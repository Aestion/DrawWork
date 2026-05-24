const { request } = require('@playwright/test')

const API_BASE = process.env.API_BASE || 'http://localhost/api'

// Create a test user, board, and mind map canvas via the API
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

  // 3. Create a mind map canvas
  const canvasRes = await ctx.post(`${API_BASE}/boards/${board.id}/canvases`, {
    headers: authHeaders,
    data: { name: 'Mind Map', type: 'mindmap' },
  })
  if (!canvasRes.ok()) {
    const body = await canvasRes.text()
    throw new Error(`Canvas creation failed: ${canvasRes.status()} ${body}`)
  }
  const canvas = await canvasRes.json()

  // 4. Delete the default excalidraw canvas so the mind map canvas is the only one
  //    (fetchCanvases auto-selects the first canvas)
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

// Navigate to the mind map editor and wait for it to load
async function navigateToMindMap(page, boardId) {
  await page.goto(`/board/${boardId}`, { waitUntil: 'networkidle' })
  // Wait for the editor to render (look for the toolbar title "思维导图")
  await page.waitForSelector('text=思维导图', { timeout: 20000 })
  // Wait for React Flow to be ready
  await page.waitForSelector('.react-flow__renderer', { timeout: 10000 })
  // Wait for nodes to render — by default there should be "中心主题"
  await page.waitForSelector('text=中心主题', { timeout: 10000 })
  // Small grace period for layout calculations
  await page.waitForTimeout(1000)
}

module.exports = { setupTestEnvironment, setupAuthPage, navigateToMindMap, getNodeByText, API_BASE }

// Get a node by its text content
async function getNodeByText(page, text) {
  const textNode = page
    .locator(`text=${text}`)
    .locator('xpath=ancestor::*[contains(@class, "react-flow__node-mindNode")][1]')
  const inputNode = page.locator('.react-flow__node-mindNode').filter({
    has: page.locator(`input[value="${text}"]`)
  })
  return textNode.or(inputNode).first()
}
