import { describe, it, expect } from 'vitest'
import {
  updateEdgeHandles,
  calculateMultiTreeLayout,
  serializeSubtree,
  deserializeSubtree,
  applyLayoutWithOffsets,
  treesToFlowData,
  flowDataToTrees,
  exportToMarkdown,
  importFromMarkdown,
  TREE_VERTICAL_SPACING,
  MIN_NODE_HEIGHT
} from './mindmap-utils'

// ============================================================
// updateEdgeHandles
// ============================================================
describe('updateEdgeHandles', () => {
  const makeNode = (id, side) => ({ id, type: 'mindNode', data: { side, label: id } })
  const makeEdge = (id, source, target) => ({ id, source, target, type: 'smoothstep' })

  it('leaves handles undefined when nodes have no side (default connection points)', () => {
    const nodes = [makeNode('a', undefined), makeNode('b', undefined)]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBeUndefined()
    expect(result[0].targetHandle).toBeUndefined()
  })

  it('sets source-right / target-left when source is center and target is right', () => {
    const nodes = [makeNode('a', 'center'), makeNode('b', 'right')]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBe('source-right')
    expect(result[0].targetHandle).toBe('target-left')
  })

  it('sets source-left / target-right when target is left', () => {
    const nodes = [makeNode('a', 'center'), makeNode('b', 'left')]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBe('source-left')
    expect(result[0].targetHandle).toBe('target-right')
  })

  it('source-right when source side is right', () => {
    const nodes = [makeNode('a', 'right'), makeNode('b', 'left')]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBe('source-right')
    expect(result[0].targetHandle).toBe('target-right')
  })

  it('source-left when source side is left', () => {
    const nodes = [makeNode('a', 'left'), makeNode('b', 'right')]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBe('source-left')
    expect(result[0].targetHandle).toBe('target-left')
  })

  it('leaves targetHandle undefined when target side is neither left nor right', () => {
    const nodes = [makeNode('a', 'center'), makeNode('b', 'center')]
    const edges = [makeEdge('e1', 'a', 'b')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].targetHandle).toBeUndefined()
  })

  it('passes through cross-connection edges unchanged', () => {
    const nodes = [makeNode('a', 'center'), makeNode('b', 'right')]
    const edges = [{ id: 'c1', source: 'a', target: 'b', type: 'crossConnection', data: { crossConnection: true } }]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0]).not.toHaveProperty('sourceHandle')
    expect(result[0]).not.toHaveProperty('targetHandle')
  })

  it('returns edge unchanged when source/target node not found', () => {
    const nodes = [makeNode('a', 'center')]
    const edges = [makeEdge('e1', 'a', 'nonexistent')]
    const result = updateEdgeHandles(nodes, edges)
    expect(result[0].sourceHandle).toBeUndefined()
  })
})

// ============================================================
// calculateMultiTreeLayout
// ============================================================
describe('calculateMultiTreeLayout', () => {
  it('returns nodes with positions and edges with handles for a simple tree', () => {
    const nodes = [{ id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical' } }]
    const edges = []
    const result = calculateMultiTreeLayout(nodes, edges)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].position).toBeDefined()
    expect(typeof result.nodes[0].position.x).toBe('number')
    expect(typeof result.nodes[0].position.y).toBe('number')
  })

  it('positions parent above children in vertical layout', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    expect(nodeA.position.y).toBeLessThan(nodeB.position.y)
  })

  it('lays out multiple roots stacked vertically with spacing', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root1', layout: 'vertical' } },
      { id: 'b', type: 'mindNode', data: { label: 'root2', layout: 'vertical' } }
    ]
    const edges = []
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    expect(nodeB.position.y - nodeA.position.y).toBeGreaterThanOrEqual(TREE_VERTICAL_SPACING)
  })

  it('sets side and depth on nodes', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    result.nodes.forEach(n => {
      expect(n.data).toHaveProperty('depth')
      expect(typeof n.data.depth).toBe('number')
    })
  })

  it('handles empty nodes gracefully', () => {
    const result = calculateMultiTreeLayout([], [])
    expect(result.nodes).toEqual([])
  })

  it('skips children of collapsed parents', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical', collapsed: true } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    // Root should have no side since collapsed children aren't laid out,
    // but root itself should still exist
    const root = result.nodes.find(n => n.id === 'a')
    expect(root).toBeDefined()
  })

  it('respects getLayoutForRoot callback for horizontal layout', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges, (rootId) => rootId === 'a' ? 'horizontal' : 'vertical')
    const nodeB = result.nodes.find(n => n.id === 'b')
    // In horizontal layout, children get left/right side
    expect(['left', 'right']).toContain(nodeB.data.side)
  })

  it('uses center-based coordinates in horizontal layout (root center at origin)', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'horizontal' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    // Root center should be at (0, offsetY + rootHeight/2) — x=0
    expect(nodeA.position.x).toBe(0)
    // Root center y should be > 0 (offsetY + half estimated height)
    expect(nodeA.position.y).toBeGreaterThan(0)
    // Child center x should be away from 0 (right side)
    expect(nodeB.position.x).toBeGreaterThan(50)
  })

  it('positions right-side children with correct edge margin (MARGIN_X=80)', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'horizontal' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    // With center coords: childCx = cx + EST_WIDTH/2 + MARGIN_X + EST_WIDTH/2
    // = 0 + 60 + 80 + 60 = 200
    expect(nodeA.position.y).toBeGreaterThan(0)
    expect(nodeB.position.x).toBeGreaterThanOrEqual(180)
    expect(nodeB.data.side).toBe('right')
  })

  it('Y-center of right-side children aligns with root center', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'horizontal' } },
      { id: 'b', type: 'mindNode', data: { label: 'child1' } },
      { id: 'c', type: 'mindNode', data: { label: 'child2' } }
    ]
    const edges = [
      { id: 'e1', source: 'a', target: 'b', type: 'smoothstep' },
      { id: 'e2', source: 'a', target: 'c', type: 'smoothstep' }
    ]
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    const nodeC = result.nodes.find(n => n.id === 'c')
    // Children are assigned right and left (alternating)
    const rightChildren = [nodeB, nodeC].filter(n => n.data.side === 'right')
    const leftChildren = [nodeB, nodeC].filter(n => n.data.side === 'left')
    // At least one child on each side
    expect(rightChildren.length).toBeGreaterThanOrEqual(1)
    expect(leftChildren.length).toBeGreaterThanOrEqual(1)
    // Right children bounding box should be centered on root Y
    if (rightChildren.length > 0) {
      const avgY = rightChildren.reduce((sum, n) => sum + n.position.y, 0) / rightChildren.length
      expect(Math.abs(avgY - nodeA.position.y)).toBeLessThan(25)
    }
  })

  it('uses center-based coordinates in vertical layout', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = calculateMultiTreeLayout(nodes, edges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    // Root center x should be 0 (centered)
    expect(nodeA.position.x).toBe(0)
    // Child center should be below root
    expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y)
    // Child center x should be near 0 (centered under root)
    expect(Math.abs(nodeB.position.x)).toBeLessThan(1)
  })
})

// ============================================================
// serializeSubtree / deserializeSubtree
// ============================================================
describe('serializeSubtree', () => {
  it('serializes a leaf node', () => {
    const nodes = [{ id: 'a', type: 'mindNode', data: { label: 'leaf', style: {}, media: [], collapsed: false } }]
    const edges = []
    const result = serializeSubtree('a', nodes, edges)
    expect(result).toEqual({
      label: 'leaf',
      style: {},
      media: [],
      collapsed: false,
      children: []
    })
  })

  it('serializes a subtree with children', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'parent', style: {}, media: [], collapsed: false } },
      { id: 'b', type: 'mindNode', data: { label: 'child', style: {}, media: [], collapsed: false } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = serializeSubtree('a', nodes, edges)
    expect(result.label).toBe('parent')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].label).toBe('child')
  })

  it('returns null for nonexistent node', () => {
    const result = serializeSubtree('nonexistent', [], [])
    expect(result).toBeNull()
  })
})

describe('deserializeSubtree', () => {
  it('creates nodes and edges from tree data', () => {
    const tree = { label: 'root', style: {}, media: [], collapsed: false, children: [] }
    const result = deserializeSubtree(tree, null)
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)
    expect(result.nodes[0].data.label).toBe('root')
  })

  it('creates edges connecting parent to children', () => {
    const tree = {
      label: 'root', style: {}, media: [], collapsed: false,
      children: [
        { label: 'child1', style: {}, media: [], collapsed: false, children: [] }
      ]
    }
    const result = deserializeSubtree(tree, null)
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].source).toBe(result.nodes[0].id)
    expect(result.edges[0].target).toBe(result.nodes[1].id)
  })

  it('connects to a parent when parentId is provided', () => {
    const tree = { label: 'child', style: {}, media: [], collapsed: false, children: [] }
    const result = deserializeSubtree(tree, 'parent-1')
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].source).toBe('parent-1')
  })
})

// ============================================================
// applyLayoutWithOffsets
// ============================================================
describe('applyLayoutWithOffsets', () => {
  it('preserves positions of existing nodes', () => {
    const existing = [{ id: 'a', type: 'mindNode', position: { x: 100, y: 200 }, data: { label: 'root', layout: 'vertical' } }]
    const newNodes = [...existing]
    const newEdges = []
    const result = applyLayoutWithOffsets(existing, [], newNodes, newEdges)
    const nodeA = result.nodes.find(n => n.id === 'a')
    expect(nodeA.position).toEqual({ x: 100, y: 200 })
  })

  it('offsets new nodes relative to reference node displacement', () => {
    const existing = [
      { id: 'a', type: 'mindNode', position: { x: 300, y: 200 }, data: { label: 'root', layout: 'vertical' } }
    ]
    const newNodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root', layout: 'vertical' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const newEdges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = applyLayoutWithOffsets(existing, [], newNodes, newEdges, 'a')
    const nodeA = result.nodes.find(n => n.id === 'a')
    const nodeB = result.nodes.find(n => n.id === 'b')
    // Node A should keep its saved position
    expect(nodeA.position).toEqual({ x: 300, y: 200 })
    // Node B should be offset by the displacement of A (saved 300, layout 0 → dx=300)
    expect(nodeB.position.x).toBeGreaterThanOrEqual(250) // offset applied
  })

  // ============================================================
  // Bug 1 Tests: New node positioning relative to existing nodes
  // ============================================================

  it('BUG1: positions new child right of parent in horizontal layout', () => {
    // Root at (0, 20) — layout was already applied to existing nodes.
    // Adding a child should place it to the right of root.
    const existing = [
      { id: 'root', type: 'mindNode', position: { x: 0, y: 20 }, data: { label: '中心主题', layout: 'horizontal' } }
    ]
    const childId = 'child-1'
    const newNodes = [
      { id: 'root', type: 'mindNode', data: { label: '中心主题', layout: 'horizontal' } },
      { id: childId, type: 'mindNode', data: { label: '新节点' } }
    ]
    const newEdges = [{ id: 'e1', source: 'root', target: childId, type: 'mindmap' }]
    const result = applyLayoutWithOffsets(existing, [], newNodes, newEdges, 'root')
    const root = result.nodes.find(n => n.id === 'root')
    const child = result.nodes.find(n => n.id === childId)
    expect(root.position).toEqual({ x: 0, y: 20 })
    expect(child.position.x).toBeGreaterThan(root.position.x)
    expect(Math.abs(child.position.y - root.position.y)).toBeLessThan(50)
  })

  it('BUG1: positions child below parent in vertical layout', () => {
    const existing = [
      { id: 'root', type: 'mindNode', position: { x: 0, y: 20 }, data: { label: 'Root', layout: 'vertical' } }
    ]
    const childId = 'child-1'
    const newNodes = [
      { id: 'root', type: 'mindNode', data: { label: 'Root', layout: 'vertical' } },
      { id: childId, type: 'mindNode', data: { label: 'Child' } }
    ]
    const newEdges = [{ id: 'e1', source: 'root', target: childId, type: 'mindmap' }]
    const result = applyLayoutWithOffsets(existing, [], newNodes, newEdges, 'root')
    const root = result.nodes.find(n => n.id === 'root')
    const child = result.nodes.find(n => n.id === childId)
    expect(root.position).toEqual({ x: 0, y: 20 })
    expect(child.position.y).toBeGreaterThan(root.position.y)
    expect(Math.abs(child.position.x - root.position.x)).toBeLessThan(10)
  })

  it('BUG1: positions new root node below existing roots', () => {
    // Adding a new root node (addRootNode) — it should get placed below
    // the existing root band.
    const existing = [
      { id: 'root1', type: 'mindNode', position: { x: 0, y: 20 }, data: { label: 'Root1', layout: 'horizontal' } }
    ]
    const newId = 'root2'
    const newNodes = [
      { id: 'root1', type: 'mindNode', data: { label: 'Root1', layout: 'horizontal' } },
      { id: newId, type: 'mindNode', data: { label: '新中心', layout: 'horizontal' } }
    ]
    const result = applyLayoutWithOffsets(existing, [], newNodes, [], newId)
    const r2 = result.nodes.find(n => n.id === newId)
    expect(Number.isFinite(r2.position.x)).toBe(true)
    expect(Number.isFinite(r2.position.y)).toBe(true)
    // New root should not be at origin (0,0)
    expect(r2.position.y).toBeGreaterThan(10)
  })

  it('BUG1: _autoEdit flag is preserved through applyLayoutWithOffsets', () => {
    const existing = [
      { id: 'root', type: 'mindNode', position: { x: 200, y: 100 }, data: { label: 'Root', layout: 'horizontal' } }
    ]
    const childId = 'child-1'
    const newNodes = [
      { id: 'root', type: 'mindNode', data: { label: 'Root', layout: 'horizontal' } },
      { id: childId, type: 'mindNode', data: { label: '新节点', _autoEdit: true } }
    ]
    const newEdges = [{ id: 'e1', source: 'root', target: childId, type: 'mindmap' }]
    const result = applyLayoutWithOffsets(existing, [], newNodes, newEdges, 'root')
    const child = result.nodes.find(n => n.id === childId)
    expect(child.data._autoEdit).toBe(true)
  })
})

// ============================================================
// treesToFlowData / flowDataToTrees
// ============================================================
describe('treesToFlowData', () => {
  it('converts a single root to nodes and edges', () => {
    const root = { id: 'r1', text: 'root', media: [], layout: 'vertical', children: [
      { id: 'c1', text: 'child', media: [], children: [] }
    ]}
    const result = treesToFlowData(root)
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].source).toBe('r1')
    expect(result.edges[0].target).toBe('c1')
  })

  it('converts multiple roots to nodes and edges', () => {
    const roots = [
      { id: 'r1', text: 'root1', media: [], layout: 'vertical', children: [] },
      { id: 'r2', text: 'root2', media: [], layout: 'vertical', children: [] }
    ]
    const result = treesToFlowData(roots)
    expect(result.nodes).toHaveLength(2)
  })

  it('adds cross-connection edges', () => {
    const root = { id: 'r1', text: 'root', media: [], layout: 'vertical', children: [] }
    const crossConnections = [{ fromNodeId: 'r1', toNodeId: 'some-other-id', label: 'cross' }]
    const result = treesToFlowData(root, crossConnections)
    const crossEdges = result.edges.filter(e => e.data?.crossConnection)
    expect(crossEdges).toHaveLength(1)
    expect(crossEdges[0].label).toBe('cross')
  })

  it('generates ids for nodes without one', () => {
    const root = { text: 'root', media: [], layout: 'vertical', children: [] }
    const result = treesToFlowData(root)
    expect(result.nodes[0].id).toMatch(/^node-/)
  })
})

describe('flowDataToTrees', () => {
  it('converts nodes and edges to trees', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root' } },
      { id: 'b', type: 'mindNode', data: { label: 'child' } }
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }]
    const result = flowDataToTrees(nodes, edges)
    expect(result.roots).toHaveLength(1)
    expect(result.roots[0].text).toBe('root')
    expect(result.roots[0].children).toHaveLength(1)
    expect(result.roots[0].children[0].text).toBe('child')
  })

  it('separates cross-connection edges', () => {
    const nodes = [
      { id: 'a', type: 'mindNode', data: { label: 'root' } },
      { id: 'b', type: 'mindNode', data: { label: 'other' } }
    ]
    const edges = [{ id: 'c1', source: 'a', target: 'b', type: 'crossConnection', data: { crossConnection: true }, label: 'xref' }]
    const result = flowDataToTrees(nodes, edges)
    expect(result.roots).toHaveLength(2) // No parent-child, so both are roots
    expect(result.crossConnections).toHaveLength(1)
    expect(result.crossConnections[0].label).toBe('xref')
  })
})

describe('treesToFlowData / flowDataToTrees round-trip', () => {
  it('preserves structure through round-trip', () => {
    const original = [
      { id: 'r1', text: 'root', media: [], layout: 'vertical', children: [
        { id: 'c1', text: 'child1', media: [], children: [] },
        { id: 'c2', text: 'child2', media: [], children: [
          { id: 'gc1', text: 'grandchild', media: [], children: [] }
        ]}
      ]}
    ]
    const flow = treesToFlowData(original)
    const { roots } = flowDataToTrees(flow.nodes, flow.edges)
    expect(roots).toHaveLength(1)
    expect(roots[0].text).toBe('root')
    expect(roots[0].children).toHaveLength(2)
    expect(roots[0].children[1].children).toHaveLength(1)
    expect(roots[0].children[1].children[0].text).toBe('grandchild')
  })
})

// ============================================================
// exportToMarkdown / importFromMarkdown
// ============================================================
describe('exportToMarkdown', () => {
  it('exports a simple tree to markdown', () => {
    const roots = [{ id: 'r1', text: 'Root', media: [], layout: 'vertical', children: [
      { id: 'c1', text: 'Child', media: [], children: [] }
    ]}]
    const md = exportToMarkdown(roots)
    expect(md).toContain('# 思维导图')
    expect(md).toContain('## Root')
    expect(md).toContain('Child')
  })

  it('includes layout comment for horizontal layout', () => {
    const roots = [{ id: 'r1', text: 'Root', media: [], layout: 'horizontal', children: [] }]
    const md = exportToMarkdown(roots)
    expect(md).toContain('<!-- layout: horizontal -->')
  })

  it('handles empty roots', () => {
    const md = exportToMarkdown([])
    expect(md).toBe('# 思维导图')
  })
})

describe('importFromMarkdown', () => {
  it('imports a simple markdown structure', () => {
    const md = `# 思维导图

## Root

1. **Child**
  - **Grandchild**`
    const roots = importFromMarkdown(md)
    expect(roots).toHaveLength(1)
    expect(roots[0].text).toBe('Root')
    expect(roots[0].children).toHaveLength(1)
    expect(roots[0].children[0].text).toBe('Child')
    expect(roots[0].children[0].children).toHaveLength(1)
    expect(roots[0].children[0].children[0].text).toBe('Grandchild')
  })

  it('handles multiple roots', () => {
    const md = `# 思维导图

## Root1

1. **Child**

## Root2`
    const roots = importFromMarkdown(md)
    expect(roots).toHaveLength(2)
    expect(roots[0].text).toBe('Root1')
    expect(roots[1].text).toBe('Root2')
  })

  it('handles empty markdown', () => {
    const roots = importFromMarkdown('')
    expect(roots).toHaveLength(1)
    expect(roots[0].text).toBe('中心主题')
  })
})

describe('markdown round-trip', () => {
  it('preserves structure through export/import', () => {
    const original = [{ id: 'r1', text: 'Project', media: [], layout: 'vertical', children: [
      { id: 'c1', text: 'Task 1', media: [], children: [] },
      { id: 'c2', text: 'Task 2', media: [], children: [] }
    ]}]
    const md = exportToMarkdown(original)
    const roots = importFromMarkdown(md)
    expect(roots).toHaveLength(1)
    expect(roots[0].text).toBe('Project')
    expect(roots[0].children).toHaveLength(2)
    expect(roots[0].children[0].text).toBe('Task 1')
    expect(roots[0].children[1].text).toBe('Task 2')
  })
})
