import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import DashboardPage from './DashboardPage'
import api from '../lib/axios'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  init: vi.fn(),
  logout: vi.fn(),
  fetchBoards: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  user: { id: 'user-1', username: 'alice' },
  boards: []
}))

const sampleBoards = [
  {
    id: 'owned-late',
    name: 'Beta 我的画板',
    canvas_count: 3,
    permission: 'owner',
    access_type: 'owned',
    owner_id: 'user-1',
    owner_name: 'alice',
    created_at: '2026-05-26T04:00:00.000Z'
  },
  {
    id: 'owned-early',
    name: 'Alpha 我的画板',
    canvas_count: 1,
    permission: 'owner',
    access_type: 'owned',
    owner_id: 'user-1',
    owner_name: 'alice',
    created_at: '2026-05-20T04:00:00.000Z'
  },
  {
    id: 'shared-1',
    name: '别人分享的画板',
    canvas_count: 2,
    permission: 'editor',
    access_type: 'shared',
    share_source: 'invite',
    owner_id: 'user-2',
    owner_name: 'bob',
    created_at: '2026-05-24T04:00:00.000Z'
  },
  {
    id: 'public-1',
    name: '内网共享画板',
    canvas_count: 4,
    permission: 'viewer',
    access_type: 'public',
    is_public: true,
    owner_id: 'user-3',
    owner_name: 'carol',
    created_at: '2026-05-22T04:00:00.000Z'
  }
]

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mocks.navigate
  }
})

vi.mock('../lib/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}))

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    user: mocks.user,
    init: mocks.init,
    logout: mocks.logout
  })
}))

vi.mock('../stores/boardStore', () => ({
  useBoardStore: () => ({
    boards: mocks.boards,
    fetchBoards: mocks.fetchBoards,
    createBoard: mocks.createBoard,
    updateBoard: mocks.updateBoard,
    deleteBoard: mocks.deleteBoard,
    isLoading: false
  })
}))

vi.mock('../components/Notifications/NotificationBell', () => ({ default: () => null }))
vi.mock('../components/Dashboard/BoardModal', () => ({ default: () => null }))
vi.mock('../components/Dashboard/BoardCard', () => ({
  default: ({ board, viewMode }) => (
    <article data-testid="board-card" data-view-mode={viewMode}>
      {board.name}
    </article>
  )
}))

describe('DashboardPage board organization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'user-1', username: 'alice' }
    mocks.boards = [...sampleBoards]
    api.get.mockResolvedValue({ data: {} })
    api.put.mockResolvedValue({ data: {} })
  })

  it('groups boards by owner, explicit share, and public access', async () => {
    render(<DashboardPage />)

    await waitFor(() => expect(mocks.fetchBoards).toHaveBeenCalled())

    expect(screen.getByRole('heading', { name: '我的画板' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '别人分享给我' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '内网共享' })).toBeInTheDocument()

    expect(within(screen.getByTestId('board-group-owned')).getByText('Beta 我的画板')).toBeInTheDocument()
    expect(within(screen.getByTestId('board-group-shared')).getByText('别人分享的画板')).toBeInTheDocument()
    expect(within(screen.getByTestId('board-group-public')).getByText('内网共享画板')).toBeInTheDocument()
  })

  it('keeps empty groups visible so they can still be renamed', () => {
    mocks.boards = [sampleBoards[0]]

    render(<DashboardPage />)

    expect(screen.getByTestId('board-group-shared')).toHaveTextContent('暂无画板')
    expect(screen.getByTestId('board-group-public')).toHaveTextContent('暂无画板')

    fireEvent.change(screen.getByLabelText('别人分享给我分组名称'), { target: { value: '协作项目' } })

    expect(screen.getByRole('heading', { name: '协作项目' })).toBeInTheDocument()
  })

  it('loads dashboard preferences from the server', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        dashboard: {
          viewMode: 'list',
          sortMode: 'name',
          groupNames: { owned: '项目画板' }
        }
      }
    })

    render(<DashboardPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/preferences'))
    await waitFor(() => expect(screen.getByRole('heading', { name: '项目画板' })).toBeInTheDocument())
    expect(screen.getAllByTestId('board-card')[0]).toHaveAttribute('data-view-mode', 'list')
    expect(within(screen.getByTestId('board-group-owned')).getAllByTestId('board-card').map(card => card.textContent)).toEqual([
      'Alpha 我的画板',
      'Beta 我的画板'
    ])
  })

  it('switches from grid cards to list rows and saves the choice', async () => {
    render(<DashboardPage />)

    expect(screen.getAllByTestId('board-card')[0]).toHaveAttribute('data-view-mode', 'grid')

    fireEvent.click(screen.getByRole('button', { name: '列表视图' }))

    expect(screen.getAllByTestId('board-card')[0]).toHaveAttribute('data-view-mode', 'list')
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/preferences', {
      preferences: expect.objectContaining({
        dashboard: expect.objectContaining({ viewMode: 'list' })
      })
    }))
  })

  it('sorts boards by name when requested and saves the choice', async () => {
    render(<DashboardPage />)

    const ownedGroup = screen.getByTestId('board-group-owned')
    expect(within(ownedGroup).getAllByTestId('board-card').map(card => card.textContent)).toEqual([
      'Beta 我的画板',
      'Alpha 我的画板'
    ])

    fireEvent.change(screen.getByLabelText('画板排序'), { target: { value: 'name' } })

    expect(within(ownedGroup).getAllByTestId('board-card').map(card => card.textContent)).toEqual([
      'Alpha 我的画板',
      'Beta 我的画板'
    ])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/preferences', {
      preferences: expect.objectContaining({
        dashboard: expect.objectContaining({ sortMode: 'name' })
      })
    }))
  })

  it('saves renamed board groups to user preferences', async () => {
    render(<DashboardPage />)

    fireEvent.change(screen.getByLabelText('我的画板分组名称'), { target: { value: '项目画板' } })

    expect(screen.getByRole('heading', { name: '项目画板' })).toBeInTheDocument()
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/preferences', {
      preferences: expect.objectContaining({
        dashboard: expect.objectContaining({
          groupNames: expect.objectContaining({ owned: '项目画板' })
        })
      })
    }))
  })
})
