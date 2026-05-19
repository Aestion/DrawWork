// Mind map utility functions — extracted for testability

// ============================================================
// Node dimension estimation (text-based, no DOM needed)
// ============================================================
export function estimateNodeDimensions(label = '') {
  const charWidth = 15
  const padding = 32     // px-4 = 16px * 2
  const minWidth = 100
  const estimatedWidth = Math.max(minWidth, (label || '').length * charWidth + padding)
  const estimatedHeight = 40  // py-2 = 8px*2 + line-height ~24px
  return { width: estimatedWidth, height: estimatedHeight }
}

// ============================================================
// Rectilinear (elbow) edge path
// ============================================================
export function getRectilinearPath({ sourceX, sourceY, targetX, targetY }) {
  const BEND_OFFSET = 60

  // Horizontal-dominant: H-bend (horizontal then vertical then horizontal)
  if (Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY)) {
    const bendX = sourceX + (targetX > sourceX ? BEND_OFFSET : -BEND_OFFSET)
    const clampedX = Math.min(Math.max(bendX, Math.min(sourceX, targetX) + 5), Math.max(sourceX, targetX) - 5)
    return `M ${sourceX} ${sourceY} H ${clampedX} V ${targetY} H ${targetX}`
  } else {
    // Vertical-dominant: V-bend (vertical then horizontal then vertical)
    const bendY = sourceY + (targetY > sourceY ? BEND_OFFSET : -BEND_OFFSET)
    const clampedY = Math.min(Math.max(bendY, Math.min(sourceY, targetY) + 5), Math.max(sourceY, targetY) - 5)
    return `M ${sourceX} ${sourceY} V ${clampedY} H ${targetX} V ${targetY}`
  }
}

// ============================================================
// Edge handles
// ============================================================
export function updateEdgeHandles(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  return edges.map(edge => {
    if (edge.data?.crossConnection || edge.type === 'crossConnection') return edge
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    if (!sourceNode || !targetNode) return edge

    const sourceSide = sourceNode.data?.side
    const targetSide = targetNode.data?.side

    let sourceHandle, targetHandle
    if (sourceSide === 'center') {
      sourceHandle = targetSide === 'left' ? 'source-left' : 'source-right'
    } else if (sourceSide === 'right') {
      sourceHandle = 'source-right'
    } else if (sourceSide === 'left') {
      sourceHandle = 'source-left'
    }

    if (targetSide === 'right') {
      targetHandle = 'target-left'
    } else if (targetSide === 'left') {
      targetHandle = 'target-right'
    }

    // 确保所有普通边都设置为 mindmap 类型，即使没有设置 type
    return { ...edge, sourceHandle, targetHandle, type: 'mindmap' }
  })
}

// ============================================================
// Multi-tree layout algorithm
// ============================================================
export const TREE_VERTICAL_SPACING = 80
export const MIN_NODE_HEIGHT = 40

export function calculateMultiTreeLayout(nodes, edges, getLayoutForRoot) {
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n, children: [] }]))
  const childrenMap = new Map()

  // Build parent-child relationships
  edges.forEach((edge) => {
    if (edge.data?.crossConnection || edge.type === 'crossConnection') return
    const parent = nodeMap.get(edge.source)
    const child = nodeMap.get(edge.target)
    if (parent && child) {
      if (parent.data?.collapsed) return
      if (!childrenMap.has(parent.id)) {
        childrenMap.set(parent.id, [])
      }
      childrenMap.get(parent.id).push(child)
    }
  })

  // Find all roots (nodes without parent)
  const childIds = new Set()
  edges.forEach((edge) => {
    if (edge.data?.crossConnection || edge.type === 'crossConnection') return
    childIds.add(edge.target)
  })
  const rootIds = nodes.filter((n) => !childIds.has(n.id)).map((n) => n.id)

  if (rootIds.length === 0) return { nodes, edges: [] }

  // Resolve layout per root
  const getLayout = typeof getLayoutForRoot === 'function'
    ? getLayoutForRoot
    : (rootId) => nodeMap.get(rootId)?.data?.layout || 'vertical'

  // Clear side from all nodes first, then each subtree will set it as needed
  nodeMap.forEach((node, id) => {
    nodeMap.set(id, { ...node, data: { ...node.data, side: undefined } })
  })

  // Stack roots vertically, each in its own band
  let currentY = 0
  rootIds.forEach((rootId) => {
    const layout = getLayout(rootId)
    if (layout === 'horizontal') {
      currentY += layoutHorizontalSubtree(nodeMap, childrenMap, rootId, currentY)
    } else {
      currentY += layoutVerticalSubtree(nodeMap, childrenMap, rootId, currentY)
    }
    currentY += TREE_VERTICAL_SPACING
  })

  return {
    nodes: Array.from(nodeMap.values()),
    edges: updateEdgeHandles(Array.from(nodeMap.values()), edges)
  }
}

// Layout a single root's subtree top-down (root at top, children below)
// Uses center-based coordinates (compatible with nodeOrigin={[0.5, 0.5]})
function layoutVerticalSubtree(nodeMap, childrenMap, rootId, offsetY) {
  const HORIZONTAL_SPACING = 150
  const VERTICAL_SPACING = 80
  let maxDepth = 0

  // Width cache: compute subtree widths without positioning
  const widthCache = new Map()
  function calcSubtreeWidth(nodeId) {
    if (widthCache.has(nodeId)) return widthCache.get(nodeId)
    const node = nodeMap.get(nodeId)
    const children = childrenMap.get(nodeId) || []
    if (children.length === 0) {
      const { width } = estimateNodeDimensions(node?.data?.label)
      widthCache.set(nodeId, width)
      return width
    }
    const totalWidth = children.reduce((sum, child) => sum + calcSubtreeWidth(child.id), 0)
    const withSpacing = totalWidth + (children.length - 1) * HORIZONTAL_SPACING
    const { width: nodeWidth } = estimateNodeDimensions(node?.data?.label)
    const result = Math.max(withSpacing, nodeWidth)
    widthCache.set(nodeId, result)
    return result
  }

  // Position nodes top-down with center-based coordinates
  function layoutNode(nodeId, cx, cy, depth) {
    const node = nodeMap.get(nodeId)
    if (!node) return
    maxDepth = Math.max(maxDepth, depth)

    const children = childrenMap.get(nodeId) || []

    nodeMap.set(nodeId, {
      ...node,
      data: { ...node.data, side: undefined, depth },
      position: { x: cx, y: cy }
    })

    if (children.length > 0) {
      const childWidths = children.map(c => calcSubtreeWidth(c.id))
      const totalWidth = childWidths.reduce((a, b) => a + b, 0) + (children.length - 1) * HORIZONTAL_SPACING

      let childCx = cx - totalWidth / 2
      children.forEach((child, i) => {
        const childCenterX = childCx + childWidths[i] / 2
        layoutNode(child.id, childCenterX, cy + VERTICAL_SPACING, depth + 1)
        childCx += childWidths[i] + HORIZONTAL_SPACING
      })
    }
  }

  const rootNode = nodeMap.get(rootId)
  const { height: rootHeight } = estimateNodeDimensions(rootNode?.data?.label)
  layoutNode(rootId, 0, offsetY + rootHeight / 2, 0)
  return maxDepth * VERTICAL_SPACING + rootHeight
}

// Layout a single root's subtree with balanced left/right distribution
// Uses center-based coordinates (compatible with nodeOrigin={[0.5, 0.5]})
function layoutHorizontalSubtree(nodeMap, childrenMap, rootId, offsetY) {
  const EDGE_MARGIN_X = 80        // horizontal gap between node edges
  const SIBLING_MARGIN_Y = 20     // vertical gap between sibling subtree blocks

  // Calculate subtree heights bottom-up (cached) — includes subtree descendants
  const heightCache = new Map()
  function calcSubtreeHeight(nodeId) {
    if (heightCache.has(nodeId)) return heightCache.get(nodeId)
    const node = nodeMap.get(nodeId)
    const children = childrenMap.get(nodeId) || []
    if (children.length === 0) {
      const { height } = estimateNodeDimensions(node?.data?.label)
      heightCache.set(nodeId, height)
      return height
    }
    const total = children.reduce((sum, child) => sum + calcSubtreeHeight(child.id), 0)
    const result = total + (children.length - 1) * SIBLING_MARGIN_Y
    heightCache.set(nodeId, result)
    return result
  }

  // Balance children by predictable alternating pattern (right, left, right, left...).
  // Each child keeps its index, and since new children append at the end, existing
  // children never flip sides when a new sibling is added.
  function balanceChildren(children, heights) {
    if (children.length === 0) return []
    return children.map((child, i) => ({
      child,
      side: i % 2 === 0 ? 'right' : 'left',
      height: heights[i],
      originalIndex: i
    }))
  }

  // Position nodes recursively with center-based coordinates
  function layoutNode(nodeId, cx, cy, side, depth) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    nodeMap.set(nodeId, {
      ...node,
      data: { ...node.data, side, depth },
      position: { x: cx, y: cy }
    })

    const children = childrenMap.get(nodeId) || []
    if (children.length === 0) return

    const heights = children.map((child) => calcSubtreeHeight(child.id))

    // Use balanced assignment for root (center), maintain side for deeper levels
    const assignments = side === 'center'
      ? balanceChildren(children, heights)
      : children.map((child, i) => ({ child, side, height: heights[i] }))

    // Get parent width for spacing calculations
    const { width: parentWidth } = estimateNodeDimensions(node?.data?.label)

    // Separate left and right assignments
    const leftAssignments = assignments.filter(a => a.side === 'left')
    const rightAssignments = assignments.filter(a => a.side === 'right')

    // Layout left side — distribute vertically centered around parent CY
    if (leftAssignments.length > 0) {
      const totalHeight = leftAssignments.reduce((sum, a) => sum + a.height, 0) + (leftAssignments.length - 1) * SIBLING_MARGIN_Y
      let currentY = cy - totalHeight / 2

      for (const { child } of leftAssignments) {
        const subtreeH = calcSubtreeHeight(child.id)
        const { width: childWidth } = estimateNodeDimensions(child?.data?.label)
        const childCx = cx - parentWidth / 2 - EDGE_MARGIN_X - childWidth / 2
        const childCy = currentY + subtreeH / 2
        layoutNode(child.id, childCx, childCy, 'left', depth + 1)
        currentY += subtreeH + SIBLING_MARGIN_Y
      }
    }

    // Layout right side — distribute vertically centered around parent CY
    if (rightAssignments.length > 0) {
      const totalHeight = rightAssignments.reduce((sum, a) => sum + a.height, 0) + (rightAssignments.length - 1) * SIBLING_MARGIN_Y
      let currentY = cy - totalHeight / 2

      for (const { child } of rightAssignments) {
        const subtreeH = calcSubtreeHeight(child.id)
        const { width: childWidth } = estimateNodeDimensions(child?.data?.label)
        const childCx = cx + parentWidth / 2 + EDGE_MARGIN_X + childWidth / 2
        const childCy = currentY + subtreeH / 2
        layoutNode(child.id, childCx, childCy, 'right', depth + 1)
        currentY += subtreeH + SIBLING_MARGIN_Y
      }
    }
  }

  const rootHeight = calcSubtreeHeight(rootId)
  layoutNode(rootId, 0, offsetY + rootHeight / 2, 'center', 0)
  return rootHeight
}

// ============================================================
// Move node (for drag-and-drop rearrangement)
// ============================================================

/**
 * Move a node (and its subtree) to a new position relative to a target node.
 * Returns updated edges array with the new parent-child relationship.
 * Returns null if the move is invalid (self-move, circular dependency).
 *
 * @param {Array} nodes - Flat node array
 * @param {Array} edges - Flat edge array
 * @param {string} sourceId - ID of node to move
 * @param {string} targetId - ID of target node
 * @param {'before'|'after'|'asChild'} position - Where to place source relative to target
 * @returns {{nodes: Array, edges: Array}|null}
 */
export function moveNode(nodes, edges, sourceId, targetId, position) {
  if (sourceId === targetId) return null

  // Prevent circular: check if target is a descendant of source
  function isDescendant(nodeId, potentialAncestorId, visited = new Set()) {
    if (nodeId === potentialAncestorId) return true
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    const parentEdge = edges.find(
      e => e.target === nodeId && !e.data?.crossConnection && e.type !== 'crossConnection'
    )
    if (!parentEdge) return false
    return isDescendant(parentEdge.source, potentialAncestorId, visited)
  }
  // Only need to check for circular when moving as child (creating new parent-child edge)
  if (position === 'asChild' && isDescendant(targetId, sourceId)) return null

  // If source is being moved as sibling of target and target has no parent (target is root),
  // then source becomes a root too — just remove its parent edge.
  if (position !== 'asChild') {
    const targetParentEdge = edges.find(
      e => e.target === targetId && !e.data?.crossConnection && e.type !== 'crossConnection'
    )
    if (!targetParentEdge) {
      // Target is a root — remove source's parent if any, source becomes a root too
      const newEdges = edges.filter(e => {
        if (e.target === sourceId && !e.data?.crossConnection && e.type !== 'crossConnection') return false
        return true
      })
      return { nodes, edges: newEdges }
    }
  }

  // Build new edges: remove source's incoming edge, add new edge based on position
  const newEdges = edges.filter(e => {
    if (e.target === sourceId && !e.data?.crossConnection && e.type !== 'crossConnection') return false
    return true
  })

  if (position === 'asChild') {
    // Source becomes child of target
    newEdges.push({
      id: `edge-${targetId}-${sourceId}-${Date.now()}`,
      source: targetId,
      target: sourceId,
      type: 'mindmap'
    })
  } else {
    // Source becomes sibling of target — find target's parent and use same parent
    const targetParentEdge = edges.find(
      e => e.target === targetId && !e.data?.crossConnection && e.type !== 'crossConnection'
    )
    if (targetParentEdge) {
      newEdges.push({
        id: `edge-${targetParentEdge.source}-${sourceId}-${Date.now()}`,
        source: targetParentEdge.source,
        target: sourceId,
        type: 'mindmap'
      })
    }
  }

  return { nodes, edges: newEdges }
}

// ============================================================
// Subtree serialization (for copy/paste)
// ============================================================
export function serializeSubtree(nodeId, allNodes, allEdges) {
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) return null
  const children = allEdges
    .filter(e => e.source === nodeId && !e.data?.crossConnection && e.type !== 'crossConnection')
    .map(e => serializeSubtree(e.target, allNodes, allEdges))
    .filter(Boolean)
  return {
    label: node.data.label || '',
    style: node.data.style ? { ...node.data.style } : {},
    media: node.data.media ? node.data.media.map(m => ({ ...m })) : [],
    collapsed: !!node.data.collapsed,
    children
  }
}

export function deserializeSubtree(treeData, parentId) {
  const newNodes = []
  const newEdges = []
  let counter = 0
  function create(node, pId) {
    const nodeId = `pasted-${Date.now()}-${counter++}`
    newNodes.push({
      id: nodeId,
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: {
        label: node.label,
        style: node.style,
        media: node.media,
        collapsed: node.collapsed,
        depth: 0,
        canEdit: true,
        side: null
      }
    })
    if (pId) {
      newEdges.push({ id: `e-${pId}-${nodeId}`, source: pId, target: nodeId, type: 'mindmap' })
    }
    for (const child of node.children) {
      create(child, nodeId)
    }
  }
  create(treeData, parentId)
  return { nodes: newNodes, edges: newEdges }
}

// ============================================================
// Layout with offset preservation
// ============================================================
export function applyLayoutWithOffsets(existingNodes, existingEdges, newNodes, newEdges, referenceNodeId) {
  const savedPositions = new Map(existingNodes.map(n => [n.id, n.position]))
  // Preserve layout setting from existing nodes
  const savedLayouts = new Map(existingNodes.map(n => [n.id, n.data?.layout]))

  // Build getLayoutForRoot that prefers saved layout, defaults to horizontal
  const getLayoutForRoot = (rootId) => {
    return savedLayouts.get(rootId) || 'horizontal'
  }

  const result = calculateMultiTreeLayout(newNodes, newEdges, getLayoutForRoot)
  const layoutPositions = new Map(result.nodes.map(n => [n.id, n.position]))
  result.nodes = result.nodes.map(n => {
    const saved = savedPositions.get(n.id)
    if (saved) return { ...n, position: { ...saved } }
    return n
  })
  if (referenceNodeId) {
    const refLayoutPos = layoutPositions.get(referenceNodeId)
    const refActualPos = savedPositions.get(referenceNodeId)
    if (refLayoutPos && refActualPos) {
      const dx = refActualPos.x - refLayoutPos.x
      const dy = refActualPos.y - refLayoutPos.y
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        result.nodes = result.nodes.map(n => {
          if (!savedPositions.has(n.id)) {
            return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          }
          return n
        })
      }
    }
  }
  return result
}

// ============================================================
// Tree <-> Flow data conversion
// ============================================================
export function treesToFlowData(roots, crossConnections = []) {
  const nodes = []
  const edges = []
  let idCounter = 1

  function traverse(node, parentId = null) {
    const id = node.id || `node-${idCounter++}`
    nodes.push({
      id,
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: {
        label: node.text || '新节点',
        media: node.media || [],
        layout: node.layout || 'vertical'
      }
    })

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: 'mindmap'
      })
    }

    if (node.children) {
      node.children.forEach((child) => traverse(child, id))
    }

    return id
  }

  const rootArray = Array.isArray(roots) ? roots : [roots]
  rootArray.forEach((root) => traverse(root))

  crossConnections.forEach((conn) => {
    edges.push({
      id: `cross-${conn.fromNodeId}-${conn.toNodeId}`,
      source: conn.fromNodeId,
      target: conn.toNodeId,
      type: 'crossConnection',
      label: conn.label || '',
      data: { crossConnection: true }
    })
  })

  return { nodes, edges }
}

export function flowDataToTrees(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [
    n.id,
    {
      id: n.id,
      text: n.data.label,
      children: [],
      media: n.data.media || [],
      layout: n.data.layout
    }
  ]))
  const childIds = new Set()
  const crossConnections = []

  edges.forEach((edge) => {
    if (edge.data?.crossConnection || edge.type === 'crossConnection') {
      crossConnections.push({
        fromNodeId: edge.source,
        toNodeId: edge.target,
        label: edge.label || ''
      })
      return
    }

    const parent = nodeMap.get(edge.source)
    const child = nodeMap.get(edge.target)
    if (parent && child) {
      parent.children.push(child)
      childIds.add(child.id)
    }
  })

  const rootIds = nodes.filter((n) => !childIds.has(n.id)).map((n) => n.id)
  const roots = rootIds.map((id) => nodeMap.get(id)).filter(Boolean)

  return { roots, crossConnections }
}

// ============================================================
// Markdown export/import
// ============================================================
export function exportToMarkdown(roots, crossConnections = []) {
  let md = '# 思维导图\n\n'

  roots.forEach((root, index) => {
    if (root.layout === 'horizontal') {
      md += '<!-- layout: horizontal -->\n'
    }
    md += `## ${root.text}\n\n`

    function traverse(node, level = 1) {
      const indent = '  '.repeat(level - 1)
      const prefix = level === 1 ? '1.' : '-'

      let mediaLines = ''
      if (node.media && node.media.length > 0) {
        mediaLines = node.media.map((m) => {
          const typeName = m.type === 'video' ? '视频' : '图片'
          return `${indent}  - [${typeName}:${m.fileName || '未命名'}]`
        }).join('\n')
        if (mediaLines) mediaLines = '\n' + mediaLines
      }

      let connLines = ''
      const nodeConns = crossConnections.filter((c) => c.fromNodeId === node.id)
      if (nodeConns.length > 0) {
        connLines = nodeConns.map((c) => {
          return `${indent}  - [连接到:${c.toNodeId}]`
        }).join('\n')
        if (connLines) connLines = '\n' + connLines
      }

      md += `${indent}${prefix} **${node.text}**${mediaLines}${connLines}\n`

      if (node.children) {
        node.children.forEach((child) => traverse(child, level + 1))
      }
    }

    if (root.children) {
      root.children.forEach((child) => traverse(child, 1))
    }

    md += '\n'
  })

  return md.trim() || '# 思维导图\n\n*空思维导图*'
}

export function importFromMarkdown(md) {
  const lines = md.split('\n').filter((l) => l.trim())
  const roots = []
  let currentRoot = null
  let stack = []
  let lastLayoutComment = null

  lines.forEach((line) => {
    const rootMatch = line.match(/^##\s+(.+)$/)
    if (rootMatch) {
      currentRoot = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: rootMatch[1].trim(),
        children: [],
        layout: lastLayoutComment || 'vertical'
      }
      roots.push(currentRoot)
      stack = []
      lastLayoutComment = null
      return
    }

    const layoutMatch = line.match(/^<!--\s*layout:\s*(horizontal|vertical)\s*-->$/)
    if (layoutMatch) {
      lastLayoutComment = layoutMatch[1]
      return
    }

    const mediaMatch = line.match(/^\s*-?\s*\[(图片|视频):(.+?)\]/)
    if (mediaMatch) return

    const connMatch = line.match(/^\s*-?\s*\[连接到:(.+?)\]/)
    if (connMatch) return

    const match = line.match(/^(\s*)(?:[-*]|\d+\.)\s*\*\*(.+?)\*\*/)
    if (!match) return

    const indent = match[1].length
    const text = match[2].trim()
    const level = Math.floor(indent / 2) + 1

    if (!currentRoot) {
      currentRoot = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: '中心主题',
        children: []
      }
      roots.push(currentRoot)
    }

    const node = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      children: []
    }

    if (level === 1) {
      currentRoot.children.push(node)
      stack = [{ node, level }]
    } else {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node
        parent.children.push(node)
      } else {
        currentRoot.children.push(node)
      }

      stack.push({ node, level })
    }
  })

  return roots.length > 0 ? roots : [{ id: 'root', text: '中心主题', children: [] }]
}
