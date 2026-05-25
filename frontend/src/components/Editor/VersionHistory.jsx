import { useState, useEffect, useRef } from 'react'
import api from '../../lib/axios'

function formatTime(dateStr) {
  if (!dateStr) return '当前版本'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleString('zh-CN')
}

export default function VersionHistory({ canvasId, onClose, onSave, onRestore, onDelete }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [showNaming, setShowNaming] = useState(false)
  const [versionName, setVersionName] = useState('')
  const inputRef = useRef(null)

  const fetchSnapshots = () => {
    setLoading(true)
    setError('')
    api.get(`/canvases/${canvasId}/snapshots`)
      .then(res => {
        setSnapshots(res.data || [])
        setLoading(false)
      })
      .catch(() => {
        setError('获取版本列表失败')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchSnapshots()
  }, [canvasId])

  // Focus input when naming appears
  useEffect(() => {
    if (showNaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [showNaming])

  const handleSaveClick = () => {
    const manualCount = snapshots.filter(s => s.created_by).length
    setVersionName(`手动保存版本 ${manualCount + 1}`)
    setShowNaming(true)
  }

  const handleSaveConfirm = async () => {
    if (!onSave || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(versionName.trim() || null)
      setShowNaming(false)
      fetchSnapshots()
    } catch (e) {
      setError('保存版本失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCancel = () => {
    setShowNaming(false)
    setVersionName('')
  }

  const handleSaveKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveConfirm()
    if (e.key === 'Escape') handleSaveCancel()
  }

  const handleRestore = async (snapshotId) => {
    if (restoringId) return
    if (!confirm('确定要恢复到此版本吗？当前未保存的内容将丢失。')) return
    setRestoringId(snapshotId)
    setError('')
    try {
      await onRestore(snapshotId)
      onClose()
    } catch (e) {
      setError('恢复版本失败')
      setRestoringId(null)
    }
  }

  const handleDelete = async (snapshotId) => {
    if (deletingId) return
    if (!confirm('确定要删除此版本吗？此操作不可撤销。')) return
    setDeletingId(snapshotId)
    setError('')
    try {
      if (onDelete) {
        await onDelete(snapshotId)
      } else {
        await api.delete(`/canvases/${canvasId}/snapshots/${snapshotId}`)
      }
      setDeletingId(null)
      fetchSnapshots()
    } catch (e) {
      setError('删除版本失败')
      setDeletingId(null)
    }
  }

  const latestId = snapshots.length > 0 ? snapshots[0].id : null

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" role="dialog" aria-modal="true" onKeyDown={e => e.key === 'Escape' && onClose?.()} onClick={onClose} tabIndex={-1}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">版本历史</h2>
          <button aria-label="关闭" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Naming input (shown when saving) */}
        {showNaming && (
          <div className="px-5 pt-3 pb-2 border-b">
            <label htmlFor="version-name" className="text-xs text-gray-500 mb-1 block">为当前版本命名：</label>
            <div className="flex gap-2">
              <input
                id="version-name"
                ref={inputRef}
                type="text"
                value={versionName}
                onChange={e => setVersionName(e.target.value)}
                onKeyDown={handleSaveKeyDown}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                maxLength={255}
              />
              <button
                onClick={handleSaveConfirm}
                disabled={saving}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm whitespace-nowrap"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={handleSaveCancel}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Save button (hidden when naming is open or onSave is null) */}
        {onSave && !showNaming && (
          <div className="px-5 pt-3">
            <button
              onClick={handleSaveClick}
              className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
            >
              保存为版本
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded border border-red-200">
            {error}
          </div>
        )}

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">暂无历史版本</div>
          ) : (
            <ul className="space-y-2">
              {snapshots.map(s => {
                const isAuto = !s.created_by
                const isLatest = s.id === latestId
                const isRestoring = restoringId === s.id
                const isDeleting = deletingId === s.id

                return (
                  <li
                    key={s.id}
                    className={`group relative py-2.5 px-3 rounded-lg border transition-colors ${
                      isAuto
                        ? 'border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-50'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: name/time */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">
                          {s.name || formatTime(s.created_at)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          {isAuto ? (
                            <span className="bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">自动保存</span>
                          ) : s.created_by?.username ? (
                            <span>{s.created_by.username}</span>
                          ) : null}
                          <span>{formatTime(s.created_at)}</span>
                        </div>
                      </div>

                      {/* Right: current badge / restore button */}
                      <div className="flex items-center gap-2">
                        {isLatest ? (
                          <span className="text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                            {isRestoring ? '恢复中...' : '当前版本'}
                          </span>
                        ) : onRestore ? (
                          <button
                            onClick={() => handleRestore(s.id)}
                            disabled={isRestoring}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {isRestoring ? '恢复中...' : '恢复'}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Delete button (manual saves only, appears on hover) */}
                    {!isAuto && (
                      <div className="mt-2 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={isDeleting}
                          className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isDeleting ? '删除中...' : '🗑️ 删除此版本'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
