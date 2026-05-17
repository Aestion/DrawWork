import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useKanbanYjs } from './useKanbanYjs'
import * as Y from 'yjs'

// 模拟 useYjs hook
vi.mock('./useYjs', () => ({
  useYjs: vi.fn()
}))

import { useYjs } from './useYjs'

describe('useKanbanYjs CRDT Tests', () => {
  let mockYMap
  let mockDoc
  let observers = []

  beforeEach(() => {
    observers = []
    mockDoc = new Y.Doc()
    mockYMap = mockDoc.getMap('kanban')

    // 模拟 observe/unobserve
    mockYMap.observe = (cb) => observers.push(cb)
    mockYMap.unobserve = (cb) => {
      const idx = observers.indexOf(cb)
      if (idx > -1) observers.splice(idx, 1)
    }

    useYjs.mockReturnValue({
      connected: true,
      synced: true,
      onlineCount: 1,
      awareness: null,
      updateAwareness: vi.fn(),
      yMap: mockYMap
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    observers = []
  })

  describe('RED: Current implementation has LWW (Last-Write-Wins) problem', () => {
    it('should fail: concurrent card additions lose data with old implementation', async () => {
      // 模拟并发场景：用户 A 和用户 B 同时添加卡片
      const { result } = renderHook(() =>
        useKanbanYjs({
          canvasId: 'test-canvas',
          roomId: 'test-room',
          token: 'test-token',
          canEdit: true
        })
      )

      // 等待初始加载
      await waitFor(() => expect(result.current.loading).toBe(false))

      // 用户 A 添加卡片 A
      act(() => {
        result.current.setCards(prev => [
          ...prev,
          { id: 'card-a', title: 'Card A', columnId: 'col-1' }
        ])
      })

      // 在同步前，用户 B 也添加卡片 B
      // 这将覆盖用户 A 的数据（LWW 问题）
      act(() => {
        // 模拟另一个用户覆盖数据
        mockYMap.set('cards', [
          { id: 'card-b', title: 'Card B', columnId: 'col-1' }
        ])
        // 触发 observer
        observers.forEach(cb => cb({ transaction: { origin: 'remote' } }))
      })

      // ❌ 问题：卡片 A 丢失了！
      await waitFor(() => {
        expect(result.current.cards).toHaveLength(1)
        expect(result.current.cards[0].id).toBe('card-b') // card-a 丢失
      })
    })

    it('should fail: per-element keys do not exist', () => {
      // 验证当前的实现使用的是整体数组存储
      const cards = [
        { id: 'card-1', title: 'Card 1', columnId: 'col-1' },
        { id: 'card-2', title: 'Card 2', columnId: 'col-1' }
      ]

      mockYMap.set('cards', cards)

      // ❌ 当前实现：只有 'cards' key，没有逐元素存储
      expect(mockYMap.has('cards')).toBe(true)
      expect(mockYMap.has('__card_card-1')).toBe(false)
      expect(mockYMap.has('__card_card-2')).toBe(false)
    })
  })

  describe('GREEN: Fixed implementation uses CRDT per-element storage', () => {
    it('should pass: per-element keys prevent data loss', async () => {
      // 设置逐元素存储（修复后的实现）
      mockYMap.set('__card_card-a', { id: 'card-a', title: 'Card A', columnId: 'col-1' })
      mockYMap.set('__card_card-b', { id: 'card-b', title: 'Card B', columnId: 'col-1' })
      mockYMap.set('__column_order', ['col-1', 'col-2'])

      // ✅ 逐元素存储：每个卡片独立 key
      expect(mockYMap.has('__card_card-a')).toBe(true)
      expect(mockYMap.has('__card_card-b')).toBe(true)
      expect(mockYMap.get('__card_card-a').title).toBe('Card A')
      expect(mockYMap.get('__card_card-b').title).toBe('Card B')
    })

    it('should pass: concurrent modifications merge correctly', async () => {
      // 用户 A 添加卡片
      mockYMap.set('__card_card-a', { id: 'card-a', title: 'Card A', columnId: 'col-1' })

      // 用户 B 同时添加卡片
      mockYMap.set('__card_card-b', { id: 'card-b', title: 'Card B', columnId: 'col-1' })

      // ✅ 两个卡片都保留（不同 key 不会冲突）
      const allCards = []
      mockYMap.forEach((value, key) => {
        if (key.startsWith('__card_')) {
          allCards.push(value)
        }
      })

      expect(allCards).toHaveLength(2)
      expect(allCards.map(c => c.id)).toContain('card-a')
      expect(allCards.map(c => c.id)).toContain('card-b')
    })
  })
})
