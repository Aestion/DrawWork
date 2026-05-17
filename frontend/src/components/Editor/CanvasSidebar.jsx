import { useState } from 'react'
import { CANVAS_TYPES } from '../../lib/constants'

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

  return (
    <div className="relative z-10 w-56 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      {/* Top safe area for hamburger menu */}
      <div className="h-14 flex-shrink-0" />

      {/* Canvas list header */}
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
                <div className="absolute top-full right-0 mt-1 bg-white shadow-lg rounded-md border py-1 z-20 min-w-[120px]">
                  {Object.entries(CANVAS_TYPES).map(([key, { label, icon }]) => (
                    <button
                      key={key}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => handleCreate(key)}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Canvas list */}
      <div className="flex-1 overflow-y-auto">
        {canvases.map(canvas => (
          <div
            key={canvas.id}
            className={`group flex items-center px-3 py-2 cursor-pointer border-b border-gray-100 ${
              currentCanvas?.id === canvas.id
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => onSwitch(canvas)}
          >
            <span className="mr-2">{CANVAS_TYPES[canvas.type]?.icon || '✏️'}</span>
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
            {/* 只在选中项且可编辑且多于1个画布时显示删除按钮，hover 时显示 */}
            {canEdit && canvases.length > 1 && currentCanvas?.id === canvas.id && renaming !== canvas.id && (
              <button
                className="ml-1 text-gray-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(canvas.id)
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {canvases.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            暂无画布
          </div>
        )}
      </div>
    </div>
  )
}
