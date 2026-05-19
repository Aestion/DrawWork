import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from '../../lib/tencent-mind-utils'
import UnbalancedLayoutPlugin from '../../lib/unbalanced-layout-plugin'
import api from '../../lib/axios'

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

const TencentMindEditor = forwardRef(function TencentMindEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const mmRef = useRef(null)
  const originDataRef = useRef(null)
  const saveTimerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [currentLayout, setCurrentLayout] = useState('mindMap')
  const [currentTheme, setCurrentTheme] = useState('default')
  const [readonly, setReadonly] = useState(false)

  // Load data from API
  useEffect(() => {
    if (!isActive || !canvasId) return

    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        const res = await api.get(`/canvases/${canvasId}/tencentmind`)
        if (cancelled) return

        let tencentData
        if (res.data?.data) {
          tencentData = res.data.data
        } else {
          tencentData = DEFAULT_TENCENT_MIND
        }
        originDataRef.current = tencentData
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load tencent mind data:', err)
        originDataRef.current = DEFAULT_TENCENT_MIND
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isActive, canvasId])

  // Initialize simple-mind-map
  useEffect(() => {
    if (!containerRef.current || !isActive || loading) return
    let mounted = true
    let mindMap = null

    const init = async () => {
      const [MindMapModule, DragModule] = await Promise.all([
        import('simple-mind-map'),
        import('simple-mind-map/src/plugins/Drag.js')
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

      MindMap.usePlugin(DragClass)
      MindMap.usePlugin(UnbalancedLayoutPlugin)

      const smmData = tencentToSimpleMindMap(originDataRef.current)
      mindMap = new MindMap({
        el: containerRef.current,
        data: smmData,
        layout: currentLayout,
        theme: currentTheme,
        readonly,
        fit: true,
        enableFreeDrag: false
      })
      mmRef.current = mindMap

      // Listen for data changes to auto-save
      mindMap.on('data_change', () => {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveData()
        }, 2000)
      })

      onConnectionChange?.({ connected: true, synced: true, label: 'synced', onlineCount: 1 }, canvasId)
    }

    init()

    return () => {
      mounted = false
      clearTimeout(saveTimerRef.current)
      if (mmRef.current) {
        mmRef.current.destroy()
        mmRef.current = null
      }
    }
  }, [isActive, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update readonly mode
  useEffect(() => {
    mmRef.current?.setMode(readonly ? 'readonly' : 'edit')
  }, [readonly])

  // Save data to API
  const saveData = useCallback(async () => {
    if (!originDataRef.current || !mmRef.current) return
    try {
      const currentData = mmRef.current.getData()
      const tencentData = originDataRef.current

      // Update the text content of the root
      if (tencentData.rootTopic?.title?.children?.[0]?.children?.[0]) {
        tencentData.rootTopic.title.children[0].children[0].text = currentData.data?.text || ''
      }

      await api.put(`/canvases/${canvasId}/tencentmind`, {
        data: tencentData
      })
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
