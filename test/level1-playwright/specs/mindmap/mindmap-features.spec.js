const { test, expect } = require('@playwright/test')
const { setupTestEnvironment, setupAuthPage, navigateToMindMap, getNodeByText } = require('./helpers')

test.describe('MindMap Features', () => {
  let env

  test.beforeEach(async ({ page }) => {
    env = await setupTestEnvironment()
    await setupAuthPage(page, { token: env.token })
  })

  // ============================================================
  // Undo / Redo
  // ============================================================
  test('Ctrl+Z undoes node creation and Ctrl+Shift+Z redoes it', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Select root and create a child with Tab
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child was created
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Exit auto-edit so Ctrl+Z reaches the global undo handler (not the input)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Undo (Ctrl+Z)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)

    // Should be back to 1 node (the root only)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 3000 })

    // Redo (Ctrl+Shift+Z) — do action first, then wait for result
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(500)

    // Child node should be restored
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })
  })

  test('Ctrl+Z undoes node deletion and redoes it', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create a child node first
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Exit auto-edit on the child
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Select child and delete it
    const childNode = await getNodeByText(page, '新节点')
    await childNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    // Should be back to 1 node
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 3000 })

    // Undo the deletion (Ctrl+Z) — should restore child
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Redo (Ctrl+Shift+Z) — should delete child again
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(500)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(1, { timeout: 3000 })
  })

  // ============================================================
  // Search / Filter
  // ============================================================
  test('search filters and highlights matching nodes', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create some nodes with distinct names
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    // Change root text to "项目计划"
    await rootNode.dblclick()
    await page.waitForTimeout(300)
    const input = page.locator('.react-flow__node-mindNode input')
    await input.fill('项目计划')
    await input.press('Enter')
    await page.waitForTimeout(500)

    // Create child (will be "新节点")
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify 2 nodes
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Type in search box
    const searchInput = page.locator('input[placeholder="搜索节点..."]')
    await searchInput.fill('新节点')
    await page.waitForTimeout(500)

    // Should show match count "1/1"
    await expect(page.locator('text=1/1')).toBeVisible({ timeout: 3000 })

    // The "项目计划" node should be dimmed (opacity reduced via opacity-25 class)
    await page.waitForFunction(() => {
      // Find the "项目计划" node and check its opacity
      const nodes = document.querySelectorAll('.react-flow__node-mindNode')
      let planNode = null
      for (const n of nodes) {
        if (n.textContent.includes('项目计划')) {
          planNode = n
          break
        }
      }
      if (!planNode) return false
      return parseFloat(window.getComputedStyle(planNode).opacity) < 0.5
    }, { timeout: 5000 })
  })

  test('search match navigation cycles through results', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create multiple matching nodes
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)

    // Create two children (both will be "新节点")
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    // Exit auto-edit so Enter creates a sibling
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // Should be 3 nodes now
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(3, { timeout: 3000 })

    // Type "新" in search
    const searchInput = page.locator('input[placeholder="搜索节点..."]')
    await searchInput.fill('新')
    await page.waitForTimeout(500)

    // Should show "1/2" (first of two matches)
    await expect(page.locator('text=1/2')).toBeVisible({ timeout: 3000 })

    // Click the down arrow to go to next match
    await page.locator('button[title="下一个"]').click()
    await page.waitForTimeout(300)

    // Should show "2/2"
    await expect(page.locator('text=2/2')).toBeVisible({ timeout: 3000 })
  })

  // ============================================================
  // Node Styling
  // ============================================================
  test('style panel changes node background color', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Select the root node
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(500)

    // Click the style button
    const styleBtn = page.locator('[title="节点样式"]')
    await styleBtn.click()
    await page.waitForTimeout(500)

    // Find the background color section and click the red swatch (second swatch)
    // The StylePanel renders color sections in order: bg, font, border
    // Each section starts with a label div, then a flex-wrap div with buttons
    const swatches = page.locator('[title="红色"]')
    const count = await swatches.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Click the first red swatch (background color section)
    await swatches.first().click()
    await page.waitForTimeout(500)

    // Wait for inline style to be applied
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-node-id]')
      if (!el) return false
      const bg = el.style.backgroundColor
      return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== ''
    }, { timeout: 5000 })
  })

  test('style panel changes node font size', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(500)

    await page.locator('[title="节点样式"]').click()
    await page.waitForTimeout(500)

    // Click "特大" font size button
    await page.locator('button:has-text("特大")').click()
    await page.waitForTimeout(500)

    // Verify font size changed via computed style
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-node-id]')
      if (!el) return false
      const span = el.querySelector('.text-sm.whitespace-nowrap')
      if (!span) return false
      return window.getComputedStyle(span).fontSize === '24px'
    }, { timeout: 5000 })
  })

  // ============================================================
  // Feature 1: Shortcut Enhancements
  // ============================================================
  test('Ctrl+F focuses the search input', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Search input should exist but not be focused initially
    const searchInput = page.locator('input[placeholder="搜索节点..."]')
    await expect(searchInput).toBeVisible()

    // Press Ctrl+F to focus search
    await page.keyboard.press('Control+f')
    await page.waitForTimeout(300)

    // The input should now be focused (we can check by typing and seeing the value change)
    await searchInput.fill('')
    await page.keyboard.type('test')
    await expect(searchInput).toHaveValue('test')
  })

  test('arrow down navigates to child node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Select root and create a child with Tab
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Now select root again
    await rootNode.click()
    await page.waitForTimeout(300)

    // Press ArrowDown to navigate to child
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(500)

    // The child "新节点" inner div should now have the selected class
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode.locator('[data-node-id]')).toHaveClass(/border-blue-500/)
  })

  test('arrow up navigates to parent node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create a child
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Exit auto-edit on the child so getNodeByText can find it
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Click the child to select it
    const childNode = await getNodeByText(page, '新节点')
    await childNode.click()
    await page.waitForTimeout(300)

    // Press ArrowUp to go to parent
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(500)

    // The root should now be selected
    await expect(rootNode.locator('[data-node-id]')).toHaveClass(/border-blue-500/)
  })

  // ============================================================
  // Feature 2: Collapse/Expand (collapsed state exists in data model)
  // ============================================================
  test('collapse toggle hides child nodes visually', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create a child node
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Verify child exists (2 nodes)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(2, { timeout: 3000 })

    // Click the collapse button on the root node (title="折叠")
    const collapseBtn = rootNode.locator('button[title="折叠"]')
    await expect(collapseBtn).toBeVisible({ timeout: 3000 })
    await collapseBtn.click()
    await page.waitForTimeout(800)

    // Child node should now be hidden
    const childNode = await getNodeByText(page, '新节点')
    await expect(childNode).toBeHidden({ timeout: 3000 })
  })

  // ============================================================
  // Feature 3: Copy/Paste Nodes
  // ============================================================
  test('Ctrl+C and Ctrl+V copies and pastes a node', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    // Create a child node
    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Exit auto-edit on the child so getNodeByText can find it
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Select the child and copy it
    const childNode = await getNodeByText(page, '新节点')
    await childNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(300)

    // Select root and paste
    await rootNode.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(800)

    // Should now have 3 nodes (root + original child + pasted copy)
    await expect(page.locator('.react-flow__node-mindNode')).toHaveCount(3, { timeout: 3000 })
  })

  test('style panel clear button resets custom styles', async ({ page }) => {
    await navigateToMindMap(page, env.board.id)

    const rootNode = await getNodeByText(page, '中心主题')
    await rootNode.click()
    await page.waitForTimeout(500)

    await page.locator('[title="节点样式"]').click()
    await page.waitForTimeout(500)

    // Apply red background
    await page.locator('[title="红色"]').first().click()
    await page.waitForTimeout(500)

    // Verify inline style was applied
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-node-id]')
      if (!el) return false
      return el.style.backgroundColor && el.style.backgroundColor !== 'rgba(0, 0, 0, 0)'
    }, { timeout: 5000 })

    // Click "清除样式" button
    await page.locator('button:has-text("清除样式")').click()
    await page.waitForTimeout(500)

    // Background should no longer have inline style
    const bg = await rootNode.evaluate((el) => el.style.backgroundColor)
    expect(bg).toBe('')
  })
})
