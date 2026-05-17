import { useState, useEffect } from 'react'
import api from '../../lib/axios'

export default function SharePanel({ boardId, onClose }) {
  const [boardDetail, setBoardDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inviteUserId, setInviteUserId] = useState('')
  const [invitePermission, setInvitePermission] = useState('viewer')
  const [linkPermission, setLinkPermission] = useState('viewer')
  const [linkMaxUses, setLinkMaxUses] = useState('')
  const [error, setError] = useState('')

  const isOwner = boardDetail?.is_owner

  useEffect(() => {
    api.get(`/boards/${boardId}`)
      .then(res => {
        setBoardDetail(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('获取画板信息失败')
        setLoading(false)
      })
  }, [boardId])

  const handleInvite = async () => {
    if (!inviteUserId.trim()) return
    try {
      await api.post(`/boards/${boardId}/shares`, {
        user_id: inviteUserId.trim(),
        permission: invitePermission
      })
      setInviteUserId('')
      const res = await api.get(`/boards/${boardId}`)
      setBoardDetail(res.data)
    } catch (err) {
      setError(err.response?.data?.error || '邀请失败')
    }
  }

  const handleRemoveShare = async (userId) => {
    try {
      await api.delete(`/boards/${boardId}/shares/${userId}`)
      const res = await api.get(`/boards/${boardId}`)
      setBoardDetail(res.data)
    } catch (err) {
      setError(err.response?.data?.error || '移除失败')
    }
  }

  const handleCreateLink = async () => {
    try {
      const res = await api.post(`/boards/${boardId}/tokens`, {
        permission: linkPermission,
        max_uses: linkMaxUses ? parseInt(linkMaxUses) : null
      })
      const link = `${window.location.origin}/s/${res.data.token}`
      navigator.clipboard.writeText(link)
        .then(() => alert(`分享链接已生成并复制到剪贴板：${link}`))
        .catch(() => alert(`分享链接已生成：${link}\n（复制失败，请手动复制）`))
      const detail = await api.get(`/boards/${boardId}`)
      setBoardDetail(detail.data)
    } catch (err) {
      setError(err.response?.data?.error || '生成链接失败')
    }
  }

  const handleRevokeLink = async (tokenId) => {
    try {
      await api.delete(`/boards/${boardId}/tokens/${tokenId}`)
      const res = await api.get(`/boards/${boardId}`)
      setBoardDetail(res.data)
    } catch (err) {
      setError(err.response?.data?.error || '撤销失败')
    }
  }

  const copyLink = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/s/${token}`)
      .then(() => alert('链接已复制到剪贴板'))
      .catch(() => alert('复制失败，请手动复制'))
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-6 w-[480px]">
          <div className="text-center text-gray-500">加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg p-6 w-[480px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">分享画板</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}

        {isOwner && (
          <>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">邀请协作者</h4>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="用户ID或用户名"
                  className="flex-1 px-3 py-2 border rounded text-sm"
                  value={inviteUserId}
                  onChange={e => setInviteUserId(e.target.value)}
                />
                <select
                  className="px-2 py-2 border rounded text-sm"
                  value={invitePermission}
                  onChange={e => setInvitePermission(e.target.value)}
                >
                  <option value="viewer">查看者</option>
                  <option value="commenter">评论者</option>
                  <option value="editor">编辑者</option>
                </select>
                <button
                  onClick={handleInvite}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  邀请
                </button>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">分享链接</h4>
              <div className="flex space-x-2 mb-2">
                <select
                  className="px-2 py-2 border rounded text-sm"
                  value={linkPermission}
                  onChange={e => setLinkPermission(e.target.value)}
                >
                  <option value="viewer">查看者</option>
                  <option value="commenter">评论者</option>
                  <option value="editor">编辑者</option>
                </select>
                <input
                  type="number"
                  placeholder="最大使用次数（可选）"
                  className="flex-1 px-3 py-2 border rounded text-sm"
                  value={linkMaxUses}
                  onChange={e => setLinkMaxUses(e.target.value)}
                />
                <button
                  onClick={handleCreateLink}
                  className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  生成链接
                </button>
              </div>
            </div>
          </>
        )}

        {boardDetail?.shares?.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">已邀请</h4>
            <div className="space-y-1">
              {boardDetail.shares.map(share => (
                <div key={share.user_id} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded text-sm">
                  <span>{share.username || share.user_id}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">{share.permission}</span>
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveShare(share.user_id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {boardDetail?.tokens?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">有效链接</h4>
            <div className="space-y-1">
              {boardDetail.tokens.map(token => (
                <div key={token.id} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="mr-2">{token.permission}</span>
                    {token.max_uses && (
                      <span className="text-gray-500">({token.used_count}/{token.max_uses})</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyLink(token.token)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      复制
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => handleRevokeLink(token.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        撤销
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
