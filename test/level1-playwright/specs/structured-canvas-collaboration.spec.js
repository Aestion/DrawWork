const { test, expect } = require('@playwright/test')
const {
  apiCall,
  createBoard,
  getBoardId,
  getToken,
  getUserId,
  openBoard,
  registerGetUser,
  shareBoardWithUser
} = require('./utils')

test.describe('Shared board collaboration across canvas types', () => {
  test.use({ actionTimeout: 30000, timeout: 120000 })

  async function setupSharedBoard(browser, boardName) {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    const userA = await registerGetUser(pageA)
    await createBoard(pageA, boardName)
    await openBoard(pageA, boardName)
    const boardId = await getBoardId(pageA)
    expect(boardId).toBeTruthy()

    const tokenA = await getToken(pageA)
    for (const canvas of [
      { name: 'E2E Tencent', type: 'tencentmind' },
      { name: 'E2E Kanban', type: 'kanban' },
      { name: 'E2E Swimlane', type: 'swimlane' }
    ]) {
      const res = await apiCall(pageA, {
        method: 'POST',
        path: `/api/boards/${boardId}/canvases`,
        body: canvas,
        token: tokenA
      })
      expect([200, 201]).toContain(res.status)
    }

    const userB = await registerGetUser(pageB)
    const userBId = await getUserId(pageB, userB.token)
    const shareResult = await shareBoardWithUser(pageA, boardId, userBId)
    expect([200, 201]).toContain(shareResult.status)

    await pageB.goto('/')
    await pageB.waitForTimeout(1500)
    await openBoard(pageB, boardName)
    await pageA.reload({ waitUntil: 'networkidle' })
    await pageA.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 20000 })
    await pageB.locator('.excalidraw__canvas.interactive').first().waitFor({ state: 'visible', timeout: 20000 })
    await pageA.waitForTimeout(1000)
    await pageB.waitForTimeout(1000)

    return { ctxA, ctxB, pageA, pageB }
  }

  async function switchCanvas(page, name) {
    await page.locator('.w-56').getByText(name, { exact: true }).click()
    await page.waitForTimeout(1000)
  }

  async function waitForOnlinePair(page) {
    await expect.poll(async () => {
      const text = await page.locator('body').innerText()
      return /2\s*人在线/.test(text) || /2\s*浜哄湪绾/.test(text)
    }, { timeout: 15000 }).toBeTruthy()
  }

  async function addKanbanCard(page, title) {
    await page.waitForSelector('.w-64.bg-gray-100', { timeout: 15000 })
    await page.evaluate(() => {
      const columns = [...document.querySelectorAll('.w-64.bg-gray-100')]
      const firstColumn = columns[0]
      if (!firstColumn) throw new Error('kanban column not found')
      const addButton = [...firstColumn.querySelectorAll('button')].find((button) => button.textContent.includes('+'))
      if (!addButton) throw new Error('kanban add card button not found')
      addButton?.click()
    })
    await page.keyboard.type(title)
    await page.keyboard.press('Enter')
  }

  async function deleteKanbanCard(page, title) {
    await page.evaluate((cardTitle) => {
      const cards = [...document.querySelectorAll('.bg-white.p-2')]
      const card = cards.find((node) => node.textContent.includes(cardTitle))
      card?.querySelector('button')?.click()
    }, title)
  }

  async function addSwimlaneElement(page, text) {
    await page.waitForSelector('[class*="border-2"][class*="border-gray-200"]', { timeout: 15000 })
    await page.evaluate(() => {
      const lane = document.querySelector('[class*="border-2"][class*="border-gray-200"]')
      if (!lane) throw new Error('swimlane lane not found')
      const addButton = [...lane.querySelectorAll('button')].find((button) => button.textContent.includes('+'))
      if (!addButton) throw new Error('swimlane add element button not found')
      addButton?.click()
    })
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }

  async function deleteSwimlaneElement(page, text) {
    await page.evaluate((elementText) => {
      const elements = [...document.querySelectorAll('[data-element-id]')]
      const element = elements.find((node) => node.textContent.includes(elementText))
      element?.querySelector('button:last-child')?.click()
    }, text)
  }

  test('kanban canvas syncs add, delete, and peer card additions', async ({ browser }) => {
    const { ctxA, ctxB, pageA, pageB } = await setupSharedBoard(browser, `FourCanvasKanban ${Date.now()}`)
    try {
      await switchCanvas(pageA, 'E2E Kanban')
      await switchCanvas(pageB, 'E2E Kanban')
      await waitForOnlinePair(pageA)
      await waitForOnlinePair(pageB)
      await pageA.waitForTimeout(1500)
      await pageB.waitForTimeout(1500)

      const cardA = `KB-A-${Date.now()}`
      const cardB = `KB-B-${Date.now()}`
      await addKanbanCard(pageA, cardA)
      await expect(pageB.locator('body')).toContainText(cardA, { timeout: 20000 })

      await addKanbanCard(pageA, cardB)
      await expect(pageB.locator('body')).toContainText(cardB, { timeout: 20000 })
      await addKanbanCard(pageB, `${cardB}-peer`)

      await expect(pageA.locator('body')).toContainText(cardB, { timeout: 20000 })
      await expect(pageA.locator('body')).toContainText(`${cardB}-peer`, { timeout: 20000 })
      await expect(pageB.locator('body')).toContainText(cardB, { timeout: 20000 })
      await expect(pageB.locator('body')).toContainText(`${cardB}-peer`, { timeout: 20000 })

      await deleteKanbanCard(pageA, cardA)
      await expect(pageB.locator('body')).not.toContainText(cardA, { timeout: 20000 })
    } finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('swimlane canvas syncs add, delete, and peer element additions', async ({ browser }) => {
    const { ctxA, ctxB, pageA, pageB } = await setupSharedBoard(browser, `FourCanvasSwimlane ${Date.now()}`)
    try {
      await switchCanvas(pageA, 'E2E Swimlane')
      await switchCanvas(pageB, 'E2E Swimlane')
      await waitForOnlinePair(pageA)
      await waitForOnlinePair(pageB)
      await pageA.waitForTimeout(1500)
      await pageB.waitForTimeout(1500)

      const elA = `SL-A-${Date.now()}`
      const elB = `SL-B-${Date.now()}`
      await addSwimlaneElement(pageA, elA)
      await expect(pageB.locator('body')).toContainText(elA, { timeout: 20000 })

      await addSwimlaneElement(pageA, elB)
      await expect(pageB.locator('body')).toContainText(elB, { timeout: 20000 })
      await addSwimlaneElement(pageB, `${elB}-peer`)

      await expect(pageA.locator('body')).toContainText(elB, { timeout: 20000 })
      await expect(pageA.locator('body')).toContainText(`${elB}-peer`, { timeout: 20000 })
      await expect(pageB.locator('body')).toContainText(elB, { timeout: 20000 })
      await expect(pageB.locator('body')).toContainText(`${elB}-peer`, { timeout: 20000 })

      await deleteSwimlaneElement(pageA, elA)
      await expect(pageB.locator('body')).not.toContainText(elA, { timeout: 20000 })
    } finally {
      await ctxA.close()
      await ctxB.close()
    }
  })
})
