import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'
import 'mind-elixir/style.css'

const SAMPLE_DATA = {
  nodeData: {
    id: 'root',
    topic: '中心主题',
    children: [
      {
        id: 'b1',
        topic: '分支 1',
        children: [
          { id: 'b11', topic: '子分支 1-1' },
          { id: 'b12', topic: '子分支 1-2' }
        ]
      },
      {
        id: 'b2',
        topic: '分支 2',
        children: [
          { id: 'b21', topic: '子分支 2-1' }
        ]
      },
      {
        id: 'b3',
        topic: '分支 3'
      }
    ]
  }
}

const DIRECTIONS = [
  { value: -1, label: '左侧' },
  { value: 0, label: '左右' },
  { value: 1, label: '右侧' },
  { value: 2, label: '自由' }
]

const MindElixirEditor = forwardRef(function MindElixirEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const meRef = useRef(null)
  const [direction, setDirection] = useState(0)

  // Init mind-elixir
  useEffect(() => {
    if (!containerRef.current || !isActive) return
    let mounted = true
    let mind = null

    const init = async () => {
      const mod = await import('mind-elixir')
      const MindElixir = mod.default
      const zhCN = mod.i18n?.zh_CN
      if (!mounted) return

      mind = new MindElixir({
        el: containerRef.current,
        direction,
        draggable: true,
        contextMenu: zhCN ? { locale: zhCN } : true,
        toolBar: true,
        nodeMenu: true,
        keypress: true,
      })

      mind.init(SAMPLE_DATA)
      mind.toCenter()
      meRef.current = mind

      onConnectionChange?.({ connected: true, synced: true, label: 'synced', onlineCount: 1 }, canvasId)
    }

    init()

    return () => {
      mounted = false
      if (meRef.current) {
        meRef.current.destroy()
        meRef.current = null
      }
    }
  }, [isActive, canvasId, onConnectionChange])

  // Handle direction change
  const handleDirectionChange = useCallback((dir) => {
    setDirection(Number(dir))
    if (meRef.current) {
      meRef.current.direction = Number(dir)
      meRef.current.refresh(meRef.current.getData())
    }
  }, [])

  const handleExport = useCallback(() => {
    const data = meRef.current?.getData()
    console.log('MindElixir data:', JSON.stringify(data, null, 2))
  }, [])

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0">
        <span className="text-xs text-gray-400 font-mono mr-2">Mind Elixir</span>

        <select
          className="text-xs border rounded px-2 py-1"
          value={direction}
          onChange={e => handleDirectionChange(e.target.value)}
        >
          {DIRECTIONS.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          onClick={handleExport}
        >
          导出数据
        </button>
      </div>

      {/* Mind-elixir container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})

export default MindElixirEditor
