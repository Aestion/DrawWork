const { test, expect } = require('@playwright/test');
const { registerGetUser, createBoard, openBoard, getBoardId, shareBoardWithUser, getUserId, apiCall } = require('./utils');

test('A creates canvas, B sees it appear via polling', async ({ browser }) => {
  test.setTimeout(60000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    const userA = await registerGetUser(pageA);
    const boardName = `CanvasPolling ${Date.now()}`;
    await createBoard(pageA, boardName);
    await openBoard(pageA, boardName);
    const boardId = await getBoardId(pageA);
    expect(boardId).toBeTruthy();

    const userB = await registerGetUser(pageB);
    const userBId = await getUserId(pageB, userB.token);
    expect(userBId).toBeTruthy();
    const shareResult = await shareBoardWithUser(pageA, boardId, userBId);
    expect([200, 201]).toContain(shareResult.status);

    await pageB.goto('/');
    await pageB.waitForTimeout(2000);
    await openBoard(pageB, boardName);
    await pageB.waitForTimeout(2000);

    // Get B's initial canvas count from sidebar DOM
    const initialCount = await pageB.locator('.w-56 .group').count();
    console.log('B initial canvas count:', initialCount);

    // A creates a new canvas via the store's createCanvas (simulates UI flow)
    await pageA.evaluate(async () => {
      // Access Zustand store from React internals (window.__STORE__ is not exposed)
      const { useCanvasStore } = await import('../../src/stores/canvasStore');
      const store = useCanvasStore.getState();
      // We need boardId — read it from URL or from the store
      const match = window.location.pathname.match(/\/board\/([a-f0-9-]+)/i);
      if (match) {
        await store.createCanvas(match[1], { name: 'Polling Test Canvas', type: 'excalidraw' });
      }
    });
    await pageA.waitForTimeout(2000);

    // Verify A sees the new canvas
    const aCount = await pageA.locator('.w-56 .group').count();
    console.log('A canvas count after create:', aCount);
    expect(aCount).toBe(initialCount + 1);

    // Wait for B's poll (interval is 3s, wait up to 6s)
    try {
      await pageB.waitForFunction(
        (expected) => document.querySelectorAll('.w-56 .group').length >= expected,
        initialCount + 1,
        { timeout: 8000 }
      );
      console.log('[SUCCESS] B saw A\'s new canvas via polling');
    } catch (e) {
      // Debug: check what B's store has
      const bStoreState = await pageB.evaluate(() => {
        try {
          // Check the React fiber for canvas store state
          const root = document.getElementById('root');
          const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber'));
          if (!fiberKey) return 'no-fiber';
          return 'fiber-found';
        } catch(e2) { return 'error:' + e2.message; }
      });
      console.log('B store debug:', bStoreState);
      const bCount = await pageB.locator('.w-56 .group').count();
      console.log('B final count:', bCount);
      throw e;
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
