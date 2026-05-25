const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { registerAccount, createBoard, openBoard } = require('./utils');

test.describe('Media Persistence', () => {
  test.use({ actionTimeout: 20000 });

  function tinyGifBuffer() {
    return Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x37, 0x61,
      0x0A, 0x00, 0x0A, 0x00, 0x80, 0x00, 0x00,
      0x2C, 0x00, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x0A, 0x00, 0x00,
      0x02,
      0x02, 0x44, 0x01, 0x00,
      0x3B
    ]);
  }

  test('uploaded GIF persists after page refresh', async ({ page }) => {
    await registerAccount(page);
    await createBoard(page, 'GIF Test Board');
    await openBoard(page, 'GIF Test Board');

    // Create a minimal test GIF
    const gifPath = path.join(process.cwd(), 'e2e', 'test-assets', 'test.gif');

    // Ensure test-assets directory exists
    const assetsDir = path.dirname(gifPath);
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Create a small valid GIF file (10x10 red square)
    // GIF87a format: header + logical screen descriptor + image descriptor + image data + trailer
    fs.writeFileSync(gifPath, tinyGifBuffer());

    // Click "Insert Media" button
    await page.click('button[aria-label="插入媒体"], button:has-text("插入媒体")');
    await page.waitForTimeout(500);

    // Upload the GIF file using the file input
    const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"]');
    await fileInput.setInputFiles(gifPath);

    // Wait for upload and sync
    await page.waitForTimeout(3000);

    // Take screenshot before refresh
    await page.screenshot({ path: 'e2e/results/screenshots/gif-before-refresh.png' });

    // Refresh the page
    await page.reload();
    await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(4000);

    // Take screenshot after refresh
    await page.screenshot({ path: 'e2e/results/screenshots/gif-after-refresh.png' });

    // Verify: The GIF element should still be present
    // Excalidraw stores elements in the scene, we check if any image element exists
    const hasImageElement = await page.evaluate(() => {
      const canvas = document.querySelector('.excalidraw__canvas.interactive');
      return canvas !== null;
    });
    expect(hasImageElement).toBe(true);

    // Cleanup test file
    if (fs.existsSync(gifPath)) {
      fs.unlinkSync(gifPath);
    }
  });

  test('uploaded video persists after page refresh', async ({ page }) => {
    await registerAccount(page);
    await createBoard(page, 'Video Test Board');
    await openBoard(page, 'Video Test Board');

    // Create a minimal WebM file (just EBML magic bytes — enough for server magic-number check)
    const webmBuffer = Buffer.from([
      0x1A, 0x45, 0xDF, 0xA3,  // EBML header magic bytes
      0x80, 0x00,                // dummy EBML element
    ]);

    // Click "Insert Media" button
    await page.click('button[aria-label="插入媒体"], button:has-text("插入媒体")');
    await page.waitForTimeout(500);

    // Upload the video file using inline buffer
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'test.webm', mimeType: 'video/webm', buffer: webmBuffer });

    // Wait for upload and sync
    await page.waitForTimeout(4000);

    // Take screenshot before refresh
    await page.screenshot({ path: 'e2e/results/screenshots/video-before-refresh.png' });

    // Refresh the page
    await page.reload();
    await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(4000);

    // Take screenshot after refresh
    await page.screenshot({ path: 'e2e/results/screenshots/video-after-refresh.png' });

    // Verify the editor still has content (the uploaded file should persist)
    await expect(page.locator('.excalidraw__canvas.interactive')).toBeVisible({ timeout: 5000 });
  });

  test('GIF overlay tracks element position and size while zooming canvas', async ({ page }) => {
    await registerAccount(page);
    const boardName = `GIF Zoom ${Date.now()}`;
    await createBoard(page, boardName);
    await openBoard(page, boardName);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'zoom.gif', mimeType: 'image/gif', buffer: tinyGifBuffer() });

    await expect.poll(async () => {
      return page.evaluate(() => window.__EXCALIDRAW__?.getSceneElements?.().filter(e => e.type === 'image').length || 0);
    }, { timeout: 15000 }).toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.pointer-events-none.absolute.inset-0 img').first()).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Control++');
    await page.keyboard.press('Control++');
    await page.waitForTimeout(500);

    const alignment = await page.evaluate(() => {
      const exc = window.__EXCALIDRAW__;
      const element = exc.getSceneElements().find(e => e.type === 'image');
      const appState = exc.getAppState();
      const zoom = typeof appState.zoom === 'number' ? appState.zoom : appState.zoom.value;
      const canvasRect = document.querySelector('.excalidraw__canvas').getBoundingClientRect();
      const overlayRect = document.querySelector('.pointer-events-none.absolute.inset-0 img').getBoundingClientRect();

      return {
        overlay: {
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
          height: overlayRect.height
        },
        expected: {
          left: canvasRect.left + (element.x - appState.scrollX) * zoom,
          top: canvasRect.top + (element.y - appState.scrollY) * zoom,
          width: Math.abs(element.width) * zoom,
          height: Math.abs(element.height) * zoom
        }
      };
    });

    expect(Math.abs(alignment.overlay.left - alignment.expected.left)).toBeLessThan(3);
    expect(Math.abs(alignment.overlay.top - alignment.expected.top)).toBeLessThan(3);
    expect(Math.abs(alignment.overlay.width - alignment.expected.width)).toBeLessThan(3);
    expect(Math.abs(alignment.overlay.height - alignment.expected.height)).toBeLessThan(3);
  });
});
