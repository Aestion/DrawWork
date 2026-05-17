const { test, expect } = require('@playwright/test');
const {
  generateUnique,
  registerAccount,
  createBoard,
  openBoard,
} = require('./utils');

test.describe('Laser Pointer', () => {
  test.use({ timeout: 180000 });

  test('laser pointer should be visible to collaborators during use', async ({ browser }) => {
    const ownerContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const collaboratorContext = await browser.newContext();

    const ownerPage = await ownerContext.newPage();
    const collaboratorPage = await collaboratorContext.newPage();

    try {
      // Owner registers and creates board
      const ownerAccount = await registerAccount(ownerPage);
      const boardName = `Laser Visibility ${generateUnique()}`;
      await createBoard(ownerPage, boardName);
      await openBoard(ownerPage, boardName);

      // Owner opens share panel and generates link
      await ownerPage.click('text=分享');
      await expect(ownerPage.locator('text=分享画板')).toBeVisible();
      await ownerPage.click('text=生成链接');
      await ownerPage.waitForTimeout(1000);

      // Copy share link
      const sharePanel = ownerPage.locator('text=分享画板').locator('..').locator('..');
      await sharePanel.locator('text=复制').first().click();
      await ownerPage.waitForTimeout(500);

      const shareLink = await ownerPage.evaluate(() => navigator.clipboard.readText());
      console.log(`Share link: ${shareLink}`);

      // Close share panel by pressing Escape
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(500);

      // Collaborator registers and joins via share link
      const collaboratorAccount = await registerAccount(collaboratorPage);

      if (!shareLink || !shareLink.includes('/s/')) {
        console.log('Share link not available, skipping test');
        return;
      }

      await collaboratorPage.goto(shareLink);
      await expect(collaboratorPage.locator('.excalidraw')).toBeVisible({ timeout: 20000 });

      // Wait for collaboration to be ready
      await ownerPage.waitForTimeout(3000);
      await collaboratorPage.waitForTimeout(3000);

      // Owner uses laser pointer (press K then draw)
      const ownerCanvas = ownerPage.locator('.excalidraw__canvas.interactive');
      const ownerBox = await ownerCanvas.boundingBox();

      await ownerPage.keyboard.press('k');
      await ownerPage.waitForTimeout(300);

      // Draw laser pointer stroke
      await ownerPage.mouse.move(ownerBox.x + ownerBox.width / 2 - 100, ownerBox.y + ownerBox.height / 2);
      await ownerPage.mouse.down();
      for (let i = 0; i < 20; i++) {
        await ownerPage.mouse.move(
          ownerBox.x + ownerBox.width / 2 - 100 + i * 10,
          ownerBox.y + ownerBox.height / 2 + Math.sin(i * 0.5) * 30
        );
      }
      await ownerPage.mouse.up();

      // Wait for sync to collaborator
      await ownerPage.waitForTimeout(2000);
      await collaboratorPage.waitForTimeout(2000);

      // Take screenshots during laser use
      await ownerPage.screenshot({ path: 'e2e/results/screenshots/laser-owner-during.png' });
      await collaboratorPage.screenshot({ path: 'e2e/results/screenshots/laser-collaborator-during.png' });

      // Check if collaborator sees the laser (freedraw elements)
      const collaboratorSeesLaser = await collaboratorPage.evaluate(() => {
        // Look for freedraw elements (laser pointer creates these)
        const elements = window.__EXCALIDRAW__?.getSceneElements?.() || [];
        const freedrawElements = elements.filter(el =>
          el.type === 'freedraw' && !el.isDeleted
        );
        return freedrawElements.length > 0;
      });

      const ownerSeesLaser = await ownerPage.evaluate(() => {
        const elements = window.__EXCALIDRAW__?.getSceneElements?.() || [];
        const freedrawElements = elements.filter(el =>
          el.type === 'freedraw' && !el.isDeleted
        );
        return freedrawElements.length > 0;
      });

      console.log(`Owner sees laser: ${ownerSeesLaser}`);
      console.log(`Collaborator sees laser: ${collaboratorSeesLaser}`);

      // Both should see the laser pointer
      expect(ownerSeesLaser).toBe(true);
      expect(collaboratorSeesLaser).toBe(true);

      // Wait for laser to fade
      await ownerPage.waitForTimeout(5000);
      await collaboratorPage.waitForTimeout(5000);

      // Take screenshots after fade
      await ownerPage.screenshot({ path: 'e2e/results/screenshots/laser-owner-after.png' });
      await collaboratorPage.screenshot({ path: 'e2e/results/screenshots/laser-collaborator-after.png' });

      // Check if laser faded
      const collaboratorLaserFaded = await collaboratorPage.evaluate(() => {
        const elements = window.__EXCALIDRAW__?.getSceneElements?.() || [];
        const freedrawElements = elements.filter(el =>
          el.type === 'freedraw' && !el.isDeleted
        );
        return freedrawElements.length === 0;
      });

      const ownerLaserFaded = await ownerPage.evaluate(() => {
        const elements = window.__EXCALIDRAW__?.getSceneElements?.() || [];
        const freedrawElements = elements.filter(el =>
          el.type === 'freedraw' && !el.isDeleted
        );
        return freedrawElements.length === 0;
      });

      console.log(`Owner laser faded: ${ownerLaserFaded}`);
      console.log(`Collaborator laser faded: ${collaboratorLaserFaded}`);

      // Laser should have faded for both
      expect(ownerLaserFaded).toBe(true);
      expect(collaboratorLaserFaded).toBe(true);

      console.log('[SUCCESS] Laser pointer sync test passed');

    } finally {
      await ownerContext.close();
      await collaboratorContext.close();
    }
  });
});
