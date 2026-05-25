import { useState } from 'react'
import { CANVAS_TYPES } from '../../lib/constants'

const defaultIconClass = 'h-4 w-4 shrink-0'

function CanvasTypeIcon({ type, className = defaultIconClass }) {
  const icon = CANVAS_TYPES[type]?.icon || 'pen'
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }

  if (icon === 'brain') {
    return (
      <svg {...common}>
        <path d="M9 4.5a3 3 0 0 0-3 3v.25A3.25 3.25 0 0 0 5.25 14H6a3 3 0 0 0 3 3" />
        <path d="M15 4.5a3 3 0 0 1 3 3v.25A3.25 3.25 0 0 1 18.75 14H18a3 3 0 0 1-3 3" />
        <path d="M9 4.5V19a2.5 2.5 0 0 0 5 0V4.5" />
        <path d="M6 10h3" />
        <path d="M15 10h3" />
      </svg>
    )
  }

  if (icon === 'kanban') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v16" />
        <path d="M15 4v16" />
        <path d="M6.5 8h1" />
        <path d="M12.5 12h1" />
        <path d="M17.5 9h1" />
      </svg>
    )
  }

  if (icon === 'workflow') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="5" height="4" rx="1" />
        <rect x="15.5" y="5" width="5" height="4" rx="1" />
        <rect x="9.5" y="15" width="5" height="4" rx="1" />
        <path d="M8.5 7h7" />
        <path d="M18 9v2a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2" />
        <path d="M6 9v2a2 2 0 0 0 2 2h4" />
      </svg>
    )
  }

  if (icon === 'network' || icon === 'mindmap') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.5" />
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="7" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M10.2 10.4 6.6 7.4" />
        <path d="m13.8 10.6 3.6-2.6" />
        <path d="m10.5 13.6-3 3" />
        <path d="m13.5 13.6 3 3" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m14 7 3 3" />
    </svg>
  )
}

export default function CanvasSidebar({ canvases, currentCanvas, onSwitch, onCreate, onDelete, onRename, canEdit }) {
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const handleCreate = (type) => {
    onCreate(type)
    setShowTypeMenu(false)
  }

  const startRename = (canvas) => {
    setRenaming(canvas.id)
    setRenameValue(canvas.name)
  }

  const confirmRename = (id) => {
    const trimmed = renameValue.trim()
    const canvas = canvases.find(c => c.id === id)
    if (trimmed && trimmed !== canvas?.name) {
      onRename(id, trimmed)
    }
    setRenaming(null)
  }

  const handleDelete = (id) => {
    if (confirm('删除此画布？')) {
      onDelete(id)
    }
  }

  const creatableTypes = Object.entries(CANVAS_TYPES).filter(([, config]) => config.creatable)

  return (
    <div className="relative z-10 w-56 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      <div className="h-14 flex-shrink-0" />

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">画布</span>
        {canEdit && (
          <div className="relative">
            <button
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
              onClick={() => setShowTypeMenu(!showTypeMenu)}
            >
              + 新建
            </button>
            {showTypeMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTypeMenu(false)}
                />
                <div className="absolute top-full right-0 mt-1 bg-white shadow-lg rounded-md border py-1 z-20 min-w-[160px]">
                  {creatableTypes.map(([key, { label }]) => (
                    <button
                      key={key}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => handleCreate(key)}
                    >
                      <CanvasTypeIcon type={key} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {canvases.map(canvas => {
          const disabled = CANVAS_TYPES[canvas.type]?.disabled
          return (
            <div
              key={canvas.id}
              className={`group flex items-center px-3 py-2 cursor-pointer border-b border-gray-100 ${
                currentCanvas?.id === canvas.id
                  ? 'bg-blue-50 text-blue-700'
                  : disabled
                    ? 'text-gray-400 hover:bg-gray-100'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => onSwitch(canvas)}
            >
              <CanvasTypeIcon type={canvas.type} className="mr-2 h-4 w-4 shrink-0" />
              {renaming === canvas.id ? (
                <input
                  autoFocus
                  className="flex-1 px-1 text-sm border rounded"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(canvas.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmRename(canvas.id)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="flex-1 text-sm truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (canEdit) startRename(canvas)
                  }}
                >
                  {canvas.name}
                </span>
              )}
              {canEdit && canvases.length > 1 && currentCanvas?.id === canvas.id && renaming !== canvas.id && (
                <button
                  className="ml-1 text-gray-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(canvas.id)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {canvases.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            暂无画布
          </div>
        )}
      </div>
    </div>
  )
}
