const { test, expect } = require('@playwright/test')
const {
  setupTestEnvironment,
  setupAuthPage,
  navigateToTencentMind,
  waitForRender,
  API_BASE,
} = require('./helpers')

async function waitForTencentMindData(api, canvasId, token, predicate, timeout = 20000) {
  const start = Date.now()
  let lastData = null
  while (Date.now() - start < timeout) {
    const res = await api.get(`${API_BASE}/canvases/${canvasId}/tencentmind`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    lastData = body.data
    if (lastData && predicate(lastData)) return lastData
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for TencentMind data. Last data: ${JSON.stringify(lastData)?.slice(0, 5000)}`)
}

async function getAdvancedFeatureState(page) {
  return page.evaluate(() => {
    const mm = window.__mm
    const root = mm?.renderer?.renderTree
    if (!mm || !root?.children?.length) return null
    const first = root.children[0]?._node || root.children[0]
    const second = root.children[1]?._node || root.children[1]
    const firstData = first?.nodeData?.data || first?.data || {}
    const secondData = second?.nodeData?.data || second?.data || {}
    const generalizationTexts = []
    const walk = (node) => {
      const realNode = node?._node || node
      const data = realNode?.nodeData?.data || realNode?.data || {}
      const gen = realNode?.getData?.('generalization') || data.generalization
      if (Array.isArray(gen)) {
        gen.forEach(item => {
          if (item?.text) generalizationTexts.push(item.text)
        })
      }
      if (data.text) generalizationTexts.push(data.text)
      ;(node?.children || []).forEach(walk)
    }
    walk(root)
    return {
      firstIcons: first?.getData?.('icon') || firstData.icon || [],
      firstGeneralization: first?.getData?.('generalization') || firstData.generalization || null,
      firstOuterFrame: first?.getData?.('outerFrame') || firstData.outerFrame || null,
      secondOuterFrame: second?.getData?.('outerFrame') || secondData.outerFrame || null,
      lineCount: mm.associativeLine?.lineList?.length || 0,
      generalizationTexts
    }
  })
}

async function getLineAndMediaState(page) {
  return page.evaluate(() => {
    const mm = window.__mm
    const root = mm?.renderer?.renderTree
    if (!mm || !root?.children?.length) return null
    const first = root.children[0]?._node || root.children[0]
    const second = root.children[1]?._node || root.children[1]
    const firstData = first?.nodeData?.data || first?.data || {}
    const toUid = second?.getData?.('uid')
    const lineTextMap = first?.getData?.('associativeLineText') || firstData.associativeLineText || {}
    const mediaNodes = []
    const lineTexts = []
    const walk = (node) => {
      const realNode = node?._node || node
      const data = realNode?.nodeData?.data || realNode?.data || {}
      if (data._uploadId) mediaNodes.push(data)
      const textMap = realNode?.getData?.('associativeLineText') || data.associativeLineText || {}
      Object.values(textMap).forEach(text => {
        if (text) lineTexts.push(text)
      })
      ;(node?.children || []).forEach(walk)
    }
    walk(root)
    const media = mediaNodes[0] || {}
    return {
      lineCount: mm.associativeLine?.lineList?.length || 0,
      lineText: (toUid ? lineTextMap[toUid] || '' : '') || lineTexts[0] || '',
      mediaUploadId: media._uploadId || '',
      mediaType: media._mediaType || '',
      image: media.image || '',
      imageSize: media.imageSize || null,
      renderedImages: document.querySelectorAll('.smm-mind-map-container image, .smm-mind-map-container img, .smm-mind-map-container video, .smm-mind-map-container foreignObject[data-video]').length
    }
  })
}

async function getAllMediaState(page) {
  return page.evaluate(() => {
    const mm = window.__mm
    const root = mm?.renderer?.renderTree
    const media = []
    const walk = (node) => {
      const realNode = node?._node || node
      const data = realNode?.nodeData?.data || realNode?.data || {}
      if (data._uploadId) media.push({ uploadId: data._uploadId, mediaType: data._mediaType })
      ;(node?.children || []).forEach(walk)
    }
    if (root) walk(root)
    return media
  })
}

async function getRootChildDebugState(page) {
  return page.evaluate(() => {
    const mm = window.__mm
    return (mm?.renderer?.renderTree?.children || []).slice(0, 3).map((child, index) => {
      const realNode = child?._node || child
      const data = realNode?.nodeData?.data || realNode?.data || {}
      return {
        index,
        text: data.text,
        uploadId: data._uploadId || '',
        mediaType: data._mediaType || '',
        childCount: child?.children?.length || 0
      }
    })
  })
}

async function hasMindText(page, text) {
  return page.evaluate((expectedText) => {
    if (document.body.innerText.includes(expectedText)) return true
    const mm = window.__mm
    const root = mm?.renderer?.renderTree
    if (!root) return false
    const walk = (node) => {
      const realNode = node?._node || node
      const data = realNode?.nodeData?.data || realNode?.data || {}
      if (String(data.text || '').includes(expectedText)) return true
      return (node?.children || []).some(walk)
    }
    return walk(root)
  }, text)
}

async function uploadTinyPng(api, boardId, token) {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz6j2QAAAABJRU5ErkJggg=='
  const uploadRes = await api.post(`${API_BASE}/upload?board_id=${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name: 'tiny.png',
        mimeType: 'image/png',
        buffer: Buffer.from(pngBase64, 'base64')
      }
    }
  })
  expect(uploadRes.ok()).toBeTruthy()
  const file = await uploadRes.json()
  return file.id
}

async function uploadMedia(api, boardId, token, { name, mimeType, buffer }) {
  const uploadRes = await api.post(`${API_BASE}/upload?board_id=${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name, mimeType, buffer }
    }
  })
  expect(uploadRes.ok()).toBeTruthy()
  const file = await uploadRes.json()
  return file.id
}

function hasAdvancedFeatures(data, summaryText) {
  const children = data?.rootTopic?.children?.attached || []
  const first = children[0]
  const second = children[1]
  const firstMarkers = first?.markers || []
  const rootGen = data?.rootTopic?.extensions?.['drawwork.generalization'] || []
  const boundaries = data?.rootTopic?.boundaries || []
  const relationships = data?.relationships || []
  return firstMarkers.some(m => m.markerId === 'symbol-question') &&
    rootGen.some(g => g.text === summaryText) &&
    boundaries.some(b => b.range?.[0] === 0 && b.range?.[1] === 1) &&
    relationships.some(r => r.end1Id === first?.id && r.end2Id === second?.id)
}

async function renameRootChildFromPage(page, childIndex, nodeName) {
  await page.evaluate(({ childIndex, name }) => {
    const mm = window.__mm
    if (!mm) throw new Error('mind map not found')
    const child = mm.renderer.renderTree?.children?.[childIndex]?._node || mm.renderer.renderTree?.children?.[childIndex]
    if (!child) throw new Error(`root child ${childIndex} not found`)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    child.setText(name)
    mm.emit('data_change')
  }, { childIndex, name: nodeName })
}

async function ensureRootChildCount(page, expectedCount) {
  await page.evaluate((count) => {
    const mm = window.__mm
    if (!mm) throw new Error('mind map not found')
    const data = JSON.parse(JSON.stringify(mm.getData()))
    data.children = Array.isArray(data.children) ? data.children : []
    while (data.children.length < count) {
      const nextIndex = data.children.length + 1
      data.children.push({
        data: { text: `子节点 ${nextIndex}` },
        children: []
      })
    }
    mm.setData(data)
    mm.emit('data_change')
  }, expectedCount)
  await expect.poll(() => page.evaluate(() => window.__mm?.renderer?.renderTree?.children?.length || 0), {
    timeout: 5000
  }).toBeGreaterThanOrEqual(expectedCount)
}

async function setRootChildMediaFromPage(page, childIndex, media) {
  await page.evaluate(({ childIndex, media }) => {
    const mm = window.__mm
    if (!mm) throw new Error('mind map not found')
    const container = document.querySelector('.smm-mind-map-container') || document.querySelector('.flex-1.overflow-hidden')
    container?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    const child = mm.renderer.renderTree?.children?.[childIndex]?._node || mm.renderer.renderTree?.children?.[childIndex]
    if (!child) throw new Error(`root child ${childIndex} not found`)
    const realChild = child?._node || child
    const imageSize = media.imageSize || { width: 32, height: 32, custom: true }
    const mediaData = {
      _uploadId: media.uploadId,
      _mediaType: media.mediaType,
      _imageSize: imageSize,
      imageSize
    }
    mm.execCommand('SET_NODE_DATA', realChild, mediaData)
    for (const node of [child, realChild]) {
      node.setData?.('_uploadId', media.uploadId)
      node.setData?.('_mediaType', media.mediaType)
      node.setData?.('_imageSize', imageSize)
      node.setData?.('imageSize', imageSize)
      const targetData = node?.nodeData?.data || node?.data
      if (targetData) Object.assign(targetData, mediaData)
    }
    mm.emit('data_change')
  }, { childIndex, media })
}

test.describe('TencentMind Collaboration', () => {
  let env
  let tokenB
  let contextA, pageA, contextB, pageB

  test.beforeEach(async ({ browser, request: api }) => {
    env = await setupTestEnvironment()

    // Register User B via API
    const ts = Date.now()
    const bEmail = `tmb-${ts}@test.com`
    const bUser = `tmb-${ts}`

    const regRes = await api.post(`${API_BASE}/auth/register`, {
      data: { username: bUser, email: bEmail, password: 'Test123456!' }
    })
    expect(regRes.ok()).toBeTruthy()

    const loginRes = await api.post(`${API_BASE}/auth/login`, {
      data: { email: bEmail, password: 'Test123456!' }
    })
    expect(loginRes.ok()).toBeTruthy()
    const loginData = await loginRes.json()
    tokenB = loginData.token
    const userBId = loginData.user?.id || loginData.user

    // Share board with User B
    const shareRes = await api.post(`${API_BASE}/boards/${env.board.id}/shares`, {
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

    // Both navigate to the same board (tencent mind canvas)
    await navigateToTencentMind(pageA, env.board.id)
    await navigateToTencentMind(pageB, env.board.id)
    await waitForRender(pageA)
    await waitForRender(pageB)
  })

  test.afterEach(async () => {
    await contextA?.close()
    await contextB?.close()
  })

  // 1. Both users see the same initial mind map.

  test('both users see the same initial mind map', async () => {
    const rootA = pageA.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()
    const rootB = pageB.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()
    await expect(rootA).toBeVisible({ timeout: 10000 })
    await expect(rootB).toBeVisible({ timeout: 10000 })

    await expect(pageA.locator('.smm-mind-map-container foreignObject').filter({ hasText: '子节点' }).first()).toBeVisible({ timeout: 5000 })
    await expect(pageB.locator('.smm-mind-map-container foreignObject').filter({ hasText: '子节点' }).first()).toBeVisible({ timeout: 5000 })
  })

  // 2. Real-time sync: A adds child via mind map API, B sees it.

  test('real-time sync: user A adds a child node, user B sees it without refresh', async () => {
    // Verify both see initial data
    await expect(pageB.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()).toBeVisible({ timeout: 10000 })

    // User A: click root node, then use mind map API to add a child
    const rootA = pageA.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()
    await rootA.click()
    await pageA.waitForTimeout(300)

    const nodeName = `SyncTest-${Date.now()}`
    await pageA.evaluate((name) => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!root) throw new Error('root node not found')
      mm.execCommand('INSERT_CHILD_NODE', false, [root], { text: name })
      mm.emit('data_change')
    }, nodeName)

    // Wait for data_change debounce (2s) + Yjs sync
    await pageA.waitForTimeout(6000)

    // User B should see the new node WITHOUT refresh
    await expect.poll(() => hasMindText(pageB, nodeName), { timeout: 20000 }).toBeTruthy()
  })

  // 3. Data persists after refresh.

  test('remote text edits update B without rebuilding the whole mind map', async () => {
    await pageA.waitForTimeout(4500)
    await pageB.waitForTimeout(4500)

    await pageB.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      window.__tmSetDataCalls = 0
      const originalSetData = mm.setData.bind(mm)
      mm.setData = (...args) => {
        window.__tmSetDataCalls += 1
        return originalSetData(...args)
      }
    })

    const nodeName = `NoRebuild-${Date.now()}`
    await renameRootChildFromPage(pageA, 0, nodeName)

    await expect(pageB.locator('.smm-mind-map-container foreignObject').filter({ hasText: nodeName }).first()).toBeVisible({ timeout: 20000 })
    await expect.poll(() => pageB.evaluate(() => window.__tmSetDataCalls || 0), { timeout: 5000 }).toBe(0)
  })

  test('data persists: user A edits, user B refreshes and sees data', async () => {
    // User A: add a child node via mind map API
    const rootA = pageA.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()
    await rootA.click()
    await pageA.waitForTimeout(300)

    const persistName = `Persist-${Date.now()}`
    await pageA.evaluate((name) => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!root) throw new Error('root node not found')
      mm.execCommand('INSERT_CHILD_NODE', false, [root], { text: name })
      mm.emit('data_change')
    }, persistName)

    // Wait for save (debounce + HTTP persist)
    await pageA.waitForTimeout(5000)

    // User B refreshes the page
    await pageB.reload({ waitUntil: 'networkidle' })
    const tencentItem = pageB.locator('text=Tencent Mind').first()
    if (await tencentItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tencentItem.click()
      await pageB.waitForTimeout(500)
    }
    await pageB.waitForSelector('text=腾讯思维', { timeout: 20000 })
    await pageB.waitForSelector('.smm-mind-map-container foreignObject', { timeout: 10000 })
    await pageB.waitForTimeout(2000)

    // User B should see the persisted node
    await expect.poll(() => hasMindText(pageB, persistName), { timeout: 15000 }).toBeTruthy()
  })

  test('advanced features sync and persist: markers, summaries, boundaries, and associative lines', async ({ request: api }) => {
    await pageA.waitForTimeout(4500)
    await ensureRootChildCount(pageA, 2)
    const summaryText = `Summary-${Date.now()}`

    await pageA.evaluate((text) => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree
      const rootNode = root?._node || root
      const first = root.children?.[0]?._node || root.children?.[0]
      const second = root.children?.[1]?._node || root.children?.[1]
      if (!first || !second) throw new Error('expected at least two root children')

      const rootData = rootNode.nodeData?.data || rootNode.data
      const firstData = first.nodeData?.data || first.data
      const secondData = second.nodeData?.data || second.data
      firstData.icon = ['tencent_question']
      rootData.generalization = [{ text, range: [0, 1] }]

      const outerFrame = {
        groupId: `frame-${Date.now()}`,
        strokeColor: '#0984e3',
        fill: 'rgba(9,132,227,0.05)',
        radius: 5,
        strokeWidth: 2,
        strokeDasharray: '0'
      }
      firstData.outerFrame = outerFrame
      secondData.outerFrame = outerFrame

      mm.associativeLine?.addLine(first, second)
      mm.emit('data_change')
    }, summaryText)

    await expect.poll(async () => getAdvancedFeatureState(pageA), { timeout: 5000 }).toMatchObject({
      firstIcons: expect.arrayContaining(['tencent_question']),
      generalizationTexts: expect.arrayContaining([summaryText]),
      firstOuterFrame: expect.objectContaining({ strokeColor: '#0984e3' }),
      secondOuterFrame: expect.objectContaining({ strokeColor: '#0984e3' })
    })

    const savedData = await waitForTencentMindData(api, env.canvas.id, env.token, data => hasAdvancedFeatures(data, summaryText))
    expect(hasAdvancedFeatures(savedData, summaryText)).toBeTruthy()

    await expect.poll(async () => getAdvancedFeatureState(pageB), { timeout: 20000 }).toMatchObject({
      firstIcons: expect.arrayContaining(['tencent_question']),
      generalizationTexts: expect.arrayContaining([summaryText]),
      firstOuterFrame: expect.objectContaining({ strokeColor: '#0984e3' }),
      secondOuterFrame: expect.objectContaining({ strokeColor: '#0984e3' })
    })

    await expect.poll(async () => {
      const state = await getAdvancedFeatureState(pageB)
      return state?.lineCount || 0
    }, { timeout: 20000 }).toBeGreaterThan(0)

  })

  test('remote updates do not echo-save stale snapshots back to the author', async ({ request: api }) => {
    await pageA.waitForTimeout(4500)
    await pageB.waitForTimeout(4500)

    let bSaveRequests = 0
    let aSaveRequests = 0
    pageA.on('request', request => {
      if (request.method() === 'PUT' && request.url().includes('/tencentmind')) {
        aSaveRequests += 1
      }
    })
    pageB.on('request', request => {
      if (request.method() === 'PUT' && request.url().includes('/tencentmind')) {
        bSaveRequests += 1
      }
    })

    const firstName = `EchoFirst-${Date.now()}`
    await renameRootChildFromPage(pageA, 0, firstName)
    await expect.poll(() => hasMindText(pageB, firstName), { timeout: 20000 }).toBeTruthy()
    await pageA.waitForTimeout(1000)

    await ensureRootChildCount(pageA, 2)
    const secondName = `EchoSecond-${Date.now()}`
    await renameRootChildFromPage(pageA, 1, secondName)

    await expect(pageA.locator('.smm-mind-map-container foreignObject').filter({ hasText: secondName }).first()).toBeVisible({ timeout: 5000 })
    await expect.poll(() => aSaveRequests, { timeout: 10000 }).toBeGreaterThanOrEqual(1)
    await waitForTencentMindData(api, env.canvas.id, env.token, data => JSON.stringify(data).includes(secondName), 10000)
    await expect.poll(() => hasMindText(pageB, secondName), { timeout: 20000 }).toBeTruthy()
    await pageB.waitForTimeout(7000)

    expect(aSaveRequests).toBeGreaterThanOrEqual(1)
    expect(bSaveRequests).toBe(0)
    await expect.poll(() => hasMindText(pageA, firstName), { timeout: 5000 }).toBeTruthy()
    await expect.poll(() => hasMindText(pageA, secondName), { timeout: 5000 }).toBeTruthy()

    const savedData = await waitForTencentMindData(api, env.canvas.id, env.token, data => {
      const json = JSON.stringify(data)
      return json.includes(firstName) && json.includes(secondName)
    })
    const savedJson = JSON.stringify(savedData)
    expect(savedJson).toContain(firstName)
    expect(savedJson).toContain(secondName)
  })

  test('line text and node media sync and persist between collaborators', async ({ request: api }) => {
    await pageA.waitForTimeout(4500)
    await ensureRootChildCount(pageA, 2)
    const lineTitle = `LineTitle-${Date.now()}`
    const uploadId = await uploadTinyPng(api, env.board.id, env.token)

    await pageA.evaluate(({ lineTitle, uploadId }) => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree
      const first = root.children?.[0]?._node || root.children?.[0]
      const second = root.children?.[1]?._node || root.children?.[1]
      if (!first || !second) throw new Error('expected at least two root children')

      mm.associativeLine?.addLine(first, second)
      const toUid = second.getData('uid')
      mm.execCommand('SET_NODE_DATA', first, {
        associativeLineText: {
          ...(first.getData('associativeLineText') || {}),
          [toUid]: lineTitle
        },
        _uploadId: uploadId,
        _mediaType: 'image',
        _imageSize: { width: 32, height: 32, custom: true },
        imageSize: { width: 32, height: 32, custom: true }
      })
      first.setData?.('associativeLineText', {
        ...(first.getData('associativeLineText') || {}),
        [toUid]: lineTitle
      })

      mm.associativeLine?.renderAllLines?.()
      mm.emit('data_change')
    }, { lineTitle, uploadId })

    const savedData = await waitForTencentMindData(api, env.canvas.id, env.token, data => {
      const first = data?.rootTopic?.children?.attached?.[0]
      return data?.relationships?.some(r => r.title === lineTitle) &&
        first?.extensions?.['drawwork.media']?.uploadId === uploadId
    })
    expect(savedData.relationships.some(r => r.title === lineTitle)).toBeTruthy()
    expect(savedData.rootTopic.children.attached[0].extensions['drawwork.media'].uploadId).toBe(uploadId)

    await expect.poll(() => getLineAndMediaState(pageB), { timeout: 20000 }).toMatchObject({
      lineCount: expect.any(Number),
      lineText: lineTitle,
      mediaUploadId: uploadId,
      mediaType: 'image',
      imageSize: expect.objectContaining({ width: 32, height: 32 })
    })

    await expect.poll(() => getLineAndMediaState(pageB), { timeout: 20000 }).toMatchObject({
      image: expect.stringMatching(/^blob:/),
      renderedImages: expect.any(Number)
    })
    await expect.poll(async () => {
      const state = await getLineAndMediaState(pageB)
      return state?.renderedImages || 0
    }, { timeout: 20000 }).toBeGreaterThan(0)
  })

  test('gif media syncs immediately before a later video edit', async ({ request: api }) => {
    await pageA.waitForTimeout(4500)
    await ensureRootChildCount(pageA, 2)
    const gifBuffer = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0x00, 0xff,
      0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
      0x01, 0x00, 0x3b
    ])
    const videoBuffer = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
    const gifId = await uploadMedia(api, env.board.id, env.token, {
      name: 'tiny.gif',
      mimeType: 'image/gif',
      buffer: gifBuffer
    })
    const videoId = await uploadMedia(api, env.board.id, env.token, {
      name: 'tiny.mp4',
      mimeType: 'video/mp4',
      buffer: videoBuffer
    })

    await setRootChildMediaFromPage(pageA, 0, {
      uploadId: gifId,
      mediaType: 'image',
      imageSize: { width: 32, height: 32, custom: true }
    })

    await expect.poll(() => getLineAndMediaState(pageB), { timeout: 20000 }).toMatchObject({
      mediaUploadId: gifId,
      mediaType: 'image'
    })

    await setRootChildMediaFromPage(pageA, 1, {
      uploadId: videoId,
      mediaType: 'video',
      imageSize: { width: 120, height: 80, custom: true }
    })

    await expect.poll(() => getAllMediaState(pageA), {
      timeout: 5000,
      message: async () => `A media debug: ${JSON.stringify(await getRootChildDebugState(pageA))}`
    }).toEqual(expect.arrayContaining([
      expect.objectContaining({ uploadId: gifId, mediaType: 'image' }),
      expect.objectContaining({ uploadId: videoId, mediaType: 'video' })
    ]))

    await waitForTencentMindData(api, env.canvas.id, env.token, (data) => {
      const ids = []
      const walk = (node) => {
        const media = node?.extensions?.['drawwork.media']
        if (media?.uploadId) ids.push(media.uploadId)
        ;(node?.children?.attached || []).forEach(walk)
      }
      walk(data?.rootTopic)
      return ids.includes(gifId) && ids.includes(videoId)
    }, 10000)

    await expect.poll(() => getAllMediaState(pageB), { timeout: 20000 }).toEqual(expect.arrayContaining([
      expect.objectContaining({ uploadId: gifId, mediaType: 'image' }),
      expect.objectContaining({ uploadId: videoId, mediaType: 'video' })
    ]))
  })
})
