import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBoardStore } from './boardStore'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../lib/axios', () => ({ default: mockApi }))

beforeEach(() => {
  useBoardStore.setState({ boards: [], isLoading: false, error: null })
  vi.clearAllMocks()
})

describe('boardStore', () => {
  describe('initial state', () => {
    it('starts with empty boards', () => {
      expect(useBoardStore.getState().boards).toEqual([])
      expect(useBoardStore.getState().isLoading).toBe(false)
      expect(useBoardStore.getState().error).toBeNull()
    })
  })

  describe('fetchBoards', () => {
    it('loads boards successfully', async () => {
      const mockBoards = [{ id: '1', name: 'Board 1' }, { id: '2', name: 'Board 2' }]
      mockApi.get.mockResolvedValueOnce({ data: mockBoards })

      await useBoardStore.getState().fetchBoards()
      expect(useBoardStore.getState().boards).toEqual(mockBoards)
      expect(useBoardStore.getState().isLoading).toBe(false)
    })

    it('handles fetch error', async () => {
      mockApi.get.mockRejectedValueOnce({ response: { data: { error: '获取失败' } } })

      await useBoardStore.getState().fetchBoards()
      expect(useBoardStore.getState().error).toContain('获取失败')
      expect(useBoardStore.getState().isLoading).toBe(false)
    })
  })

  describe('createBoard', () => {
    it('creates a board and prepends to list', async () => {
      const newBoard = { id: '3', name: 'New Board' }
      mockApi.post.mockResolvedValueOnce({ data: newBoard })

      const result = await useBoardStore.getState().createBoard({ name: 'New Board' })
      expect(result).toEqual(newBoard)
      expect(useBoardStore.getState().boards).toHaveLength(1)
      expect(useBoardStore.getState().boards[0]).toEqual(newBoard)
    })

    it('returns null and sets error on failure', async () => {
      mockApi.post.mockRejectedValueOnce({ response: { data: { error: '创建失败' } } })

      const result = await useBoardStore.getState().createBoard({ name: 'Bad' })
      expect(result).toBeNull()
      expect(useBoardStore.getState().error).toContain('创建失败')
    })
  })

  describe('deleteBoard', () => {
    it('removes board from list', async () => {
      useBoardStore.setState({ boards: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] })
      mockApi.delete.mockResolvedValueOnce({})

      const result = await useBoardStore.getState().deleteBoard('1')
      expect(result).toBe(true)
      expect(useBoardStore.getState().boards).toHaveLength(1)
      expect(useBoardStore.getState().boards[0].id).toBe('2')
    })

    it('returns false on failure', async () => {
      mockApi.delete.mockRejectedValueOnce({ response: { data: { error: '删除失败' } } })
      const result = await useBoardStore.getState().deleteBoard('1')
      expect(result).toBe(false)
    })
  })
})
