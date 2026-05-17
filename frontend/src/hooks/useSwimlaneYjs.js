import { useCallback, useEffect, useRef, useState } from 'react'
import { useYjs } from './useYjs'
import api from '../lib/axios'

// Convert lanes array to Yjs format
export function lanesToYjs(lanes) {
  return lanes.map(lane => ({
    id: lane.id,
    title: lane.title,
    order: lane.order
  }))
}

// Convert Yjs format to lanes array
export function yjsToLanes(yjsLanes) {
  return (yjsLanes || []).map(l => ({
    id: l.id,
    title: l.title,
    order: l.order
  }))
}

// Convert elements array to Yjs format
export function elementsToYjs(elements) {
  return elements.map(el => ({
    id: el.id,
    type: el.type,
    title: el.title,
    laneId: el.laneId,
    order: el.order,
    createdAt: el.createdAt || Date.now()
  }))
}

// Convert Yjs format to elements array
export function yjsToElements(yjsElements) {
  return (yjsElements || []).map(e => ({
    id: e.id,
    type: e.type,
    title: e.title,
    laneId: e.laneId,
    order: e.order,
    createdAt: e.createdAt
  }))
}

// Extract swimlane data from per-element Y.Map keys
// Falls back to old monolithic keys for backward compatibility
function extractSwimlaneData(yMap) {
  const json = yMap.toJSON()
  const lanes = []
  const elements = []

  for (const key of Object.keys(json)) {
    if (key.startsWith('__sl_lane_')) lanes.push(json[key])
    if (key.startsWith('__sl_elem_')) elements.push(json[key])
  }

  // Backward compat: old format stored monolithic arrays
  if (lanes.length === 0 && Array.isArray(json.lanes)) {
    lanes.push(...json.lanes)
  }
  if (elements.length === 0 && Array.isArray(json.elements)) {
    elements.push(...json.elements)
  }

  return {
    direction: json.direction || json.__sl_direction || 'horizontal',
    lanes,
    elements
  }
}

export function useSwimlaneYjs({ canvasId, roomId, token, canEdit }) {
  const [direction, setDirection] = useState('horizontal')
  const [lanes, setLanes] = useState([])
  const [elements, setElements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [remoteUpdateVersion, setRemoteUpdateVersion] = useState(0)

  const debounceRef = useRef(null)
  const initialDataLoaded = useRef(false)
  const isApplyingRemoteUpdate = useRef(false)

  const {
    connected,
    synced,
    onlineCount,
    awareness,
    updateAwareness: updateYjsAwareness,
    yMap
  } = useYjs(roomId, token, { type: 'swimlane' })

  // Reset loading state when canvas changes
  useEffect(() => {
    initialDataLoaded.current = false
    setLoading(true)
    setDirection('horizontal')
    setLanes([])
    setElements([])
  }, [canvasId])

  // Track latest state via refs so syncToYjs always has current data
  const directionRef = useRef(direction)
  const lanesRef = useRef(lanes)
  const elementsRef = useRef(elements)

  useEffect(() => {
    directionRef.current = direction
    lanesRef.current = lanes
    elementsRef.current = elements
  }, [direction, lanes, elements])

  // Sync local changes to Yjs (debounced) — stores each lane/element as individual
  // Y.Map key so CRDT merges correctly when two users edit concurrently.
  const syncToYjs = useCallback(() => {
    if (!yMap || !canEdit) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        yMap.doc.transact(() => {
          // Store direction as simple key (scalar, no conflict issues)
          yMap.set('__sl_direction', directionRef.current)

          // Write lanes individually for CRDT merge
          const currentLanes = lanesToYjs(lanesRef.current)
          const laneIds = new Set()
          for (const lane of currentLanes) {
            laneIds.add(lane.id)
            yMap.set('__sl_lane_' + lane.id, lane)
          }
          // Remove deleted lanes
          const laneKeysToDelete = []
          yMap.forEach((value, key) => {
            if (key.startsWith('__sl_lane_') && !laneIds.has(key.slice(10))) {
              laneKeysToDelete.push(key)
            }
          })
          for (const key of laneKeysToDelete) yMap.delete(key)

          // Write elements individually
          const currentElements = elementsToYjs(elementsRef.current)
          const elemIds = new Set()
          for (const el of currentElements) {
            elemIds.add(el.id)
            yMap.set('__sl_elem_' + el.id, el)
          }
          // Remove deleted elements
          const elemKeysToDelete = []
          yMap.forEach((value, key) => {
            if (key.startsWith('__sl_elem_') && !elemIds.has(key.slice(10))) {
              elemKeysToDelete.push(key)
            }
          })
          for (const key of elemKeysToDelete) yMap.delete(key)
        }, 'local-swimlane-change')
      } catch (err) {
        console.error('[useSwimlaneYjs] Failed to sync to Yjs:', err)
      }
    }, 200) // Reduced debounce for faster sync
  }, [yMap, canEdit])

  // Listen for remote changes from Yjs
  useEffect(() => {
    if (!yMap) return

    const observer = (event) => {
      // Only process remote changes
      if (event.transaction?.origin === 'local-swimlane-change') {
        return
      }

      const { direction: yjsDirection, lanes: yjsLanes, elements: yjsElements } = extractSwimlaneData(yMap)

      if (!yjsLanes.length && !yjsElements.length) return

      isApplyingRemoteUpdate.current = true
      setDirection(yjsDirection || 'horizontal')
      setLanes(yjsToLanes(yjsLanes))
      setElements(yjsToElements(yjsElements))
      setLoading(false)
      initialDataLoaded.current = true

      // Reset flag after React processes the update
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false
        setRemoteUpdateVersion((v) => v + 1)
      }, 0)
    }

    yMap.observe(observer)
    return () => yMap.unobserve(observer)
  }, [yMap])

  // Load initial data when synced (with fallback if WebSocket fails)
  const yMapRef = useRef(null)
  const fallbackTimeoutRef = useRef(null)
  if (yMap) yMapRef.current = yMap

  // Fallback: load from HTTP if WebSocket doesn't connect within 2 seconds
  useEffect(() => {
    if (!yMap || initialDataLoaded.current || loading === false) return

    fallbackTimeoutRef.current = setTimeout(() => {
      if (initialDataLoaded.current) return

      const loadFromHttp = async () => {
        try {
          const { direction: yjsDirection, lanes: yjsLanes, elements: yjsElements } = extractSwimlaneData(yMapRef.current)

          if (yjsLanes.length > 0) {
            setDirection(yjsDirection || 'horizontal')
            setLanes(yjsToLanes(yjsLanes))
            setElements(yjsToElements(yjsElements))
          } else {
            // Try loading from HTTP API
            try {
              const res = await api.get(`/canvases/${canvasId}/swimlane`)
              if (res.data.lanes) {
                const loadedDirection = res.data.direction || 'horizontal'
                const loadedLanes = res.data.lanes || []
                const loadedElements = res.data.elements || []
                setDirection(loadedDirection)
                setLanes(loadedLanes)
                setElements(loadedElements)
                // Sync to Yjs
                directionRef.current = loadedDirection
                lanesRef.current = loadedLanes
                elementsRef.current = loadedElements
                syncToYjs()
              } else {
                const defaultLanes = [{ id: 'lane-1', title: '默认泳道', order: 0 }]
                setDirection('horizontal')
                setLanes(defaultLanes)
                setElements([])
                directionRef.current = 'horizontal'
                lanesRef.current = defaultLanes
                elementsRef.current = []
                syncToYjs()
              }
            } catch (err) {
              if (err.response?.status === 404) {
                const defaultLanes = [{ id: 'lane-1', title: '默认泳道', order: 0 }]
                setDirection('horizontal')
                setLanes(defaultLanes)
                setElements([])
                directionRef.current = 'horizontal'
                lanesRef.current = defaultLanes
                elementsRef.current = []
                syncToYjs()
              } else {
                throw err
              }
            }
          }
          initialDataLoaded.current = true
          setLoading(false)
        } catch (err) {
          console.error('[useSwimlaneYjs] Fallback load failed:', err)
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
  }, [yMap, canvasId, loading, syncToYjs])

  // Primary: Load from Yjs when synced
  useEffect(() => {
    if (!yMap || !synced || initialDataLoaded.current) return

    const loadData = async () => {
      try {
        const { direction: yjsDirection, lanes: yjsLanes, elements: yjsElements } = extractSwimlaneData(yMap)

        if (yjsLanes.length > 0) {
          // Use Yjs data
          setDirection(yjsDirection || 'horizontal')
          setLanes(yjsToLanes(yjsLanes))
          setElements(yjsToElements(yjsElements))
        } else {
          // Try loading from HTTP API
          try {
            const res = await api.get(`/canvases/${canvasId}/swimlane`)
            if (res.data.lanes) {
              const loadedDirection = res.data.direction || 'horizontal'
              const loadedLanes = res.data.lanes || []
              const loadedElements = res.data.elements || []
              setDirection(loadedDirection)
              setLanes(loadedLanes)
              setElements(loadedElements)
              // Sync initial data to Yjs
              directionRef.current = loadedDirection
              lanesRef.current = loadedLanes
              elementsRef.current = loadedElements
              syncToYjs()
            } else {
              const defaultLanes = [{ id: 'lane-1', title: '默认泳道', order: 0 }]
              setDirection('horizontal')
              setLanes(defaultLanes)
              setElements([])
              directionRef.current = 'horizontal'
              lanesRef.current = defaultLanes
              elementsRef.current = []
              syncToYjs()
            }
          } catch (err) {
            console.warn('[useSwimlaneYjs] HTTP fallback failed:', err.message)
            const defaultLanes = [{ id: 'lane-1', title: '默认泳道', order: 0 }]
            setDirection('horizontal')
            setLanes(defaultLanes)
            setElements([])
            directionRef.current = 'horizontal'
            lanesRef.current = defaultLanes
            elementsRef.current = []
            syncToYjs()
          }
        }

        initialDataLoaded.current = true
        // Clear fallback timeout
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current)
          fallbackTimeoutRef.current = null
        }
        setLoading(false)
      } catch (err) {
        console.error('[useSwimlaneYjs] Failed to load data:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadData()
  }, [yMap, synced, canEdit, syncToYjs, canvasId])

  // Wrapped setDirection - updates local state and syncs to Yjs
  const updateDirection = useCallback((updater) => {
    if (isApplyingRemoteUpdate.current) return

    setDirection(prev => {
      const newDirection = typeof updater === 'function' ? updater(prev) : updater
      directionRef.current = newDirection
      syncToYjs()
      return newDirection
    })
  }, [syncToYjs])

  // Wrapped setLanes - updates local state and syncs to Yjs
  const updateLanes = useCallback((updater) => {
    if (isApplyingRemoteUpdate.current) return

    setLanes(prev => {
      const newLanes = typeof updater === 'function' ? updater(prev) : updater
      lanesRef.current = newLanes
      syncToYjs()
      return newLanes
    })
  }, [syncToYjs])

  // Wrapped setElements - updates local state and syncs to Yjs
  const updateElements = useCallback((updater) => {
    if (isApplyingRemoteUpdate.current) return

    setElements(prev => {
      const newElements = typeof updater === 'function' ? updater(prev) : updater
      elementsRef.current = newElements
      syncToYjs()
      return newElements
    })
  }, [syncToYjs])

  // Combined setter — sets all state with a single sync
  const setAll = useCallback((newDirection, newLanes, newElements) => {
    if (isApplyingRemoteUpdate.current) return
    setDirection(newDirection)
    setLanes(newLanes)
    setElements(newElements)
    directionRef.current = newDirection
    lanesRef.current = newLanes
    elementsRef.current = newElements
    syncToYjs()
  }, [syncToYjs])

  // Update awareness
  const updateAwareness = useCallback((data) => {
    updateYjsAwareness({ swimlane: data })
  }, [updateYjsAwareness])

  // Get other users' awareness states
  const [awarenessStates, setAwarenessStates] = useState(new Map())

  useEffect(() => {
    if (!awareness) return

    const updateStates = () => {
      const states = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (state.swimlane) {
          states.set(clientId, state)
        }
      })
      setAwarenessStates(states)
    }

    awareness.on('change', updateStates)
    updateStates()

    return () => awareness.off('change', updateStates)
  }, [awareness])

  return {
    direction,
    lanes,
    elements,
    setDirection: updateDirection,
    setLanes: updateLanes,
    setElements: updateElements,
    setAll,
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
