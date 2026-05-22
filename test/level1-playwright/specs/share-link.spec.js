const { test, expect } = require('@playwright/test');
const { registerAccount, createBoard, openBoard, getToken, getUserId } = require('./utils');

test.describe('Share Link Functionality', () => {
  test.use({
    actionTimeout: 60000,
    timeout: 120000,
  });

  test('Generated share link token is not undefined', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Register and login
      await registerAccount(page);
      const boardName = `ShareLink Test ${Date.now()}`;
      await createBoard(page, boardName);
      await openBoard(page, boardName);

      // Get auth token from localStorage
      const token = await getToken(page);

      // Extract board ID from URL
      const boardId = page.url().match(/\/board\/([a-f0-9-]+)/)?.[1];
      expect(boardId).toBeTruthy();

      // Generate share token via API (more reliable than reading from DOM/alert)
      const shareToken = await page.evaluate(async ({ boardId, token }) => {
        const res = await fetch(`/api/boards/${boardId}/tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ permission: 'viewer' })
        });
        const data = await res.json().catch(() => ({}));
        return data.token || null;
      }, { boardId, token });

      console.log(`Share token: ${shareToken}`);

      // Verify token is not undefined and matches format
      expect(shareToken).toBeTruthy();
      expect(shareToken).toMatch(/^[a-f0-9]+$/);

      console.log(`[SUCCESS] Token is properly stored: ${shareToken}`);

    } finally {
      await context.close();
    }
  });

  test('Share link max_uses is consumed only when a logged-in user gains access', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const viewerContext = await browser.newContext();
    const secondViewerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const viewerPage = await viewerContext.newPage();
    const secondViewerPage = await secondViewerContext.newPage();

    try {
      await registerAccount(ownerPage);
      const boardName = `ShareLimit ${Date.now()}`;
      await createBoard(ownerPage, boardName);
      await openBoard(ownerPage, boardName);

      const ownerToken = await getToken(ownerPage);
      const boardId = ownerPage.url().match(/\/board\/([a-f0-9-]+)/)?.[1];
      expect(boardId).toBeTruthy();

      const tokenData = await ownerPage.evaluate(async ({ boardId, ownerToken }) => {
        const res = await fetch(`/api/boards/${boardId}/tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ownerToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ permission: 'viewer', max_uses: 1 })
        });
        return res.json();
      }, { boardId, ownerToken });

      expect(tokenData.token).toBeTruthy();

      const anonymousPreview = await ownerPage.evaluate(async (shareToken) => {
        const res = await fetch(`/api/shares/validate?token=${encodeURIComponent(shareToken)}&consume=true`);
        return { status: res.status, data: await res.json() };
      }, tokenData.token);
      expect(anonymousPreview.status).toBe(200);
      expect(anonymousPreview.data.used_count).toBe(0);

      const viewer = await registerAccount(viewerPage);
      expect(await getUserId(viewerPage, viewer.token)).toBeTruthy();

      const viewerUse = await viewerPage.evaluate(async ({ shareToken, authToken }) => {
        const res = await fetch(`/api/shares/validate?token=${encodeURIComponent(shareToken)}&consume=false`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return { status: res.status, data: await res.json() };
      }, { shareToken: tokenData.token, authToken: viewer.token });
      expect(viewerUse.status).toBe(200);
      expect(viewerUse.data.used_count).toBe(1);

      const secondViewer = await registerAccount(secondViewerPage);
      expect(await getUserId(secondViewerPage, secondViewer.token)).toBeTruthy();

      const blockedUse = await secondViewerPage.evaluate(async ({ shareToken, authToken }) => {
        const res = await fetch(`/api/shares/validate?token=${encodeURIComponent(shareToken)}&consume=false`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return { status: res.status, data: await res.json() };
      }, { shareToken: tokenData.token, authToken: secondViewer.token });
      expect(blockedUse.status).toBe(400);
    } finally {
      await ownerContext.close();
      await viewerContext.close();
      await secondViewerContext.close();
    }
  });
});
