import { create } from 'zustand'
import api from '../lib/axios'

export const useBoardStore = create((set, get) => ({
  boards: [],
  isLoading: false,
  error: null,

  fetchBoards: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.get('/boards')
      set({ boards: res.data, isLoading: false })
    } catch (err) {
      set({ error: err.response?.data?.error || '获取画板失败', isLoading: false })
    }
  },

  createBoard: async (data) => {
    try {
      const res = await api.post('/boards', data)
      set({ boards: [res.data, ...get().boards] })
      return res.data
    } catch (err) {
      set({ error: err.response?.data?.error || '创建画板失败' })
      return null
    }
  },

  updateBoard: async (id, data) => {
    try {
      const res = await api.put(`/boards/${id}`, data)
      set({
        boards: get().boards.map(board =>
          board.id === id ? { ...board, ...res.data } : board
        )
      })
      return res.data
    } catch (err) {
      set({ error: err.response?.data?.error || '更新画板失败' })
      return null
    }
  },

  deleteBoard: async (id) => {
    try {
      await api.delete(`/boards/${id}`)
      set({ boards: get().boards.filter(b => b.id !== id) })
      return true
    } catch (err) {
      set({ error: err.response?.data?.error || '删除画板失败' })
      return false
    }
  }
}))
