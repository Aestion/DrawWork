import { useCallback, useEffect, useRef, useState } from 'react'
import { useYjs } from './useYjs'
import api from '../lib/axios'

// Convert React Flow nodes to Yjs format
export function nodesToYjs(nodes) {
  return nodes.map(node => ({
    id: node.id,
    text: node.data?.label || '',
    media: node.data?.media || [],
    position: node.position,
    collapsed: node.data?.collapsed || false,
    layout: node.data?.layout || 'horizontal',
    style: node.data?.style || {}
  }))
}

// Convert Yjs format to React Flow nodes
export function yjsToNodes(yjsNodes, canEdit) {
  return (yjsNodes || []).map(n => ({
    id: n.id,
    type: 'mindNode',
    position: n.position || { x: 0, y: 0 },
    data: {
      label: n.text || '',
      media: n.media || [],
      collapsed: n.collapsed || false,
      layout: n.layout || 'horizontal',
      style: n.style || {},
      canEdit
    }
  }))
}

// Convert React Flow edges to Yjs format
export function edgesToYjs(edges) {
  return edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type || 'mindmap',  // 修正：使用 mindmap 类型而不是 smoothstep
    label: edge.label || ''
  }))
}

// Convert Yjs format to React Flow edges
export function yjsToEdges(yjsEdges) {
  return (yjsEdges || []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type || 'mindmap',  // 修正：使用 mindmap 类型而不是 smoothstep
    label: e.label || ''
  }))
}

// Reconstruct nodes/edges from Y.Map. Primary format is a single '__mm_state' key
// storing { nodes, edges } as a monolithic JSON blob. Falls back to per-element
// keys (__mm_node_{id}, __mm_edge_{id}) and old monolithic 'nodes'/'edges' keys.
function extractMindMapData(yMap) {
  const json = yMap.toJSON()
  // Primary: single __mm_state key (avoids Yjs key collision bug with per-element keys)
  if (json.__mm_state) {
    return { nodes: json.__mm_state.nodes || [], edges: json.__mm_state.edges || [] }
  }
  // Fallback: per-element keys
  const nodes = []
  const edges = []
  for (const key of Object.keys(json)) {
    if (key.startsWith('__mm_node_')) nodes.push(json[key])
    if (key.startsWith('__mm_edge_')) edges.push(json[key])
  }
  if (nodes.length > 0 || edges.length > 0) return { nodes, edges }
  // Backward compat: old monolithic arrays
  if (Array.isArray(json.nodes)) nodes.push(...json.nodes)
  if (Array.isArray(json.edges)) edges.push(...json.edges)
  return { nodes, edges }
}

export function useMindMapYjs({ canvasId, roomId, token, canEdit }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [remoteUpdateVersion, setRemoteUpdateVersion] = useState(0)

  const debounceRef = useRef(null)
  const initialDataLoaded = useRef(false)
  const isApplyingRemoteUpdate = useRef(false)
  const pendingLocalUpdate = useRef(false)

  // Debug log removed

  const {
    connected,
    synced,
    onlineCount,
    awareness,
    updateAwareness: updateYjsAwareness,
    yMap
  } = useYjs(roomId, token, { type: 'mindmap' })


  // Reset loading state when canvas changes
  useEffect(() => {
    initialDataLoaded.current = false
    setLoading(true)
    setNodes([])
    setEdges([])
  }, [canvasId])

  // Track latest nodes/edges via refs so syncToYjs always has current data
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  // Sync local changes to Yjs (debounced) — stores all data as a single '__mm_state' key
  // to avoid a Yjs internal bug where writing keys with shared prefixes (e.g. __mm_node_*
  // and __mm_edge_*) in the same transaction causes data loss.
  const syncToYjs = useCallback(() => {
    if (!yMap || !canEdit) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        yMap.doc.transact(() => {
          const currentNodes = nodesToYjs(nodesRef.current)
          const currentEdges = edgesToYjs(edgesRef.current)
          yMap.set('__mm_state', { nodes: currentNodes, edges: currentEdges })
        }, 'local-mindmap-change')
      } catch (err) {
        console.error('[useMindMapYjs] Failed to sync to Yjs:', err)
      }
    }, 100)
  }, [yMap, canEdit])

  // Listen for remote changes from Yjs
  useEffect(() => {
    if (!yMap) return

    const observer = (event) => {
      // Only process remote changes
      if (event.transaction?.origin === 'local-mindmap-change') {
        return
      }

      const { nodes: yjsNodes, edges: yjsEdges } = extractMindMapData(yMap)
      if (!yjsNodes.length && !yjsEdges.length) return

      isApplyingRemoteUpdate.current = true
      const newNodes = yjsToNodes(yjsNodes, canEdit)
      const newEdges = yjsToEdges(yjsEdges)

      setNodes(newNodes)
      setEdges(newEdges)
      setLoading(false)
      initialDataLoaded.current = true

      isApplyingRemoteUpdate.current = false
      setRemoteUpdateVersion((v) => v + 1)
    }

    yMap.observe(observer)
    return () => yMap.unobserve(observer)
  }, [yMap, canEdit])

  // Load initial data when synced (with fallback if WebSocket fails)
  const yMapRef = useRef(null)
  const fallbackTimeoutRef = useRef(null)
  if (yMap) yMapRef.current = yMap

  // Fallback: load from HTTP if WebSocket doesn't connect within 5 seconds
  useEffect(() => {
    if (!yMap || initialDataLoaded.current || loading === false) return

    fallbackTimeoutRef.current = setTimeout(() => {
      if (initialDataLoaded.current) return

      const loadFromHttp = async () => {
        try {
          const { nodes: yjsNodes, edges: yjsEdges } = extractMindMapData(yMapRef.current)

          if (yjsNodes.length > 0) {
            setNodes(yjsToNodes(yjsNodes, canEdit))
            setEdges(yjsToEdges(yjsEdges))
          } else {
            // Try loading from HTTP API
            try {
              const res = await api.get(`/canvases/${canvasId}/mindmap`)
              const roots = res.data.roots || (res.data.root_node ? [res.data.root_node] : [])
              const crossConnections = res.data.crossConnections || []

              if (roots.length > 0) {
                const { nodes: newNodes, edges: newEdges } = convertRootsToFlowData(roots, crossConnections, canEdit)
                setNodes(newNodes)
                setEdges(newEdges)
              } else {
                // Create default root node
                const defaultNode = createDefaultNode(canEdit)
                setNodes([defaultNode])
                setEdges([])
              }
            } catch (err) {
              if (err.response?.status === 404) {
                const defaultNode = createDefaultNode(canEdit)
                setNodes([defaultNode])
                setEdges([])
              } else {
                throw err
              }
            }
          }
          initialDataLoaded.current = true
          setLoading(false)
        } catch (err) {
          console.error('[useMindMapYjs] Fallback load failed:', err)
          setError(err.message)
          setLoading(false)
        }
      }

      loadFromHttp()
    }, 2000)

    return () => {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current)
      }
    }
  }, [yMap, canvasId, canEdit, loading])

  // Primary: Load from localStorage FIRST, then Yjs, then API
  useEffect(() => {
    if (!yMap || !synced || initialDataLoaded.current) return

    const loadData = async () => {
      try {
        // === 策略 1: 优先检查 LocalStorage 备份 ===
        const backupKey = 'drawwork_mm_backup_' + canvasId
        const backupJson = localStorage.getItem(backupKey)
        if (backupJson) {
          try {
            const backup = JSON.parse(backupJson)
            if (backup?.nodes?.length > 0) {
              // Load from local backup first (user's last edits before refresh)
              setNodes(yjsToNodes(backup.nodes, canEdit))
              setEdges(yjsToEdges(backup.edges))
              initialDataLoaded.current = true
              setLoading(false)

              // Clear fallback timer since we already loaded
              if (fallbackTimeoutRef.current) {
                clearTimeout(fallbackTimeoutRef.current)
                fallbackTimeoutRef.current = null
              }

              // Sync backup to Yjs in background
              syncToYjs()

              // Also save backup to API in background
              const saveBackupToApi = async () => {
                try {
                  const currentNodes = backup.nodes
                  const currentEdges = backup.edges

                  const roots = []
                  const crossConnections = []

                  const rootNodes = currentNodes.filter(n => !currentEdges.some(e => e.target === n.id && !e.data?.crossConnection))

                  for (const root of rootNodes) {
                    const buildTree = (nodeId) => {
                      const node = currentNodes.find(n => n.id === nodeId)
                      if (!node) return null

                      const childrenEdges = currentEdges.filter(e => e.source === nodeId && !e.data?.crossConnection)
                      const children = []

                      for (const edge of childrenEdges) {
                        const child = buildTree(edge.target)
                        if (child) children.push(child)
                      }

                      return {
                        id: node.id,
                        text: node.text,
                        media: node.media || [],
                        position: node.position,
                        collapsed: node.collapsed || false,
                        layout: node.layout || 'horizontal',
                        style: node.style || {},
                        children
                      }
                    }
                    roots.push(buildTree(root.id))
                  }

                  const crossEdges = currentEdges.filter(e => e.data?.crossConnection)
                  crossEdges.forEach(edge => {
                    crossConnections.push({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || '' })
                  })

                  if (roots.length > 0) {
                    await api.put(`/canvases/${canvasId}/mindmap`, { roots, crossConnections, layout: 'vertical' })
                  }
                } catch (e) { /* ignore */ }
              }
              saveBackupToApi()

              // Keep backup for safety, remove only when confirmed saved
              setTimeout(() => {
                try { localStorage.removeItem(backupKey) } catch (e) {}
              }, 5000)

              return
            }
          } catch (e) { /* ignore parse error */ }
        }

        // === 策略 2: 从 Yjs 加载 ===
        const { nodes: yjsNodes, edges: yjsEdges } = extractMindMapData(yMap)

        if (yjsNodes.length > 0) {
          // Use Yjs data
          setNodes(yjsToNodes(yjsNodes, canEdit))
          setEdges(yjsToEdges(yjsEdges))
        } else {
          // Try loading from HTTP API
          try {
            const res = await api.get(`/canvases/${canvasId}/mindmap`)
            const roots = res.data.roots || (res.data.root_node ? [res.data.root_node] : [])
            const crossConnections = res.data.crossConnections || []

            if (roots.length > 0) {
              const { nodes: newNodes, edges: newEdges } = convertRootsToFlowData(roots, crossConnections, canEdit)
              setNodes(newNodes)
              setEdges(newEdges)
              syncToYjs()
            } else {
              // Create default root node
              const defaultNode = createDefaultNode(canEdit)
              setNodes([defaultNode])
              setEdges([])
              syncToYjs()
            }
          } catch (err) {
            // Network error
            console.warn('[useMindMapYjs] HTTP fallback failed:', err.message)
            const defaultNode = createDefaultNode(canEdit)
            setNodes([defaultNode])
            setEdges([])
            syncToYjs()
          }
        }

        initialDataLoaded.current = true
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current)
          fallbackTimeoutRef.current = null
        }
        setLoading(false)
      } catch (err) {
        console.error('[useMindMapYjs] Failed to load data:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadData()
  }, [yMap, synced, canEdit, syncToYjs, canvasId])

  // Wrapped setNodes - updates local state and syncs to Yjs
  const updateNodes = useCallback((updater) => {
    setNodes(prev => {
      const newNodes = typeof updater === 'function' ? updater(prev) : updater
      nodesRef.current = newNodes
      syncToYjs()
      return newNodes
    })
  }, [syncToYjs])

  // Wrapped setEdges - updates local state and syncs to Yjs
  const updateEdges = useCallback((updater) => {
    setEdges(prev => {
      const newEdges = typeof updater === 'function' ? updater(prev) : updater
      edgesRef.current = newEdges
      syncToYjs()
      return newEdges
    })
  }, [syncToYjs])

  // Combined setter — sets both nodes and edges with a single sync (for undo/redo)
  const setNodesAndEdges = useCallback((newNodes, newEdges) => {
    setNodes(newNodes)
    setEdges(newEdges)
    nodesRef.current = newNodes
    edgesRef.current = newEdges
    syncToYjs()
  }, [syncToYjs])

  // Update awareness when selection changes
  const updateAwareness = useCallback((data) => {
    updateYjsAwareness({ mindmap: data })
  }, [updateYjsAwareness])

  // Get other users' awareness states
  const [awarenessStates, setAwarenessStates] = useState(new Map())

  useEffect(() => {
    if (!awareness) return

    const updateStates = () => {
      const states = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (state.mindmap) {
          states.set(clientId, state)
        }
      })
      setAwarenessStates(states)
    }

    awareness.on('change', updateStates)
    updateStates()

    return () => awareness.off('change', updateStates)
  }, [awareness])

  // Auto-save to HTTP API when data changes (fast debounce)
  useEffect(() => {
    if (!canvasId || !canEdit) return

    // Don't auto-save for empty state (default node only)
    if (nodes.length === 0) return
    if (nodes.length === 1 && nodes[0].data.label === '中心主题') return

    const autoSaveTimer = setTimeout(() => {
      const saveToApi = async () => {
        try {
          const currentNodes = nodesRef.current
          const currentEdges = edgesRef.current

          // Convert to roots and cross connections format
          const roots = []
          const crossConnections = []

          // Find root nodes
          const rootNodes = currentNodes.filter(n => !currentEdges.some(e => e.target === n.id && !e.data?.crossConnection))

          for (const root of rootNodes) {
            const buildTree = (nodeId) => {
              const node = currentNodes.find(n => n.id === nodeId)
              if (!node) return null

              const childrenEdges = currentEdges.filter(e => e.source === nodeId && !e.data?.crossConnection)
              const children = []

              for (const edge of childrenEdges) {
                const child = buildTree(edge.target)
                if (child) children.push(child)
              }

              return {
                id: node.id,
                text: node.data.label,
                media: node.data.media || [],
                position: node.position,
                collapsed: node.data.collapsed || false,
                layout: node.data.layout || 'horizontal',
                style: node.data.style || {},
                children
              }
            }

            roots.push(buildTree(root.id))
          }

          // Find cross connections
          const crossEdges = currentEdges.filter(e => e.data?.crossConnection)
          crossEdges.forEach(edge => {
            crossConnections.push({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              label: edge.label || ''
            })
          })

          await api.put(`/canvases/${canvasId}/mindmap`, {
            roots,
            crossConnections,
            layout: 'vertical'
          })
          // console.log('[useMindMapYjs] Auto-save to API succeeded')
        } catch (err) {
          console.error('[useMindMapYjs] Auto-save to API failed:', err.message)
        }
      }

      saveToApi()
    }, 500)  // 500ms 快速保存

    return () => clearTimeout(autoSaveTimer)
  }, [nodes, edges, canvasId, canEdit])

  // LocalStorage backup for persistence on page refresh
  useEffect(() => {
    if (!canvasId) return

    const handleBeforeUnload = () => {
      try {
        const backup = {
          nodes: nodesToYjs(nodesRef.current),
          edges: edgesToYjs(edgesRef.current)
        }
        localStorage.setItem('drawwork_mm_backup_' + canvasId, JSON.stringify(backup))
      } catch (e) { /* localStorage full or unavailable */ }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [canvasId])

  return {
    nodes,
    edges,
    setNodes: updateNodes,
    setEdges: updateEdges,
    setNodesAndEdges,
    // Raw setters — update local state without triggering Yjs sync.
    // Used for layout recalculation after remote updates, where the data
    // already came from Yjs and syncing back would cause a broadcast loop.
    setNodesLocal: setNodes,
    setEdgesLocal: setEdges,
    loading,
    error,
    connected,
    synced,
    onlineCount,
    awareness,
    awarenessStates,
    updateAwareness,
    remoteUpdateVersion
  }
}

// Helper functions
function createDefaultNode(canEdit) {
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'mindNode',
    position: { x: 0, y: 0 },
    data: {
      label: '中心主题',
      media: [],
      collapsed: false,
      layout: 'horizontal',
      canEdit
    }
  }
}

function convertRootsToFlowData(roots, crossConnections, canEdit) {
  const nodes = []
  const edges = []
  let idCounter = 1

  function traverse(node, parentId = null, depth = 0) {
    const id = node.id || `node-${idCounter++}`

    nodes.push({
      id,
      type: 'mindNode',
      position: { x: depth * 150, y: nodes.length * 80 },
      data: {
        label: node.text || '新节点',
        media: node.media || [],
        collapsed: false,
        layout: node.layout || 'horizontal',
        canEdit
      }
    })

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: 'mindmap'  // 修正：使用 mindmap 类型而不是 smoothstep
      })
    }

    if (node.children) {
      node.children.forEach(child => traverse(child, id, depth + 1))
    }
  }

  roots.forEach(root => traverse(root))

  // Add cross connections
  crossConnections.forEach(conn => {
    edges.push({
      id: conn.id || `cross-${conn.source}-${conn.target}`,
      source: conn.source,
      target: conn.target,
      type: 'crossConnection',
      label: conn.label || ''
    })
  })

  return { nodes, edges }
}
