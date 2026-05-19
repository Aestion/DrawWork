import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'

const DEFAULT_DATA = {
  data: { text: '中心主题' },
  children: [
    {
      data: { text: '分支 1' },
      children: [
        { data: { text: '子分支 1-1' } },
        { data: { text: '子分支 1-2' } }
      ]
    },
    {
      data: { text: '分支 2' },
      children: [
        { data: { text: '子分支 2-1' } }
      ]
    },
    {
      data: { text: '分支 3' }
    }
  ]
}

const LAYOUTS = [
  { value: 'logicalStructure', label: '逻辑结构' },
  { value: 'mindMap', label: '思维导图' },
  { value: 'catalogOrganization', label: '目录组织' },
  { value: 'organizationStructure', label: '组织结构' },
  { value: 'timeline', label: '时间线' },
  { value: 'fishbone', label: '鱼骨图' }
]

const THEMES = [
  'default', 'classic', 'classic2', 'classic3', 'dark',
  'blue', 'green', 'purple', 'red', 'orange', 'gold',
  'minions', 'simple', 'fresh', 'fresh-blue', 'fresh-red'
]

const SimpleMindMapEditor = forwardRef(function SimpleMindMapEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const mmRef = useRef(null)
  const [currentLayout, setCurrentLayout] = useState('logicalStructure')
  const [currentTheme, setCurrentTheme] = useState('default')
  const [readonly, setReadonly] = useState(false)

  // Init mind map
  useEffect(() => {
    if (!containerRef.current || !isActive) return
    let mounted = true
    let mindMap = null

    const init = async () => {
      const [MindMapModule, DragModule] = await Promise.all([
        import('simple-mind-map'),
        import('simple-mind-map/src/plugins/Drag.js')
      ])
      const MindMap = MindMapModule.default
      if (!mounted) return

      // Register Drag plugin for node dragging (both reorder and free drag)
      MindMap.usePlugin(DragModule.default)

      mindMap = new MindMap({
        el: containerRef.current,
        data: DEFAULT_DATA,
        layout: currentLayout,
        theme: currentTheme,
        readonly,
        fit: true,
        enableFreeDrag: false,
      })
      mmRef.current = mindMap
      onConnectionChange?.({ connected: true, synced: true, label: 'synced', onlineCount: 1 }, canvasId)
    }

    init()

    return () => {
      mounted = false
      if (mmRef.current) {
        mmRef.current.destroy()
        mmRef.current = null
      }
    }
  }, [isActive, canvasId, onConnectionChange])

  // Update readonly mode
  useEffect(() => {
    mmRef.current?.setMode(readonly ? 'readonly' : 'edit')
  }, [readonly])

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

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-mono mr-2">simple-mind-map</span>

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
      </div>

      {/* Mind map container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})

export default SimpleMindMapEditor
