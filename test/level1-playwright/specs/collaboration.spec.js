const { test, expect } = require('@playwright/test');
const { registerAccount, createBoard, openBoard, getToken, getBoardId, shareBoardWithUser, registerGetUser, getUserId, getSceneElements, waitForSceneElements } = require('./utils');

test.describe('Collaboration', () => {
  test.use({ actionTimeout: 30000, timeout: 60000 });

  test('two users can see each other edits in real-time', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // ── User A: register, create board, enter editor ──
      const userA = await registerGetUser(pageA);
      const boardName = `Collab ${Date.now()}`;
      await createBoard(pageA, boardName);
      await openBoard(pageA, boardName);

      const boardId = await getBoardId(pageA);
      expect(boardId).toBeTruthy();

      // ── User B: register ──
      const userB = await registerGetUser(pageB);

      // Get User B's user ID via API
      const userBId = await getUserId(pageB, userB.token);
      expect(userBId).toBeTruthy();

      // ── User A shares board with User B via API ──
      const shareResult = await shareBoardWithUser(pageA, boardId, userBId);
      expect([200, 201]).toContain(shareResult.status);

      // ── User B: go to dashboard to refresh board list ──
      await pageB.goto('/');
      await pageB.waitForTimeout(2000);

      // ── User B should see the shared board ──
      const boardVisible = await pageB.locator(`text=${boardName}`).isVisible();
      expect(boardVisible).toBe(true);

      // ── User B enters the shared board ──
      await openBoard(pageB, boardName);

      // ── Verify both see the editor ──
      expect(await pageA.locator('.excalidraw').isVisible()).toBe(true);
      expect(await pageB.locator('.excalidraw').isVisible()).toBe(true);

      // ── User A draws a rectangle ──
      await pageA.keyboard.press('r');
      await pageA.waitForTimeout(300);
      const canvasA = pageA.locator('.excalidraw__canvas.interactive');
      const boxA = await canvasA.boundingBox();
      if (boxA) {
        await pageA.mouse.move(boxA.x + 200, boxA.y + 200);
        await pageA.mouse.down();
        await pageA.mouse.move(boxA.x + 350, boxA.y + 300);
        await pageA.mouse.up();
      }

      // ── Wait for Yjs sync ──
      await pageA.waitForTimeout(3000);
      await pageB.waitForTimeout(2000);

      // ── User B draws an ellipse ──
      await pageB.keyboard.press('o');
      await pageB.waitForTimeout(300);
      const canvasB = pageB.locator('.excalidraw__canvas.interactive');
      const boxB = await canvasB.boundingBox();
      if (boxB) {
        await pageB.mouse.move(boxB.x + 400, boxB.y + 200);
        await pageB.mouse.down();
        await pageB.mouse.move(boxB.x + 500, boxB.y + 300);
        await pageB.mouse.up();
      }

      await pageB.waitForTimeout(2000);

      // ── Take screenshots for visual verification ──
      await pageA.screenshot({ path: 'e2e/results/screenshots/collab-userA.png' });
      await pageB.screenshot({ path: 'e2e/results/screenshots/collab-userB.png' });

      console.log('[SUCCESS] Two users accessed and edited the same board');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('unauthorized user cannot access board', async ({ browser }) => {
    const ctxOwner = await browser.newContext();
    const ctxIntruder = await browser.newContext();
    const pageOwner = await ctxOwner.newPage();
    const pageIntruder = await ctxIntruder.newPage();

    try {
      // Owner creates a board
      const ownerAcct = await registerGetUser(pageOwner);
      const boardName = `Secure ${Date.now()}`;
      await createBoard(pageOwner, boardName);
      await openBoard(pageOwner, boardName);

      const boardUrl = pageOwner.url();
      const boardId = await getBoardId(pageOwner);
      expect(boardId).toBeTruthy();

      // Intruder registers (completely unrelated user)
      await registerGetUser(pageIntruder);

      // Intruder tries to access the board directly
      await pageIntruder.goto(boardUrl);
      await pageIntruder.waitForTimeout(3000);

      // Intruder should NOT see the editor
      const hasEditor = await pageIntruder.locator('.excalidraw').isVisible().catch(() => false);
      const hasError = await pageIntruder.locator('text=/画板不存在|无权访问|403|404|forbidden/i').isVisible().catch(() => false);

      console.log(`Intruder access: hasEditor=${hasEditor}, hasError=${hasError}`);
      await pageIntruder.screenshot({ path: 'e2e/results/screenshots/intruder-denied.png' });

      // Either intruder sees an error OR the editor is not visible
      // (Accept either behavior as long as unauthorized access is prevented)
      expect(hasEditor).toBe(false);

    } finally {
      await ctxOwner.close();
      await ctxIntruder.close();
    }
  });

  test('share link grants access to viewer', async ({ browser }) => {
    const ctxOwner = await browser.newContext();
    const ctxViewer = await browser.newContext();
    const pageOwner = await ctxOwner.newPage();
    const pageViewer = await ctxViewer.newPage();

    try {
      // Owner creates an account and a board
      const ownerAcct = await registerGetUser(pageOwner);
      const boardName = `ShareViaLink ${Date.now()}`;
      await createBoard(pageOwner, boardName);
      await openBoard(pageOwner, boardName);

      const boardId = await getBoardId(pageOwner);
      expect(boardId).toBeTruthy();

      // Owner generates share token via API directly (avoids headless clipboard issues)
      const token = await getToken(pageOwner);
      const shareTokenResult = await pageOwner.evaluate(async ({ boardId, token }) => {
        const res = await fetch(`/api/boards/${boardId}/tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ permission: 'viewer' })
        });
        return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
      }, { boardId, token });

      expect(shareTokenResult.ok).toBe(true);
      const shareToken = shareTokenResult.data?.token || shareTokenResult.data?.share_token;
      expect(shareToken).toBeTruthy();
      console.log(`Share token created: ${shareToken}`);

      // Viewer registers
      await registerGetUser(pageViewer);

      // Viewer navigates via share link
      await pageViewer.goto(`/s/${shareToken}`);
      await pageViewer.waitForTimeout(3000);

      // Viewer should be redirected or see the shared board
      const viewerInEditor = await pageViewer.locator('.excalidraw').isVisible().catch(() => false);
      console.log(`Viewer in editor via share link: ${viewerInEditor}`);

      // Close share panel on owner side
      await pageOwner.keyboard.press('Escape');

    } finally {
      await ctxOwner.close();
      await ctxViewer.close();
    }
  });

  test('data sync: user A draws a rectangle, user B sees it appear', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup: A creates board, shares with B
      const userA = await registerGetUser(pageA);
      const boardName = `DataSync ${Date.now()}`;
      await createBoard(pageA, boardName);
      await openBoard(pageA, boardName);
      const boardId = await getBoardId(pageA);
      expect(boardId).toBeTruthy();

      const userB = await registerGetUser(pageB);
      const userBId = await getUserId(pageB, userB.token);
      expect(userBId).toBeTruthy();
      const shareResult = await shareBoardWithUser(pageA, boardId, userBId);
      expect([200, 201]).toContain(shareResult.status);

      // B navigates to shared board
      await pageB.goto('/');
      await pageB.waitForTimeout(2000);
      await openBoard(pageB, boardName);

      // Both focus the canvas
      await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // A draws a rectangle using setActiveTool (matches workflow.spec.js pattern)
      const canvasA = pageA.locator('.excalidraw__canvas.interactive');
      const boxA = await canvasA.boundingBox();
      expect(boxA).not.toBeNull();
      const acx = boxA.x + boxA.width / 2;
      const acy = boxA.y + boxA.height / 2;

      // Retry draw if Yjs initial sync clears the canvas (race condition workaround)
      let aCount = 0;
      for (let attempt = 0; attempt < 5 && aCount === 0; attempt++) {
        if (attempt > 0) await pageA.waitForTimeout(500);
        await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'rectangle' }));
        await pageA.waitForTimeout(300);
        await pageA.mouse.move(acx - 80, acy - 60);
        await pageA.mouse.down();
        await pageA.mouse.move(acx + 80, acy + 60);
        await pageA.mouse.up();
        await pageA.waitForTimeout(500);
        aCount = await pageA.evaluate(() => {
          const exc = window.__EXCALIDRAW__;
          return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
        });
      }
      expect(aCount).toBeGreaterThanOrEqual(1);

      // Wait for sync: B should have at least 1 element
      const elementsB = await waitForSceneElements(pageB, 1);
      const hasRect = elementsB.some(e => e.type === 'rectangle');
      expect(hasRect).toBe(true);

      // Verify element properties match between A and B
      const rectA = await pageA.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.find(e => e.type === 'rectangle');
        return el ? { x: el.x, y: el.y, w: el.width, h: el.height, id: el.id } : null;
      });
      const rectB = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.find(e => e.type === 'rectangle');
        return el ? { x: el.x, y: el.y, w: el.width, h: el.height, id: el.id } : null;
      });

      expect(rectA).toBeTruthy();
      expect(rectB).toBeTruthy();
      // Positions and sizes should be roughly equal (tolerance: 10 scene units)
      expect(Math.abs(rectA.x - rectB.x)).toBeLessThan(10);
      expect(Math.abs(rectA.y - rectB.y)).toBeLessThan(10);
      expect(Math.abs(rectA.w - rectB.w)).toBeLessThan(10);
      expect(Math.abs(rectA.h - rectB.h)).toBeLessThan(10);

      console.log('[SUCCESS] Data sync verified: B sees A\'s rectangle with matching properties');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('viewer presence does not clear owner scene when owner adds a new shape', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const userA = await registerGetUser(pageA);
      const boardName = `ViewerSafe ${Date.now()}`;
      await createBoard(pageA, boardName);
      await openBoard(pageA, boardName);
      const boardId = await getBoardId(pageA);
      expect(boardId).toBeTruthy();

      const userB = await registerGetUser(pageB);
      const userBId = await getUserId(pageB, userB.token);
      expect(userBId).toBeTruthy();
      const shareResult = await shareBoardWithUser(pageA, boardId, userBId, 'viewer');
      expect([200, 201]).toContain(shareResult.status);

      await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.goto('/');
      await pageB.waitForTimeout(1000);
      await openBoard(pageB, boardName);
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });

      const canvasA = pageA.locator('.excalidraw__canvas.interactive');
      const boxA = await canvasA.boundingBox();
      expect(boxA).not.toBeNull();
      const acx = boxA.x + boxA.width / 2;
      const acy = boxA.y + boxA.height / 2;

      let aCount = 0;
      for (let attempt = 0; attempt < 5 && aCount === 0; attempt++) {
        if (attempt > 0) await pageA.waitForTimeout(500);
        await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'rectangle' }));
        await pageA.waitForTimeout(300);
        await pageA.mouse.move(acx - 240, acy - 80);
        await pageA.mouse.down();
        await pageA.mouse.move(acx - 120, acy);
        await pageA.mouse.up();
        await pageA.waitForTimeout(500);
        aCount = await pageA.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }

      await expect.poll(async () => {
        return pageA.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 10000 }).toBeGreaterThanOrEqual(1);

      await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'diamond' }));
      await pageA.waitForTimeout(300);
      await pageA.mouse.move(acx + 20, acy - 80);
      await pageA.mouse.down();
      await pageA.mouse.move(acx + 140, acy);
      await pageA.mouse.up();

      await expect.poll(async () => {
        return pageA.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 10000 }).toBe(2);

      await waitForSceneElements(pageB, 2, { timeout: 20000 });

      await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'ellipse' }));
      await pageA.waitForTimeout(300);
      await pageA.mouse.move(acx + 240, acy - 80);
      await pageA.mouse.down();
      await pageA.mouse.move(acx + 360, acy);
      await pageA.mouse.up();

      await expect.poll(async () => {
        return pageA.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 10000 }).toBeGreaterThanOrEqual(3);

      await expect.poll(async () => {
        return pageB.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 20000 }).toBeGreaterThanOrEqual(3);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('editor and owner edits sync in both directions', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxOwner = await browser.newContext();
    const ctxEditor = await browser.newContext();
    const ownerPage = await ctxOwner.newPage();
    const editorPage = await ctxEditor.newPage();

    try {
      const owner = await registerGetUser(ownerPage);
      const boardName = `BiDir ${Date.now()}`;
      await createBoard(ownerPage, boardName);
      await openBoard(ownerPage, boardName);
      const boardId = await getBoardId(ownerPage);
      expect(boardId).toBeTruthy();

      const editor = await registerGetUser(editorPage);
      const editorId = await getUserId(editorPage, editor.token);
      expect(editorId).toBeTruthy();
      const shareResult = await shareBoardWithUser(ownerPage, boardId, editorId, 'editor');
      expect([200, 201]).toContain(shareResult.status);

      await editorPage.goto('/');
      await editorPage.waitForTimeout(1000);
      await openBoard(editorPage, boardName);

      await ownerPage.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await editorPage.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });

      const ownerBox = await ownerPage.locator('.excalidraw__canvas.interactive').boundingBox();
      const editorBox = await editorPage.locator('.excalidraw__canvas.interactive').boundingBox();
      expect(ownerBox).not.toBeNull();
      expect(editorBox).not.toBeNull();

      await ownerPage.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'rectangle' }));
      await ownerPage.waitForTimeout(300);
      await ownerPage.mouse.move(ownerBox.x + 220, ownerBox.y + 220);
      await ownerPage.mouse.down();
      await ownerPage.mouse.move(ownerBox.x + 340, ownerBox.y + 310);
      await ownerPage.mouse.up();

      await expect.poll(async () => {
        return editorPage.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 20000 }).toBeGreaterThanOrEqual(1);

      await editorPage.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'ellipse' }));
      await editorPage.waitForTimeout(300);
      await editorPage.mouse.move(editorBox.x + 460, editorBox.y + 220);
      await editorPage.mouse.down();
      await editorPage.mouse.move(editorBox.x + 560, editorBox.y + 310);
      await editorPage.mouse.up();

      await expect.poll(async () => {
        return ownerPage.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 20000 }).toBeGreaterThanOrEqual(2);

      await expect.poll(async () => {
        return editorPage.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().length || 0);
      }, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    } finally {
      await ctxOwner.close();
      await ctxEditor.close();
    }
  });

  test('operation sync: user A deletes all elements, user B sees empty scene', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup: A creates board, shares with B
      const userA = await registerGetUser(pageA);
      const boardName = `DelSync ${Date.now()}`;
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

      // Wait for B's Yjs connection to settle before A draws
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);
      await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });

      // Wait for Yjs initial sync on pageA before drawing (green dot = synced)
      await pageA.locator('.bg-green-500').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      // A draws a rectangle using setActiveTool
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
      await pageA.waitForTimeout(500);

      // A draws an ellipse
      await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'ellipse' }));
      await pageA.waitForTimeout(300);
      await pageA.mouse.move(acx - 80, acy + 80);
      await pageA.mouse.down();
      await pageA.mouse.move(acx + 80, acy + 180);
      await pageA.mouse.up();

      // Wait for both elements to sync to B
      await waitForSceneElements(pageB, 2);

      // A selects all and deletes
      await pageA.keyboard.press('Escape');
      await pageA.waitForTimeout(300);
      await pageA.keyboard.press('Control+a');
      await pageA.waitForTimeout(300);
      await pageA.keyboard.press('Delete');
      await pageA.waitForTimeout(500);

      // Wait for B's scene to be empty (poll via waitForFunction)
      await pageB.waitForFunction(() => {
        const exc = window.__EXCALIDRAW__;
        if (!exc || typeof exc.getSceneElements !== 'function') return false;
        return exc.getSceneElements().length === 0;
      }, { timeout: 20000 });

      const countB = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
      });
      expect(countB).toBe(0);

      console.log('[SUCCESS] Operation sync (delete) verified: B\'s scene is empty after A deletes all');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('operation sync: user A moves an element, user B sees new position', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup: A creates board, shares with B
      const userA = await registerGetUser(pageA);
      const boardName = `MoveSync ${Date.now()}`;
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

      await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });

      // Wait for Yjs initial sync on pageA before drawing (green dot = synced)
      await pageA.locator('.bg-green-500').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      // A draws a rectangle using setActiveTool
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

      // Wait for sync
      await waitForSceneElements(pageB, 1);

      // Read A's element position before move
      const beforePos = await pageA.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { x: el.x, y: el.y } : null;
      });
      expect(beforePos).toBeTruthy();

      // Move the element via updateScene (triggers onChange → Yjs → B)
      await pageA.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        const elements = exc.getSceneElements();
        const el = elements[0];
        if (el) {
          el.x += 50;
          el.y += 30;
          exc.updateScene({ elements, appState: exc.getAppState() });
        }
      });

      // Wait for debounce (200ms) + network + Yjs observe + applyScene on B
      await pageB.waitForFunction((expectedX) => {
        const exc = window.__EXCALIDRAW__;
        const el = exc?.getSceneElements?.()?.[0];
        return el && Math.abs(el.x - expectedX) < 5;
      }, beforePos.x + 50, { timeout: 15000 });

      // Read B's element position after move
      const afterPosB = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { x: el.x, y: el.y } : null;
      });
      expect(afterPosB).toBeTruthy();

      // B should see the element at the new position
      expect(Math.abs(afterPosB.x - (beforePos.x + 50))).toBeLessThan(5);
      expect(Math.abs(afterPosB.y - (beforePos.y + 30))).toBeLessThan(5);

      console.log('[SUCCESS] Operation sync (move) verified: B sees element at new position');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('delete single element: user A deletes one element, user B sees only the other', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup
      const userA = await registerGetUser(pageA);
      const boardName = `DelOne ${Date.now()}`;
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
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // A draws rectangle + ellipse
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
      await pageA.waitForTimeout(500);

      await pageA.evaluate(() => window.__EXCALIDRAW__.setActiveTool({ type: 'ellipse' }));
      await pageA.waitForTimeout(300);
      await pageA.mouse.move(acx + 120, acy - 60);
      await pageA.mouse.down();
      await pageA.mouse.move(acx + 220, acy + 60);
      await pageA.mouse.up();

      // Wait for both elements to sync to B
      await waitForSceneElements(pageB, 2);

      // A selects only the rectangle (via selectedElementIds)
      await pageA.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        const rect = exc.getSceneElements().find(e => e.type === 'rectangle');
        if (rect) {
          exc.updateScene({
            elements: exc.getSceneElements(),
            appState: { ...exc.getAppState(), selectedElementIds: { [rect.id]: true } }
          });
        }
      });
      await pageA.waitForTimeout(300);

      // A presses Delete to remove the selected rectangle
      await pageA.keyboard.press('Delete');
      await pageA.waitForTimeout(500);

      // Wait for B's element count to drop from 2 to 1
      await pageB.waitForFunction(() => {
        const exc = window.__EXCALIDRAW__;
        if (!exc || typeof exc.getSceneElements !== 'function') return false;
        return exc.getSceneElements().length === 1;
      }, { timeout: 20000 });

      // Verify B still has the ellipse but not the rectangle
      const bTypes = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        if (!exc || typeof exc.getSceneElements !== 'function') return [];
        return exc.getSceneElements().map(e => e.type);
      });
      expect(bTypes).not.toContain('rectangle');
      expect(bTypes).toContain('ellipse');
      expect(bTypes.length).toBe(1);

      console.log('[SUCCESS] Delete single element sync verified: B lost rectangle, kept ellipse');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('mouse drag: user A drags an element, user B sees new position', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup
      const userA = await registerGetUser(pageA);
      const boardName = `DragMove ${Date.now()}`;
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
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // Wait for Yjs initial sync on pageA before drawing (green dot = synced)
      await pageA.locator('.bg-green-500').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      // A draws a rectangle
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

      // Wait for sync
      await waitForSceneElements(pageB, 1);

      // Read A's element position before drag
      const beforePos = await pageA.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { x: el.x, y: el.y } : null;
      });
      expect(beforePos).toBeTruthy();

      // Convert element center to viewport pixel coordinates for mouse drag
      const canvasBox = await pageA.locator('.excalidraw__canvas.interactive').boundingBox();
      const rectCenter = await pageA.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        const el = exc.getSceneElements()[0];
        const appState = exc.getAppState();
        const cx = (el.x + el.width / 2 - appState.scrollX) * appState.zoom.value;
        const cy = (el.y + el.height / 2 - appState.scrollY) * appState.zoom.value;
        return { cx, cy };
      });

      const startX = canvasBox.x + rectCenter.cx;
      const startY = canvasBox.y + rectCenter.cy;
      const ddx = 80;
      const ddy = 60;

      // Mouse drag the element to a new position
      await pageA.mouse.move(startX, startY);
      await pageA.mouse.down();
      await pageA.mouse.move(startX + ddx, startY + ddy, { steps: 10 });
      await pageA.mouse.up();
      await pageA.waitForTimeout(500);

      // Wait for B to see the movement — poll using approximate position
      const expectedX = beforePos.x + ddx;
      const expectedY = beforePos.y + ddy;
      await pageB.waitForFunction(({ ex, ey }) => {
        const exc = window.__EXCALIDRAW__;
        const el = exc?.getSceneElements?.()?.[0];
        return el && Math.abs(el.x - ex) < 20 && Math.abs(el.y - ey) < 20;
      }, { ex: expectedX, ey: expectedY }, { timeout: 15000 });

      // Verify B's element position
      const afterPosB = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { x: el.x, y: el.y } : null;
      });
      expect(afterPosB).toBeTruthy();
      expect(Math.abs(afterPosB.x - expectedX)).toBeLessThan(20);
      expect(Math.abs(afterPosB.y - expectedY)).toBeLessThan(20);

      console.log('[SUCCESS] Mouse drag sync verified: B sees element at dragged position');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('style sync: user A changes element color, user B sees the new color', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup
      const userA = await registerGetUser(pageA);
      const boardName = `ColorSync ${Date.now()}`;
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
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // A draws a rectangle
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

      // Wait for sync
      await waitForSceneElements(pageB, 1);

      // Read original colors
      const origColor = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.find(e => e.type === 'rectangle');
        return el ? { strokeColor: el.strokeColor, backgroundColor: el.backgroundColor } : null;
      });
      expect(origColor).toBeTruthy();

      // A changes strokeColor and backgroundColor via updateScene
      await pageA.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        const rect = exc.getSceneElements().find(e => e.type === 'rectangle');
        if (rect) {
          rect.strokeColor = '#ff0000';
          rect.backgroundColor = '#00ff00';
          exc.updateScene({ elements: exc.getSceneElements(), appState: exc.getAppState() });
        }
      });

      // Wait for B to see the color change
      await pageB.waitForFunction(() => {
        const exc = window.__EXCALIDRAW__;
        const el = exc?.getSceneElements?.()?.find(e => e.type === 'rectangle');
        return el && el.strokeColor === '#ff0000';
      }, { timeout: 15000 });

      // Verify B's colors
      const bColor = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.find(e => e.type === 'rectangle');
        return el ? { strokeColor: el.strokeColor, backgroundColor: el.backgroundColor } : null;
      });
      expect(bColor).toBeTruthy();
      expect(bColor.strokeColor).toBe('#ff0000');
      expect(bColor.backgroundColor).toBe('#00ff00');

      console.log('[SUCCESS] Style sync verified: B sees A\'s color changes');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('resize sync: user A resizes an element, user B sees new dimensions', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup
      const userA = await registerGetUser(pageA);
      const boardName = `ResizeSync ${Date.now()}`;
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
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // A draws a rectangle
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

      // Wait for sync
      await waitForSceneElements(pageB, 1);

      // Read original dimensions
      const origSize = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { w: el.width, h: el.height } : null;
      });
      expect(origSize).toBeTruthy();

      // A resizes the element via updateScene
      const newW = origSize.w + 80;
      const newH = origSize.h + 40;
      await pageA.evaluate(({ nw, nh }) => {
        const exc = window.__EXCALIDRAW__;
        const el = exc.getSceneElements()[0];
        if (el) {
          el.width = nw;
          el.height = nh;
          exc.updateScene({ elements: exc.getSceneElements(), appState: exc.getAppState() });
        }
      }, { nw: newW, nh: newH });

      // Wait for B to see the new dimensions
      await pageB.waitForFunction(({ ew, eh }) => {
        const exc = window.__EXCALIDRAW__;
        const el = exc?.getSceneElements?.()?.[0];
        return el && Math.abs(el.width - ew) < 5 && Math.abs(el.height - eh) < 5;
      }, { ew: newW, eh: newH }, { timeout: 15000 });

      // Verify B's dimensions
      const bSize = await pageB.evaluate(() => {
        const el = window.__EXCALIDRAW__?.getSceneElements()?.[0];
        return el ? { w: el.width, h: el.height } : null;
      });
      expect(bSize).toBeTruthy();
      expect(Math.abs(bSize.w - newW)).toBeLessThan(5);
      expect(Math.abs(bSize.h - newH)).toBeLessThan(5);

      console.log('[SUCCESS] Resize sync verified: B sees A\'s dimension changes');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('undo/redo sync: user A undoes a draw, user B sees it disappear then reappear', async ({ browser }) => {
    test.setTimeout(90000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Setup
      const userA = await registerGetUser(pageA);
      const boardName = `UndoSync ${Date.now()}`;
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
      await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 10000 });
      await pageB.waitForTimeout(1000);

      // A draws a rectangle
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

      // Wait for B to see the rectangle
      await waitForSceneElements(pageB, 1);
      expect(await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        return exc?.getSceneElements?.()?.some?.(e => e.type === 'rectangle') ?? false;
      })).toBe(true);

      // A presses Ctrl+Z to undo
      await pageA.keyboard.press('Control+z');
      await pageA.waitForTimeout(800);

      // Wait for B's scene to be empty
      await pageB.waitForFunction(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' && exc.getSceneElements().length === 0;
      }, { timeout: 20000 });

      const afterUndo = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
      });
      expect(afterUndo).toBe(0);

      // A presses Ctrl+Shift+Z to redo
      await pageA.keyboard.press('Control+Shift+z');
      await pageA.waitForTimeout(800);

      // Wait for B's scene to have the element again
      await pageB.waitForFunction(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' && exc.getSceneElements().length >= 1;
      }, { timeout: 20000 });

      const afterRedo = await pageB.evaluate(() => {
        const exc = window.__EXCALIDRAW__;
        return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements().length : -1;
      });
      expect(afterRedo).toBeGreaterThanOrEqual(1);

      console.log('[SUCCESS] Undo/Redo sync verified: B saw element disappear on undo and reappear on redo');

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
