const { test, expect } = require('@playwright/test');
const {
  generateUnique,
  registerAccount,
  createBoard,
  openBoard,
  cleanupUserBoards,
} = require('./utils');

test.describe('Editor', () => {
  test('user can open a board and see the editor', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Editor Test ${generateUnique()}`;

    await createBoard(page, boardName);
    await openBoard(page, boardName);

    // Verify editor UI elements
    await expect(page.locator('text=返回')).toBeVisible();
    await expect(page.locator(`text=${boardName}`)).toBeVisible();
    await expect(page.locator('text=分享')).toBeVisible();

    // Cleanup
    await page.goto('/');
    await cleanupUserBoards(page, account.token);
  });
});
