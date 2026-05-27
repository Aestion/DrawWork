import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BoardCard from './BoardCard'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

describe('BoardCard', () => {
  const board = {
    id: 'board-1',
    name: '项目画板',
    description: '产品方案',
    canvas_count: 3,
    permission: 'owner',
    owner_name: 'alice',
    created_at: '2026-05-26T04:00:00.000Z'
  }

  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('shows board metadata and opens edit without navigating', () => {
    const onEdit = vi.fn()

    render(<BoardCard board={board} onDelete={vi.fn()} onEdit={onEdit} />)

    expect(screen.getByText('项目画板')).toBeInTheDocument()
    expect(screen.getByText('3 个画布')).toBeInTheDocument()
    expect(screen.getByText('创建者 alice')).toBeInTheDocument()
    expect(screen.getByText(/创建于/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))

    expect(onEdit).toHaveBeenCalledWith(board)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders compact metadata in list mode and still opens the board', () => {
    render(<BoardCard board={board} onDelete={vi.fn()} onEdit={vi.fn()} viewMode="list" />)

    fireEvent.click(screen.getByText('项目画板'))

    expect(screen.getByText('产品方案')).toBeInTheDocument()
    expect(screen.getAllByText('3 个画布')).toHaveLength(2)
    expect(screen.getAllByText('创建者 alice')).toHaveLength(2)
    expect(mockNavigate).toHaveBeenCalledWith('/board/board-1')
  })
})
