import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('../lib/axios', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args)
  }
}))

import { useVotes } from './useVotes'

describe('useVotes', () => {
  const canvasId = 'canvas-1'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchVotes / initial load', () => {
    it('exposes my_vote_count from votes response', async () => {
      mockGet.mockResolvedValue({
        data: [
          { id: 'v1', title: 'Pick one', my_vote_count: 2, scope_data: {} },
          { id: 'v2', title: 'Pick two', my_vote_count: 0, scope_data: {} }
        ]
      })

      const { result } = renderHook(() => useVotes(canvasId))

      await vi.waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.votes).toHaveLength(2)
      expect(result.current.votes[0].my_vote_count).toBe(2)
      expect(result.current.votes[1].my_vote_count).toBe(0)
    })
  })

  describe('createVote', () => {
    it('adds my_vote_count: 0 to the locally inserted vote', async () => {
      mockGet.mockResolvedValue({ data: [] })
      mockPost.mockResolvedValue({
        data: { id: 'v-new', title: 'New vote', scope_data: { options: ['A'] } }
      })

      const { result } = renderHook(() => useVotes(canvasId))

      await vi.waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const r = await result.current.createVote({
          title: 'New vote',
          options: ['A', 'B'],
          votes_per_user: 1,
          is_anonymous: false,
          expires_at: null
        })
        expect(r.ok).toBe(true)
      })

      expect(result.current.votes).toHaveLength(1)
      expect(result.current.votes[0].my_vote_count).toBe(0)
      expect(result.current.votes[0].title).toBe('New vote')
    })
  })

  describe('submitVote', () => {
    it('increments my_vote_count locally on success', async () => {
      mockGet.mockResolvedValue({
        data: [
          { id: 'v1', title: 'Pick one', my_vote_count: 0, votes_per_user: 2, scope_data: {} }
        ]
      })
      mockPost.mockResolvedValue({ data: { id: 'r1', target_id: 'opt-a' } })

      const { result } = renderHook(() => useVotes(canvasId))

      await vi.waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const r = await result.current.submitVote('v1', 'opt-a')
        expect(r.ok).toBe(true)
      })

      expect(result.current.votes[0].my_vote_count).toBe(1)
    })
  })

  describe('closeVote', () => {
    it('sets is_closed on the local vote', async () => {
      mockGet.mockResolvedValue({
        data: [
          { id: 'v1', title: 'Close me', my_vote_count: 0, is_closed: false, scope_data: {} }
        ]
      })
      mockPut.mockResolvedValue({ data: { is_closed: true } })

      const { result } = renderHook(() => useVotes(canvasId))

      await vi.waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const r = await result.current.closeVote('v1')
        expect(r.ok).toBe(true)
      })

      expect(result.current.votes[0].is_closed).toBe(true)
    })
  })

  describe('refetchInterval polling', () => {
    it('polls on the given interval', async () => {
      vi.useFakeTimers()

      mockGet.mockResolvedValue({
        data: [{ id: 'v1', title: 'Poll test', my_vote_count: 0, scope_data: {} }]
      })

      renderHook(() => useVotes(canvasId, { refetchInterval: 5000 }))

      // Flush initial mount effects (useEffect fires but interval hasn't ticked yet)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGet).toHaveBeenCalledTimes(1)

      // Advance 5s → should trigger first poll
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGet).toHaveBeenCalledTimes(2)

      // Advance another 5s → second poll
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGet).toHaveBeenCalledTimes(3)

      vi.useRealTimers()
    })

    it('does not poll when refetchInterval is 0 or omitted', async () => {
      vi.useFakeTimers()

      mockGet.mockResolvedValue({ data: [] })

      renderHook(() => useVotes(canvasId))
      await vi.advanceTimersByTimeAsync(0)

      expect(mockGet).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGet).toHaveBeenCalledTimes(1) // no extra call

      vi.useRealTimers()
    })
  })

  describe('fetchResults', () => {
    it('returns results array', async () => {
      mockGet.mockResolvedValue({
        data: [
          { target_id: 'opt-a', count: 3 },
          { target_id: 'opt-b', count: 1 }
        ]
      })

      const { result } = renderHook(() => useVotes(canvasId))

      let results
      await act(async () => {
        results = await result.current.fetchResults('v1')
      })

      expect(results).toEqual([
        { target_id: 'opt-a', count: 3 },
        { target_id: 'opt-b', count: 1 }
      ])
    })
  })
})
