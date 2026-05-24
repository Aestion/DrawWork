const { test, expect } = require('@playwright/test');
const { registerAccount, createBoard, openBoard, getBoardId, shareBoardWithUser, registerGetUser, getUserId, waitForSceneElements } = require('./utils');

test('diagnose Yjs sync between two users', async ({ browser }) => {
  test.setTimeout(90000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // Setup
    const userA = await registerGetUser(pageA);
    const boardName = `SyncDiag ${Date.now()}`;
    await createBoard(pageA, boardName);
    await openBoard(pageA, boardName);
    const boardId = await getBoardId(pageA);
    expect(boardId).toBeTruthy();

    const userB = await registerGetUser(pageB);
    const userBId = await getUserId(pageB, userB.token);
    const shareResult = await shareBoardWithUser(pageA, boardId, userBId);
    expect([200, 201]).toContain(shareResult.status);

    await pageB.goto('/');
    await pageB.waitForTimeout(2000);
    await openBoard(pageB, boardName);

    // Wait for both editors to be ready
    await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
    await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
    await pageB.waitForTimeout(2000);

    // Check connection status indicator color for both users
    const statusA = await pageA.evaluate(() => {
      const dot = document.querySelector('.rounded-full.h-2.w-2');
      if (!dot) return 'no-dot';
      for (const cls of dot.classList) {
        if (cls.includes('green')) return 'green';
        if (cls.includes('blue')) return 'blue';
        if (cls.includes('yellow')) return 'yellow';
        if (cls.includes('gray')) return 'gray';
      }
      return 'unknown:' + dot.className;
    });
    console.log('User A connection dot:', statusA);

    const statusB = await pageB.evaluate(() => {
      const dot = document.querySelector('.rounded-full.h-2.w-2');
      if (!dot) return 'no-dot';
      for (const cls of dot.classList) {
        if (cls.includes('green')) return 'green';
        if (cls.includes('blue')) return 'blue';
        if (cls.includes('yellow')) return 'yellow';
        if (cls.includes('gray')) return 'gray';
      }
      return 'unknown:' + dot.className;
    });
    console.log('User B connection dot:', statusB);

    // Check canEdit for both users
    const canEditA = await pageA.evaluate(() => {
      try {
        // Check the UI state - viewModeEnabled
        const exc = window.__EXCALIDRAW__;
        if (exc && exc.getAppState) return JSON.stringify(exc.getAppState().viewModeEnabled);
        return 'no-excalidraw';
      } catch(e) { return 'error:' + e.message; }
    });
    console.log('User A viewModeEnabled:', canEditA);

    const canEditB = await pageB.evaluate(() => {
      try {
        const exc = window.__EXCALIDRAW__;
        if (exc && exc.getAppState) return JSON.stringify(exc.getAppState().viewModeEnabled);
        return 'no-excalidraw';
      } catch(e) { return 'error:' + e.message; }
    });
    console.log('User B viewModeEnabled:', canEditB);

    // Check user B's board permission
    const permB = await pageB.evaluate(() => {
      try {
        // Try to read from React state via window.__STATE__ or similar
        const el = document.querySelector('[class*="text-lg"]');
        return el ? el.textContent : 'no-title-found';
      } catch(e) { return 'error'; }
    });
    console.log('User B page title:', permB);

    // User A draws a rectangle
    const canvasA = pageA.locator('.excalidraw__canvas.interactive');
    const boxA = await canvasA.boundingBox();
    expect(boxA).not.toBeNull();
    const acx = boxA.x + boxA.width / 2;
    const acy = boxA.y + boxA.height / 2;

    await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'rectangle' }));
    await pageA.waitForTimeout(300);
    await pageA.mouse.move(acx - 80, acy - 60);
    await pageA.mouse.down();
    await pageA.mouse.move(acx + 80, acy + 60);
    await pageA.mouse.up();
    await pageA.waitForTimeout(1000);

    // Verify A has elements
    const aCount = await pageA.evaluate(() => {
      const exc = window.__EXCALIDRAW__;
      return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
    });
    console.log('User A element count:', aCount);
    expect(aCount).toBeGreaterThanOrEqual(1);

    // Check Yjs connected/synced state by looking at the connection dot status
    // If green (synced), the connection is working
    const statusAAfter = await pageA.evaluate(() => {
      const dot = document.querySelector('.rounded-full.h-2.w-2');
      if (!dot) return 'no-dot';
      for (const cls of dot.classList) {
        if (cls.includes('green')) return 'green';
        if (cls.includes('blue')) return 'blue';
        if (cls.includes('yellow')) return 'yellow';
        if (cls.includes('gray')) return 'gray';
      }
      return 'unknown';
    });
    console.log('User A connection dot after draw:', statusAAfter);

    const statusBAfter = await pageB.evaluate(() => {
      const dot = document.querySelector('.rounded-full.h-2.w-2');
      if (!dot) return 'no-dot';
      for (const cls of dot.classList) {
        if (cls.includes('green')) return 'green';
        if (cls.includes('blue')) return 'blue';
        if (cls.includes('yellow')) return 'yellow';
        if (cls.includes('gray')) return 'gray';
      }
      return 'unknown';
    });
    console.log('User B connection dot after draw:', statusBAfter);

    // Also check online count display
    const onlineA = await pageA.evaluate(() => {
      const el = document.querySelector('[class*="space-x-1.5"]');
      return el ? el.textContent : 'no-element';
    });
    const onlineB = await pageB.evaluate(() => {
      const el = document.querySelector('[class*="space-x-1.5"]');
      return el ? el.textContent : 'no-element';
    });
    console.log('User A online text:', onlineA);
    console.log('User B online text:', onlineB);

    // Wait for B to sync
    try {
      const elementsB = await waitForSceneElements(pageB, 1, 15000);
      console.log('User B element count:', elementsB.length);
      console.log('SYNC SUCCESS: User B received elements from User A');
    } catch (e) {
      console.log('SYNC FAILED:', e.message);
      // Check B's elements one more time
      const bCount = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
      });
      console.log('User B element count at failure:', bCount);

      // Check if B's scene has any elements at all
      const allB = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        if (!exc || !exc.getSceneElements) return 'no-excalidraw';
        const els = exc.getSceneElements();
        return els.length + ' elements: ' + els.map(e => e.type + ':' + e.id.substring(0, 8)).join(', ');
      });
      console.log('User B all elements:', allB);
    }

  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
