import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/axios'
import { PERMISSION_LABELS } from '../../lib/constants'

function formatDate(dateStr) {
  if (!dateStr) return '未知时间'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function BoardCover({ url, compact = false }) {
  const fallbackSize = compact ? 'w-12 h-12' : 'w-16 h-16'
  const [src, setSrc] = useState('')
  const blobUrlRef = useRef(null)

  useEffect(() => {
    if (!url) {
      setSrc('')
      return
    }
    if (!url.startsWith('/api/upload/')) {
      setSrc(url)
      return
    }
    let cancelled = false
    api.get(url.replace(/^\/api/, ''), { responseType: 'blob' }).then((res) => {
      if (cancelled) return
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const blobUrl = URL.createObjectURL(res.data)
      blobUrlRef.current = blobUrl
      setSrc(blobUrl)
    }).catch(() => {
      if (!cancelled) setSrc('')
    })
    return () => { cancelled = true }
  }, [url])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  if (src) {
    return <img src={src} alt="" className="w-full h-full object-cover" />
  }

  return (
    <svg viewBox="0 0 96 96" className={fallbackSize} aria-hidden="true">
      <rect x="14" y="16" width="68" height="56" rx="14" fill="#eef2ff" stroke="#4f46e5" strokeWidth="3" />
      <circle cx="34" cy="38" r="6" fill="#22c55e" />
      <circle cx="50" cy="32" r="6" fill="#f59e0b" />
      <circle cx="62" cy="48" r="6" fill="#3b82f6" />
      <path d="M30 64c10-13 19-16 30-6 5 4 10 4 16-1v15H20v-6c4 2 7 1 10-2z" fill="#f472b6" />
    </svg>
  )
}

function BoardActions({ board, canEdit, canDelete, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3">
      {canEdit && (
        <button
          className="text-xs text-blue-600 hover:text-blue-800"
          onClick={(e) => {
            e.stopPropagation()
            onEdit?.(board)
          }}
        >
          编辑
        </button>
      )}
      {canDelete && (
        <button
          className="text-xs text-red-500 hover:text-red-700"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('确定删除此画板？')) onDelete(board.id)
          }}
        >
          删除
        </button>
      )}
    </div>
  )
}

export default function BoardCard({ board, onDelete, onEdit, viewMode = 'grid' }) {
  const navigate = useNavigate()
  const canEdit = board.permission === 'owner' || board.permission === 'editor'
  const canDelete = board.permission === 'owner'
  const permissionLabel = PERMISSION_LABELS[board.permission] || board.permission

  if (viewMode === 'list') {
    return (
      <div
        className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow transition-shadow cursor-pointer px-4 py-3"
        onClick={() => navigate(`/board/${board.id}`)}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-md bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center overflow-hidden shrink-0">
            <BoardCover url={board.cover_url} compact />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{board.name}</h3>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600 shrink-0">
                {permissionLabel}
              </span>
            </div>
            {board.description && (
              <p className="text-xs text-gray-500 mt-1 truncate">{board.description}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 md:hidden">
              <span>{board.canvas_count || 0} 个画布</span>
              <span>创建者 {board.owner_name || '未知'}</span>
              <span>创建于 {formatDate(board.created_at)}</span>
            </div>
          </div>

          <p className="hidden md:block w-24 text-sm text-gray-600">{board.canvas_count || 0} 个画布</p>
          <p className="hidden lg:block w-32 text-xs text-gray-400 truncate">创建者 {board.owner_name || '未知'}</p>
          <p className="hidden xl:block w-32 text-xs text-gray-400">创建于 {formatDate(board.created_at)}</p>
          {(canEdit || canDelete) && (
            <div className="shrink-0">
              <BoardActions board={board} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
      onClick={() => navigate(`/board/${board.id}`)}
    >
      <div className="h-32 bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
        <BoardCover url={board.cover_url} />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start gap-3">
          <h3 className="font-semibold text-gray-900 truncate">{board.name}</h3>
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600 shrink-0">
            {permissionLabel}
          </span>
        </div>

        <p className="text-sm text-gray-500 mt-1">{board.canvas_count || 0} 个画布</p>
        <div className="mt-2 space-y-1 text-xs text-gray-400">
          <p>创建者 {board.owner_name || '未知'}</p>
          <p>创建于 {formatDate(board.created_at)}</p>
        </div>

        {board.description && (
          <p className="text-xs text-gray-500 mt-2 truncate">{board.description}</p>
        )}

        {(canEdit || canDelete) && (
          <div className="mt-3">
            <BoardActions board={board} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />
          </div>
        )}
      </div>
    </div>
  )
}
