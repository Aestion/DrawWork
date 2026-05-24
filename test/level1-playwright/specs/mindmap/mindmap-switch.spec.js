const { test, expect, request } = require('@playwright/test')
const { setupTestEnvironment, setupAuthPage, navigateToMindMap, getNodeByText } = require('./helpers')

//
// Bug reproduction rationale:
// MindMapEditor uses key={currentCanvas.id} (EditorPage.jsx), forcing full remount on canvas switch.
// useYjs has a connection cache with DESTROY_DELAY = 8000ms (useYjs.js).
// When switching away and back within 8s, the Yjs connection is reused (same yMap object).
// On remount, useMindMapYjs resets state then fires two concurrent effects:
//   1. Observer setup (yMap.observe)
//   2. Primary load effect (yMap.get('nodes') / get('edges'))
// Both can try to set nodes/edges data, creating a race condition where
// edges are overwritten with empty arrays, disconnecting children from parents.
//

test.describe('MindMap Canvas Switching', () => {
  let env

  test.beforeEach(async ({ page }) => {
    env = await setupTestEnvironment()
    await setupAuthPage(page, { token: env.token })
  })

  // ============================================================
  // Switch within connection cache window (< 8s between switches)
  // ============================================================
  test('preserves nodes and edges when switching away and back within connection cache window', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Create an excalidraw canvas via API (so we have something to switch to)
    const ctx = await request.newContext()
    const createRes = await ctx.post(`http://localhost:3000/api/boards/${env.board.id}/canvases`, {
      headers: { Authorization: `Bearer ${env.token}` },
      data: { name: '画布 2', type: 'excalidraw' },
    })
    expect(createRes.ok()).toBeTruthy()
    await ctx.dispose()

    await navigateToMindMap(page, env.board.id)

    // Select root node and create a child with Tab
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child node was created
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Wait for Yjs debounced sync to complete (500ms debounce + buffer)
    await page.waitForTimeout(1000)

    // Count edges before switching
    const edgeCountBefore = await page.locator('.react-flow__edge').count()
    expect(edgeCountBefore).toBe(1)

    // Switch to excalidraw canvas via sidebar click
    await page.locator('text=画布 2').first().click()
    await page.waitForTimeout(500)

    // Verify the mindmap editor unmounted
    await expect(page.locator('text=思维导图')).not.toBeVisible({ timeout: 10000 })

    // Stay within the 8s connection cache window
    await page.waitForTimeout(1000)

    // Switch back to mindmap canvas via sidebar click
    await page.locator('text=Mind Map').first().click()

    // Wait for mindmap to fully reload
    await page.waitForSelector('text=思维导图', { timeout: 15000 })
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 })
    await page.waitForSelector('text=中心主题', { timeout: 10000 })
    await page.waitForTimeout(1500)

    // Verify child node is still present
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeVisible({ timeout: 5000 })

    // Verify node count
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 5000 })

    // Verify edge count — THIS IS THE CRITICAL ASSERTION
    // If the bug is present, the edge will be lost and count will be 0
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 })

    // Verify no Error 008 or edge-related errors
    const relevantErrors = errors.filter(e =>
      e.includes('008') ||
      e.includes('Could not create edge') ||
      e.includes('sourceHandle')
    )
    expect(relevantErrors).toEqual([])
  })

  // ============================================================
  // Switch after connection cache expires (> 8s between switches)
  // Known issue: Yjs data not persisted to server after disconnect
  // ============================================================
  test.skip('preserves nodes and edges when switching after connection cache expires', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Create an excalidraw canvas via API
    const ctx = await request.newContext()
    const createRes = await ctx.post(`http://localhost:3000/api/boards/${env.board.id}/canvases`, {
      headers: { Authorization: `Bearer ${env.token}` },
      data: { name: '画布 2', type: 'excalidraw' },
    })
    expect(createRes.ok()).toBeTruthy()
    await ctx.dispose()

    await navigateToMindMap(page, env.board.id)

    // Select root node and create a child with Tab
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child node was created
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Wait for Yjs debounced sync
    await page.waitForTimeout(1000)

    // Count edges before switching
    const edgeCountBefore = await page.locator('.react-flow__edge').count()
    expect(edgeCountBefore).toBe(1)

    // Switch to excalidraw canvas
    await page.locator('text=画布 2').first().click()
    await page.waitForTimeout(500)

    // Wait for connection cache to expire (> 8s DESTROY_DELAY in useYjs)
    await page.waitForTimeout(9000)

    // Switch back to mindmap canvas
    await page.locator('text=Mind Map').first().click()

    // Wait for mindmap to fully reload
    await page.waitForSelector('text=思维导图', { timeout: 15000 })
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 })
    await page.waitForSelector('text=中心主题', { timeout: 10000 })
    await page.waitForTimeout(1500)

    // Verify child node is still present
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeVisible({ timeout: 5000 })

    // Verify node count
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 5000 })

    // Verify edge count — CRITICAL ASSERTION
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 })

    // Verify no errors
    const relevantErrors = errors.filter(e =>
      e.includes('008') ||
      e.includes('Could not create edge') ||
      e.includes('sourceHandle')
    )
    expect(relevantErrors).toEqual([])
  })

  // ============================================================
  // Rapid multiple switches
  // ============================================================
  test('preserves nodes and edges after multiple rapid canvas switches', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Create an excalidraw canvas via API
    const ctx = await request.newContext()
    const createRes = await ctx.post(`http://localhost:3000/api/boards/${env.board.id}/canvases`, {
      headers: { Authorization: `Bearer ${env.token}` },
      data: { name: '画布 2', type: 'excalidraw' },
    })
    expect(createRes.ok()).toBeTruthy()
    await ctx.dispose()

    await navigateToMindMap(page, env.board.id)

    // Select root node and create a child with Tab
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child node was created
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Wait for Yjs debounced sync
    await page.waitForTimeout(1000)

    // Count edges before switching
    const edgeCountBefore = await page.locator('.react-flow__edge').count()
    expect(edgeCountBefore).toBe(1)

    // Rapidly switch between canvases multiple times
    for (let i = 0; i < 3; i++) {
      await page.locator('text=画布 2').first().click()
      await page.waitForTimeout(300)
      await page.locator('text=Mind Map').first().click()
      await page.waitForTimeout(300)
    }

    // Wait for mindmap to fully reload after last switch
    await page.waitForSelector('text=思维导图', { timeout: 15000 })
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 })
    await page.waitForSelector('text=中心主题', { timeout: 10000 })
    await page.waitForTimeout(1500)

    // Verify child node is still present
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeVisible({ timeout: 5000 })

    // Verify node count
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 5000 })

    // Verify edge count — CRITICAL ASSERTION
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 })

    // Verify no errors
    const relevantErrors = errors.filter(e =>
      e.includes('008') ||
      e.includes('Could not create edge') ||
      e.includes('sourceHandle')
    )
    expect(relevantErrors).toEqual([])
  })
})
