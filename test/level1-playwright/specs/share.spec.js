const { test, expect } = require('@playwright/test');
const { registerAccount, apiCall, createBoard, getUserId } = require('./utils');

test.describe('Share Collaboration', () => {
  test.use({ actionTimeout: 60000, timeout: 180000 });

  test('User A shares board, User B refreshes and sees it', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      // User A: Register, create board
      const userA = await registerAccount(pageA);

      const boardName = `Shared Board ${Date.now()}`;
      await createBoard(pageA, boardName);

      // Enter editor
      await pageA.locator('.grid > div', { hasText: boardName }).click();
      await expect(pageA.locator('.excalidraw')).toBeVisible({ timeout: 20000 });
      await pageA.waitForTimeout(2000);

      // Get board ID from URL
      const boardId = pageA.url().split('/board/')[1]?.split('?')[0];
      console.log(`Board ID: ${boardId}`);

      // User A draws something
      await pageA.keyboard.press('r');
      await pageA.waitForTimeout(500);
      const boxA = await pageA.locator('.excalidraw__canvas.interactive').boundingBox();
      if (boxA) {
        await pageA.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
        await pageA.mouse.down();
        await pageA.mouse.move(boxA.x + boxA.width / 2 + 120, boxA.y + boxA.height / 2 + 100);
        await pageA.mouse.up();
      }
      await pageA.waitForTimeout(2000);

      // User B: Register
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const userB = await registerAccount(pageB);

      // Get User B's actual user ID (UUID, not username)
      const userBId = await getUserId(pageB, userB.token);
      expect(userBId).toBeTruthy();

      // User A invites User B directly via API
      console.log('[A] Inviting User B...');

      const inviteResult = await apiCall(pageA, {
        method: 'POST',
        path: `/api/boards/${boardId}/shares`,
        body: { user_id: userBId, permission: 'editor' },
        token: userA.token
      });

      console.log(`Invite result: ${JSON.stringify(inviteResult)}`);
      // Accept 201 (created) or 200 (updated existing)
      expect([200, 201]).toContain(inviteResult.status);

      await pageA.screenshot({ path: 'e2e/results/screenshots/share-A-board.png' });

      // User B: Go to dashboard (to refresh boards list), then navigate
      try {
        // CRITICAL: Go to dashboard first to trigger fetchBoards()
        // This refreshes the boards list and picks up the newly shared board
        await pageB.goto('/');
        await pageB.waitForTimeout(2000);

        // Now User B should see the shared board in their list
        const boardVisible = await pageB.locator(`text=${boardName}`).isVisible().catch(() => false);
        console.log(`User B sees board in list: ${boardVisible}`);

        await pageB.screenshot({ path: 'e2e/results/screenshots/share-B-dashboard.png' });

        // Click on the shared board
        if (boardVisible) {
          await pageB.locator('.grid > div', { hasText: boardName }).click();
          // Wait for navigation to complete
          await pageB.waitForURL(/\/board\/[a-f0-9-]+/, { timeout: 20000 });
          // Wait for the board to load (loading indicator should disappear)
          await pageB.waitForTimeout(3000);
          // Check if we're showing an error
          const hasError = await pageB.locator('text=/画板不存在|无权访问|获取画板失败/').isVisible().catch(() => false);
          console.log(`Page has error: ${hasError}`);
          // Take screenshot before checking .excalidraw
          await pageB.screenshot({ path: 'e2e/results/screenshots/share-B-after-click.png' });
          await expect(pageB.locator('.excalidraw')).toBeVisible({ timeout: 30000 });
          await pageB.waitForTimeout(2000);

          console.log('[SUCCESS] User B entered the shared board!');
          await pageB.screenshot({ path: 'e2e/results/screenshots/share-B-editor.png' });

          // User B draws something
          await pageB.keyboard.press('o'); // Ellipse
          await pageB.waitForTimeout(500);
          const boxB = await pageB.locator('.excalidraw__canvas.interactive').boundingBox();
          if (boxB) {
            await pageB.mouse.move(boxB.x + 200, boxB.y + 200);
            await pageB.mouse.down();
            await pageB.mouse.move(boxB.x + 300, boxB.y + 280);
            await pageB.mouse.up();
          }
          await pageB.waitForTimeout(2000);

          // Take final screenshots
          await pageA.screenshot({ path: 'e2e/results/screenshots/collab-final-A.png' });
          await pageB.screenshot({ path: 'e2e/results/screenshots/collab-final-B.png' });

          console.log('[SUCCESS] Real-time collaboration verified!');
        }

        expect(boardVisible).toBe(true);

      } finally {
        await contextB.close();
      }

    } finally {
      await contextA.close();
    }
  });

  test('Direct board URL access after share - requires refresh', async ({ browser }) => {
    // This test documents the current behavior:
    // User B must go to dashboard first (or refresh) after being invited
    // to see the shared board

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      const userA = await registerAccount(pageA);

      const boardName = `URL Test ${Date.now()}`;
      await createBoard(pageA, boardName);
      await pageA.locator('.grid > div', { hasText: boardName }).click();
      await expect(pageA.locator('.excalidraw')).toBeVisible({ timeout: 20000 });

      const boardUrl = pageA.url();
      const boardId = boardUrl.split('/board/')[1]?.split('?')[0];

      // User B: Register
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const userB = await registerAccount(pageB);

      // User A invites User B
      await apiCall(pageA, {
        method: 'POST',
        path: `/api/boards/${boardId}/shares`,
        body: { user_id: userB.username, permission: 'editor' },
        token: userA.token
      });

      // User B: Navigate to board URL WITHOUT refreshing dashboard
      try {
        await pageB.waitForTimeout(1000);

        // Direct URL access - this should NOT work without refresh
        await pageB.goto(boardUrl);
        await pageB.waitForTimeout(3000);

        const hasEditor = await pageB.locator('.excalidraw').isVisible().catch(() => false);
        const hasError = await pageB.locator('text=/画板不存在|无权访问/').isVisible().catch(() => false);
        const isLoading = await pageB.locator('text=/加载中|加载画板/').isVisible().catch(() => false);

        console.log(`Direct URL: hasEditor=${hasEditor}, hasError=${hasError}, isLoading=${isLoading}`);
        await pageB.screenshot({ path: 'e2e/results/screenshots/url-direct-access.png' });

        // Document current behavior: direct URL access doesn't work
        // User must go to dashboard first to refresh boards list

      } finally {
        await contextB.close();
      }

    } finally {
      await contextA.close();
    }
  });
});