import { useCallback, useEffect, useRef, useState } from 'react'
import { useYjs } from './useYjs'
import api from '../lib/axios'

// Convert columns array to Yjs format (per-element storage)
export function columnsToYjs(columns) {
  return columns.map(col => ({
    id: col.id,
    title: col.title,
    order: col.order
  }))
}

// Convert Yjs format to columns array
export function yjsToColumns(yjsColumns) {
  return (yjsColumns || []).map(c => ({
    id: c.id,
    title: c.title,
    order: c.order
  }))
}

// Convert cards array to Yjs format (per-element storage)
export function cardsToYjs(cards) {
  return cards.map(card => ({
    id: card.id,
    title: card.title,
    columnId: card.columnId,
    order: card.order,
    createdAt: card.createdAt || Date.now()
  }))
}

// Convert Yjs format to cards array
export function yjsToCards(yjsCards) {
  return (yjsCards || []).map(c => ({
    id: c.id,
    title: c.title,
    columnId: c.columnId,
    order: c.order,
    createdAt: c.createdAt
  }))
}

function isDeletedRecord(record) {
  return record?.__deleted === true
}

// Extract kanban data from per-element Y.Map keys.
// Tombstone records represent explicit deletes and are filtered from UI state.
// Falls back to old monolithic keys for backward compatibility.
export function extractKanbanData(yMap) {
  const json = yMap.toJSON()
  const columns = []
  const cards = []

  for (const key of Object.keys(json)) {
    if (key.startsWith('__col_') && !isDeletedRecord(json[key])) columns.push(json[key])
    if (key.startsWith('__card_') && !isDeletedRecord(json[key])) cards.push(json[key])
  }

  // Backward compat: old format stored monolithic arrays
  if (columns.length === 0 && Array.isArray(json.columns)) {
    columns.push(...json.columns)
  }
  if (cards.length === 0 && Array.isArray(json.cards)) {
    cards.push(...json.cards)
  }

  return { columns, cards }
}

export function writeKanbanDataToYjs(yMap, { columns, cards }, { deletedColumnIds = [], deletedCardIds = [] } = {}) {
  const now = Date.now()
  const currentColumns = columnsToYjs(columns || [])
  const currentCards = cardsToYjs(cards || [])

  for (const col of currentColumns) {
    yMap.set('__col_' + col.id, col)
  }
  for (const colId of deletedColumnIds) {
    yMap.set('__col_' + colId, { id: colId, __deleted: true, deletedAt: now })
  }

  for (const card of currentCards) {
    yMap.set('__card_' + card.id, card)
  }
  for (const cardId of deletedCardIds) {
    yMap.set('__card_' + cardId, { id: cardId, __deleted: true, deletedAt: now })
  }
}

export function useKanbanYjs({ canvasId, roomId, token, canEdit }) {
  const [columns, setColumns] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [remoteUpdateVersion, setRemoteUpdateVersion] = useState(0)

  const debounceRef = useRef(null)
  const initialDataLoaded = useRef(false)
  const isApplyingRemoteUpdate = useRef(false)
  const deletedColumnIdsRef = useRef(new Set())
  const deletedCardIdsRef = useRef(new Set())

  const {
    connected,
    synced,
    onlineCount,
    awareness,
    updateAwareness: updateYjsAwareness,
    yMap
  } = useYjs(roomId, token, { type: 'kanban' })

  // Reset loading state when canvas changes
  useEffect(() => {
    initialDataLoaded.current = false
    setLoading(true)
    setColumns([])
    setCards([])
  }, [canvasId])

  // Track latest columns/cards via refs so syncToYjs always has current data
  const columnsRef = useRef(columns)
  const cardsRef = useRef(cards)

  useEffect(() => {
    columnsRef.current = columns
    cardsRef.current = cards
  }, [columns, cards])

  // Sync local changes to Yjs (debounced) — stores each column/card as individual
  // Y.Map key so CRDT merges correctly when two users edit concurrently.
  const syncToYjs = useCallback(() => {
    if (!yMap || !canEdit) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        yMap.doc.transact(() => {
          writeKanbanDataToYjs(
            yMap,
            { columns: columnsRef.current, cards: cardsRef.current },
            {
              deletedColumnIds: [...deletedColumnIdsRef.current],
              deletedCardIds: [...deletedCardIdsRef.current]
            }
          )
          deletedColumnIdsRef.current.clear()
          deletedCardIdsRef.current.clear()
        }, 'local-kanban-change')
      } catch (err) {
        console.error('[useKanbanYjs] Failed to sync to Yjs:', err)
      }
    }, 200) // Reduced debounce for faster sync
  }, [yMap, canEdit])

  // Listen for remote changes from Yjs
  useEffect(() => {
    if (!yMap) return

    const observer = (event) => {
      // Only process remote changes
      if (event.transaction?.origin === 'local-kanban-change') {
        return
      }

      const { columns: yjsColumns, cards: yjsCards } = extractKanbanData(yMap)

      if (!yjsColumns.length && !yjsCards.length) return

      isApplyingRemoteUpdate.current = true
      setColumns(yjsToColumns(yjsColumns))
      setCards(yjsToCards(yjsCards))
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
          const { columns: yjsColumns, cards: yjsCards } = extractKanbanData(yMapRef.current)

          if (yjsColumns.length > 0) {
            setColumns(yjsToColumns(yjsColumns))
            setCards(yjsToCards(yjsCards))
          } else {
            // Try loading from HTTP API
            try {
              const res = await api.get(`/canvases/${canvasId}/kanban`)
              if (res.data.columns) {
                const loadedColumns = res.data.columns
                const loadedCards = res.data.cards || []
                setColumns(loadedColumns)
                setCards(loadedCards)
                // Sync to Yjs
                columnsRef.current = loadedColumns
                cardsRef.current = loadedCards
                syncToYjs()
              } else {
                // Create default columns
                const defaultCols = [
                  { id: 'col-1', title: '待办', order: 0 },
                  { id: 'col-2', title: '进行中', order: 1 },
                  { id: 'col-3', title: '已完成', order: 2 }
                ]
                setColumns(defaultCols)
                setCards([])
                columnsRef.current = defaultCols
                cardsRef.current = []
                syncToYjs()
              }
            } catch (err) {
              if (err.response?.status === 404) {
                const defaultCols = [
                  { id: 'col-1', title: '待办', order: 0 },
                  { id: 'col-2', title: '进行中', order: 1 },
                  { id: 'col-3', title: '已完成', order: 2 }
                ]
                setColumns(defaultCols)
                setCards([])
                columnsRef.current = defaultCols
                cardsRef.current = []
                syncToYjs()
              } else {
                throw err
              }
            }
          }
          initialDataLoaded.current = true
          setLoading(false)
        } catch (err) {
          console.error('[useKanbanYjs] Fallback load failed:', err)
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
        const { columns: yjsColumns, cards: yjsCards } = extractKanbanData(yMap)

        if (yjsColumns.length > 0) {
          // Use Yjs data
          setColumns(yjsToColumns(yjsColumns))
          setCards(yjsToCards(yjsCards))
        } else {
          // Try loading from HTTP API
          try {
            const res = await api.get(`/canvases/${canvasId}/kanban`)
            if (res.data.columns) {
              const loadedColumns = res.data.columns
              const loadedCards = res.data.cards || []
              setColumns(loadedColumns)
              setCards(loadedCards)
              // Sync initial data to Yjs
              columnsRef.current = loadedColumns
              cardsRef.current = loadedCards
              syncToYjs()
            } else {
              // Create default columns
              const defaultCols = [
                { id: 'col-1', title: '待办', order: 0 },
                { id: 'col-2', title: '进行中', order: 1 },
                { id: 'col-3', title: '已完成', order: 2 }
              ]
              setColumns(defaultCols)
              setCards([])
              columnsRef.current = defaultCols
              cardsRef.current = []
              syncToYjs()
            }
          } catch (err) {
            console.warn('[useKanbanYjs] HTTP fallback failed:', err.message)
            const defaultCols = [
              { id: 'col-1', title: '待办', order: 0 },
              { id: 'col-2', title: '进行中', order: 1 },
              { id: 'col-3', title: '已完成', order: 2 }
            ]
            setColumns(defaultCols)
            setCards([])
            columnsRef.current = defaultCols
            cardsRef.current = []
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
        console.error('[useKanbanYjs] Failed to load data:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadData()
  }, [yMap, synced, canEdit, syncToYjs, canvasId])

  // Wrapped setColumns - updates local state and syncs to Yjs
  const updateColumns = useCallback((updater) => {
    setColumns(prev => {
      const newColumns = typeof updater === 'function' ? updater(prev) : updater
      const nextIds = new Set(newColumns.map((col) => col.id))
      prev.forEach((col) => {
        if (!nextIds.has(col.id)) deletedColumnIdsRef.current.add(col.id)
      })
      columnsRef.current = newColumns
      syncToYjs()
      return newColumns
    })
  }, [syncToYjs])

  // Wrapped setCards - updates local state and syncs to Yjs
  const updateCards = useCallback((updater) => {
    setCards(prev => {
      const newCards = typeof updater === 'function' ? updater(prev) : updater
      const nextIds = new Set(newCards.map((card) => card.id))
      prev.forEach((card) => {
        if (!nextIds.has(card.id)) deletedCardIdsRef.current.add(card.id)
      })
      cardsRef.current = newCards
      syncToYjs()
      return newCards
    })
  }, [syncToYjs])

  // Combined setter — sets both columns and cards with a single sync
  const setColumnsAndCards = useCallback((newColumns, newCards) => {
    const nextColumnIds = new Set(newColumns.map((col) => col.id))
    columnsRef.current.forEach((col) => {
      if (!nextColumnIds.has(col.id)) deletedColumnIdsRef.current.add(col.id)
    })
    const nextCardIds = new Set(newCards.map((card) => card.id))
    cardsRef.current.forEach((card) => {
      if (!nextCardIds.has(card.id)) deletedCardIdsRef.current.add(card.id)
    })
    setColumns(newColumns)
    setCards(newCards)
    columnsRef.current = newColumns
    cardsRef.current = newCards
    syncToYjs()
  }, [syncToYjs])

  // Update awareness
  const updateAwareness = useCallback((data) => {
    updateYjsAwareness({ kanban: data })
  }, [updateYjsAwareness])

  // Get other users' awareness states
  const [awarenessStates, setAwarenessStates] = useState(new Map())

  useEffect(() => {
    if (!awareness) return

    const updateStates = () => {
      const states = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (state.kanban) {
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
    columns,
    cards,
    setColumns: updateColumns,
    setCards: updateCards,
    setColumnsAndCards,
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
