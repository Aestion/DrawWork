const { request } = require('@playwright/test')

const API_BASE = process.env.API_BASE || 'http://localhost/api'

// Create a test user, board, and tencent mind canvas via the API
async function setupTestEnvironment() {
  const ctx = await request.newContext()
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'Test123456!'
  const testUsername = `tester-${Date.now()}`

  // 1. Register a new user
  const registerRes = await ctx.post(`${API_BASE}/auth/register`, {
    data: { username: testUsername, email: testEmail, password: testPassword },
  })
  if (!registerRes.ok()) {
    const body = await registerRes.text()
    throw new Error(`Registration failed: ${registerRes.status()} ${body}`)
  }
  const { token, user } = await registerRes.json()
  const authHeaders = { Authorization: `Bearer ${token}` }

  // 2. Create a board
  const boardRes = await ctx.post(`${API_BASE}/boards`, {
    headers: authHeaders,
    data: { name: `Test Board ${Date.now()}` },
  })
  if (!boardRes.ok()) {
    const body = await boardRes.text()
    throw new Error(`Board creation failed: ${boardRes.status()} ${body}`)
  }
  const board = await boardRes.json()

  // 3. Create a tencent mind canvas
  const canvasRes = await ctx.post(`${API_BASE}/boards/${board.id}/canvases`, {
    headers: authHeaders,
    data: { name: 'Tencent Mind', type: 'tencentmind' },
  })
  if (!canvasRes.ok()) {
    const body = await canvasRes.text()
    throw new Error(`Canvas creation failed: ${canvasRes.status()} ${body}`)
  }
  const canvas = await canvasRes.json()

  // 4. Delete the default excalidraw canvas so the tencent mind canvas is the only one
  const canvasesRes = await ctx.get(`${API_BASE}/boards/${board.id}/canvases`, {
    headers: authHeaders,
  })
  const allCanvases = await canvasesRes.json()
  for (const c of allCanvases) {
    if (c.id !== canvas.id) {
      await ctx.delete(`${API_BASE}/canvases/${c.id}`, { headers: authHeaders })
    }
  }

  await ctx.dispose()

  return { token, user, board, canvas, email: testEmail, password: testPassword }
}

// Set localStorage BEFORE the page loads so the auth store initializes with the token
async function setupAuthPage(page, { token }) {
  await page.addInitScript((t) => {
    localStorage.setItem('drawwork_token', t)
  }, token)
}

// Navigate to the tencent mind editor and wait for it to load
async function navigateToTencentMind(page, boardId) {
  await page.goto(`/board/${boardId}`, { waitUntil: 'networkidle' })
  // The page may default to another canvas — click the 🧠 TencentMind canvas in sidebar
  const tencentItem = page.locator('text=Tencent Mind').first()
  if (await tencentItem.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tencentItem.click()
    await page.waitForTimeout(500)
  }
  // Wait for the editor to render (look for the toolbar title "腾讯思维")
  await page.waitForSelector('text=腾讯思维', { timeout: 20000 })
  // Wait for the simple-mind-map SVG to render (large SVG in .smm-mind-map-container)
  await page.waitForSelector('.smm-mind-map-container svg', { timeout: 10000 })
  // Wait for initial data to load (foreignObject richtext nodes)
  await page.waitForSelector('.smm-mind-map-container foreignObject', { timeout: 10000 })
  await page.waitForTimeout(1000)
}

// Get a node by its text content within the simple-mind-map SVG
async function getNodeByText(page, text) {
  return page.locator(`.smm-container text:has-text("${text}"), .smm-container [data-text]:has-text("${text}")`)
}

// Wait for the mind map to finish rendering
async function waitForRender(page, { timeout = 10000 } = {}) {
  await page.waitForFunction(() => {
    const container = document.querySelector('.smm-mind-map-container')
    if (!container) return false
    const fos = container.querySelectorAll('foreignObject')
    return fos.length > 0
  }, { timeout })
}

// Share board with another user via API
async function shareBoardWithUser(page, boardId, userId, permission = 'editor') {
  const token = await page.evaluate(() => localStorage.getItem('drawwork_token'))
  return page.evaluate(
    async ({ boardId, userId, permission, token }) => {
      const res = await fetch(`/api/boards/${boardId}/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, permission }),
      })
      return { status: res.status, ok: res.ok }
    },
    { boardId, userId, permission, token }
  )
}

// Get user ID via API
async function getUserId(page, token) {
  return page.evaluate(async (t) => {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${t}` }
    })
    const data = await res.json()
    return data.user?.id || data.user
  }, token)
}

module.exports = {
  setupTestEnvironment,
  setupAuthPage,
  navigateToTencentMind,
  getNodeByText,
  waitForRender,
  shareBoardWithUser,
  getUserId,
  API_BASE,
}
