import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ boardId: 'board-1' }),
    useNavigate: () => vi.fn()
  }
})

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', username: 'owner' },
    init: vi.fn(() => Promise.resolve())
  })
}))

const fetchBoards = vi.fn()
vi.mock('../stores/boardStore', () => ({
  useBoardStore: () => ({
    boards: [{ id: 'board-1', name: 'Board 1', owner_id: 'user-1', permission: 'owner' }],
    fetchBoards,
    isLoading: false
  })
}))

const fetchCanvases = vi.fn()
const setCurrentCanvas = vi.fn()
vi.mock('../stores/canvasStore', () => ({
  useCanvasStore: () => ({
    canvases: [{
      id: 'canvas-1',
      board_id: 'board-1',
      name: 'Tencent Mind',
      type: 'tencentmind',
      yjs_room_id: 'room-1'
    }],
    currentCanvas: {
      id: 'canvas-1',
      board_id: 'board-1',
      name: 'Tencent Mind',
      type: 'tencentmind',
      yjs_room_id: 'room-1'
    },
    fetchCanvases,
    createCanvas: vi.fn(),
    deleteCanvas: vi.fn(),
    updateCanvas: vi.fn(),
    setCurrentCanvas,
    reset: vi.fn(),
    isLoading: false
  })
}))

vi.mock('../components/Editor/CanvasSidebar', () => ({
  default: () => <div data-testid="canvas-sidebar" />
}))
vi.mock('../components/Editor/SharePanel', () => ({ default: () => null }))
vi.mock('../components/Editor/VersionHistory', () => ({ default: () => null }))
vi.mock('../components/Editor/VotePanel', () => ({ default: () => null }))
vi.mock('../components/Notifications/NotificationBell', () => ({ default: () => null }))
vi.mock('../components/Editor/CommentsOverlay', () => ({ default: () => null }))
vi.mock('../components/ui/Toast', () => ({
  ToastContainer: () => null,
  toast: { error: vi.fn() }
}))

vi.mock('../components/Editor/ExcalidrawWrapper', () => ({ default: () => null }))
vi.mock('../components/Editor/SimpleMindMapEditor', () => ({ default: () => null }))
vi.mock('../components/Editor/MindElixirEditor', () => ({ default: () => null }))
vi.mock('../components/Editor/MindMapEditor', () => ({ default: () => null }))
vi.mock('../components/Editor/KanbanEditor', () => ({ default: () => null }))
vi.mock('../components/Editor/SwimlaneEditor', () => ({ default: () => null }))
vi.mock('../components/Editor/TencentMindEditor', async () => {
  const React = await vi.importActual('react')
  return {
    default: ({ canvasId, onConnectionChange }) => {
      React.useEffect(() => {
        onConnectionChange?.({
          connected: true,
          synced: true,
          label: 'synced',
          onlineCount: 2
        }, canvasId)
      }, [canvasId, onConnectionChange])
      return <div data-testid="tencent-mind-editor" />
    }
  }
})

import EditorPage from './EditorPage'

describe('EditorPage connection status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts online count updates from the initially active canvas', async () => {
    render(<EditorPage />)

    await screen.findByTestId('tencent-mind-editor')

    await waitFor(() => {
      expect(screen.getByText(/2 .*在线/)).toBeInTheDocument()
    })
  })
})
