import { useState, useCallback, useEffect } from 'react'
import api from '../lib/axios'

export function useVotes(canvasId, options = {}) {
  const { refetchInterval = 0 } = options
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchVotes = useCallback(async () => {
    if (!canvasId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await api.get(`/canvases/${canvasId}/votes`)
      setVotes(res.data || [])
    } catch (err) {
      console.error('[votes] fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [canvasId])

  useEffect(() => {
    fetchVotes()
  }, [fetchVotes])

  // 轮询刷新投票列表（用于协作场景）
  useEffect(() => {
    if (!refetchInterval || refetchInterval <= 0) return
    const interval = setInterval(fetchVotes, refetchInterval)
    return () => clearInterval(interval)
  }, [fetchVotes, refetchInterval])

  const createVote = useCallback(async ({ title, options, votes_per_user, is_anonymous, expires_at }) => {
    if (!canvasId) {
      return { error: '缺少画布上下文' }
    }
    try {
      const res = await api.post(`/canvases/${canvasId}/votes`, {
        title,
        votes_per_user: votes_per_user ?? 1,
        is_anonymous: is_anonymous ?? false,
        scope: 'canvas',
        scope_data: { options },
        expires_at: expires_at || null
      })
      setVotes(prev => [{ ...res.data, my_vote_count: 0 }, ...prev])
      return { ok: true, data: res.data }
    } catch (err) {
      return { error: err.response?.data?.error || '创建投票失败' }
    }
  }, [canvasId])

  const submitVote = useCallback(async (voteId, targetId) => {
    if (!voteId) {
      return { error: '缺少投票ID' }
    }
    try {
      await api.post(`/votes/${voteId}/records`, { target_id: targetId })
      setVotes(prev => prev.map(v => v.id === voteId ? { ...v, my_vote_count: (v.my_vote_count || 0) + 1 } : v))
      return { ok: true }
    } catch (err) {
      return { error: err.response?.data?.error || '投票提交失败' }
    }
  }, [])

  const closeVote = useCallback(async (voteId) => {
    if (!voteId) {
      return { error: '缺少投票ID' }
    }
    try {
      await api.put(`/votes/${voteId}/close`)
      setVotes(prev => prev.map(v => v.id === voteId ? { ...v, is_closed: true } : v))
      return { ok: true }
    } catch (err) {
      return { error: err.response?.data?.error || '关闭失败' }
    }
  }, [])

  const fetchResults = useCallback(async (voteId) => {
    if (!voteId) {
      console.error('[votes] fetchResults failed: voteId is required')
      return []
    }
    try {
      const res = await api.get(`/votes/${voteId}/results`)
      return res.data || []
    } catch (err) {
      console.error('[votes] results failed', err)
      return []
    }
  }, [])

  return { votes, loading, fetchVotes, createVote, submitVote, closeVote, fetchResults }
}
