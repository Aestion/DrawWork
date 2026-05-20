import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from '../../lib/tencent-mind-utils'
import UnbalancedLayoutPlugin from '../../lib/unbalanced-layout-plugin'
import { TENCENT_MARKER_ICONS } from '../../lib/marker-icons'
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
    if (!yjsTencentData) return
    if (lastAppliedVersionRef.current === remoteUpdateVersion && originDataRef.current) return
    originDataRef.current = yjsTencentData
    lastAppliedVersionRef.current = remoteUpdateVersion
    setLoading(false)
  }, [yjsTencentData, remoteUpdateVersion])

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

    const restoreNodeMedia = async (mindMap) => {
      const walk = async (node) => {
        if (node.nodeData?.data?._uploadId) {
          const uploadId = node.nodeData.data._uploadId
          const mediaType = node.nodeData.data._mediaType
          try {
            const blobRes = await api.get(`/upload/${uploadId}`, { responseType: 'blob' })
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
      // Re-render to create SVG <image> elements for placeholders
      mindMap.render(() => {
        injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
      })
    }

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

      const smmData = tencentToSimpleMindMap(originDataRef.current)
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
            linkSourceRef.current = null
            linkModeRef.current = false
            setLinkMode(false)
          }
        }
      })
      mindMap.on('node_tree_render_end', () => {
        injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
      })
      restoreNodeMedia(mindMap).catch(console.error)

      // Restore associative lines from Tencent relationships
      const relationships = originDataRef.current?.relationships || []
      if (relationships.length > 0) {
        const buildNodeIdMap = (node) => {
          const map = new Map()
          const walk = (n) => {
            const id = n?.nodeData?.data?._tencentMeta?.id
            if (id) map.set(id, n)
            if (n.children) n.children.forEach(walk)
          }
          walk(node)
          return map
        }
        const nodeMap = buildNodeIdMap(mindMap.renderer.renderTree)
        for (const rel of relationships) {
          const fromNode = nodeMap.get(rel.end1Id)
          const toNode = nodeMap.get(rel.end2Id)
          if (fromNode && toNode) {
            mindMap.associativeLine?.addLine(fromNode, toNode)
          }
        }
      }

      // Restore generalizations from extensions
      try {
        const restoreGeneralizations = (parentNode) => {
          const walk = (node) => {
            const meta = node?.nodeData?.data?._tencentMeta
            const genData = meta?.extensions?.['drawwork.generalization']
            if (genData && genData.length > 0 && node.children) {
              const range = genData[0].range
              if (range) {
                const targetChildren = node.children.slice(range[0], range[1] + 1)
                if (targetChildren.length > 0) {
                  mindMap.renderer.setActiveNodeList(targetChildren)
                  mindMap.execCommand('ADD_GENERALIZATION', { text: genData[0].text || '概要' })
                }
              }
            }
            if (node.children) node.children.forEach(walk)
          }
          walk(parentNode)
        }
        restoreGeneralizations(mindMap.renderer.renderTree)
      } catch (err) {
        console.error('Failed to restore generalizations:', err)
      }

      // Restore boundaries from _tencentMeta
      try {
        const restoreBoundaries = (parentNode) => {
          const walk = (node) => {
            const meta = node?.nodeData?.data?._tencentMeta
            if (meta?.boundaries && meta.boundaries.length > 0 && node.children) {
              for (const boundary of meta.boundaries) {
                const [start, end] = boundary.range || [0, 0]
                const targetChildren = node.children.slice(start, end + 1)
                if (targetChildren.length > 0) {
                  mindMap.renderer.setActiveNodeList(targetChildren)
                  mindMap.execCommand('ADD_OUTER_FRAME', null, {
                    strokeColor: '#0984e3',
                    fill: 'rgba(9,132,227,0.05)',
                    radius: 5,
                    strokeWidth: 2,
                    strokeDasharray: '0'
                  })
                }
              }
            }
            if (node.children) node.children.forEach(walk)
          }
          walk(parentNode)
        }
        restoreBoundaries(mindMap.renderer.renderTree)
      } catch (err) {
        console.error('Failed to restore boundaries:', err)
      }

      // Restore markers from _tencentMeta
      try {
        const restoreMarkers = (parentNode) => {
          const walk = (node) => {
            const meta = node?.nodeData?.data?._tencentMeta
            if (meta?.markers?.length) {
              const iconKeys = meta.markers.map(m => {
                if (m.markerId === 'symbol-question') return 'tencent_question'
                return null
              }).filter(Boolean)
              if (iconKeys.length) {
                node.setIcon(iconKeys)
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

      // Listen for data changes to auto-save
      mindMap.on('data_change', () => {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveData()
        }, 2000)
      })

      // onConnectionChange is handled by a reactive effect below
    }

    init()

    return () => {
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
    if (!originDataRef.current || !mmRef.current) return
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
          relationships.push({
            id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            end1Id: fromId,
            end2Id: toId,
            title: '',
            controlPoints: {},
            lineEndPoints: {},
            style: { lineColor: '#319B62' }
          })
        }
      }
      tencentData.relationships = relationships

      originDataRef.current = tencentData
      syncToYjs(tencentData)
      await api.put(`/canvases/${canvasId}/tencentmind`, { data: tencentData })
    } catch (err) {
      console.error('Failed to save tencent mind data:', err)
    }
  }, [canvasId])

  const addSiblingNode = useCallback(() => {
    mmRef.current?.execCommand('INSERT_NODE')
  }, [])

  const addChildNode = useCallback(() => {
    mmRef.current?.execCommand('INSERT_CHILD_NODE')
  }, [])

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

        <button
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={addChildNode}
          disabled={!canEdit || readonly}
        >
          添加子节点
        </button>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={addSiblingNode}
          disabled={!canEdit || readonly}
        >
          添加同级
        </button>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={handleAddMedia}
          disabled={!canEdit || readonly}
          title="添加图片/视频"
        >
          添加媒体
        </button>

        <button
          className={`text-xs px-2 py-1 rounded disabled:opacity-50 ${linkMode ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          onClick={() => {
            setLinkMode(prev => {
              const next = !prev
              linkModeRef.current = next
              if (!next) linkSourceRef.current = null
              return next
            })
          }}
          disabled={!canEdit || readonly}
          title={linkMode ? '点击节点设置起始节点' : '创建关联线'}
        >
          {linkMode ? '取消关联线' : '关联线'}
        </button>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => mmRef.current?.associativeLine?.removeLine()}
          disabled={!canEdit || readonly}
          title="删除选中的关联线"
        >
          删除关联线
        </button>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => mmRef.current?.execCommand('ADD_GENERALIZATION')}
          disabled={!canEdit || readonly}
          title="为选中同级节点创建概要"
        >
          添加概要
        </button>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => mmRef.current?.execCommand('REMOVE_GENERALIZATION')}
          disabled={!canEdit || readonly}
          title="删除选中的概要节点"
        >
          删除概要
        </button>

        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => mmRef.current?.execCommand('ADD_OUTER_FRAME', null, { strokeColor: '#0984e3', fill: 'rgba(9,132,227,0.05)' })}
          disabled={!canEdit || readonly}
          title="为选中节点添加外框"
        >
          添加外框
        </button>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => mmRef.current?.outerFrame?.removeActiveOuterFrame()}
          disabled={!canEdit || readonly}
          title="删除选中的外框"
        >
          删除外框
        </button>

        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={() => {
            const activeNode = activeNodeRef.current
            if (!activeNode || !mmRef.current) return
            const currentIcons = activeNode.getData('icon') || []
            if (currentIcons.includes('tencent_question')) {
              activeNode.setIcon([])
            } else {
              activeNode.setIcon(['tencent_question'])
            }
            mmRef.current.emit('data_change')
          }}
          disabled={!canEdit || readonly}
          title="切换标记图标（问号）"
        >
          标记
        </button>

        <div className="w-px h-4 bg-gray-300 mx-1" />

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

        <button
          className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          onClick={saveData}
          disabled={!canEdit || readonly}
        >
          保存
        </button>
      </div>

      {/* Mind map container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})

export default TencentMindEditor
