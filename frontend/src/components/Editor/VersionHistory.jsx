import { useState, useEffect } from 'react'
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

export default function VersionHistory({ canvasId, onClose, onSave, onRestore }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [error, setError] = useState('')

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

  const handleSave = async () => {
    if (!onSave || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave()
      fetchSnapshots()
    } catch (e) {
      setError('保存版本失败')
    } finally {
      setSaving(false)
    }
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
    } finally {
      setRestoringId(null)
    }
  }

  const latestId = snapshots.length > 0 ? snapshots[0].id : null

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">版本历史</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Save button */}
        {onSave && (
          <div className="px-5 pt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {saving ? '保存中...' : '保存为版本'}
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
              {snapshots.map(s => (
                <li key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700">{formatTime(s.created_at)}</div>
                    {s.created_by && (
                      <div className="text-xs text-gray-400 mt-0.5">{s.created_by.username}</div>
                    )}
                  </div>
                  {s.id === latestId ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">当前版本</span>
                  ) : onRestore ? (
                    <button
                      onClick={() => handleRestore(s.id)}
                      disabled={restoringId === s.id}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 font-medium whitespace-nowrap"
                    >
                      {restoringId === s.id ? '恢复中...' : '恢复'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
