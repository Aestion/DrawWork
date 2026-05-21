import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from '../../lib/tencent-mind-utils'
import UnbalancedLayoutPlugin from '../../lib/unbalanced-layout-plugin'
import { TENCENT_MARKER_ICONS, questionIcon, priorityIcon, progressIcon, starIcon, checkIcon, crossIcon, ideaIcon, warningIcon, targetIcon, clockIcon } from '../../lib/marker-icons'
import api from '../../lib/axios'
import { useTencentMindYjs } from '../../hooks/useTencentMindYjs'
import { useAuthStore } from '../../stores/authStore'

const LAYOUTS = [
  { value: 'logicalStructure', label: '逻辑结构' },
  { value: 'mindMap', label: '思维导图' },
  { value: 'catalogOrganization', label: '目录组织' },
  { value: 'organizationStructure', label: '组织结构' },
  { value: 'timeline', label: '时间线' },
  { value: 'fishbone', label: '鱼骨图' }
]

const THEMES = [
  'default', 'classic', 'classic2', 'dark',
  'blue', 'green', 'purple', 'red', 'orange', 'gold',
  'simple', 'fresh', 'fresh-blue', 'fresh-red'
]

const VIDEO_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e2e8f0" rx="6"/><circle cx="60" cy="40" r="16" fill="#64748b"/><polygon points="54,32 54,48 66,40" fill="#fff"/></svg>')

// Scan SVG DOM for VIDEO_PLACEHOLDER <image> elements and replace with <foreignObject><video>
const injectVideoPlaceholders = (containerEl, blobs, apiClient) => {
  const svg = containerEl?.querySelector('svg')
  if (!svg) return
  const svgNs = 'http://www.w3.org/2000/svg'
  const images = svg.querySelectorAll('image')
  for (const img of images) {
    const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
    if (href.slice(0, 30) !== VIDEO_PLACEHOLDER.slice(0, 30)) continue
    const g = img.closest('g')
    if (!g || g.querySelector('foreignObject[data-video]')) continue
    let blobUrl = g.dataset.videoBlobUrl || ''
    if (!blobUrl) {
      const uploadId = g.dataset.videoUploadId || ''
      if (uploadId && blobs.has(uploadId)) {
        blobUrl = blobs.get(uploadId)
      } else {
        for (const [uid, url] of blobs) {
          blobUrl = url
          g.dataset.videoUploadId = uid
          break
        }
      }
      if (blobUrl) g.dataset.videoBlobUrl = blobUrl
    }
    if (!blobUrl) continue
    const x = parseFloat(img.getAttribute('x')) || 0
    const y = parseFloat(img.getAttribute('y')) || 0
    const w = parseFloat(img.getAttribute('width')) || 120
    const h = parseFloat(img.getAttribute('height')) || 80
    const fo = document.createElementNS(svgNs, 'foreignObject')
    fo.setAttribute('data-video', 'true')
    fo.setAttribute('x', x)
    fo.setAttribute('y', y)
    fo.setAttribute('width', w)
    fo.setAttribute('height', h)
    fo.style.overflow = 'visible'
    const div = document.createElement('div')
    div.style.cssText = `width:${w}px;height:${h}px;line-height:0;`
    div.innerHTML = `<video src="${blobUrl}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover;border-radius:4px;display:block;"></video>`
    fo.appendChild(div)
    img.replaceWith(fo)
    // If blob URL fails (e.g. revoked after HMR), retry fetching from API
    const video = div.querySelector('video')
    const retryUploadId = g.dataset.videoUploadId
    if (video && retryUploadId && apiClient) {
      video.addEventListener('error', () => {
        apiClient.get(`/upload/${retryUploadId}`, { responseType: 'blob' }).then(res => {
          const newUrl = URL.createObjectURL(res.data)
          video.src = newUrl
          video.play().catch(() => {})
        }).catch(() => {})
      }, { once: true })
    }
  }
}

const TencentMindEditor = forwardRef(function TencentMindEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const mmRef = useRef(null)
  const originDataRef = useRef(null)
  const saveTimerRef = useRef(null)
  const activeNodeRef = useRef(null)
  const blobUrlsRef = useRef(new Set())
  const pendingVideoBlobsRef = useRef(new Map()) // uploadId → blobUrl
  const [loading, setLoading] = useState(true)
  const [currentLayout, setCurrentLayout] = useState('mindMap')
  const [currentTheme, setCurrentTheme] = useState('default')
  const [readonly, setReadonly] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const linkModeRef = useRef(false)
  const linkSourceRef = useRef(null)
  const pluginsRegisteredRef = useRef(false)
  const prevCanvasIdRef = useRef(canvasId)
  const lastAppliedVersionRef = useRef(0)
  const saveDataRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const contextNodeRef = useRef(null)
  const markerMenuRef = useRef(null)
  const setContextMenuRef = useRef(setContextMenu)

  // Get auth token from store (consistent with MindMapEditor)
  const token = useAuthStore((state) => state.token)

  const {
    tencentData: yjsTencentData,
    loading: yjsLoading,
    connected,
    synced,
    onlineCount,
    remoteUpdateVersion,
    syncToYjs
  } = useTencentMindYjs({ canvasId, roomId, token, canEdit })

  // Sync Yjs data to originDataRef (initial load and remote updates)
  useEffect(() => {
    if (!yjsTencentData || yjsLoading) return
    if (lastAppliedVersionRef.current === remoteUpdateVersion && originDataRef.current) return
    console.log('[YJS-EDITOR] Applying Yjs data, version:', remoteUpdateVersion, 'hasBoundaries:', !!yjsTencentData?.rootTopic?.boundaries, 'generations:', !!yjsTencentData?.rootTopic?.extensions?.['drawwork.generalization'], 'relationships:', yjsTencentData?.relationships?.length)
    originDataRef.current = yjsTencentData
    lastAppliedVersionRef.current = remoteUpdateVersion
    setLoading(false)
  }, [yjsTencentData, remoteUpdateVersion, yjsLoading])

  // Handle canvas change
  useEffect(() => {
    if (prevCanvasIdRef.current !== canvasId) {
      prevCanvasIdRef.current = canvasId
      originDataRef.current = null
      lastAppliedVersionRef.current = 0
      setLoading(true)
    }
  }, [canvasId])

  // Initialize simple-mind-map
  useEffect(() => {
    if (!containerRef.current || !isActive || loading) return
    let mounted = true
    let mindMap = null
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setContextMenuRef.current(null)
    }

    const restoreNodeMedia = async (mindMap) => {
      const walk = async (node) => {
        if (!mounted) return
        if (node.nodeData?.data?._uploadId) {
          const uploadId = node.nodeData.data._uploadId
          const mediaType = node.nodeData.data._mediaType
          try {
            const blobRes = await api.get(`/upload/${uploadId}`, { responseType: 'blob' })
            if (!mounted) return
            const blobUrl = URL.createObjectURL(blobRes.data)
            blobUrlsRef.current.add(blobUrl)
            if (mediaType === 'video') {
              pendingVideoBlobsRef.current.set(uploadId, blobUrl)
              node.nodeData.data.image = VIDEO_PLACEHOLDER
              const imgSize = node.nodeData.data._imageSize || { width: 120, height: 80, custom: true }
              node.nodeData.data.imageSize = imgSize
            } else {
              const imageSize = node.nodeData.data._imageSize || { width: 200, height: 150, custom: true }
              node.nodeData.data.image = blobUrl
              node.nodeData.data.imageSize = imageSize
            }
          } catch (err) {
            console.error('Failed to restore media:', err)
          }
        }
        if (node.children) {
          for (const child of node.children) {
            await walk(child)
          }
        }
      }
      await walk(mindMap.renderer.renderTree)
      if (!mounted) return
      // Re-render to create SVG <image> elements for placeholders
      mindMap.render(() => {
        injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
      })
    }

    // Clear stale blob URLs from previous init (e.g. on remoteUpdateVersion change)
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    blobUrlsRef.current.clear()
    pendingVideoBlobsRef.current.clear()

    const init = async () => {
      const [MindMapModule, DragModule, AssociativeLineModule, OuterFrameModule, RichTextModule, SelectModule] = await Promise.all([
        import('simple-mind-map'),
        import('simple-mind-map/src/plugins/Drag.js'),
        import('simple-mind-map/src/plugins/AssociativeLine.js'),
        import('simple-mind-map/src/plugins/OuterFrame.js'),
        import('simple-mind-map/src/plugins/RichText.js'),
        import('simple-mind-map/src/plugins/Select.js')
      ])
      const MindMap = MindMapModule.default
      if (!mounted) return

      const DragClass = DragModule.default

      // 重载 getNodeDistanceToSiblingNode：一级节点跨侧兄弟偏移量为负
      // （左右侧节点同一高度重叠）时，硬编码 60px 放置区，不使用 minOffset
      // 避免 minOffset 增大影响同侧半距计算逻辑
      const origGetDist = DragClass.prototype.getNodeDistanceToSiblingNode
      DragClass.prototype.getNodeDistanceToSiblingNode = function(checkList, node, nodeRect, direction) {
        const result = origGetDist.call(this, checkList, node, nodeRect, direction)
        if (node.layerIndex === 1) {
          const scale = direction === 'v'
            ? (this.drawTransform?.scaleY || 1)
            : (this.drawTransform?.scaleX || 1)
          const edgeDropZone = 60 * scale  // 硬编码 60px，不依赖 minOffset
          if (result.prevBrother && result.prevBrotherOffset < 0) {
            result.prevBrotherOffset = edgeDropZone
            result.prevBrother = null
          }
          if (result.nextBrother && result.nextBrotherOffset < 0) {
            result.nextBrotherOffset = edgeDropZone
            result.nextBrother = null
          }
        }
        return result
      }

      // Monkey-patch: 保留所有兄弟参与检查，增加边缘前置检测
      // 当光标在全部一级节点最上方/最下方 60px 时，跳过水平边界检查直接触发
      // 解决跨侧拖拽时光标不在目标节点水平范围内的问题
      DragClass.prototype.handleMindMap = function(node) {
        const checkList = node.parent
          ? node.parent.children.filter(item => {
              return !this.checkIsInBeingDragNodeList(item)
            })
          : []

        // 边缘前置检测：仅对一级节点，在所有节点之上/之下触发
        // 按光标 X 位置判断目标侧，优先检查距离更近的一侧
        if (node.layerIndex === 1 && !this.overlapNode && !this.prevNode && !this.nextNode && checkList.length > 0) {
          const cursorY = this.mouseMoveY
          const cursorX = this.mouseMoveX
          const edgeZone = 60
          const rootCenter = node.parent ? (node.parent.left || 0) + (node.parent.width || 0) / 2 : 0

          const leftSide = checkList.filter(n => n.data?.dir === 'left').sort((a, b) => (a.top || 0) - (b.top || 0))
          const rightSide = checkList.filter(n => n.data?.dir === 'right').sort((a, b) => (a.top || 0) - (b.top || 0))

          // 光标偏左先检左，偏右先检右
          const sides = cursorX < rootCenter
            ? [leftSide, rightSide]
            : [rightSide, leftSide]

          for (const side of sides) {
            if (side.length === 0) continue
            const first = side[0]
            const last = side[side.length - 1]
            if (cursorY < (first.top ?? -Infinity) && cursorY >= (first.top ?? -Infinity) - edgeZone) {
              this.nextNode = first
              return
            }
            if (cursorY > (last.bottom ?? Infinity) && cursorY <= (last.bottom ?? Infinity) + edgeZone) {
              this.prevNode = last
              return
            }
          }
        }

        this.handleVerticalCheck(node, checkList)
      }

      if (!MindMap._tencentPluginsRegistered) {
        MindMap.usePlugin(DragClass)
        MindMap.usePlugin(AssociativeLineModule.default || AssociativeLineModule)
        MindMap.usePlugin(UnbalancedLayoutPlugin)
        MindMap.usePlugin(OuterFrameModule.default || OuterFrameModule)
        MindMap.usePlugin(RichTextModule.default || RichTextModule)
        MindMap.usePlugin(SelectModule.default || SelectModule)
        MindMap._tencentPluginsRegistered = true
      }

      const rawData = originDataRef.current
      const smmData = tencentToSimpleMindMap(rawData)
      mindMap = new MindMap({
        el: containerRef.current,
        data: smmData,
        layout: currentLayout,
        theme: currentTheme,
        readonly,
        fit: true,
        enableFreeDrag: false,
        useLeftKeySelectionRightKeyDrag: true,
        iconList: TENCENT_MARKER_ICONS
      })
      mmRef.current = mindMap

      // Right-click context menu (library emits node_contextmenu on node groups)
      mindMap.on('node_contextmenu', (e, node) => {
        contextNodeRef.current = node
        // Set as active node so execCommand with null appointNodes applies to this node
        if (mmRef.current?.renderer) {
          mmRef.current.renderer.activeNodeList = Array.isArray(node) ? node : [node]
        }
        setContextMenuRef.current({ x: e.clientX, y: e.clientY, node })
      })
      document.addEventListener('keydown', onKeyDown)

      // Track active node for media upload
      mindMap.on('node_active', (node) => {
        const n = Array.isArray(node) ? node[0] : node
        activeNodeRef.current = n
      })
      mindMap.on('node_click', (node) => {
        const n = Array.isArray(node) ? node[0] : node
        activeNodeRef.current = n

        // Link mode: first click = source, second click = target
        if (linkModeRef.current) {
          if (!linkSourceRef.current) {
            linkSourceRef.current = n
          } else if (n !== linkSourceRef.current) {
            mmRef.current?.associativeLine?.addLine(linkSourceRef.current, n)
            mmRef.current?.emit('data_change')
            linkSourceRef.current = null
            linkModeRef.current = false
            setLinkMode(false)
          }
        }
      })
      // Run restoration after async layout/render completes
      const onFirstRender = () => {
        mindMap.off('node_tree_render_end', onFirstRender)

        injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
        restoreNodeMedia(mindMap).catch(console.error)

        // Restore associative lines from Tencent relationships
        try {
          const relationships = originDataRef.current?.relationships || []
          if (relationships.length > 0) {
            // After layout, render tree data nodes have ._node pointing to Node instances.
            // Walk the render tree using ._node to find nodes by their tencent ID.
            const buildNodeIdMap = (dataNode) => {
              const map = new Map()
              const walk = (n) => {
                const node = n._node || n
                const id = node?.nodeData?.data?._tencentMeta?.id
                if (id) map.set(id, node)
                if (n.children) n.children.forEach(c => walk(c))
              }
              walk(dataNode)
              return map
            }
            const nodeMap = buildNodeIdMap(mindMap.renderer.renderTree)
            for (const rel of relationships) {
              const fromNode = nodeMap.get(rel.end1Id)
              const toNode = nodeMap.get(rel.end2Id)
              if (fromNode && toNode) {
                mindMap.associativeLine?.addLine(fromNode, toNode)
                // Restore custom bezier control points if saved
                if (rel.controlPoints && Object.keys(rel.controlPoints).length > 0) {
                  try {
                    const toUid = toNode.getData('uid')
                    const targets = fromNode.getData('associativeLineTargets') || []
                    const idx = targets.indexOf(toUid)
                    if (idx >= 0) {
                      const sp = rel.lineEndPoints?.["0"] || {}
                      const ep = rel.lineEndPoints?.["1"] || {}
                      const cp0 = rel.controlPoints["0"] || {}
                      const cp1 = rel.controlPoints["1"] || {}
                      const offsets = [
                        { x: (cp0.x || 0) - (sp.x || 0), y: (cp0.y || 0) - (sp.y || 0) },
                        { x: (cp1.x || 0) - (ep.x || 0), y: (cp1.y || 0) - (ep.y || 0) }
                      ]
                      const allOffsets = fromNode.getData('associativeLineTargetControlOffsets') || []
                      allOffsets[idx] = offsets
                      fromNode.setData('associativeLineTargetControlOffsets', allOffsets)
                      const allPoints = fromNode.getData('associativeLinePoint') || []
                      allPoints[idx] = { startPoint: sp, endPoint: ep }
                      fromNode.setData('associativeLinePoint', allPoints)
                    }
                  } catch (e) {
                    console.error('Failed to restore control points:', e)
                  }
                }
                // Restore line style if saved
                if (rel.style && rel.style.lineColor) {
                  try {
                    const toUid = toNode.getData('uid')
                    const allStyles = fromNode.getData('associativeLineStyle') || {}
                    allStyles[toUid] = {
                      associativeLineColor: rel.style.lineColor,
                      ...(rel.style.lineWidth != null ? { associativeLineWidth: rel.style.lineWidth } : {}),
                      ...(rel.style.lineDasharray != null ? { associativeLineDasharray: rel.style.lineDasharray } : {})
                    }
                    fromNode.setData('associativeLineStyle', allStyles)
                  } catch (e) {
                    console.error('Failed to restore line style:', e)
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('Failed to restore associative lines:', err)
        }

        // Restore generalizations from extensions
        try {
          const restoreGeneralizations = (parentNode) => {
            const walk = (node, depth = 0) => {
              const mn = node._node || node
              const meta = mn?.nodeData?.data?._tencentMeta
              const genData = meta?.extensions?.['drawwork.generalization']
              if (genData && genData.length > 0) {
                const range = genData[0].range
                if (range && mn.children) {
                  const targetChildren = mn.children.slice(range[0], range[1] + 1)
                  const nodeInstances = targetChildren.map(n => n._node).filter(Boolean)
                  if (nodeInstances.length > 0) {
                    mindMap.renderer.activeNodeList = nodeInstances
                    mindMap.execCommand('ADD_GENERALIZATION', { text: genData[0].text || '概要' })
                  }
                } else if (!range) {
                  try {
                    mindMap.execCommand('SET_NODE_DATA', mn, { generalization: genData })
                  } catch (e) {
                    console.error('Failed to restore self-generalization:', e)
                  }
                }
              }
              if (node.children) node.children.forEach(c => walk(c, depth + 1))
            }
            walk(parentNode, 0)
            mindMap.render()
          }
          restoreGeneralizations(mindMap.renderer.renderTree)
        } catch (err) {
          console.error('Failed to restore generalizations:', err)
        }

        // Restore boundaries from originDataRef.rootTopic.boundaries
        try {
          const boundaryList = originDataRef.current?.rootTopic?.boundaries
          const rootChildren = mindMap.renderer.renderTree?.children
          if (boundaryList && boundaryList.length > 0 && rootChildren) {
            for (const boundary of boundaryList) {
              const [start, end] = boundary.range || [0, 0]
              const targetChildren = rootChildren.slice(start, end + 1)
              if (targetChildren.length > 0) {
                // Map data tree nodes to Node instances via ._node
                const nodeInstances = targetChildren.map(n => n._node).filter(Boolean)
                if (nodeInstances.length > 0) {
                  mindMap.renderer.activeNodeList = nodeInstances
                  mindMap.execCommand('ADD_OUTER_FRAME', null, {
                    strokeColor: boundary.strokeColor || '#0984e3',
                    fill: boundary.fill || 'rgba(9,132,227,0.05)',
                    radius: boundary.radius || 5,
                    strokeWidth: boundary.strokeWidth || 2,
                    strokeDasharray: boundary.strokeDasharray || '0'
                  })
                }
              }
            }
          }
        } catch (err) {
          console.error('Failed to restore boundaries:', err)
        }

        // Restore markers from _tencentMeta
        try {
          const restoreMarkers = (parentNode) => {
            const walk = (node) => {
              const mn = node._node || node
              const meta = mn?.nodeData?.data?._tencentMeta
              if (meta?.markers?.length) {
                const iconKeys = meta.markers.map(m => {
                  if (m.markerId === 'symbol-question') return 'tencent_question'
                  return null
                }).filter(Boolean)
                if (iconKeys.length) {
                  mn.setIcon(iconKeys)
                }
              }
              if (node.children) node.children.forEach(walk)
            }
            walk(parentNode)
          }
          restoreMarkers(mindMap.renderer.renderTree)
        } catch (err) {
          console.error('Failed to restore markers:', err)
        }

        mindMap.emit('data_change')
      }
      mindMap.on('node_tree_render_end', onFirstRender)

      // Listen for data changes to auto-save
      mindMap.on('data_change', () => {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveDataRef.current?.()
        }, 2000)
      })

      // onConnectionChange is handled by a reactive effect below
    }

    init()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      mounted = false
      clearTimeout(saveTimerRef.current)
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      blobUrlsRef.current.clear()
      if (mmRef.current) {
        mmRef.current.destroy()
        mmRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, loading, remoteUpdateVersion])

  // Report real connection status via onConnectionChange
  useEffect(() => {
    if (loading || !canvasId) return
    let label
    if (!connected) label = 'disconnected'
    else if (!synced) label = 'syncing'
    else label = 'synced'
    onConnectionChange?.({ connected, synced, label, onlineCount }, canvasId)
  }, [connected, synced, onlineCount, loading, readonly, canvasId, onConnectionChange])

  // Update readonly mode
  useEffect(() => {
    mmRef.current?.setMode(readonly ? 'readonly' : 'edit')
  }, [readonly])

  // Save data to API
  const saveData = useCallback(async () => {
    if (!originDataRef.current || !mmRef.current) {
      return
    }
    try {
      const currentData = mmRef.current.getData()
      const tencentData = simpleMindMapToTencent(currentData, originDataRef.current)

      // Persist associative lines as Tencent relationships (always overwrite)
      const lineList = mmRef.current.associativeLine?.lineList || []
      const relationships = []
      for (const line of lineList) {
        const fromNode = line[3]
        const toNode = line[4]
        const fromId = fromNode?.nodeData?.data?._tencentMeta?.id
        const toId = toNode?.nodeData?.data?._tencentMeta?.id
        if (fromId && toId) {
          // Capture bezier control points, endpoints, and style from node data
          const fromUid = fromNode.getData?.('uid')
          const toUid = toNode.getData?.('uid')
          const targets = fromNode.getData?.('associativeLineTargets') || []
          const targetIndex = targets.indexOf(toUid)

          let controlPoints = {}
          let lineEndPoints = {}
          let lineStyle = { lineColor: '#319B62' }

          if (targetIndex >= 0) {
            const allOffsets = fromNode.getData?.('associativeLineTargetControlOffsets') || []
            const allPoints = fromNode.getData?.('associativeLinePoint') || []
            const offsets = allOffsets[targetIndex]
            const points = allPoints[targetIndex]

            if (offsets && points) {
              const sp = points.startPoint || {}
              const ep = points.endPoint || {}
              controlPoints = {
                "0": { x: (sp.x || 0) + (offsets[0]?.x || 0), y: (sp.y || 0) + (offsets[0]?.y || 0) },
                "1": { x: (ep.x || 0) + (offsets[1]?.x || 0), y: (ep.y || 0) + (offsets[1]?.y || 0) }
              }
              lineEndPoints = {
                "0": { x: sp.x || 0, y: sp.y || 0 },
                "1": { x: ep.x || 0, y: ep.y || 0 }
              }
            }

            const allStyles = fromNode.getData?.('associativeLineStyle') || {}
            const perLineStyle = allStyles[toUid]
            if (perLineStyle) {
              lineStyle = {
                lineColor: perLineStyle.associativeLineColor || '#319B62',
                ...(perLineStyle.associativeLineWidth != null ? { lineWidth: perLineStyle.associativeLineWidth } : {}),
                ...(perLineStyle.associativeLineDasharray != null ? { lineDasharray: perLineStyle.associativeLineDasharray } : {})
              }
            }
          }

          relationships.push({
            id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            end1Id: fromId,
            end2Id: toId,
            title: '',
            controlPoints,
            lineEndPoints,
            style: lineStyle
          })
        }
      }
      tencentData.relationships = relationships

      originDataRef.current = tencentData
      console.log('[YJS-SAVE] Calling syncToYjs, data size:', JSON.stringify(tencentData).length, 'relationships:', relationships.length, 'hasRootTopic:', !!tencentData?.rootTopic)
      syncToYjs(tencentData)
      await api.put(`/canvases/${canvasId}/tencentmind`, { data: tencentData })
      console.log('[YJS-SAVE] API save complete')
    } catch (err) {
      console.error('Failed to save tencent mind data:', err)
    }
  }, [canvasId, syncToYjs])

  saveDataRef.current = saveData

  const handleLayoutChange = useCallback((layout) => {
    setCurrentLayout(layout)
    mmRef.current?.setLayout(layout)
  }, [])

  const handleThemeChange = useCallback((theme) => {
    setCurrentTheme(theme)
    mmRef.current?.setTheme(theme)
  }, [])

  const handleAddMedia = useCallback(() => {
    const activeNodes = mmRef.current?.renderer?.activeNodeList
    const raw = activeNodes?.[0]
    if (!raw || readonly) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*,.gif'

    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过 10MB')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await api.post(`/upload?board_id=${boardId}`, formData)
        const uploadId = res.data.id

        const blobRes = await api.get(`/upload/${uploadId}`, { responseType: 'blob' })
        const blobUrl = URL.createObjectURL(blobRes.data)
        blobUrlsRef.current.add(blobUrl)

        // Set media data on the node's nodeData.data object
        if (file.type.startsWith('video/')) {
          // Placeholder image reserves layout space; injectVideoPlaceholders swaps it for live <video>
          pendingVideoBlobsRef.current.set(uploadId, blobUrl)
          raw.nodeData.data.image = VIDEO_PLACEHOLDER
          raw.nodeData.data.imageSize = { width: 120, height: 80, custom: true }
          raw.nodeData.data._uploadId = uploadId
          raw.nodeData.data._mediaType = 'video'
          raw.nodeData.data._blobUrl = blobUrl
          raw.nodeData.data._imageSize = { width: 120, height: 80, custom: true }
        } else {
          const img = new Image()
          img.src = blobUrl
          await img.decode()
          const maxW = 200, maxH = 150
          let w = img.naturalWidth, h = img.naturalHeight
          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h)
            w = Math.round(w * ratio)
            h = Math.round(h * ratio)
          }
          raw.nodeData.data.image = blobUrl
          raw.nodeData.data.imageSize = { width: w, height: h, custom: true }
          raw.nodeData.data._uploadId = uploadId
          raw.nodeData.data._mediaType = 'image'
          raw.nodeData.data._imageSize = { width: w, height: h, custom: true }
        }
        mmRef.current?.render(() => {
          injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
        })
        mmRef.current?.emit('data_change')
      } catch (err) {
        console.error('Upload failed:', err)
      }
    }

    input.click()
  }, [readonly, boardId])

  const handleRemoveGeneralization = useCallback(() => {
    const mm = mmRef.current
    if (!mm) return

    // Find any node that has generalization data
    const findGen = (n) => {
      if (!n) return null
      const gen = n.getData?.('generalization') ?? n.data?.generalization ?? n.nodeData?.data?.generalization
      if (gen != null) return n
      for (const c of n.children || []) {
        const found = findGen(c)
        if (found) return found
      }
      return null
    }

    const node = findGen(mm.renderer?.renderTree)
    if (node) {
      // Direct property removal (most reliable)
      if (node.nodeData?.data) {
        node.nodeData.data.generalization = null
      }
      if (node.data) {
        node.data.generalization = null
      }
      // Also try library command
      try { mm.execCommand('SET_NODE_DATA', node, { generalization: null }) } catch (e) {}
      mm.render()
      mm.emit('data_change')

      // Manually clean up any generalization child nodes
      if (node.children) {
        node.children = node.children.filter(c => !c.isGeneralization)
      }
      mm.render()
      return
    }

    mm.execCommand('REMOVE_GENERALIZATION')
    mm.emit('data_change')
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-mono mr-2">腾讯思维</span>

        <select
          className="text-xs border rounded px-2 py-1"
          value={currentLayout}
          onChange={e => handleLayoutChange(e.target.value)}
        >
          {LAYOUTS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        <select
          className="text-xs border rounded px-2 py-1"
          value={currentTheme}
          onChange={e => handleThemeChange(e.target.value)}
        >
          {THEMES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={readonly}
            onChange={e => setReadonly(e.target.checked)}
          />
          只读
        </label>

        <div className="flex-1" />
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onContextMenu={e => e.preventDefault()}
          onClick={(e) => { if (e.target === e.currentTarget) setContextMenu(null) }}
        >
          <div
            ref={menuEl => {
              if (!menuEl) return
              const rect = menuEl.getBoundingClientRect()
              if (rect.right > window.innerWidth) menuEl.style.left = (window.innerWidth - rect.width - 8) + 'px'
              if (rect.bottom > window.innerHeight) menuEl.style.top = (window.innerHeight - rect.height - 8) + 'px'
            }}
            className="absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <ContextMenuItem onClick={() => { mmRef.current?.execCommand('INSERT_CHILD_NODE'); setContextMenu(null) }}>
              添加子节点
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { mmRef.current?.execCommand('INSERT_NODE'); setContextMenu(null) }}
              disabled={contextMenu.node.isRoot}
            >
              添加同级
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem onClick={() => { setContextMenu(null); handleAddMedia() }}>
              添加图片/视频
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem
              onClick={() => { mmRef.current?.execCommand('ADD_GENERALIZATION'); mmRef.current?.emit('data_change'); setContextMenu(null) }}
              disabled={contextMenu.node.isRoot}
            >
              添加概要
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { setContextMenu(null); handleRemoveGeneralization() }}
              disabled={contextMenu.node.isRoot}
            >
              删除概要
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const mm = mmRef.current
                if (!mm) return
                mm.execCommand('ADD_OUTER_FRAME', null, { strokeColor: '#0984e3', fill: 'rgba(9,132,227,0.05)' })
                mm.emit('data_change')
                setContextMenu(null)
              }}
              disabled={contextMenu.node.isRoot}
            >
              添加外框
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { mmRef.current?.outerFrame?.removeActiveOuterFrame(); mmRef.current?.emit('data_change'); setContextMenu(null) }}>
              删除外框
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem onClick={() => { setLinkMode(true); linkModeRef.current = true; setContextMenu(null) }}>
              创建关联线
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { mmRef.current?.associativeLine?.removeLine(); mmRef.current?.emit('data_change'); setContextMenu(null) }}>
              删除关联线
            </ContextMenuItem>

            <ContextMenuDivider />

            <div className="relative">
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
                onMouseLeave={(e) => {
                  setTimeout(() => {
                    if (markerMenuRef.current && !markerMenuRef.current.matches(':hover')) {
                      markerMenuRef.current.classList.add('hidden')
                    }
                  }, 200)
                }}
                onClick={(e) => {
                  const menu = markerMenuRef.current
                  if (menu) menu.classList.toggle('hidden')
                }}
              >
                <span>标记</span>
                <span className="text-gray-400">▸</span>
              </button>
              <div
                ref={markerMenuRef}
                className="hidden absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2"
                onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
                onMouseLeave={() => markerMenuRef.current?.classList.add('hidden')}
              >
                <div className="grid grid-cols-5 gap-1 w-[140px]">
                  {[
                    { key: 'tencent_question', label: '疑问', svg: questionIcon },
                    { key: 'tencent_priority', label: '优先级', svg: priorityIcon },
                    { key: 'tencent_progress', label: '进度', svg: progressIcon },
                    { key: 'tencent_star', label: '星标', svg: starIcon },
                    { key: 'tencent_check', label: '完成', svg: checkIcon },
                    { key: 'tencent_cross', label: '错误', svg: crossIcon },
                    { key: 'tencent_idea', label: '灵感', svg: ideaIcon },
                    { key: 'tencent_warning', label: '警告', svg: warningIcon },
                    { key: 'tencent_target', label: '目标', svg: targetIcon },
                    { key: 'tencent_clock', label: '时钟', svg: clockIcon },
                  ].map(({ key, label, svg }) => {
                    const node = contextNodeRef.current
                    const active = node ? (node.getData?.('icon') || node.data?.icon || []).includes(key) : false
                    return (
                      <button
                        key={key}
                        title={label}
                        className={`w-7 h-7 flex items-center justify-center rounded ${
                          active ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'
                        }`}
                        onClick={() => {
                          const mm = mmRef.current
                          const node = contextNodeRef.current
                          if (!mm || !node) return
                          const icons = node.getData?.('icon') || []
                          if (icons.includes(key)) {
                            node.setIcon(icons.filter(k => k !== key))
                          } else {
                            node.setIcon([...icons, key])
                          }
                          mm.emit('data_change')
                          setContextMenu(null)
                        }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mind map container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})

const ContextMenuItem = ({ onClick, disabled, children }) => (
  <button
    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
      disabled
        ? 'text-gray-300 cursor-not-allowed'
        : 'text-gray-700 hover:bg-gray-100'
    }`}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

const ContextMenuDivider = () => (
  <div className="h-px bg-gray-200 my-1" />
)

export default TencentMindEditor
