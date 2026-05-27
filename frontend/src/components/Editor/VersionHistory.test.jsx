import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VersionHistory, { formatVersionTime } from './VersionHistory'

const mockGet = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../lib/axios', () => ({
  default: {
    get: (...args) => mockGet(...args),
    delete: (...args) => mockDelete(...args)
  }
}))

describe('VersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders Chinese labels and snapshot metadata', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        { id: 's2', name: '当前稿', created_at: '2026-05-27T01:00:00.000Z', created_by: { username: 'alice' } },
        { id: 's1', name: null, created_at: '2026-05-26T01:00:00.000Z', created_by: null }
      ]
    })

    render(
      <VersionHistory
        canvasId="canvas-1"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(await screen.findByText('版本历史')).toBeInTheDocument()
    expect(screen.getByText('保存为版本')).toBeInTheDocument()
    expect(screen.getByText('当前稿')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('自动保存')).toBeInTheDocument()
    expect(screen.getByText('当前版本')).toBeInTheDocument()
  })

  it('saves with the typed version name and reloads the list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    mockGet
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 's1', name: '命名版本', created_at: '2026-05-27T01:00:00.000Z', created_by: { username: 'alice' } }] })

    render(<VersionHistory canvasId="canvas-1" onClose={vi.fn()} onSave={onSave} />)

    fireEvent.click(await screen.findByText('保存为版本'))
    fireEvent.change(screen.getByLabelText('为当前版本命名：'), { target: { value: '命名版本' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('命名版本'))
    expect(await screen.findByText('命名版本')).toBeInTheDocument()
  })

  it('restores and closes only after restore completes', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    mockGet.mockResolvedValueOnce({
      data: [
        { id: 'latest', name: '最新', created_at: '2026-05-27T02:00:00.000Z', created_by: { username: 'alice' } },
        { id: 'old', name: '旧版本', created_at: '2026-05-27T01:00:00.000Z', created_by: { username: 'alice' } }
      ]
    })

    render(<VersionHistory canvasId="canvas-1" onClose={onClose} onRestore={onRestore} />)

    fireEvent.click(await screen.findByText('恢复'))

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('old'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('formatVersionTime', () => {
  it('uses readable Chinese fallback for missing time', () => {
    expect(formatVersionTime(null)).toBe('当前版本')
  })
})
