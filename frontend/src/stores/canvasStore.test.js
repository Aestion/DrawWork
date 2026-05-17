import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../lib/axios', () => ({ default: mockApi }))

beforeEach(() => {
  useCanvasStore.setState({ canvases: [], currentCanvas: null, isLoading: false, error: null })
  localStorage.clear()
  vi.clearAllMocks()
})

describe('canvasStore', () => {
  describe('initial state', () => {
    it('starts with empty canvases', () => {
      const s = useCanvasStore.getState()
      expect(s.canvases).toEqual([])
      expect(s.currentCanvas).toBeNull()
      expect(s.isLoading).toBe(false)
    })
  })

  describe('fetchCanvases', () => {
    it('loads canvases and selects first as default', async () => {
      const canvases = [{ id: 'c1', name: 'Canvas 1', board_id: 'b1' }]
      mockApi.get.mockResolvedValueOnce({ data: canvases })

      await useCanvasStore.getState().fetchCanvases('b1')
      expect(useCanvasStore.getState().canvases).toEqual(canvases)
      expect(useCanvasStore.getState().currentCanvas).toEqual(canvases[0])
    })

    it('restores last selected canvas from localStorage', async () => {
      localStorage.setItem('lastCanvas:b1', 'c2')
      const canvases = [
        { id: 'c1', name: 'C1', board_id: 'b1' },
        { id: 'c2', name: 'C2', board_id: 'b1' }
      ]
      mockApi.get.mockResolvedValueOnce({ data: canvases })

      await useCanvasStore.getState().fetchCanvases('b1')
      expect(useCanvasStore.getState().currentCanvas?.id).toBe('c2')
    })

    it('handles fetch error', async () => {
      mockApi.get.mockRejectedValueOnce({ response: { data: { error: '获取失败' } } })
      await useCanvasStore.getState().fetchCanvases('b1')
      expect(useCanvasStore.getState().error).toContain('获取失败')
    })
  })

  describe('createCanvas', () => {
    it('appends new canvas to list', async () => {
      const newC = { id: 'c3', name: 'New', board_id: 'b1' }
      mockApi.post.mockResolvedValueOnce({ data: newC })

      const result = await useCanvasStore.getState().createCanvas('b1', { name: 'New' })
      expect(result).toEqual(newC)
      expect(useCanvasStore.getState().canvases).toHaveLength(1)
    })
  })

  describe('updateCanvas', () => {
    it('updates canvas in list and currentCanvas if active', async () => {
      useCanvasStore.setState({
        canvases: [{ id: 'c1', name: 'Old', board_id: 'b1' }],
        currentCanvas: { id: 'c1', name: 'Old', board_id: 'b1' }
      })
      mockApi.put.mockResolvedValueOnce({ data: { name: 'Updated' } })

      await useCanvasStore.getState().updateCanvas('c1', { name: 'Updated' })
      expect(useCanvasStore.getState().canvases[0].name).toBe('Updated')
      expect(useCanvasStore.getState().currentCanvas?.name).toBe('Updated')
    })
  })

  describe('deleteCanvas', () => {
    it('removes canvas and switches current if deleted was active', async () => {
      useCanvasStore.setState({
        canvases: [
          { id: 'c1', name: 'A', board_id: 'b1' },
          { id: 'c2', name: 'B', board_id: 'b1' }
        ],
        currentCanvas: { id: 'c1', name: 'A', board_id: 'b1' }
      })
      mockApi.delete.mockResolvedValueOnce({})

      const result = await useCanvasStore.getState().deleteCanvas('c1')
      expect(result).toBe(true)
      expect(useCanvasStore.getState().canvases).toHaveLength(1)
      expect(useCanvasStore.getState().currentCanvas?.id).toBe('c2')
    })

    it('keeps currentCanvas unchanged when deleting inactive canvas', async () => {
      useCanvasStore.setState({
        canvases: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
        currentCanvas: { id: 'c2', name: 'B' }
      })
      mockApi.delete.mockResolvedValueOnce({})

      await useCanvasStore.getState().deleteCanvas('c1')
      expect(useCanvasStore.getState().currentCanvas?.id).toBe('c2')
    })
  })

  describe('setCurrentCanvas', () => {
    it('updates current canvas and persists to localStorage', () => {
      useCanvasStore.getState().setCurrentCanvas({ id: 'c1', board_id: 'b1' })
      expect(useCanvasStore.getState().currentCanvas?.id).toBe('c1')
      expect(localStorage.getItem('lastCanvas:b1')).toBe('c1')
    })
  })

  describe('reset', () => {
    it('clears all canvas state', () => {
      useCanvasStore.setState({ canvases: [{ id: 'c1' }], currentCanvas: { id: 'c1' }, error: 'err' })
      useCanvasStore.getState().reset()
      expect(useCanvasStore.getState().canvases).toEqual([])
      expect(useCanvasStore.getState().currentCanvas).toBeNull()
      expect(useCanvasStore.getState().error).toBeNull()
    })
  })
})
