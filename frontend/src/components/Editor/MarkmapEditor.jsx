import { useEffect, useRef, useState, forwardRef } from 'react'

const DEFAULT_MARKDOWN = `# 中心主题

## 分支 1
### 子分支 1-1
### 子分支 1-2

## 分支 2
### 子分支 2-1
### 子分支 2-2

## 分支 3
### 子分支 3-1

## React 特性
### 组件化
### 虚拟 DOM
### 单向数据流
`

const MarkmapEditor = forwardRef(function MarkmapEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const svgRef = useRef(null)
  const mmRef = useRef(null)
  const transformerRef = useRef(null)
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [showEditor, setShowEditor] = useState(true)

  const updateMarkmap = (mm, md) => {
    if (!mm || !transformerRef.current) return
    const { root } = transformerRef.current.transform(md)
    mm.setData(root)
    mm.fit()
  }

  // Init markmap on mount
  useEffect(() => {
    if (!svgRef.current || !isActive) return
    let mounted = true
    let mm = null

    const init = async () => {
      const [{ Markmap }, { Transformer }] = await Promise.all([
        import('markmap-view'),
        import('markmap-lib')
      ])
      if (!mounted) return

      transformerRef.current = new Transformer()
      mm = Markmap.create(svgRef.current, {
        zoom: { min: 0.5, max: 5 },
        pan: true,
      })
      updateMarkmap(mm, markdown)
      mmRef.current = mm
      onConnectionChange?.({ connected: true, synced: true, label: 'synced', onlineCount: 1 }, canvasId)
    }

    init()
    return () => {
      mounted = false
      mm?.destroy()
      mmRef.current = null
    }
  }, [isActive, canvasId, onConnectionChange])

  // Debounced update when markdown changes
  useEffect(() => {
    if (!mmRef.current) return
    const timer = setTimeout(() => {
      updateMarkmap(mmRef.current, markdown)
    }, 300)
    return () => clearTimeout(timer)
  }, [markdown])

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0">
        <span className="text-xs text-gray-400 font-mono mr-2">markmap</span>
        <button
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          onClick={() => setShowEditor(!showEditor)}
        >
          {showEditor ? '隐藏编辑' : '编辑Markdown'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {showEditor && (
          <textarea
            className="w-72 border-r border-gray-200 p-3 text-xs font-mono resize-none outline-none bg-gray-50"
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            disabled={!canEdit}
            placeholder="输入 Markdown..."
          />
        )}
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-white">
          <svg ref={svgRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  )
})

export default MarkmapEditor
