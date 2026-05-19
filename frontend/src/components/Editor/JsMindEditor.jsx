import { useEffect, useRef, forwardRef, useCallback } from 'react'
import jsmindCss from './jsmind-css.js'

const DEFAULT_MIND = {
  meta: { name: 'jsMind Canvas', author: 'DrawWork', version: '0.1' },
  format: 'node_tree',
  data: {
    id: 'root',
    topic: '中心主题',
    children: [
      {
        id: 'child1',
        topic: '分支 1',
        direction: 'right',
        children: [
          { id: 'child1-1', topic: '子分支 1-1' },
          { id: 'child1-2', topic: '子分支 1-2' }
        ]
      },
      {
        id: 'child2',
        topic: '分支 2',
        direction: 'left',
        children: [
          { id: 'child2-1', topic: '子分支 2-1' }
        ]
      },
      {
        id: 'child3',
        topic: '分支 3',
        direction: 'right'
      }
    ]
  }
}

const THEMES = [
  'primary', 'orange', 'greensea', 'wisteria', 'asphalt',
  'default', 'white', 'fresh-red', 'fresh-soil', 'fresh-green',
  'fresh-blue', 'fresh-purple', 'metroui', 'fish', 'cmx'
]

const JsMindEditor = forwardRef(function JsMindEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const jmRef = useRef(null)

  const addChildNode = useCallback(() => {
    const jm = jmRef.current
    if (!jm) return
    let parent = jm.get_selected_node()
    if (!parent) {
      parent = jm.get_root()
    }
    const id = `node-${Date.now()}`
    jm.add_node(parent, id, '新节点')
  }, [])

  useEffect(() => {
    if (!containerRef.current || !isActive) return

    let jm = null
    let mounted = true

    const init = async () => {
      try {
        // Inject jsmind CSS
        if (!document.getElementById('jsmind-style')) {
          const style = document.createElement('style')
          style.id = 'jsmind-style'
          style.textContent = jsmindCss
          document.head.appendChild(style)
        }

        const jsMind = (await import('jsmind')).default
        if (!mounted) return

        // Load draggable-node plugin (needs SVG engine)
        let hasDraggable = false
        try {
          await import('jsmind/draggable-node')
          hasDraggable = true
        } catch (_) { /* plugin not available */ }

        const options = {
          container: containerRef.current,
          theme: 'primary',
          mode: 'side',
          editable: canEdit,
          view: {
            engine: 'svg',
            line_width: 2,
            line_color: '#555',
            line_style: 'curved',
            zoom: { min: 0.5, max: 2.1, step: 0.1 }
          },
          layout: {
            hspace: 30,
            vspace: 20,
            pspace: 13
          }
        }

        jm = new jsMind(options)
        jm.show(DEFAULT_MIND)
        jmRef.current = jm

        // Enable draggable if plugin loaded
        if (hasDraggable && jm.enable_draggable) {
          jm.enable_draggable()
        }

        // Focus container so keyboard events fire
        containerRef.current?.focus()

        onConnectionChange?.({ connected: true, synced: true, label: 'synced', onlineCount: 1 }, canvasId)
      } catch (err) {
        console.error('JsMind init error:', err)
      }
    }

    init()

    return () => {
      mounted = false
      jmRef.current = null
    }
  }, [isActive, canEdit, canvasId, onConnectionChange])

  // Keyboard event handler
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        addChildNode()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [addChildNode])

  const handleThemeChange = (theme) => {
    jmRef.current?.set_theme(theme)
  }

  const handleAddNode = () => {
    addChildNode()
  }

  const handleExport = () => {
    if (!jmRef.current) return
    const data = jmRef.current.get_data('node_tree')
    console.log('jsMind data:', JSON.stringify(data, null, 2))
    alert('数据已打印到控制台')
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0">
        <span className="text-xs text-gray-400 font-mono mr-2">jsMind v0.9.1</span>

        <select
          className="text-xs border rounded px-2 py-1"
          onChange={(e) => handleThemeChange(e.target.value)}
          defaultValue="primary"
        >
          {THEMES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <button
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleAddNode}
          disabled={!canEdit}
        >
          添加子节点
        </button>

        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          onClick={handleExport}
        >
          导出数据
        </button>

        <div className="flex-1" />

        <span className="text-xs text-gray-400">
          Tab = 添加子节点 | 双击 = 编辑
        </span>
      </div>

      {/* jsMind container */}
      <div
        ref={containerRef}
        tabIndex={0}
        className="flex-1 overflow-hidden outline-none"
        style={{ position: 'relative' }}
      />
    </div>
  )
})

export default JsMindEditor
