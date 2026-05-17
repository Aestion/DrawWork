const { test, expect } = require('@playwright/test')

test('debug media upload', async ({ page }) => {
  // Capture console messages
  const errors = []
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text())
  })

  await page.goto('http://localhost:5173/register')
  await page.fill('input[type="text"]', `dbg_${Date.now()}`)
  await page.fill('input[type="email"]', `d_${Date.now()}@t.com`)
  await page.fill('input[type="password"]', 'TestPass123!')
  await page.click('button[type="submit"]')
  await page.waitForURL('http://localhost:5173/')

  await page.click('text=新建画板')
  await page.fill('#board-name', 'DebugMedia')
  await page.click('button[type="submit"]')
  await page.waitForSelector('text=DebugMedia')

  await page.locator('.grid > div', { hasText: 'DebugMedia' }).click()
  await page.waitForSelector('.excalidraw', { timeout: 15000 })
  await page.waitForTimeout(2000)

  // Try inserting media via file input approach
  await page.click('button[aria-label="插入媒体"], button:has-text("插入媒体")')
  await page.waitForTimeout(500)

  // Create a small PNG file
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xD7, 0x63, 0x68, 0x60, 0x60, 0x00,
    0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x34, 0x27,
    0x2B, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82 // IEND chunk
  ])

  // Make file input visible and set files
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]')
    if (input) {
      input.style.display = 'block'
      input.style.position = 'fixed'
      input.style.top = '10px'
      input.style.left = '10px'
      input.style.zIndex = '9999'
      input.style.opacity = '1'
    }
  })

  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  })

  await page.waitForTimeout(5000)

  const count = await page.evaluate(() => {
    const exc = window.__EXCALIDRAW__
    if (!exc || typeof exc.getSceneElements !== 'function') return -1
    return exc.getSceneElements().filter(e => e.type === 'image').length
  })
  console.log('Image elements:', count)
  console.log('Errors:', JSON.stringify(errors))

  // Alternative: create element directly via API
  await page.evaluate(() => {
    const exc = window.__EXCALIDRAW__
    const pngDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn1n8sAAAAASUVORK5CYII='
    const fileId = 'test-file-' + Date.now()

    exc.addFiles([{
      id: fileId,
      dataURL: pngDataURL,
      mimeType: 'image/png',
      created: Date.now(),
      lastRetrieved: Date.now()
    }])

    const appState = exc.getAppState()
    const element = {
      type: 'image',
      x: 100 - appState.scrollX,
      y: 100 - appState.scrollY,
      width: 240,
      height: 240,
      fileId: fileId,
      scale: [1, 1],
      groupIds: [],
      roundness: null,
      isDeleted: false,
      customData: {}
    }

    exc.updateScene({
      elements: [...exc.getSceneElements(), element],
      appState: { ...appState, selectedElementIds: {} }
    })
  })
  await page.waitForTimeout(1000)

  const count2 = await page.evaluate(() => {
    const exc = window.__EXCALIDRAW__
    return exc.getSceneElements().filter(e => e.type === 'image').length
  })
  console.log('Image elements after API:', count2)

  expect(true).toBe(true)
})
