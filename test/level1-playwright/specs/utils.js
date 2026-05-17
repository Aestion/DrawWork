const { expect } = require('@playwright/test');

// ─── Account helpers ───────────────────────────────────────────────

function generateUnique(prefix = 'e2e') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}_${timestamp}_${random}`;
}

async function registerAccount(page, { username, email, password = 'TestPass123!' } = {}) {
  const u = username || generateUnique('user');
  const e = email || `${u}@test.local`;

  await page.goto('/register');
  await page.waitForSelector('input[type="text"]', { state: 'visible', timeout: 10000 });

  await page.fill('input[type="text"]', u);
  await page.fill('input[type="email"]', e);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard or token to be set
  await expect(page).toHaveURL('/', { timeout: 15000 });

  // Extract token from localStorage for API calls
  const token = await page.evaluate(() => localStorage.getItem('drawwork_token'));

  return { username: u, email: e, password, token };
}

async function loginAccount(page, { email, password }) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { state: 'visible', timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 15000 });

  const token = await page.evaluate(() => localStorage.getItem('drawwork_token'));
  return { email, password, token };
}

// ─── API client (runs in browser via evaluate) ─────────────────────

async function apiCall(page, { method = 'GET', path, body, token }) {
  return page.evaluate(
    async ({ method, path, body, token }) => {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      return { status: res.status, ok: res.ok, data };
    },
    { method, path, body, token }
  );
}

// ─── Cleanup helpers ───────────────────────────────────────────────

async function deleteBoard(page, boardId, token) {
  return apiCall(page, { method: 'DELETE', path: `/api/boards/${boardId}`, token });
}

async function listBoards(page, token) {
  return apiCall(page, { method: 'GET', path: '/api/boards', token });
}

async function cleanupUserBoards(page, token) {
  const result = await listBoards(page, token);
  if (!result.ok || !Array.isArray(result.data)) return;

  for (const board of result.data) {
    if (board.permission === 'owner') {
      await deleteBoard(page, board.id, token);
    }
  }
}

// ─── Smart wait helpers (replace fixed waitForTimeout) ─────────────

async function waitForBoardsLoaded(page, { timeout = 10000 } = {}) {
  // Wait for the boards grid to appear and have children
  await page.waitForSelector('.grid', { state: 'visible', timeout });
  // Wait for at least one board card or the empty state
  await Promise.race([
    page.waitForSelector('.grid > div', { state: 'visible', timeout }),
    page.waitForSelector('text=/暂无画板|还没有画板/', { state: 'visible', timeout }),
  ]);
}

async function waitForEditorReady(page, { timeout = 20000 } = {}) {
  await page.waitForSelector('.excalidraw', { state: 'visible', timeout });
  // Wait for Yjs connection - look for online indicator (人在线) or connection status
  await Promise.race([
    page.waitForSelector('text=/\\d+ 人在线/', { state: 'visible', timeout }),
    page.waitForSelector('text=synced', { state: 'visible', timeout }),
    page.waitForSelector('text=disconnected', { state: 'visible', timeout }),
  ]);
}

async function waitForNetworkIdleAfterAction(page, actionFn, { timeout = 10000 } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/api/') && resp.status() < 500,
      { timeout }
    ),
    actionFn(),
  ]);
  return response;
}

// ─── Board helpers ─────────────────────────────────────────────────

async function createBoard(page, name) {
  await page.click('text=新建画板');
  await page.waitForSelector('#board-name', { state: 'visible' });
  await page.fill('#board-name', name);

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/boards') && resp.status() === 201,
    { timeout: 10000 }
  );
  await page.click('button[type="submit"]');
  await responsePromise;

  await expect(page.locator(`text=${name}`)).toBeVisible();
}

async function openBoard(page, name) {
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/boards/') && resp.url().includes('/canvases'),
    { timeout: 10000 }
  );
  await page.locator('.grid > div', { hasText: name }).click();
  await responsePromise;
  await waitForEditorReady(page);
}

// ─── Misc helpers ───────────────────────────────────────────────────

async function getToken(page) {
  return page.evaluate(() => localStorage.getItem('drawwork_token'))
}

async function getBoardId(page) {
  const url = page.url()
  const match = url.match(/\/board\/([a-f0-9-]+)/i)
  return match ? match[1] : null
}

async function registerGetUser(page) {
  const result = await registerAccount(page)
  return { ...result, token: result.token }
}

async function shareBoardWithUser(page, boardId, userId, permission = 'editor') {
  const token = await getToken(page)
  return apiCall(page, {
    method: 'POST',
    path: `/api/boards/${boardId}/shares`,
    body: { user_id: userId, permission },
    token
  })
}

async function getUserId(page, token) {
  return page.evaluate(async (t) => {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${t}` }
    });
    const data = await res.json();
    return data.id;
  }, token);
}

// ─── Scene data helpers (for sync verification) ─────────────────────

async function getSceneElements(page) {
  return page.evaluate(() => {
    const exc = window.__EXCALIDRAW__;
    return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements() : [];
  });
}

async function waitForSceneElements(page, minCount, { timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const elements = await getSceneElements(page);
    if (elements.length >= minCount) return elements;
    await page.waitForTimeout(300);
  }
  const elements = await getSceneElements(page);
  throw new Error(
    `Timeout waiting for sync: expected ≥${minCount} elements, got ${elements.length} after ${timeout}ms`
  );
}

// ─── Export ────────────────────────────────────────────────────────

module.exports = {
  generateUnique,
  registerAccount,
  loginAccount,
  apiCall,
  deleteBoard,
  listBoards,
  cleanupUserBoards,
  waitForBoardsLoaded,
  waitForEditorReady,
  waitForNetworkIdleAfterAction,
  createBoard,
  openBoard,
  getToken,
  getBoardId,
  registerGetUser,
  shareBoardWithUser,
  getUserId,
  getSceneElements,
  waitForSceneElements,
};
