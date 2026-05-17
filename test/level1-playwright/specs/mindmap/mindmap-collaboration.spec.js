const { test, expect } = require('@playwright/test')
const { setupTestEnvironment, setupAuthPage, navigateToMindMap, getNodeByText } = require('./helpers')

test.describe('MindMap Collaboration', () => {
  let env
  let tokenB
  let contextA, pageA, contextB, pageB

  test.beforeEach(async ({ browser, request: api }) => {
    env = await setupTestEnvironment()

    // Register User B via API
    const ts = Date.now()
    const bEmail = `mmb-${ts}@test.com`
    const bUser = `mmb-${ts}`

    const regRes = await api.post('http://localhost:3000/api/auth/register', {
      data: { username: bUser, email: bEmail, password: 'Test123456!' }
    })
    expect(regRes.ok()).toBeTruthy()

    const loginRes = await api.post('http://localhost:3000/api/auth/login', {
      data: { email: bEmail, password: 'Test123456!' }
    })
    expect(loginRes.ok()).toBeTruthy()
    const loginData = await loginRes.json()
    tokenB = loginData.token
    const userBId = loginData.user?.id || loginData.user

    // Share board with User B
    const shareRes = await api.post(`http://localhost:3000/api/boards/${env.board.id}/shares`, {
      headers: { Authorization: `Bearer ${env.token}` },
      data: { user_id: userBId, permission: 'editor' }
    })
    expect([200, 201]).toContain(shareRes.status())

    // Two isolated browser contexts with auth tokens
    contextA = await browser.newContext()
    pageA = await contextA.newPage()
    await setupAuthPage(pageA, { token: env.token })

    contextB = await browser.newContext()
    pageB = await contextB.newPage()
    await setupAuthPage(pageB, { token: tokenB })

    // Both navigate to the same board (mindmap canvas)
    await navigateToMindMap(pageA, env.board.id)
    await navigateToMindMap(pageB, env.board.id)

    // Verify both see the initial root node before proceeding
    await expect(pageA.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 5000 })
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 5000 })
  })

  test.afterEach(async () => {
    await contextA?.close()
    await contextB?.close()
  })

  // ─── 1. Node Creation Sync ───────────────────────────────────────

  test('node creation: user A creates child (Tab), user B sees it', async () => {
    // A: select root, press Tab to create child node
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(200)

    // B: should see 2 nodes and the new child text
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })
    await expect(pageB.locator('text=新节点')).toBeVisible({ timeout: 5000 })
  })

  // ─── 2. Text Edit Sync ──────────────────────────────────────────

  test('text edit: user A edits node text, user B sees updated content', async () => {
    // A: create a child node first
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(300)

    // Wait for B to see 2 nodes
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })

    // A: double-click child to edit text
    const childA = pageA.locator('.react-flow__node-mindNode').nth(1)
    const textSpan = childA.locator('.text-sm.whitespace-nowrap')
    await textSpan.dblclick({ force: true })
    await pageA.waitForTimeout(500)

    const input = childA.locator('input')
    await input.waitFor({ state: 'visible', timeout: 3000 })
    await input.fill('')
    await input.type('协同编辑测试')
    await input.press('Enter')
    await pageA.waitForTimeout(500)

    // B: should see the updated text
    await expect(pageB.locator('text=协同编辑测试')).toBeVisible({ timeout: 10000 })
  })

  // ─── 3. Node Deletion Sync ──────────────────────────────────────

  test('node deletion: user A deletes node, user B sees removal', async () => {
    // A: create a child node
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(300)

    // B: sees 2 nodes
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })

    // A: select the child and press Delete
    const childNode = await getNodeByText(pageA, '新节点')
    await childNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Delete')
    await pageA.waitForTimeout(800)

    // B: sees back to 1 node
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 10000 })
  })

  // ─── 4. New Root Sync ───────────────────────────────────────────

  test('new root: user A creates new root (Ctrl+Enter), user B sees it', async () => {
    // A: press Ctrl+Enter to add a new root node
    await pageA.keyboard.press('Control+Enter')
    await pageA.waitForTimeout(800)

    // B: should see 2 nodes including "新中心"
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })
    await expect(pageB.locator('text=新中心')).toBeVisible({ timeout: 5000 })
  })

  // ─── 5. Style Sync ──────────────────────────────────────────────

  test('style sync: user A changes node background color, user B sees new color', async () => {
    // A: select the root node
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(500)

    // A: open style panel and apply background color
    await pageA.locator('[title="节点样式"]').click()
    await pageA.waitForTimeout(500)
    await pageA.locator('[title="红色"]').first().click()
    await pageA.waitForTimeout(800)

    // B: should see the style change via inline backgroundColor
    await pageB.waitForFunction(() => {
      const el = document.querySelector('[data-node-id]')
      if (!el) return false
      const bg = el.style.backgroundColor
      return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== ''
    }, { timeout: 10000 })
  })

  // ─── 6. Collapse Sync ───────────────────────────────────────────

  test('collapse sync: user A collapses parent, user B sees child hidden', async () => {
    // A: create a child node
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(300)

    // B: sees 2 nodes
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })

    // A: select root node then press Left arrow to collapse (has children)
    await rootNode.click({ force: true })
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('ArrowLeft')
    await pageA.waitForTimeout(800)

    // B: child node should be hidden
    const childB = await getNodeByText(pageB, '新节点')
    await expect(childB).toBeHidden({ timeout: 10000 })
  })

  // ─── 7. Undo Sync ───────────────────────────────────────────────

  test('undo sync: user A undoes node creation, user B sees node disappear then reappear on redo', async () => {
    // A: create a child node
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(300)

    // B: sees 2 nodes
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })

    // A: Ctrl+Z to undo creation
    await pageA.keyboard.press('Control+z')
    await pageA.waitForTimeout(800)

    // B: sees back to 1 node
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 10000 })

    // A: Ctrl+Shift+Z to redo
    await pageA.keyboard.press('Control+Shift+z')
    await pageA.waitForTimeout(800)

    // B: sees 2 nodes again
    await expect(pageB.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 10000 })
  })

  // ─── 8. Edge Sync ───────────────────────────────────────────────

  test('edge sync: user A creates child, user B sees connecting edge', async () => {
    // A: create a child node (creates a parent-child edge)
    const rootNode = await getNodeByText(pageA, '中心主题')
    await rootNode.click()
    await pageA.waitForTimeout(300)
    await pageA.keyboard.press('Tab')
    await pageA.waitForTimeout(800)
    await pageA.keyboard.press('Escape')
    await pageA.waitForTimeout(300)

    // B: should see 1 edge connecting parent to child
    await expect(pageB.locator('.react-flow__edge')).toHaveCount(1, { timeout: 10000 })
  })
})
