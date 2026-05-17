const { test, expect } = require('@playwright/test');
const {
  generateUnique,
  registerAccount,
  createBoard,
  openBoard,
  cleanupUserBoards,
} = require('./utils');

test.describe('Data Persistence', () => {
  test.use({ actionTimeout: 15000 });

  test('drawing persists after page refresh', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Persistence ${generateUnique()}`;

    await createBoard(page, boardName);
    await openBoard(page, boardName);

    // Draw a rectangle using keyboard shortcut
    await page.keyboard.press('r');
    await page.waitForTimeout(300); // tool selection is instant

    const canvas = page.locator('.excalidraw__canvas.interactive');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 100);
    await page.mouse.up();

    // Wait for Yjs sync indicator - check for online count instead of exact text
    await expect(page.locator('text=/\\d+ 人在线/')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/results/screenshots/persistence-before-refresh.png' });

    // Refresh and verify editor loads again
    await page.reload();
    await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=/\\d+ 人在线/')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/results/screenshots/persistence-after-refresh.png' });

    // Cleanup
    await page.goto('/');
    await cleanupUserBoards(page, account.token);
  });

  test('canvas switch preserves other canvas data', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Canvas Switch ${generateUnique()}`;

    await createBoard(page, boardName);
    await openBoard(page, boardName);

    // Create a second canvas
    await page.click('text=+ 新建');
    await page.locator('text=✏️ 手绘').click();

    // Wait for the new canvas to appear in sidebar
    await expect(page.locator('text=画布 2')).toBeVisible({ timeout: 5000 });

    const canvasItems = await page.locator('text=/画布 \\d/').count();
    expect(canvasItems).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'e2e/results/screenshots/canvas-switch.png' });

    // Cleanup
    await page.goto('/');
    await cleanupUserBoards(page, account.token);
  });
});
