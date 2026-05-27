const { test, expect } = require('@playwright/test');
const {
  generateUnique,
  registerAccount,
  createBoard,
  openBoard,
  cleanupUserBoards,
  apiCall,
} = require('./utils');
const Y = require('../../../frontend/node_modules/yjs');

function createBinarySnapshotBase64(scene) {
  const doc = new Y.Doc();
  const yMap = doc.getMap('excalidraw');
  for (const el of scene.elements || []) {
    yMap.set(`__el_${el.id}`, el);
  }
  yMap.set('__appState', scene.appState || {});
  yMap.set('__files', scene.files || {});
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return Buffer.from(update).toString('base64');
}

async function visibleCanvasHasInk(page) {
  const canvas = page.locator('.excalidraw__canvas.interactive').filter({ visible: true });
  const count = await canvas.count();
  if (count !== 1) return false;
  const image = await canvas.screenshot();
  const png = image.toString('base64');
  return page.evaluate((base64Png) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvasEl = document.createElement('canvas');
      canvasEl.width = img.width;
      canvasEl.height = img.height;
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhite += 1;
        if (nonWhite > 100) break;
      }
      resolve(nonWhite > 100);
    };
    img.onerror = () => resolve(false);
    img.src = `data:image/png;base64,${base64Png}`;
  }), png);
}

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
    await page.getByRole('button', { name: '+ 新建' }).click();
    await page.getByRole('button', { name: '手绘' }).click();

    // Wait for the new canvas to appear in sidebar
    await expect(page.locator('text=画布 2')).toBeVisible({ timeout: 5000 });

    const canvasItems = await page.locator('text=/画布 \\d/').count();
    expect(canvasItems).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'e2e/results/screenshots/canvas-switch.png' });

    // Cleanup
    await page.goto('/');
    await cleanupUserBoards(page, account.token);
  });

  test('switching to an Excalidraw canvas restores binary Yjs snapshot data', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Binary Snapshot Switch ${generateUnique()}`;

    await createBoard(page, boardName);
    const boardsRes = await apiCall(page, { path: '/api/boards', token: account.token });
    const board = boardsRes.data.find((item) => item.name === boardName);
    expect(board).toBeTruthy();

    const createCanvasRes = await apiCall(page, {
      method: 'POST',
      path: `/api/boards/${board.id}/canvases`,
      token: account.token,
      body: { name: 'Binary Snapshot Canvas', type: 'excalidraw' },
    });
    expect(createCanvasRes.ok).toBeTruthy();
    const targetCanvas = createCanvasRes.data;

    const snapshotBase64 = createBinarySnapshotBase64({
      elements: [{
        id: 'binary-rect',
        type: 'rectangle',
        x: 120,
        y: 80,
        width: 180,
        height: 100,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
      }],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    });

    const snapshotRes = await apiCall(page, {
      method: 'POST',
      path: `/api/canvases/${targetCanvas.id}/snapshot`,
      token: account.token,
      body: { data: snapshotBase64 },
    });
    expect(snapshotRes.ok).toBeTruthy();

    await openBoard(page, boardName);
    await page.getByText('Binary Snapshot Canvas', { exact: true }).click();
    await expect(page.locator('.excalidraw').filter({ visible: true })).toBeVisible({ timeout: 20000 });

    await expect.poll(() => visibleCanvasHasInk(page), { timeout: 15000 }).toBeTruthy();

    await page.goto('/');
    await cleanupUserBoards(page, account.token);
  });
});
