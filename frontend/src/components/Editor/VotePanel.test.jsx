import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import VotePanel from './VotePanel'

const mockFetchResults = vi.fn()

vi.mock('../../hooks/useVotes', () => ({
  useVotes: () => ({
    votes: [
      {
        id: 'vote-1',
        title: '我司的麦兜是谁？',
        scope_data: { options: ['黑面', '白金', '支书', '黄老爷', 'pony'] },
        votes_per_user: 1,
        my_vote_count: 1,
        is_closed: false,
        is_anonymous: true,
        expires_at: null
      }
    ],
    loading: false,
    createVote: vi.fn(),
    submitVote: vi.fn(),
    closeVote: vi.fn(),
    fetchResults: mockFetchResults
  })
}))

vi.mock('../ui/Toast', () => ({
  toast: { success: vi.fn() }
}))

describe('VotePanel', () => {
  beforeEach(() => {
    mockFetchResults.mockReset()
  })

  it('adds string vote counts numerically instead of concatenating them', async () => {
    mockFetchResults.mockResolvedValue([
      { target_id: '白金', count: '1' },
      { target_id: '支书', count: '1' }
    ])

    render(<VotePanel canvasId="canvas-1" canEdit onClose={vi.fn()} />)

    expect(await screen.findByText('2 人参与')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('011 人参与')).not.toBeInTheDocument()
    })
  })
})
