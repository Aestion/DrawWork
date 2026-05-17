import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MindMapEditor from './MindMapEditor'

const mockUseMindMapYjs = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useMindMapYjs', () => ({
  useMindMapYjs: mockUseMindMapYjs
}))

function defaultNode(label = '中心主题') {
  return [{
    id: 'node-test-1',
    type: 'mindNode',
    position: { x: 0, y: 0 },
    data: { label, media: [], collapsed: false, layout: 'vertical', canEdit: false }
  }]
}

function defaultReturn(overrides = {}) {
  return {
    nodes: [],
    edges: [],
    loading: false,
    error: null,
    connected: false,
    synced: false,
    onlineCount: 1,
    awarenessStates: new Map(),
    updateAwareness: vi.fn(),
    remoteUpdateVersion: 0,
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    setNodesAndEdges: vi.fn(),
    setNodesLocal: vi.fn(),
    setEdgesLocal: vi.fn(),
    ...overrides
  }
}

describe('MindMapEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows default data when no saved mindmap exists (404)', async () => {
    mockUseMindMapYjs.mockReturnValue(defaultReturn({ nodes: defaultNode() }))
    render(<MindMapEditor canvasId="c1" canEdit={false} />)
    // Verify toolbar renders (React Flow nodes don't render in jsdom)
    await waitFor(() => {
      expect(screen.getByText('思维导图')).toBeInTheDocument()
    })
    // Ensure no loading or error state
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
  })

  it('shows error message when api fails for non-404 reason', async () => {
    mockUseMindMapYjs.mockReturnValue(defaultReturn({ error: 'Something went wrong', loading: false }))
    render(<MindMapEditor canvasId="c1" canEdit={false} />)
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
    })
  })
})
