const { test, expect } = require('@playwright/test');
const { generateUnique, registerAccount, createBoard, cleanupUserBoards } = require('./utils');

test.describe('Dashboard', () => {
  test('user can create a board and see it in the list', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Board ${generateUnique()}`;

    await createBoard(page, boardName);

    await expect(page.locator(`text=${boardName}`)).toBeVisible();

    // Cleanup
    await cleanupUserBoards(page, account.token);
  });

  test('user can delete a board', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Delete Me ${generateUnique()}`;

    await createBoard(page, boardName);
    await expect(page.locator(`text=${boardName}`)).toBeVisible();

    // Delete it (accept confirm dialog)
    page.on('dialog', dialog => dialog.accept());
    const boardCard = page.locator('.grid > div', { hasText: boardName });
    await boardCard.locator('text=删除').click();

    await expect(page.locator(`text=${boardName}`)).not.toBeVisible();

    // Cleanup (in case deletion failed)
    await cleanupUserBoards(page, account.token);
  });
});
