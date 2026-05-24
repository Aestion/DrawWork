import { describe, it, expect } from 'vitest'
import { nodesToYjs, yjsToNodes, edgesToYjs, yjsToEdges } from './useMindMapYjs'

// Helper to create sample nodes for collaboration tests
function makeSampleNodes() {
  return [
    {
      id: 'n1',
      type: 'mindNode',
      position: { x: 100, y: 200 },
      data: {
        label: '中心主题',
        media: [{ id: 'm1', url: 'test.png', type: 'image' }],
        collapsed: false,
        layout: 'horizontal',
        style: { bgColor: '#ff0', borderColor: '#00f', fontSize: 18 }
      }
    },
    {
      id: 'n2',
      type: 'mindNode',
      position: { x: 300, y: 200 },
      data: {
        label: '子节点',
        media: [],
        collapsed: true,
        layout: 'vertical',
        style: {}
      }
    }
  ]
}

describe('nodesToYjs / yjsToNodes', () => {
  const sampleNodes = [
    {
      id: 'n1',
      type: 'mindNode',
      position: { x: 100, y: 200 },
      data: {
        label: '中心主题',
        media: [{ id: 'm1', url: 'test.png', type: 'image' }],
        collapsed: false,
        layout: 'horizontal',
        style: { color: '#333', background: '#fff' }
      }
    },
    {
      id: 'n2',
      type: 'mindNode',
      position: { x: 300, y: 200 },
      data: {
        label: '子节点',
        media: [],
        collapsed: true,
        layout: 'vertical',
        style: {}
      }
    }
  ]

  it('converts nodes to Yjs format', () => {
    const result = nodesToYjs(sampleNodes)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'n1',
      text: '中心主题',
      media: [{ id: 'm1', url: 'test.png', type: 'image' }],
      position: { x: 100, y: 200 },
      collapsed: false,
      layout: 'horizontal',
      style: { color: '#333', background: '#fff' }
    })
    expect(result[1].collapsed).toBe(true)
    expect(result[1].layout).toBe('vertical')
  })

  it('converts Yjs format back to React Flow nodes', () => {
    const yjsNodes = [
      {
        id: 'n1',
        text: '中心主题',
        media: [{ id: 'm1', url: 'test.png', type: 'image' }],
        position: { x: 100, y: 200 },
        collapsed: false,
        layout: 'horizontal',
        style: { color: '#333' }
      }
    ]
    const result = yjsToNodes(yjsNodes, true)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n1')
    expect(result[0].type).toBe('mindNode')
    expect(result[0].position).toEqual({ x: 100, y: 200 })
    expect(result[0].data.label).toBe('中心主题')
    expect(result[0].data.media).toHaveLength(1)
    expect(result[0].data.collapsed).toBe(false)
    expect(result[0].data.layout).toBe('horizontal')
    expect(result[0].data.canEdit).toBe(true)
  })

  it('round-trips node data faithfully', () => {
    const yjsFormat = nodesToYjs(sampleNodes)
    const reactFlowFormat = yjsToNodes(yjsFormat, false)

    expect(reactFlowFormat).toHaveLength(2)
    expect(reactFlowFormat[0].id).toBe('n1')
    expect(reactFlowFormat[0].data.label).toBe('中心主题')
    expect(reactFlowFormat[0].data.media).toEqual(sampleNodes[0].data.media)
    expect(reactFlowFormat[0].data.collapsed).toBe(false)
    expect(reactFlowFormat[0].data.layout).toBe('horizontal')
    expect(reactFlowFormat[0].data.canEdit).toBe(false)

    expect(reactFlowFormat[1].id).toBe('n2')
    expect(reactFlowFormat[1].data.label).toBe('子节点')
    expect(reactFlowFormat[1].data.collapsed).toBe(true)
    expect(reactFlowFormat[1].data.layout).toBe('vertical')
    expect(reactFlowFormat[1].data.canEdit).toBe(false)
  })

  it('handles empty node array', () => {
    expect(nodesToYjs([])).toEqual([])
    expect(yjsToNodes([], true)).toEqual([])
  })

  it('handles null/undefined Yjs nodes gracefully', () => {
    expect(yjsToNodes(null, true)).toEqual([])
    expect(yjsToNodes(undefined, true)).toEqual([])
  })

  it('sets default values for missing fields in Yjs nodes', () => {
    const yjsNodes = [{ id: 'n1' }]
    const result = yjsToNodes(yjsNodes, false)
    expect(result[0].data.label).toBe('')
    expect(result[0].data.media).toEqual([])
    expect(result[0].data.collapsed).toBe(false)
    expect(result[0].data.layout).toBe('horizontal') // default after fix
    expect(result[0].data.canEdit).toBe(false)
  })

  it('preserves canEdit flag through conversion', () => {
    const nodes = [{ id: 'n1', type: 'mindNode', position: { x: 0, y: 0 }, data: { label: 'test' } }]
    const yjsNodes = nodesToYjs(nodes)

    const editable = yjsToNodes(yjsNodes, true)
    expect(editable[0].data.canEdit).toBe(true)

    const readOnly = yjsToNodes(yjsNodes, false)
    expect(readOnly[0].data.canEdit).toBe(false)
  })

  it('handles nodes with empty label', () => {
    const nodes = [{ id: 'n1', type: 'mindNode', position: { x: 0, y: 0 }, data: {} }]
    const yjsNodes = nodesToYjs(nodes)
    expect(yjsNodes[0].text).toBe('')
  })
})

describe('edgesToYjs / yjsToEdges', () => {
  const sampleEdges = [
    {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'smoothstep',
      label: '连接线'
    },
    {
      id: 'e2',
      source: 'n2',
      target: 'n3',
      type: 'crossConnection',
      label: ''
    }
  ]

  it('converts edges to Yjs format', () => {
    const result = edgesToYjs(sampleEdges)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'smoothstep',
      label: '连接线'
    })
    expect(result[1].type).toBe('crossConnection')
  })

  it('converts Yjs format back to React Flow edges', () => {
    const yjsEdges = [
      { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep', label: '标题' }
    ]
    const result = yjsToEdges(yjsEdges)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
    expect(result[0].source).toBe('n1')
    expect(result[0].target).toBe('n2')
    expect(result[0].type).toBe('smoothstep')
    expect(result[0].label).toBe('标题')
  })

  it('round-trips edge data faithfully', () => {
    const yjsFormat = edgesToYjs(sampleEdges)
    const reactFlowFormat = yjsToEdges(yjsFormat)

    expect(reactFlowFormat).toHaveLength(2)
    expect(reactFlowFormat[0].source).toBe('n1')
    expect(reactFlowFormat[0].target).toBe('n2')
    expect(reactFlowFormat[0].label).toBe('连接线')
    expect(reactFlowFormat[1].type).toBe('crossConnection')
  })

  it('handles empty edge array', () => {
    expect(edgesToYjs([])).toEqual([])
    expect(yjsToEdges([])).toEqual([])
  })

  it('handles null/undefined Yjs edges', () => {
    // Note: there's a subtle issue — edge.type default in yjsToEdges
    // comes from the Yjs data, not a default. Test that null/undefined works.
    expect(yjsToEdges(null)).toEqual([])
    expect(yjsToEdges(undefined)).toEqual([])
  })

  it('sets default values for missing fields', () => {
    const yjsEdges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    const result = yjsToEdges(yjsEdges)
    expect(result[0].type).toBe('mindmap')
    expect(result[0].label).toBe('')
  })

  it('handles edges without type or label gracefully', () => {
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    const yjsFormat = edgesToYjs(edges)
    expect(yjsFormat[0].type).toBe('mindmap')
    expect(yjsFormat[0].label).toBe('')
  })
})

// ============================================================
// Bug 3 Tests: Collaboration data consistency
// ============================================================
describe('BUG3: collaboration data consistency', () => {
  // The critical Bug 3 issue is that syncToYjs uses a 500ms debounce and
  // captures node/edge arrays at call time. If a remote update arrives
  // during the debounce window, the local capture overwrites it.
  // These tests verify that conversion functions preserve all fields
  // needed for collaboration and identify potential data loss points.

  it('preserves all essential fields through nodes round-trip', () => {
    const original = makeSampleNodes()
    const yjsFormat = nodesToYjs(original)
    const reactFlowFormat = yjsToNodes(yjsFormat, true)

    expect(reactFlowFormat).toHaveLength(2)
    // Check every essential field survived
    expect(reactFlowFormat[0].id).toBe('n1')
    expect(reactFlowFormat[0].position).toEqual({ x: 100, y: 200 })
    expect(reactFlowFormat[0].data.label).toBe('中心主题')
    expect(reactFlowFormat[0].data.media).toEqual([{ id: 'm1', url: 'test.png', type: 'image' }])
    expect(reactFlowFormat[0].data.collapsed).toBe(false)
    expect(reactFlowFormat[0].data.layout).toBe('horizontal')
    expect(reactFlowFormat[0].data.style).toEqual({ bgColor: '#ff0', borderColor: '#00f', fontSize: 18 })
  })

  it('preserves collapsed and layout fields (critical for collaboration)', () => {
    // Bug 3 risk: if layout/collapsed fields are lost in conversion,
    // collaborative edits would reset these to defaults
    const nodes = makeSampleNodes()
    const yjsFormat = nodesToYjs(nodes)

    // Verify Yjs format has both fields
    expect(yjsFormat[1].collapsed).toBe(true)
    expect(yjsFormat[1].layout).toBe('vertical')
    expect(yjsFormat[0].layout).toBe('horizontal')

    // Verify round-trip preserves them
    const roundTripped = yjsToNodes(yjsFormat, true)
    expect(roundTripped[1].data.collapsed).toBe(true)
    expect(roundTripped[1].data.layout).toBe('vertical')
    expect(roundTripped[0].data.layout).toBe('horizontal')
  })

  it('cross-connection edges survive round-trip', () => {
    const edges = [
      { id: 'cross-1', source: 'n1', target: 'n2', type: 'crossConnection', label: '链接' }
    ]
    const yjsFormat = edgesToYjs(edges)
    const roundTripped = yjsToEdges(yjsFormat)

    expect(roundTripped).toHaveLength(1)
    expect(roundTripped[0].type).toBe('crossConnection')
    expect(roundTripped[0].label).toBe('链接')
    expect(roundTripped[0].source).toBe('n1')
    expect(roundTripped[0].target).toBe('n2')
  })

  it('nodesToYjs strips runtime-only flags (expected, not a bug)', () => {
    // _autoEdit is a local-only flag. This test verifies it's intentionally
    // stripped — it documents that the flag doesn't survive Yjs sync.
    const nodes = [{
      id: 'n1',
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: { label: 'test', _autoEdit: true, canEdit: true }
    }]
    const yjsFormat = nodesToYjs(nodes)
    // _autoEdit shouldn't be in Yjs (it's local-only)
    expect(yjsFormat[0]._autoEdit).toBeUndefined()
    // But label should survive
    expect(yjsFormat[0].text).toBe('test')
  })

  it('multiple collaborations: fields are not accidentally overwritten by defaults', () => {
    // Simulate: User A sets layout=vertical, style={bgColor:'red'}
    // If another collaborator's yjsToNodes provides defaults, these must not
    // overwrite the actual values.
    const yjsNodes = [
      {
        id: 'n1',
        text: 'Project',
        media: [],
        position: { x: 100, y: 50 },
        collapsed: false,
        layout: 'vertical',
        style: { bgColor: '#ff0000', fontSize: 18 }
      }
    ]
    const result = yjsToNodes(yjsNodes, true)
    expect(result[0].data.layout).toBe('vertical')
    expect(result[0].data.style.bgColor).toBe('#ff0000')
    expect(result[0].data.style.fontSize).toBe(18)
  })

  it('handles empty media array gracefully', () => {
    const nodes = [{
      id: 'n1', type: 'mindNode', position: { x: 0, y: 0 },
      data: { label: 'test', media: [], collapsed: false, layout: 'horizontal', style: {} }
    }]
    const yjsFormat = nodesToYjs(nodes)
    const roundTripped = yjsToNodes(yjsFormat, true)
    expect(roundTripped[0].data.media).toEqual([])
  })
})
