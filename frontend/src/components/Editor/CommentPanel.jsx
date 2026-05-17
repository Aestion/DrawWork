import { useState, useEffect } from 'react'
import api from '../../lib/axios'

export default function CommentPanel({ comment, position, onClose, onReply, onResolve, canComment, onDelete }) {
  const [replies, setReplies] = useState([])
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!comment) return
    setLoading(true)
    api.get(`/comments/${comment.id}/replies`)
      .then(res => setReplies(res.data))
      .catch(err => console.error('[comments] fetch replies failed', err))
      .finally(() => setLoading(false))
  }, [comment?.id])

  const handleReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    await onReply(comment.id, replyText.trim())
    const res = await api.get(`/comments/${comment.id}/replies`)
    setReplies(res.data)
    setReplyText('')
    setSending(false)
  }

  if (!comment) return null

  const panelStyle = position
    ? { left: position.x, top: position.y, position: 'absolute' }
    : { right: 0, top: 0, bottom: 0, position: 'absolute' }

  return (
    <div
      className={`bg-white shadow-xl border z-50 flex flex-col ${position ? 'rounded-lg w-80' : 'w-80 border-l'}`}
      style={panelStyle}
    >
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <h3 className="font-semibold text-sm">评论详情</h3>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={() => { onDelete(comment.id); onClose() }}
              className="text-xs text-red-500 hover:text-red-700"
              title="删除评论"
            >
              删除
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
      </div>

      <div className="p-3 border-b shrink-0">
        <div className="flex items-center space-x-2 mb-1">
          <span className="font-medium text-sm">{comment.user?.username || '匿名'}</span>
          <span className="text-xs text-gray-400">{formatTime(comment.created_at)}</span>
          {comment.is_resolved && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded">已解决</span>
          )}
        </div>
        <p className="text-sm text-gray-700">{comment.content}</p>
        {comment.reply_count > 0 && (
          <p className="text-xs text-gray-400 mt-1">{comment.reply_count} 条回复</p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-4">加载中...</div>
        ) : replies.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-4">暂无回复</div>
        ) : (
          replies.map(r => (
            <div key={r.id} className="bg-gray-50 rounded p-2">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-medium text-xs">{r.user?.username || '匿名'}</span>
                <span className="text-xs text-gray-400">{formatTime(r.created_at)}</span>
              </div>
              <p className="text-sm">{r.content}</p>
            </div>
          ))
        )}
      </div>

      {canComment && (
        <div className="p-3 border-t shrink-0">
          <textarea
            className="w-full border rounded p-2 text-sm resize-none"
            rows={2}
            placeholder="输入回复..."
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <div className="flex justify-between mt-2">
            <button
              className={`text-xs px-2 py-1 rounded ${
                comment.is_resolved
                  ? 'bg-gray-200 text-gray-600'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
              onClick={() => onResolve(comment.id, !comment.is_resolved)}
            >
              {comment.is_resolved ? '取消解决' : '标记解决'}
            </button>
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50 hover:bg-blue-700"
              disabled={!replyText.trim() || sending}
              onClick={handleReply}
            >
              {sending ? '发送中...' : '回复'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}
