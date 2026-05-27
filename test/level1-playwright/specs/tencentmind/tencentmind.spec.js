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
    await expect(page.locator('span.text-gray-400', { hasText: '思维导图' })).toBeVisible()

    // Should see the layout selector (first select)
    await expect(page.locator('select').first()).toBeVisible()

    // Should see the readonly checkbox
    await expect(page.locator('text=只读')).toBeVisible()

    await expect(page.locator('.smm-mind-map-container foreignObject').filter({ hasText: '中心主题' }).first()).toBeVisible()
    await expect(page.locator('.smm-mind-map-container foreignObject').filter({ hasText: '子节点' }).first()).toBeVisible()
  })

  test('associative line control point drag keeps final curve data stable', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree
      const rootNode = typeof root?._node?.getData === 'function' ? root._node : root
      if (!rootNode) throw new Error('root node not found')
      if ((root.children || []).length < 2) {
        mm.execCommand('INSERT_CHILD_NODE', false, [rootNode], { text: `line-node-${Date.now()}` })
        mm.emit('data_change')
      }
    })
    await expect.poll(() => page.evaluate(() => window.__mm?.renderer?.renderTree?.children?.length || 0), { timeout: 10000 }).toBeGreaterThanOrEqual(2)

    const dragResult = await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree
      const asMindNode = node => {
        if (typeof node?.getData === 'function') return node
        if (typeof node?._node?.getData === 'function') return node._node
        return node
      }
      const first = asMindNode(root.children?.[0])
      const second = asMindNode(root.children?.[1])
      if (!first || !second) throw new Error('expected two children')

      mm.associativeLine?.addLine(first, second)
      mm.associativeLine?.renderAllLines?.()
      const line = mm.associativeLine?.lineList?.[mm.associativeLine.lineList.length - 1]
      if (!line) throw new Error('associative line not created')

      mm.execCommand('SET_NODE_DATA', first, {
        associativeLinePoint: [{
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 100, y: 100 }
        }],
        associativeLineTargetControlOffsets: [[
          { x: 20, y: 0 },
          { x: -20, y: 0 }
        ]]
      })

      mm.associativeLine.activeLine = line
      mm.associativeLine.isControlPointMousedown = true
      mm.associativeLine.mousedownControlPointKey = 'controlPoint1'
      mm.associativeLine.controlPointMousemoveState = {
        pos: { x: 72, y: 15 },
        startPoint: { x: 10, y: 5 },
        endPoint: { x: 130, y: 125 },
        targetIndex: 0
      }
      mm.associativeLine.onControlPointMouseup({
        stopPropagation() {},
        preventDefault() {}
      })
      mm.emit('data_change')

      return {
        points: first.getData('associativeLinePoint'),
        offsets: first.getData('associativeLineTargetControlOffsets')
      }
    })

    expect(dragResult.points[0]).toEqual({
      startPoint: { x: 10, y: 5 },
      endPoint: { x: 130, y: 125 }
    })
    expect(dragResult.offsets[0]).toEqual([
      { x: 62, y: 10 },
      { x: -20, y: 0 }
    ])

    await page.waitForTimeout(2500)
    await expect.poll(() => page.evaluate(() => {
      const root = window.__mm?.renderer?.renderTree
      const first = root?.children?.[0]?._node || root?.children?.[0]
      return {
        points: first?.getData?.('associativeLinePoint'),
        offsets: first?.getData?.('associativeLineTargetControlOffsets')
      }
    }), { timeout: 5000 }).toEqual(dragResult)
  })

  test('automatic root child insertion keeps both sides balanced', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const root = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!root) throw new Error('root node not found')
      for (let i = 0; i < 4; i++) {
        mm.execCommand('INSERT_CHILD_NODE', false, [root], { text: `新增节点 ${i + 1}` })
      }
      mm.emit('data_change')
    })

    await expect.poll(() => page.evaluate(() => {
      const root = window.__mm?.renderer?.renderTree
      return {
        rightNumber: root?.data?.rightNumber,
        dirs: (root?.children || []).map(child => child?._node?.data?.dir || child?.data?.dir)
      }
    }), { timeout: 10000 }).toEqual({
      rightNumber: 3,
      dirs: ['right', 'right', 'right', 'left', 'left']
    })

    const before = await page.evaluate(() => {
      const root = window.__mm?.renderer?.renderTree
      return (root?.children || []).map(child => {
        const data = child?._node?.data || child?.data || {}
        return { uid: data.uid, text: data.text, dir: data.dir }
      })
    })

    await page.evaluate(() => {
      const mm = window.__mm
      const root = mm.renderer.renderTree?._node || mm.renderer.renderTree
      mm.execCommand('INSERT_CHILD_NODE', false, [root], { text: '新增节点 5' })
      mm.emit('data_change')
    })

    await expect.poll(() => page.evaluate((oldChildren) => {
      const root = window.__mm?.renderer?.renderTree
      const current = (root?.children || []).map(child => {
        const data = child?._node?.data || child?.data || {}
        return { uid: data.uid, text: data.text, dir: data.dir }
      })
      return oldChildren.every(oldChild => {
        const match = current.find(item => item.uid === oldChild.uid)
        return match?.dir === oldChild.dir
      })
    }, before), { timeout: 10000 }).toBeTruthy()
  })

  test('manual cross-side drag keeps unrelated root children on their original sides', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    const result = await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const rootNode = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!rootNode) throw new Error('root node not found')
      for (let i = 0; i < 4; i++) {
        mm.execCommand('INSERT_CHILD_NODE', false, [rootNode], { text: `drag-node-${i + 1}` })
      }

      const getSnapshot = () => {
        const root = mm.renderer.renderTree
        return (root?.children || []).map(child => {
          const data = child?._node?.data || child?.data || {}
          return {
            uid: data.uid,
            text: data.text,
            dir: data.dir,
            node: child
          }
        })
      }

      const before = getSnapshot()
      const dragged = before.find(item => item.dir === 'left')
      const target = before.find(item => item.dir === 'right')
      if (!dragged || !target) throw new Error('expected both left and right root children')

      const root = mm.renderer.renderTree
      mm.unbalancedLayoutPlugin.beforeExecCommand('MOVE_NODE_TO', [dragged.node], target.node)
      root.children = [
        target.node,
        dragged.node,
        ...root.children.filter(child => {
          const data = child?._node?.data || child?.data || {}
          return data.uid !== target.uid && data.uid !== dragged.uid
        })
      ]
      mm.unbalancedLayoutPlugin.onDragStart()
      mm.unbalancedLayoutPlugin.afterExecCommand('MOVE_NODE_TO', [dragged.node], target.node)
      mm.unbalancedLayoutPlugin.onDragEnd()
      mm.emit('data_change')

      const after = getSnapshot()
      return before.map(item => {
        const current = after.find(next => next.uid === item.uid)
        return {
          uid: item.uid,
          text: item.text,
          beforeDir: item.dir,
          afterDir: current?.dir,
          dragged: item.uid === dragged.uid
        }
      })
    })

    expect(result.every(item => item.dragged ? item.afterDir === 'right' : item.afterDir === item.beforeDir)).toBeTruthy()
  })

  test('data normalization preserves intentionally imbalanced root child sides', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    const result = await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const rootNode = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!rootNode) throw new Error('root node not found')
      for (let i = 0; i < 7; i++) {
        mm.execCommand('INSERT_CHILD_NODE', false, [rootNode], { text: `imbalanced-node-${i + 1}` })
      }

      const root = mm.renderer.renderTree
      root.children.forEach((child, index) => {
        const data = child?._node?.data || child?.data || {}
        data.dir = index === 0 ? 'right' : 'left'
      })
      root.data.rightNumber = 1

      const before = root.children.map(child => {
        const data = child?._node?.data || child?.data || {}
        return { uid: data.uid, dir: data.dir }
      })

      mm.unbalancedLayoutPlugin.beforeUpdateData(root)

      const after = root.children.map(child => {
        const data = child?._node?.data || child?.data || {}
        return { uid: data.uid, dir: data.dir }
      })
      return { rightNumber: root.data.rightNumber, before, after }
    })

    expect(result.rightNumber).toBe(1)
    expect(result.after).toEqual([
      ...result.before.filter(item => item.dir === 'right'),
      ...result.before.filter(item => item.dir === 'left')
    ])
  })

  test('drag preview keeps opposite-side root children stable while mouse is held', async ({ page }) => {
    await navigateToTencentMind(page, env.board.id)
    await waitForRender(page)

    await page.evaluate(() => {
      const mm = window.__mm
      if (!mm) throw new Error('mind map not found')
      const rootNode = mm.renderer.renderTree?._node || mm.renderer.renderTree
      if (!rootNode) throw new Error('root node not found')
      for (let i = 0; i < 8; i++) {
        mm.execCommand('INSERT_CHILD_NODE', false, [rootNode], { text: `preview-node-${i + 1}` })
      }

      const root = mm.renderer.renderTree
      root.children.forEach((child, index) => {
        const data = child?._node?.data || child?.data || {}
        data.dir = index < 5 ? 'right' : 'left'
      })
      root.data.rightNumber = 5
      mm.unbalancedLayoutPlugin.beforeUpdateData(root)
      mm.render()
    })

    await page.waitForTimeout(500)

    const before = await page.evaluate(() => {
      const root = window.__mm?.renderer?.renderTree
      const rootCenter = (root?.left || 0) + (root?.width || 0) / 2
      return (root?.children || []).map(child => {
        const data = child?._node?.data || child?.data || {}
        return {
          uid: data.uid,
          text: data.text,
          dir: data.dir,
          visualSide: ((child.left || 0) + (child.width || 0) / 2) >= rootCenter ? 'right' : 'left'
        }
      })
    })
    const rightBefore = before.filter(item => item.dir === 'right')
    const leftBefore = before.filter(item => item.dir === 'left')
    expect(rightBefore).toHaveLength(5)
    expect(leftBefore).toHaveLength(4)

    const plainText = text => String(text || '').replace(/<[^>]+>/g, '')
    const draggedText = plainText(rightBefore[1].text)
    const targetText = plainText(leftBefore[1].text)
    const draggedBox = await page.locator('.smm-mind-map-container foreignObject').filter({ hasText: draggedText }).first().boundingBox()
    const targetBox = await page.locator('.smm-mind-map-container foreignObject').filter({ hasText: targetText }).first().boundingBox()
    expect(draggedBox).toBeTruthy()
    expect(targetBox).toBeTruthy()

    await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 })
    await page.waitForTimeout(300)

    const whileHeld = await page.evaluate((rightUids) => {
      const root = window.__mm?.renderer?.renderTree
      const rootCenter = (root?.left || 0) + (root?.width || 0) / 2
      return (root?.children || [])
        .filter(child => {
          const data = child?._node?.data || child?.data || {}
          return rightUids.includes(data.uid)
        })
        .map(child => {
          const data = child?._node?.data || child?.data || {}
          return {
            uid: data.uid,
            dir: data.dir,
            visualSide: ((child.left || 0) + (child.width || 0) / 2) >= rootCenter ? 'right' : 'left'
          }
        })
    }, rightBefore.map(item => item.uid))

    await page.mouse.up()

    expect(whileHeld.filter(item => item.visualSide === 'right').length).toBeGreaterThanOrEqual(4)
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

    const beforeTheme = await page.evaluate(() => ({
      theme: window.__mm?.getTheme?.(),
      rootFill: window.__mm?.themeConfig?.root?.fillColor,
      background: window.__mm?.themeConfig?.backgroundColor
    }))

    // Find the theme selector (second select) and change it
    const themeSelect = page.locator('select').nth(1)
    await themeSelect.selectOption('dark')
    await expect.poll(() => page.evaluate(() => ({
      theme: window.__mm?.getTheme?.(),
      rootFill: window.__mm?.themeConfig?.root?.fillColor,
      background: window.__mm?.themeConfig?.backgroundColor
    })), { timeout: 10000 }).toEqual({
      theme: 'dark',
      rootFill: '#f9fafb',
      background: '#111827'
    })

    // Verify the SVG still renders
    const svg = page.locator('.smm-mind-map-container svg').first()
    await expect(svg).toBeVisible()
    expect(beforeTheme.rootFill).not.toBe('#f9fafb')
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
