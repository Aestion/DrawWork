import { describe, expect, it, vi } from 'vitest'
import UnbalancedLayoutPlugin, { getBalancedRightNumber } from './unbalanced-layout-plugin'

describe('unbalanced-layout-plugin', () => {
  it('keeps automatically added root children balanced from right to left', () => {
    expect(getBalancedRightNumber(1)).toBe(1)
    expect(getBalancedRightNumber(2)).toBe(1)
    expect(getBalancedRightNumber(3)).toBe(2)
    expect(getBalancedRightNumber(4)).toBe(2)
    expect(getBalancedRightNumber(5)).toBe(3)
  })

  it('updates rightNumber after automatic root child insertions', () => {
    const renderTree = {
      data: { rightNumber: 1 },
      children: [
        { data: { text: '子节点1' } },
        { data: { text: '子节点2' } },
        { data: { text: '子节点3' } }
      ]
    }
    const mindMap = {
      opt: { layout: 'mindMap' },
      renderer: { renderTree },
      execCommand: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      render: vi.fn()
    }
    const plugin = new UnbalancedLayoutPlugin({ mindMap })

    plugin.afterExecCommand('INSERT_CHILD_NODE')

    expect(renderTree.data.rightNumber).toBe(2)
    expect(renderTree.children.map(child => child.data.dir)).toEqual(['right', 'right', 'left'])
    expect(mindMap.render).toHaveBeenCalled()
  })
})
