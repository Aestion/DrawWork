import { create } from 'zustand'
import api from '../lib/axios'

export const useCanvasStore = create((set, get) => ({
  canvases: [],
  currentCanvas: null,
  isLoading: false,
  error: null,

  fetchCanvases: async (boardId) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.get(`/boards/${boardId}/canvases`)
      const current = get().currentCanvas
      const savedId = localStorage.getItem(`lastCanvas:${boardId}`)
      const matched = res.data.find(c => c.id === current?.id)
      const saved = res.data.find(c => c.id === savedId)
      // Preserve currentCanvas reference when the active canvas still exists
      // (prevents unnecessary prop changes during polling that could disrupt editing)
      const nextCurrent = matched
        ? current
        : saved || res.data[0] || null
      if (savedId && !saved) {
        localStorage.removeItem(`lastCanvas:${boardId}`)
      }
      if (nextCurrent && nextCurrent.id !== current?.id) {
        localStorage.setItem(`lastCanvas:${boardId}`, nextCurrent.id)
      }
      set({ canvases: res.data, currentCanvas: nextCurrent, isLoading: false })
    } catch (err) {
      set({ error: err.response?.data?.error || '获取画布失败', isLoading: false })
    }
  },

  createCanvas: async (boardId, data) => {
    try {
      const res = await api.post(`/boards/${boardId}/canvases`, data)
      set({ canvases: [...get().canvases, res.data] })
      return res.data
    } catch (err) {
      set({ error: err.response?.data?.error || '创建画布失败' })
      return null
    }
  },

  updateCanvas: async (id, data) => {
    try {
      const res = await api.put(`/canvases/${id}`, data)
      set({
        canvases: get().canvases.map(c => c.id === id ? { ...c, ...res.data } : c),
        currentCanvas: get().currentCanvas?.id === id ? { ...get().currentCanvas, ...res.data } : get().currentCanvas
      })
      return res.data
    } catch (err) {
      set({ error: err.response?.data?.error || '更新画布失败' })
      return null
    }
  },

  deleteCanvas: async (id) => {
    try {
      await api.delete(`/canvases/${id}`)
      const deleted = get().canvases.find(c => c.id === id)
      const remaining = get().canvases.filter(c => c.id !== id)
      const nextCurrent = get().currentCanvas?.id === id ? remaining[0] || null : get().currentCanvas
      if (deleted?.board_id) {
        if (nextCurrent) {
          localStorage.setItem(`lastCanvas:${deleted.board_id}`, nextCurrent.id)
        } else {
          localStorage.removeItem(`lastCanvas:${deleted.board_id}`)
        }
      }
      set({
        canvases: remaining,
        currentCanvas: nextCurrent
      })
      return true
    } catch (err) {
      set({ error: err.response?.data?.error || '删除画布失败' })
      return false
    }
  },

  setCurrentCanvas: (canvas) => {
    if (canvas?.board_id) {
      localStorage.setItem(`lastCanvas:${canvas.board_id}`, canvas.id)
    }
    set({ currentCanvas: canvas })
  },
  reset: () => set({ canvases: [], currentCanvas: null, error: null })
}))
