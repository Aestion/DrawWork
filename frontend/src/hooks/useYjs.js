import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// Derive WebSocket URL: use VITE_YJS_WS_URL env, or route through Vite proxy /ws
function getWsUrl() {
  if (import.meta.env.VITE_YJS_WS_URL) {
    return import.meta.env.VITE_YJS_WS_URL
  }
  // Route through the Vite proxy at /ws (→ ws://localhost:3003)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

// Module-level connection registry
const connections = new Map()
const DESTROY_DELAY = 100  // Flush immediately after React unmount cycle

// Reconstruct elements array from per-element Y.Map keys (__el_{id}).
// Falls back to old monolithic 'elements' key for backward compatibility.
function extractData(yMap) {
  const json = yMap.toJSON()
  const elements = []
  for (const key of Object.keys(json)) {
    if (key.startsWith('__el_')) elements.push(json[key])
  }
  // Backward compat: old format stored elements as a single array
  if (elements.length === 0 && Array.isArray(json.elements)) {
    elements.push(...json.elements)
  }
  return {
    elements,
    appState: json.__appState || json.appState || {},
    files: json.__files || json.files || {}
  }
}

function getConnection(roomId, token, type = 'excalidraw') {
  const existing = connections.get(roomId)
  if (existing && existing.type === type) {
    // Cancel pending destruction
    if (existing.destroyTimer) {
      clearTimeout(existing.destroyTimer)
      existing.destroyTimer = null
    }
    existing.refCount++
    return existing
  }

  const doc = new Y.Doc()
  const yMap = doc.getMap(type)
  const wsUrl = getWsUrl()
  const provider = new WebsocketProvider(wsUrl, roomId, doc, {
    params: { token }
  })

  const conn = {
    type,
    doc,
    yMap,
    provider,
    awareness: provider.awareness,
    refCount: 1,
    destroyTimer: null,
    statusListeners: new Set(),
    syncListeners: new Set(),
    observers: new Set(),
    awarenessListeners: new Set(),
    pendingData: null,
    // 新增：状态防抖相关
    lastStatus: null,
    lastSync: null
  }

  // Wire up provider events to listeners
  provider.on('status', (event) => {
    // 状态防抖：只有在状态真正变化时才触发事件
    if (conn.lastStatus !== event.status) {
      conn.lastStatus = event.status
      conn.statusListeners.forEach((cb) => cb(event))
    }
  })

  provider.on('sync', (isSynced) => {
    // 状态防抖：只有在状态真正变化时才触发事件
    if (conn.lastSync !== isSynced) {
      conn.lastSync = isSynced
      conn.syncListeners.forEach((cb) => cb(isSynced))
    }
  })

  // Wire up awareness changes
  provider.awareness.on('change', () => {
    const states = Array.from(provider.awareness.getStates().keys())
    conn.awarenessListeners.forEach((cb) => cb(states.length, states))
  })

  connections.set(roomId, conn)
  return conn
}

function releaseConnection(roomId, type) {
  const conn = connections.get(roomId)
  if (!conn || conn.type !== type) return

  conn.refCount--
  if (conn.refCount <= 0) {
    // Flush pending data before scheduling destruction
    if (conn.pendingData) {
      const pending = conn.pendingData
      conn.pendingData = null
      try {
        conn.doc.transact(() => {
          for (const el of (pending.elements || [])) {
            conn.yMap.set('__el_' + el.id, el)
          }
          conn.yMap.set('__appState', pending.appState || {})
          conn.yMap.set('__files', pending.files || {})
        }, 'local-scene-change')
      } catch (err) {
        console.error('[useYjs] Failed to flush pending data:', err)
      }
    }

    // Delay destruction to handle remounts (StrictMode, etc.)
    conn.destroyTimer = setTimeout(() => {
      connections.delete(roomId)
      conn.provider.destroy()
      conn.doc.destroy()
    }, DESTROY_DELAY)
  }
}

export function useYjs(roomId, token, options = {}) {
  const { type = 'excalidraw' } = options
  const [connected, setConnected] = useState(false)
  const [synced, setSynced] = useState(false)
  const [onlineCount, setOnlineCount] = useState(1)
  const [yMapInstance, setYMapInstance] = useState(null)
  const connRef = useRef(null)
  const syncedRef = useRef(false)
  const connectedRef = useRef(false)
  const statusDebounceRef = useRef(null)
  const syncDebounceRef = useRef(null)

  useEffect(() => {
    if (!roomId || !token) return

    const conn = getConnection(roomId, token, type)
    connRef.current = conn
    setYMapInstance(conn.yMap)

    // Set local state based on actual provider state
    // (handles both new connections and reused connections from StrictMode)
    syncedRef.current = conn.provider.synced
    connectedRef.current = conn.provider.wsconnected
    setConnected(conn.provider.wsconnected)
    setSynced(conn.provider.synced)

    // Set awareness presence
    conn.awareness.setLocalState({ user: 'anonymous', timestamp: Date.now() })

    // Get initial online count
    const initialStates = Array.from(conn.awareness.getStates().keys())
    setOnlineCount(initialStates.length || 1)

    // Check if already synced (in case sync event fired before listener was attached)
    setTimeout(() => {
      if (conn.provider.synced && !syncedRef.current) {
        syncedRef.current = true
        setSynced(true)
      }
    }, 100)

    const handleStatus = (event) => {
      const isNowConnected = event.status === 'connected'

      // 清除之前的防抖定时器
      if (statusDebounceRef.current) {
        clearTimeout(statusDebounceRef.current)
      }

      // 防抖处理：避免状态频繁切换
      statusDebounceRef.current = setTimeout(() => {
        // 只有在状态真正变化时才更新
        if (connectedRef.current !== isNowConnected) {
          connectedRef.current = isNowConnected
          setConnected(isNowConnected)

          if (isNowConnected) {
            // Re-set awareness when reconnecting
            conn.awareness.setLocalState({ user: 'anonymous', timestamp: Date.now() })
          } else {
            syncedRef.current = false
            setSynced(false)
          }
        }
      }, 100) // 100ms 防抖
    }

    const handleSync = (isSynced) => {
      // 只有在同步状态真正变化时才更新
      if (syncedRef.current !== isSynced) {
        syncedRef.current = isSynced
        setSynced(isSynced)

        if (isSynced) {
          // Notify observers of initial state
          const data = extractData(conn.yMap)
          conn.observers.forEach((cb) => cb(data, { source: 'initial' }))

          // Flush pending data
          if (conn.pendingData) {
            const pending = conn.pendingData
            conn.pendingData = null
            conn.doc.transact(() => {
              for (const el of (pending.elements || [])) {
                conn.yMap.set('__el_' + el.id, el)
              }
              conn.yMap.set('__appState', pending.appState || {})
              conn.yMap.set('__files', pending.files || {})
            }, 'local-scene-change')
          }
        }
      }
    }

    const handleAwareness = (count, states) => {
      setOnlineCount(count || 1)
    }

    conn.statusListeners.add(handleStatus)
    conn.syncListeners.add(handleSync)
    conn.awarenessListeners.add(handleAwareness)

    return () => {
      // 清除防抖定时器
      if (statusDebounceRef.current) {
        clearTimeout(statusDebounceRef.current)
      }
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current)
      }

      conn.statusListeners.delete(handleStatus)
      conn.syncListeners.delete(handleSync)
      conn.awarenessListeners.delete(handleAwareness)
      releaseConnection(roomId, type)
      connRef.current = null
    }
  }, [roomId, token, type])

  // Force Yjs update flush on page unload.
  // Writes current scene data to Y.Doc and triggers awareness update to try to
  // flush the WebSocket send buffer before the page closes. The primary data
  // safety net is the synchronous localStorage backup in ExcalidrawWrapper's
  // beforeunload handler (y-websocket's bin/utils cannot be imported in browser).
  useEffect(() => {
    if (!roomId || !token) return

    const handleBeforeUnload = () => {
      const conn = connRef.current
      if (conn && conn.doc && conn.provider) {
        try {
          // Trigger awareness update to force a WebSocket send
          conn.awareness.setLocalState({
            ...(conn.awareness.getLocalState() || {}),
            _flush: Date.now(),
            _unloading: true
          })
          // Removed: empty ws.send('') causes lib0 "Unexpected end of array"
          // on the server when it tries to decode an empty binary message.
        } catch (e) { /* ignore */ }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [roomId, token])

  const getData = useCallback(() => {
    const conn = connRef.current
    if (!conn) return null
    return extractData(conn.yMap)
  }, [])

  const setData = useCallback((data) => {
    const conn = connRef.current
    if (!conn) {
      console.warn('[useYjs] setData skipped: no connection')
      return
    }

    conn.doc.transact(() => {
      // Track which element IDs are in the new data
      const newIds = new Set()
      for (const el of (data.elements || [])) {
        newIds.add(el.id)
        conn.yMap.set('__el_' + el.id, el)
      }
      // Remove element keys that no longer exist
      const keysToDelete = []
      conn.yMap.forEach((value, key) => {
        if (key.startsWith('__el_') && !newIds.has(key.slice(5))) {
          keysToDelete.push(key)
        }
      })
      for (const key of keysToDelete) {
        conn.yMap.delete(key)
      }
      conn.yMap.set('__appState', data.appState || {})
      conn.yMap.set('__files', data.files || {})
    }, 'local-scene-change')
  }, [])

  const observe = useCallback((callback) => {
    const conn = connRef.current
    if (!conn) return () => {}

    const emit = (data, meta) => callback(data, meta)
    const handler = (event) => {
      emit(
        extractData(conn.yMap),
        {
          source: event?.transaction?.origin === 'local-scene-change' ? 'local' : 'remote'
        }
      )
    }

    conn.observers.add(emit)
    conn.yMap.observe(handler)

    // Emit current state immediately if provider is already synced
    // (e.g., when switching canvases and reusing an existing connection)
    if (conn.provider.synced) {
      emit(
        extractData(conn.yMap),
        { source: 'initial' }
      )
    }

    return () => {
      conn.observers.delete(emit)
      conn.yMap.unobserve(handler)
    }
  }, [])

  const updateAwareness = useCallback((state) => {
    const conn = connRef.current
    if (!conn) return
    conn.awareness.setLocalState({ ...conn.awareness.getLocalState(), ...state })
  }, [])

  const getAwarenessStates = useCallback(() => {
    const conn = connRef.current
    if (!conn) return new Map()
    return conn.awareness.getStates()
  }, [])

  return { connected, synced, onlineCount, connectedRef, setData, getData, observe, awareness: connRef.current?.awareness, updateAwareness, getAwarenessStates, yMap: yMapInstance }
}
