import { describe, expect, it, vi } from 'vitest'
import UnbalancedLayoutPlugin, { chooseSideForNewRootChild, getBalancedRightNumber } from './unbalanced-layout-plugin'

describe('unbalanced-layout-plugin', () => {
  it('calculates the balanced right-side count', () => {
    expect(getBalancedRightNumber(1)).toBe(1)
    expect(getBalancedRightNumber(2)).toBe(1)
    expect(getBalancedRightNumber(3)).toBe(2)
    expect(getBalancedRightNumber(4)).toBe(2)
    expect(getBalancedRightNumber(5)).toBe(3)
  })

  it('chooses the side with fewer root children for newly inserted nodes', () => {
    expect(chooseSideForNewRootChild(1, 0)).toBe('left')
    expect(chooseSideForNewRootChild(1, 1)).toBe('right')
    expect(chooseSideForNewRootChild(2, 1)).toBe('left')
  })

  it('keeps existing root child sides stable after automatic insertions', () => {
    const renderTree = {
      data: { rightNumber: 2 },
      children: [
        { data: { uid: 'r1', text: '右 1', dir: 'right' } },
        { data: { uid: 'r2', text: '右 2', dir: 'right' } },
        { data: { uid: 'l1', text: '左 1', dir: 'left' } }
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

    plugin.beforeExecCommand('INSERT_CHILD_NODE')
    renderTree.children.unshift({ data: { uid: 'n1', text: '新增节点' } })
    plugin.afterExecCommand('INSERT_CHILD_NODE')

    expect(renderTree.data.rightNumber).toBe(2)
    expect(renderTree.children.map(child => child.data.uid)).toEqual(['r1', 'r2', 'n1', 'l1'])
    expect(renderTree.children.map(child => child.data.dir)).toEqual(['right', 'right', 'left', 'left'])
    expect(mindMap.render).toHaveBeenCalled()
  })

  it('keeps unrelated root child sides stable after a manual cross-side drag', () => {
    const renderTree = {
      data: { rightNumber: 2 },
      children: [
        { data: { uid: 'r1', text: '右 1', dir: 'right' } },
        { data: { uid: 'r2', text: '右 2', dir: 'right' } },
        { data: { uid: 'l1', text: '左 1', dir: 'left' } },
        { data: { uid: 'l2', text: '左 2', dir: 'left' } }
      ]
    }
    const mindMap = {
      opt: { layout: 'mindMap' },
      renderer: { renderTree },
      render: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      execCommand: vi.fn()
    }
    const plugin = new UnbalancedLayoutPlugin({ mindMap })

    const draggedNode = renderTree.children[2]
    const targetNode = renderTree.children[0]
    plugin.beforeExecCommand('MOVE_NODE_TO', [draggedNode], targetNode)
    renderTree.children = [
      renderTree.children[0],
      renderTree.children[2],
      renderTree.children[3],
      renderTree.children[1]
    ]
    plugin.onDragStart()
    plugin.afterExecCommand('MOVE_NODE_TO', [draggedNode], targetNode)

    expect(renderTree.data.rightNumber).toBe(3)
    expect(renderTree.children.map(child => child.data.uid)).toEqual(['r1', 'l1', 'r2', 'l2'])
    expect(Object.fromEntries(renderTree.children.map(child => [child.data.uid, child.data.dir]))).toEqual({
      r1: 'right',
      r2: 'right',
      l1: 'right',
      l2: 'left'
    })
  })

  it('preserves explicit root child sides when data is normalized after repeated drags', () => {
    const renderTree = {
      data: { rightNumber: 1 },
      children: [
        { data: { uid: 'l1', text: '左 1', dir: 'left' } },
        { data: { uid: 'l2', text: '左 2', dir: 'left' } },
        { data: { uid: 'l3', text: '左 3', dir: 'left' } },
        { data: { uid: 'r1', text: '右 1', dir: 'right' } }
      ]
    }
    const mindMap = {
      opt: { layout: 'mindMap' },
      renderer: { renderTree },
      render: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      execCommand: vi.fn()
    }
    const plugin = new UnbalancedLayoutPlugin({ mindMap })

    plugin.beforeUpdateData(renderTree)

    expect(renderTree.data.rightNumber).toBe(1)
    expect(renderTree.children.map(child => child.data.uid)).toEqual(['r1', 'l1', 'l2', 'l3'])
    expect(Object.fromEntries(renderTree.children.map(child => [child.data.uid, child.data.dir]))).toEqual({
      r1: 'right',
      l1: 'left',
      l2: 'left',
      l3: 'left'
    })
  })

  it('syncs rendered node directions from data before drag preview checks run', () => {
    const renderTree = {
      data: { rightNumber: 1 },
      children: [
        { dir: 'left', data: { uid: 'r1', text: '右 1', dir: 'right' }, _node: { dir: 'left', data: { uid: 'r1', dir: 'right' } } },
        { dir: 'right', data: { uid: 'l1', text: '左 1', dir: 'left' }, _node: { dir: 'right', data: { uid: 'l1', dir: 'left' } } }
      ]
    }
    const mindMap = {
      opt: { layout: 'mindMap' },
      renderer: { renderTree },
      render: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      execCommand: vi.fn()
    }
    const plugin = new UnbalancedLayoutPlugin({ mindMap })

    plugin.onDragStart()

    expect(renderTree.children[0].dir).toBe('right')
    expect(renderTree.children[0]._node.dir).toBe('right')
    expect(renderTree.children[1].dir).toBe('left')
    expect(renderTree.children[1]._node.dir).toBe('left')
  })

  it('does not reorder root children when background normalization runs during drag', () => {
    const renderTree = {
      data: { rightNumber: 2 },
      children: [
        { dir: 'left', data: { uid: 'l1', text: '左 1', dir: 'left' } },
        { dir: 'right', data: { uid: 'r1', text: '右 1', dir: 'right' } },
        { dir: 'left', data: { uid: 'l2', text: '左 2', dir: 'left' } },
        { dir: 'right', data: { uid: 'r2', text: '右 2', dir: 'right' } }
      ]
    }
    const mindMap = {
      opt: { layout: 'mindMap' },
      renderer: { renderTree },
      render: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      execCommand: vi.fn()
    }
    const plugin = new UnbalancedLayoutPlugin({ mindMap })

    plugin.onDragStart()
    plugin.beforeUpdateData(renderTree)

    expect(renderTree.children.map(child => child.data.uid)).toEqual(['l1', 'r1', 'l2', 'r2'])
    expect(mindMap.render).not.toHaveBeenCalled()
  })
})
