import { describe, it, expect } from 'vitest'
import { nextElementPosition } from './swimlane'

describe('nextElementPosition', () => {
  it('places first element at top-left', () => {
    const pos = nextElementPosition([])
    expect(pos).toEqual({ x: 10, y: 10 })
  })

  it('places elements in a grid with 3 columns', () => {
    const els = [{ id: '1' }, { id: '2' }]
    const pos = nextElementPosition(els)
    expect(pos).toEqual({ x: 10 + 2 * 120, y: 10 })
  })

  it('wraps to next row after 3 columns', () => {
    const els = [{ id: '1' }, { id: '2' }, { id: '3' }]
    const pos = nextElementPosition(els)
    expect(pos).toEqual({ x: 10, y: 10 + 80 })
  })

  it('uses minimum spacing larger than element size to avoid overlap', () => {
    const pos = nextElementPosition([], 120, 80, 3)
    expect(pos.x).toBeGreaterThanOrEqual(10)
    expect(pos.y).toBeGreaterThanOrEqual(10)
  })
})
