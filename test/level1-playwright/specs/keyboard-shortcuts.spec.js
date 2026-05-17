const { test, expect } = require('@playwright/test')
const { registerAccount, createBoard, openBoard } = require('./utils')

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    const user = await registerAccount(page)
    const boardName = `kb-${Date.now()}`
    await createBoard(page, boardName)
    await openBoard(page, boardName)
    // Extra settle time for Excalidraw + Yjs connection
    await page.waitForTimeout(2000)
    // Focus the canvas so keyboard shortcuts reach Excalidraw's handler
    await page.locator('.excalidraw__canvas.interactive').click()
  })

  /**
   * Helper: draw a shape from (sx,sy) to (ex,ey).
   * The caller must have pressed the tool key beforehand.
   */
  async function drawShape(page, sx, sy, ex, ey) {
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(ex, ey)
    await page.mouse.up()
    await page.waitForTimeout(1500)
  }

  /**
   * Helper: get scene elements via the exposed __EXCALIDRAW__ API.
   */
  async function getSceneElements(page) {
    return page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements() : []
    })
  }

  test('r key selects rectangle tool and draws a rectangle', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy - 60, cx + 80, cy + 60)

    const elements = await getSceneElements(page)
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[elements.length - 1].type).toBe('rectangle')
  })

  test('o key selects ellipse tool and draws an ellipse', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.keyboard.press('o')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy - 60, cx + 80, cy + 60)

    const elements = await getSceneElements(page)
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[elements.length - 1].type).toBe('ellipse')
  })

  test('d key selects diamond tool and draws a diamond', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.keyboard.press('d')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy - 60, cx + 80, cy + 60)

    const elements = await getSceneElements(page)
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[elements.length - 1].type).toBe('diamond')
  })

  test('a key selects arrow tool and draws an arrow', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.keyboard.press('a')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy, cx + 80, cy)

    const elements = await getSceneElements(page)
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[elements.length - 1].type).toBe('arrow')
  })

  test('Ctrl+Z undoes the last drawing action', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    const beforeCount = (await getSceneElements(page)).length

    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy - 60, cx + 80, cy + 60)

    expect((await getSceneElements(page)).length).toBe(beforeCount + 1)

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(1500)

    expect((await getSceneElements(page)).length).toBe(beforeCount)
  })

  test('Delete key removes a selected element', async ({ page }) => {
    const canvas = page.locator('.excalidraw__canvas.interactive')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    const beforeCount = (await getSceneElements(page)).length

    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    await drawShape(page, cx - 80, cy - 60, cx + 80, cy + 60)

    expect((await getSceneElements(page)).length).toBe(beforeCount + 1)

    // Element is auto-selected after draw, press Delete to remove it
    await page.keyboard.press('Delete')
    await page.waitForTimeout(1500)

    expect((await getSceneElements(page)).length).toBe(beforeCount)
  })
})
