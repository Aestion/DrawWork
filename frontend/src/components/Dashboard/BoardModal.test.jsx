import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import BoardModal from './BoardModal'
import api from '../../lib/axios'

vi.mock('../../lib/axios', () => ({
  default: {
    post: vi.fn()
  }
}))

describe('BoardModal', () => {
  const board = {
    id: 'board-1',
    name: '项目画板',
    description: '产品方案',
    cover_url: '',
    is_public: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a cover image while editing and saves the uploaded cover url', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    const onClose = vi.fn()
    api.post.mockResolvedValue({ data: { id: 'upload-1', url: '/api/upload/upload-1' } })

    render(
      <BoardModal
        board={board}
        onClose={onClose}
        onUpdate={onUpdate}
      />
    )

    const file = new File(['png'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('上传封面图'), { target: { files: [file] } })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/upload?board_id=board-1', expect.any(FormData)))
    await waitFor(() => expect(screen.getByDisplayValue('/api/upload/upload-1')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('board-1', expect.objectContaining({
      cover_url: '/api/upload/upload-1'
    })))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps direct cover url editing available', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})

    render(
      <BoardModal
        board={board}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    )

    fireEvent.change(screen.getByLabelText('图示/封面 URL'), {
      target: { value: 'https://example.com/cover.png' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('board-1', expect.objectContaining({
      cover_url: 'https://example.com/cover.png'
    })))
  })
})
