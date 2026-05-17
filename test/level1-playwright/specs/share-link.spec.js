const { test, expect } = require('@playwright/test');
const { registerAccount, createBoard, openBoard, getToken } = require('./utils');

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
});
