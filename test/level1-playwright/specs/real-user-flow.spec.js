const { test, expect } = require('@playwright/test')
const { registerAccount, createBoard, openBoard, waitForEditorReady } = require('./utils')

test.describe('Real User Flow Simulation', () => {

  async function getSceneElements(page) {
    return page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      return exc && typeof exc.getSceneElements === 'function' ? exc.getSceneElements() : []
    })
  }

  test('comprehensive user journey: register, draw, edit, persist', async ({ page }) => {
    // ── Step 1: Register a new account ──
    const user = await registerAccount(page)
    expect(user.token).toBeTruthy()

    // ── Step 2: Create a new board ──
    const boardName = `真人-${Date.now()}`
    await createBoard(page, boardName)
    await page.screenshot({ path: 'e2e/results/screenshots/real-user-01-board-created.png' })

    // ── Step 3: Open the board ──
    await openBoard(page, boardName)
    await page.waitForTimeout(1000)

    // Focus the canvas
    const canvas = page.locator('.excalidraw__canvas.interactive')
    await canvas.click()
    await page.waitForTimeout(500)

    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.screenshot({ path: 'e2e/results/screenshots/real-user-02-editor-loaded.png' })

    // ── Step 4: Draw a rectangle (like a real user would) ──
    await page.keyboard.press('r')
    await page.waitForTimeout(200)
    await page.mouse.move(cx - 120, cy - 80)
    await page.mouse.down()
    await page.mouse.move(cx + 120, cy + 80)
    await page.mouse.up()
    await page.waitForTimeout(500)

    let elements = await getSceneElements(page)
    const rectCount = elements.filter(e => e.type === 'rectangle').length
    expect(rectCount).toBeGreaterThanOrEqual(1)
    console.log(`  ✓ Drawn rectangle. Total elements: ${elements.length}`)

    // ── Step 5: Draw an ellipse ──
    await page.keyboard.press('o')
    await page.waitForTimeout(200)
    await page.mouse.move(cx + 200, cy - 60)
    await page.mouse.down()
    await page.mouse.move(cx + 350, cy + 60)
    await page.mouse.up()
    await page.waitForTimeout(500)

    elements = await getSceneElements(page)
    const ellipseCount = elements.filter(e => e.type === 'ellipse').length
    expect(ellipseCount).toBeGreaterThanOrEqual(1)
    console.log(`  ✓ Drawn ellipse. Total elements: ${elements.length}`)

    // ── Step 6: Draw an arrow ──
    await page.keyboard.press('a')
    await page.waitForTimeout(200)
    await page.mouse.move(cx - 200, cy + 80)
    await page.mouse.down()
    await page.mouse.move(cx - 50, cy + 150)
    await page.mouse.up()
    await page.waitForTimeout(500)

    elements = await getSceneElements(page)
    const arrowCount = elements.filter(e => e.type === 'arrow').length
    expect(arrowCount).toBeGreaterThanOrEqual(1)
    console.log(`  ✓ Drawn arrow. Total elements: ${elements.length}`)

    await page.screenshot({ path: 'e2e/results/screenshots/real-user-03-all-shapes.png' })

    // ── Step 7: Undo the last action (arrow) ──
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(1000)

    elements = await getSceneElements(page)
    const arrowAfterUndo = elements.filter(e => e.type === 'arrow').length
    expect(arrowAfterUndo).toBe(0)
    console.log('  ✓ Undo removed the arrow')

    // ── Step 8: Redo the undo ──
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(1000)

    elements = await getSceneElements(page)
    const arrowAfterRedo = elements.filter(e => e.type === 'arrow').length
    expect(arrowAfterRedo).toBeGreaterThanOrEqual(1)
    console.log('  ✓ Redo restored the arrow')

    // ── Step 9: Select the rectangle and delete it ──
    // Select the rectangle via API (simulates a real click on the element)
    await page.evaluate(() => {
      const exc = window.__EXCALIDRAW__
      if (!exc) return
      const elements = exc.getSceneElements()
      const rect = elements.find(e => e.type === 'rectangle')
      if (rect) {
        exc.updateScene({
          elements,
          appState: { ...exc.getAppState(), selectedElementIds: { [rect.id]: true } }
        })
      }
    })
    await page.waitForTimeout(300)

    await page.keyboard.press('Delete')
    await page.waitForTimeout(1000)

    elements = await getSceneElements(page)
    const rectAfterDelete = elements.filter(e => e.type === 'rectangle').length
    expect(rectAfterDelete).toBe(0)
    console.log('  ✓ Deleted the rectangle')

    // ── Step 10: Undo the deletion ──
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(1000)

    elements = await getSceneElements(page)
    const rectAfterUndo = elements.filter(e => e.type === 'rectangle').length
    expect(rectAfterUndo).toBeGreaterThanOrEqual(1)
    console.log('  ✓ Undo restored the deleted rectangle')

    await page.screenshot({ path: 'e2e/results/screenshots/real-user-04-after-undo-delete.png' })

    // ── Step 11: Navigate to dashboard and back ──
    const boardUrl = page.url()
    await page.goto('/')
    await page.waitForSelector('.grid', { timeout: 10000 })
    console.log('  ✓ Navigated to dashboard')

    // Click back to the board
    await page.locator('.grid > div', { hasText: boardName }).click()
    await page.waitForSelector('.excalidraw', { timeout: 20000 })

    // Poll for elements to appear (restored from snapshot or Yjs)
    for (let i = 0; i < 40; i++) {
      elements = await getSceneElements(page)
      if (elements.length > 0) break
      await page.waitForTimeout(500)
    }

    // ── Step 12: Verify all shapes survived navigation ──
    expect(elements.length).toBeGreaterThanOrEqual(3)
    console.log(`  ✓ All shapes persisted after navigation. Elements: ${elements.length}`)

    await page.screenshot({ path: 'e2e/results/screenshots/real-user-05-after-navigation.png' })

    // ── Step 13: Refresh page and verify persistence ──
    // Trigger beforeunload to save snapshot
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
    await page.waitForTimeout(500)

    await page.reload()
    await page.waitForSelector('.excalidraw', { timeout: 20000 })

    // Poll for elements to appear (restored from snapshot or Yjs)
    for (let i = 0; i < 60; i++) {
      elements = await getSceneElements(page)
      if (elements.length > 0) break
      await page.waitForTimeout(500)
    }

    expect(elements.length).toBeGreaterThanOrEqual(3)
    console.log(`  ✓ All shapes persisted after page refresh. Elements: ${elements.length}`)

    await page.screenshot({ path: 'e2e/results/screenshots/real-user-06-after-refresh.png' })

    console.log('\n✅ Real user flow simulation completed successfully!')
  })
})
