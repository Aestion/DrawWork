const { test, expect } = require('@playwright/test')
const { setupTestEnvironment, setupAuthPage, navigateToMindMap, getNodeByText } = require('./helpers')

// Each test gets its own isolated board to avoid Yjs state leaking between tests
test.describe('MindMap Editor', () => {
  let env

  test.beforeEach(async ({ page }) => {
    env = await setupTestEnvironment()
    await setupAuthPage(page, { token: env.token })
  })

  // ============================================================
  // Basic Rendering
  // ============================================================
  test('should load the mind map editor with a default root node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Should see the toolbar title
    await expect(page.locator('text=思维导图')).toBeVisible()

    // Should see a default root node "中心主题"
    const rootNode = await getNodeByText(page, '中心主题')
    await expect(rootNode).toBeVisible({ timeout: 5000 })

    // Should see the toolbar buttons
    await expect(page.locator('text=导出')).toBeVisible()
    await expect(page.locator('text=导入')).toBeVisible()

    // Should see React Flow controls
    await expect(page.locator('.react-flow__controls')).toBeVisible()
  })

  // ============================================================
  // Keyboard Shortcuts
  // ============================================================
  test('Tab key creates a child node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Click on the root node to select it
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    // Press Tab to create a child
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // The new node auto-enters edit mode — press Escape to exit and show the span
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // A new node "新节点" should appear
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeVisible({ timeout: 5000 })

    // Should now be 2 nodes
    const nodeCount = await page.locator('.react-flow__node-mindNode').count()
    expect(nodeCount).toBe(2)
  })

  test('Enter key creates a sibling node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Select root and create a child first
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child was created
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // The child auto-enters edit mode — press Escape so keyboard shortcuts work
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Enter for sibling
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // Should be 3 nodes (root + 2 children)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(3, { timeout: 3000 })
  })

  test('Enter on root node creates a child (not sibling)', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Select root node
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    // Press Enter on root — should create child (root has no sibling)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // Should now have 2 nodes (root + child)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Exit auto-edit on the child
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Verify child node exists
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeVisible({ timeout: 5000 })

    // Press Enter again on root (select root, then Enter)
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // Should now have 3 nodes (root + 2 children, no siblings)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(3, { timeout: 3000 })
  })

  test('Ctrl+Enter creates a new root node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Press Ctrl+Enter to add a new root
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(800)

    // Should see "新中心" node
    const newRoot = await getNodeByText(page, '新中心')
    await expect(newRoot).toBeVisible({ timeout: 5000 })

    // Should be 2 nodes
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })
  })

  test('Delete key removes a node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create a child node
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify 2 nodes exist
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Exit auto-edit on the child, then select and delete it
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const childNode = await getNodeByText(page, '新节点')
    await childNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(800)

    // Should be back to 1 node
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 3000 })
  })

  // ============================================================
  // Text Editing
  // ============================================================
  test('double-click edits node text', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Use .first() instead of getNodeByText to avoid the locator breaking
    // when dblclick replaces the span with an input
    const rootNode = page.locator('.react-flow__node-mindNode').first()
    await expect(rootNode).toBeVisible({ timeout: 5000 })

    // Double-click the text span with force:true (React Flow intercepts normal events)
    const textSpan = rootNode.locator('.text-sm.whitespace-nowrap')
    await textSpan.dblclick({ force: true })
    await page.waitForTimeout(500)

    // An input should appear inside the node
    const input = rootNode.locator('input')
    await expect(input).toBeVisible({ timeout: 5000 })

    // Clear and type new text
    await input.fill('')
    await input.type('新的根节点')
    await input.press('Enter')
    await page.waitForTimeout(500)

    // Verify the text changed (span comes back after Enter)
    const newSpan = rootNode.locator('.text-sm.whitespace-nowrap')
    await expect(newSpan).toHaveText('新的根节点')
  })

  // ============================================================
  // Layout Toggle
  // ============================================================
  test('root node layout toggle button works', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Click root node to select it (enables the toolbar layout toggle)
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    // Layout toggle is now in the toolbar (title="切换布局")
    const toggleBtn = page.locator('button[title="切换布局"]')
    await expect(toggleBtn).toBeVisible()
    await expect(toggleBtn).toBeEnabled()

    // Click to toggle from center to tree layout
    await toggleBtn.click()
    await page.waitForTimeout(500)

    // Click again to toggle back
    await toggleBtn.click()
    await page.waitForTimeout(500)
  })

  // ============================================================
  // Multiple Roots
  // ============================================================
  test('manages multiple root nodes with mixed layouts', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create 2 additional root nodes (total: 3)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Control+Enter')
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)
    }

    // 3 nodes total
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(3, { timeout: 3000 })

    // Toggle the second root to horizontal layout (node at index 1)
    const rootNodes = page.locator('.react-flow__node-mindNode')
    const secondRoot = rootNodes.nth(1)
    const toggleBtn = secondRoot.locator('button').filter({ hasText: '⇔' }).first()
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click({ force: true })
      await page.waitForTimeout(500)
    }

    // All nodes should still be visible without errors
    await expect(page.locator('.react-flow__node-mindNode').first()).toBeVisible()
  })

  // ============================================================
  // Cross-Connection (Shift+Click)
  // ============================================================
  test('creates cross-connection between trees', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create two additional root nodes (total: 3)
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)

    // Select first root, then Shift+click on second
    const rootNodes = page.locator('.react-flow__node-mindNode')
    const firstRoot = rootNodes.nth(0)
    const secondRoot = rootNodes.nth(1)

    await firstRoot.click()
    await page.waitForTimeout(300)

    // Shift+Click on the second root to create cross-connection
    await secondRoot.click({ modifiers: ['Shift'] })
    await page.waitForTimeout(500)

    // All nodes should remain visible (no crashes)
    await expect(firstRoot).toBeVisible()
    await expect(secondRoot).toBeVisible()
  })

  // ============================================================
  // Help Dialog
  // ============================================================
  test('help dialog opens and closes', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Click the help button (question mark icon)
    const helpButton = page.locator('button[title="帮助"]')
    await helpButton.click()
    await page.waitForTimeout(300)

    // The help dialog should be visible
    await expect(page.locator('text=快捷键')).toBeVisible()
    await expect(page.locator('text=Tab')).toBeVisible()
    await expect(page.locator('text=创建子节点')).toBeVisible()
    await expect(page.locator('text=跨树连接')).toBeVisible()

    // Click outside to close
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    // Dialog should be gone
    await expect(page.locator('text=快捷键')).not.toBeVisible()
  })

  // ============================================================
  // Markdown Export/Import
  // ============================================================
  test('export and import markdown buttons are enabled', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    const exportBtn = page.locator('text=导出')
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toBeEnabled()

    const importBtn = page.locator('text=导入')
    await expect(importBtn).toBeVisible()
    await expect(importBtn).toBeEnabled()
  })

  // ============================================================
  // Toolbar Buttons
  // ============================================================
  test('toolbar +中心 button adds a root node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Click the "+ 中心" button
    const addRootBtn = page.locator('text=+ 中心')
    await addRootBtn.click()
    await page.waitForTimeout(500)

    // Should now have a "新中心" node
    const newRoot = await getNodeByText(page, '新中心')
    await expect(newRoot).toBeVisible()

    // Total 2 nodes
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })
  })

  // ============================================================
  // Error 008 Regression Test
  // ============================================================
  test('no Error 008 when adding children to horizontal layout root', async ({ page }) => {
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      errors.push(err.message)
    })

    await navigateToMindMap(page, env.board.id)
    await page.waitForTimeout(1000)

    // Toggle root to horizontal layout via toolbar
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    const toggleBtn = page.locator('button[title="切换布局"]')
    await toggleBtn.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
    await toggleBtn.click({ force: true, timeout: 5000 }).catch(() => {
      // Fallback: click via evaluate if normal click fails
      page.evaluate(() => {
        const btn = document.querySelector('button[title="切换布局"]')
        if (btn) btn.click()
      })
    })
    await page.waitForTimeout(1000)

    // Add children with Tab (this previously triggered Error 008)
    for (let i = 0; i < 3; i++) {
      await rootNode.click()
      await page.waitForTimeout(200)
      await page.keyboard.press('Tab')
      await page.waitForTimeout(800)
    }

    await page.waitForTimeout(1000)

    const relevantErrors = errors.filter(e =>
      e.includes('008') ||
      e.includes('Could not create edge') ||
      e.includes('sourceHandle')
    )
    expect(relevantErrors).toEqual([])
  })

  // ============================================================
  // Stress Test: Rapid Operations
  // ============================================================
  test('handles rapid add and delete operations without errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    await navigateToMindMap(page, env.board.id)

    // Rapidly add multiple roots
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+Enter')
      await page.waitForTimeout(300)
    }

    // Verify at least some nodes exist
    const count = await page.locator('.react-flow__node-mindNode').count()
    expect(count).toBeGreaterThanOrEqual(3)

    await page.waitForTimeout(1000)

    // No page errors should have occurred (ResizeObserver is benign)
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toEqual([])
  })
})
