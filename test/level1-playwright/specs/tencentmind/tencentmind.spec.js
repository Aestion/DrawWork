const { test, expect } = require('@playwright/test')
const { setupTestEnvironment, setupAuthPage, navigateToTencentMind, waitForRender } = require('./helpers')

test.describe('TencentMind Editor', () => {
  let env

  test.beforeEach(async ({ page }) => {
    env = await setupTestEnvironment()
    await setupAuthPage(page, { token: env.token })
  })

  // ============================================================
  // Basic Rendering
  // ============================================================
  test('should load the tencent mind editor with default data', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)

    // Should see the toolbar title
    await expect(page.locator('text=腾讯思维')).toBeVisible()

    // Should see the layout selector (first select)
    await expect(page.locator('select').first()).toBeVisible()

    // Should see the readonly checkbox
    await expect(page.locator('text=只读')).toBeVisible()
  })

  // ============================================================
  // Layout Switching
  // ============================================================
  test('layout switch: change from mindMap to logicalStructure', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    // Find the layout selector and change it
    const layoutSelect = page.locator('select').first()
    await layoutSelect.selectOption('logicalStructure')
    await page.waitForTimeout(500)

    // Verify the SVG still renders (use .first() to avoid strict mode on multiple SVGs)
    const svg = page.locator('.smm-mind-map-container svg').first()
    await expect(svg).toBeVisible()
  })

  // ============================================================
  // Theme Switching
  // ============================================================
  test('theme switch: change from default to dark', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    // Find the theme selector (second select) and change it
    const themeSelect = page.locator('select').nth(1)
    await themeSelect.selectOption('dark')
    await page.waitForTimeout(500)

    // Verify the SVG still renders
    const svg = page.locator('.smm-mind-map-container svg').first()
    await expect(svg).toBeVisible()
  })

  // ============================================================
  // Readonly Mode
  // ============================================================
  test('readonly mode: toggle readonly checkbox', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    // Find the readonly checkbox
    const checkbox = page.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()

    // Toggle it on
    await checkbox.check()
    await page.waitForTimeout(300)

    // Verify the mind map is still rendered
    const svg = page.locator('.smm-mind-map-container svg').first()
    await expect(svg).toBeVisible()
  })
})
