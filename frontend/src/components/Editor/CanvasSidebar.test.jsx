import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import CanvasSidebar from './CanvasSidebar'

describe('CanvasSidebar', () => {
  it('shows only recommended canvas types in the create menu with SVG icons', async () => {
    render(
      <CanvasSidebar
        canvases={[]}
        currentCanvas={null}
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        canEdit
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '+ 新建' }))

    const menu = screen.getByText('手绘').closest('div')
    expect(within(menu).getByText('手绘')).toBeInTheDocument()
    expect(within(menu).getByText('思维导图')).toBeInTheDocument()
    expect(within(menu).getByText('看板')).toBeInTheDocument()
    expect(within(menu).getByText('泳道图')).toBeInTheDocument()
    expect(within(menu).queryByText(/Mind-Map/)).not.toBeInTheDocument()
    expect(within(menu).queryByText(/旧版思维导图/)).not.toBeInTheDocument()
    expect(menu.querySelectorAll('svg')).toHaveLength(4)
  })
})
