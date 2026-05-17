import { describe, it, expect } from 'vitest'
import { moveCard } from './kanban'

describe('moveCard', () => {
  it('sets moved card order to the end of target column', () => {
    const cards = [
      { id: 'a', columnId: 'col-1', order: 0 },
      { id: 'b', columnId: 'col-1', order: 1 },
      { id: 'c', columnId: 'col-2', order: 0 },
    ]
    const result = moveCard(cards, 'b', 'col-2')
    const moved = result.find(c => c.id === 'b')
    expect(moved.columnId).toBe('col-2')
    expect(moved.order).toBe(1)
  })

  it('does not create duplicate orders in target column', () => {
    const cards = [
      { id: 'a', columnId: 'col-1', order: 0 },
      { id: 'b', columnId: 'col-1', order: 1 },
      { id: 'c', columnId: 'col-2', order: 0 },
      { id: 'd', columnId: 'col-2', order: 1 },
    ]
    const result = moveCard(cards, 'a', 'col-2')
    const col2Orders = result.filter(c => c.columnId === 'col-2').map(c => c.order)
    expect(new Set(col2Orders).size).toBe(col2Orders.length)
  })

  it('compacts orders in source column after move', () => {
    const cards = [
      { id: 'a', columnId: 'col-1', order: 0 },
      { id: 'b', columnId: 'col-1', order: 1 },
      { id: 'c', columnId: 'col-1', order: 2 },
    ]
    const result = moveCard(cards, 'b', 'col-2')
    const col1Orders = result.filter(c => c.columnId === 'col-1').map(c => c.order).sort((a, b) => a - b)
    expect(col1Orders).toEqual([0, 1])
  })
})
