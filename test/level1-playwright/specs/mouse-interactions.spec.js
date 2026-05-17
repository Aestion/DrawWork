const { test, expect } = require('@playwright/test')
const { registerAccount, createBoard, openBoard } = require('./utils')

test.describe('Mouse Interactions', () => {
  test.beforeEach(async ({ page }) => {
    const user = await registerAccount(page)
    const boardName = `mouse-${Date.now()}`
    await createBoard(page, boardName)
    await openBoard(page, boardName)
    await page.waitForTimeout(2000)
    // Focus the canvas so keyboard shortcuts reach Excalidraw's handler
    await page.locator('.excalidraw__canvas.interactive').click()
  })

  async function getSceneElements(page) {
    return page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements() : []
    })
  }

  async function getSelectionState(page) {
    return page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      if (!exc) return { selectedCount: 0 }
      const appState = typeof exc.getAppState === 'function' ? exc.getAppState() : {}
      return {
        selectedCount: Object.keys(appState.selectedElementIds || {}).length,
      }
    })
  }

  /**
   * Draw a rectangle at page coordinates (cx,cy) as center, with given size.
   * Note: Drawing coordinates must be well inside the canvas (avoid left toolbar area).
   */
  async function drawCenteredRect(page, cx, cy, w, h) {
    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    await page.mouse.move(cx - w / 2, cy - h / 2)
    await page.mouse.down()
    await page.mouse.move(cx + w / 2, cy + h / 2)
    await page.mouse.up()
    await page.waitForTimeout(1500)
  }

  test('shape is auto-selected after drawing; clicking empty area deselects it', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await drawCenteredRect(page, cx, cy, 160, 120)

    // Element is auto-selected after drawing
    let state = await getSelectionState(page)
    expect(state.selectedCount).toBeGreaterThanOrEqual(1)

    // Click empty area to deselect
    await page.mouse.click(box.x + 5, box.y + 5)
    await page.waitForTimeout(500)

    state = await getSelectionState(page)
    expect(state.selectedCount).toBe(0)
  })

  test('drag-select covers multiple shapes', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Draw two rectangles side by side at canvas center
    await drawCenteredRect(page, cx - 110, cy, 80, 60)
    await drawCenteredRect(page, cx + 110, cy, 80, 60)

    expect((await getSceneElements(page)).length).toBe(2)

    // Click empty area to deselect auto-selected shapes
    await page.mouse.click(box.x + 5, box.y + 5)
    await page.waitForTimeout(300)

    // Drag-select covering both shapes
    await page.mouse.move(cx - 200, cy - 100)
    await page.mouse.down()
    await page.mouse.move(cx + 200, cy + 100)
    await page.mouse.up()
    await page.waitForTimeout(500)

    const state = await getSelectionState(page)
    expect(state.selectedCount).toBe(2)
  })

  test('clicking empty area deselects the active shape', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await drawCenteredRect(page, cx, cy, 120, 90)

    // Auto-selected after draw
    expect((await getSelectionState(page)).selectedCount).toBeGreaterThanOrEqual(1)

    // Click empty area (top-left corner) to deselect
    await page.mouse.click(box.x + 5, box.y + 5)
    await page.waitForTimeout(500)

    expect((await getSelectionState(page)).selectedCount).toBe(0)
  })

  test('dragging a shape changes its position', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await drawCenteredRect(page, cx, cy, 80, 60)

    const before = await page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      if (!exc || typeof exc.getSceneElements !== 'function') return null
      const el = exc.getSceneElements()[0]
      return el ? { x: el.x, y: el.y } : null
    })
    expect(before).not.toBeNull()

    // Element is auto-selected after drawing, so drag from center directly
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 150, cy + 100)
    await page.mouse.up()
    await page.waitForTimeout(1000)

    const after = await page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      if (!exc || typeof exc.getSceneElements !== 'function') return null
      const el = exc.getSceneElements()[0]
      return el ? { x: el.x, y: el.y } : null
    })
    expect(after.x).not.toBe(before.x)
    expect(after.y).not.toBe(before.y)
  })
})
