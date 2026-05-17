import { useState, useCallback, useRef, useEffect } from 'react'
import { useVotes } from '../../hooks/useVotes'

export default function VotePanel({ canvasId, canEdit, onClose }) {
  const { votes, loading, createVote, submitVote, closeVote, fetchResults } = useVotes(canvasId)
  const [resultsMap, setResultsMap] = useState({})
  const [votedMap, setVotedMap] = useState({})
  const [submitting, setSubmitting] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createOptions, setCreateOptions] = useState(['', ''])
  const [createVotesPerUser, setCreateVotesPerUser] = useState(1)
  const [createAnonymous, setCreateAnonymous] = useState(false)
  const [createExpires, setCreateExpires] = useState('')
  const [creating, setCreating] = useState(false)
  const panelRef = useRef(null)

  // Load results for closed/expired votes on mount
  useEffect(() => {
    votes.forEach(v => {
      if (v.is_closed || (v.expires_at && new Date(v.expires_at) < new Date())) {
        fetchResults(v.id).then(r => {
          if (r.length) setResultsMap(prev => ({ ...prev, [v.id]: r }))
        })
      }
    })
  }, [votes, fetchResults])

  const [voteError, setVoteError] = useState('')

  const handleVote = async (voteId, targetId) => {
    if (submitting[voteId]) return
    setSubmitting(prev => ({ ...prev, [voteId]: true }))
    const result = await submitVote(voteId, targetId)
    const results = await fetchResults(voteId)
    if (results.length) {
      setResultsMap(prev => ({ ...prev, [voteId]: results }))
    }
    if (result.ok) {
      setVotedMap(prev => ({ ...prev, [voteId]: (prev[voteId] || 0) + 1 }))
      setVoteError('')
    } else {
      setVoteError(result.error || '投票提交失败')
    }
    setSubmitting(prev => ({ ...prev, [voteId]: false }))
  }

  const handleCreate = async () => {
    if (!createTitle.trim() || createOptions.filter(o => o.trim()).length < 2) return
    setCreating(true)
    const options = createOptions.filter(o => o.trim()).map(o => o.trim())
    await createVote({
      title: createTitle.trim(),
      options,
      votes_per_user: createVotesPerUser,
      is_anonymous: createAnonymous,
      expires_at: createExpires || null
    })
    setCreating(false)
    setShowCreate(false)
    setCreateTitle('')
    setCreateOptions(['', ''])
    setCreateVotesPerUser(1)
    setCreateAnonymous(false)
    setCreateExpires('')
  }

  const addOption = () => setCreateOptions(prev => [...prev, ''])
  const removeOption = (idx) => setCreateOptions(prev => prev.filter((_, i) => i !== idx))

  const isExpired = (v) => v.expires_at && new Date(v.expires_at) < new Date()

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-xl border-l z-50 flex flex-col"
      onKeyDown={e => {
        if (e.key === 'Escape' && !showCreate) onClose()
        if (e.key === 'Escape' && showCreate) { setShowCreate(false); setCreateOptions(['', '']) }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <h3 className="font-semibold text-sm">投票</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {voteError && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{voteError}</div>
        )}
        {loading && (
          <div className="text-sm text-gray-400 text-center py-4">加载中...</div>
        )}

        {!loading && votes.length === 0 && !showCreate && (
          <div className="text-sm text-gray-400 text-center py-4">暂无投票</div>
        )}

        {!loading && votes.map(v => {
          const options = v.scope_data?.options || []
          const results = resultsMap[v.id] || []
          const resultMap = {}
          results.forEach(r => { resultMap[r.target_id] = r.count })
          const totalVotes = results.reduce((sum, r) => sum + r.count, 0)
          const hasVoted = votedMap[v.id] > 0 || results.some(r => r.count > 0 && results.length > 0)
          const remaining = (v.votes_per_user || 1) - (votedMap[v.id] || 0)
          const closed = v.is_closed || isExpired(v)

          return (
            <div key={v.id} className="bg-gray-50 rounded-lg p-3 border">
              {/* Title row */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{v.title}</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {closed && (
                      <span className={`text-xs px-1.5 rounded ${v.is_closed ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {v.is_closed ? '已关闭' : '已过期'}
                      </span>
                    )}
                    {v.is_anonymous && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded">匿名</span>}
                    {hasVoted && !closed && <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded">已投票</span>}
                    {!closed && remaining > 0 && remaining < (v.votes_per_user || 1) && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 rounded">还可投 {remaining} 票</span>
                    )}
                  </div>
                </div>
                {canEdit && !closed && (
                  <button
                    className="text-xs text-gray-400 hover:text-red-500 ml-2 shrink-0"
                    onClick={() => { closeVote(v.id); toast.success('投票已关闭') }}
                    title="关闭投票"
                  >
                    关闭
                  </button>
                )}
              </div>

              {/* Options */}
              <div className="space-y-1.5">
                {options.map((opt, idx) => {
                  const count = resultMap[opt] || 0
                  const maxCount = Math.max(...results.map(r => r.count), 1)
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                  const canVote = !closed && remaining > 0 && !submitting[v.id]

                  return (
                    <button
                      key={`${v.id}-${idx}`}
                      disabled={!canVote}
                      onClick={() => handleVote(v.id, opt)}
                      className={`w-full text-left rounded transition-all ${
                        canVote
                          ? 'bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                          : results.length > 0
                            ? 'bg-white border border-gray-200 cursor-default'
                            : 'bg-gray-100 border border-gray-200 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="relative px-3 py-2">
                        {/* Bar background */}
                        {results.length > 0 && (
                          <div
                            className="absolute inset-0 bg-blue-50 rounded transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        {/* Label + count */}
                        <div className="relative flex justify-between items-center text-sm">
                          <span className={canVote ? 'font-medium' : ''}>{opt}</span>
                          {results.length > 0 && (
                            <span className="text-xs text-gray-500 ml-2">{count} 票</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Meta */}
              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{totalVotes} 人参与</span>
                {v.expires_at && (
                  <span>{closed ? '已截止' : `截止 ${formatDate(v.expires_at)}`}</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Create form */}
        {showCreate && (
          <div className="bg-gray-50 rounded-lg p-3 border space-y-3">
            <h4 className="font-medium text-sm">创建投票</h4>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">投票主题</label>
              <input
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="输入投票主题"
                value={createTitle}
                onChange={e => setCreateTitle(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setShowCreate(false)}
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">选项</label>
              <div className="space-y-1.5">
                {createOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center space-x-1.5">
                    <input
                      className="flex-1 px-2 py-1.5 border rounded text-sm"
                      placeholder={`选项 ${idx + 1}`}
                      value={opt}
                      onChange={e => {
                        const next = [...createOptions]
                        next[idx] = e.target.value
                        setCreateOptions(next)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && idx === createOptions.length - 1) addOption()
                      }}
                    />
                    {createOptions.length > 2 && (
                      <button
                        className="text-gray-400 hover:text-red-500 text-sm"
                        onClick={() => removeOption(idx)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                onClick={addOption}
              >
                + 添加选项
              </button>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">每人可投</label>
                <input
                  type="number"
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  min={1}
                  value={createVotesPerUser}
                  onChange={e => setCreateVotesPerUser(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">截止时间</label>
                <input
                  type="datetime-local"
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  value={createExpires}
                  onChange={e => setCreateExpires(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={createAnonymous}
                onChange={e => setCreateAnonymous(e.target.checked)}
              />
              <span>匿名投票</span>
            </label>

            <div className="flex justify-end space-x-2">
              <button
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded"
                onClick={() => { setShowCreate(false); setCreateOptions(['', '']) }}
              >
                取消
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={!createTitle.trim() || createOptions.filter(o => o.trim()).length < 2 || creating}
                onClick={handleCreate}
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer create button */}
      {canEdit && !showCreate && (
        <div className="p-3 border-t shrink-0">
          <button
            className="w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            + 创建投票
          </button>
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}
