import { useState, useCallback, useEffect } from 'react'
import api from '../lib/axios'

export function useComments(canvasId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchComments = useCallback(async () => {
    if (!canvasId) return
    setLoading(true)
    try {
      const res = await api.get(`/canvases/${canvasId}/comments`)
      setComments(res.data || [])
    } catch (err) {
      console.error('[comments] fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [canvasId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const addComment = useCallback(async ({ content, x, y }) => {
    try {
      const res = await api.post(`/canvases/${canvasId}/comments`, { content, x, y })
      setComments(prev => [...prev, res.data])
      return res.data
    } catch (err) {
      console.error('[comments] add failed', err)
      return null
    }
  }, [canvasId])

  const addReply = useCallback(async (commentId, content, mentionedUserId) => {
    try {
      const body = { content }
      if (mentionedUserId) body.mentioned_user_id = mentionedUserId
      await api.post(`/comments/${commentId}/replies`, body)
      await fetchComments()
    } catch (err) {
      console.error('[comments] reply failed', err)
    }
  }, [fetchComments])

  const toggleResolve = useCallback(async (commentId, isResolved) => {
    try {
      await api.put(`/comments/${commentId}/resolve`, { is_resolved: isResolved })
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, is_resolved: isResolved } : c
      ))
    } catch (err) {
      console.error('[comments] resolve failed', err)
    }
  }, [])

  const deleteComment = useCallback(async (commentId) => {
    try {
      await api.delete(`/comments/${commentId}`)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (err) {
      console.error('[comments] delete failed', err)
      throw err
    }
  }, [])

  const updatePosition = useCallback(async (commentId, x, y) => {
    try {
      await api.put(`/comments/${commentId}/position`, { x, y })
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, x, y } : c
      ))
    } catch (err) {
      console.error('[comments] update position failed', err)
    }
  }, [])

  return { comments, loading, fetchComments, addComment, addReply, toggleResolve, deleteComment, updatePosition }
}
