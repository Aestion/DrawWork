import { useCallback, useEffect, useRef, useState } from 'react'
import { useYjs } from './useYjs'
import api from '../lib/axios'
import { DEFAULT_TENCENT_MIND } from '../lib/tencent-mind-utils'

function extractTencentData(yMap) {
  const json = yMap.toJSON()
  if (json.__tencent_state) return json.__tencent_state
  if (json.data) return json.data
  return null
}

export function useTencentMindYjs({ canvasId, roomId, token, canEdit }) {
  const [tencentData, setTencentData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [remoteUpdateVersion, setRemoteUpdateVersion] = useState(0)

  const debounceRef = useRef(null)
  const initialDataLoaded = useRef(false)
  const tencentDataRef = useRef(null)
  const lastObservedSnapshotRef = useRef('')
  const lastLocalSnapshotRef = useRef('')

  const { connected, synced, onlineCount, yMap, updateAwareness, getAwarenessStates } = useYjs(roomId, token, { type: 'tencentmind' })

  // Reset on canvas change
  useEffect(() => {
    initialDataLoaded.current = false
    setLoading(true)
    setTencentData(null)
  }, [canvasId])

  // Track latest data in ref
  useEffect(() => {
    tencentDataRef.current = tencentData
  }, [tencentData])

  // Sync local data to Yjs
  const syncToYjs = useCallback((data) => {
    if (!yMap || !canEdit) return
    try {
      lastLocalSnapshotRef.current = JSON.stringify(data)
      yMap.doc.transact(() => {
        yMap.set('__tencent_state', data)
      }, 'local-tencentmind-change')
    } catch (err) {
      console.error('[useTencentMindYjs] Failed to sync to Yjs:', err)
    }
  }, [yMap, canEdit])

  // Observe remote changes from Yjs
  useEffect(() => {
    if (!yMap) return

    const applyObservedData = () => {
      const data = extractTencentData(yMap)
      if (!data) {
        console.debug('[YJS-OBS] observer fired but __tencent_state not yet available')
        return
      }
      const snapshot = JSON.stringify(data)
      if (snapshot === lastLocalSnapshotRef.current) return
      if (snapshot === lastObservedSnapshotRef.current) return
      lastObservedSnapshotRef.current = snapshot
      setTencentData(data)
      Promise.resolve().then(() => {
        setRemoteUpdateVersion((v) => v + 1)
      })
    }

    const observer = (events) => {
      const eventList = Array.isArray(events) ? events : [events]
      // Ignore only writes initiated by this hook. Provider-applied remote
      // updates also mutate the local Y.Doc, so transaction.local is too broad.
      if (eventList.every(event => event.transaction?.origin === 'local-tencentmind-change')) return
      applyObservedData()
    }

    const docObserver = (_update, origin) => {
      if (origin === 'local-tencentmind-change') return
      Promise.resolve().then(applyObservedData)
    }

    yMap.doc?.on?.('update', docObserver)
    if (typeof yMap.observeDeep === 'function') {
      yMap.observeDeep(observer)
      return () => {
        yMap.unobserveDeep(observer)
        yMap.doc?.off?.('update', docObserver)
      }
    }
    yMap.observe(observer)
    return () => {
      yMap.unobserve(observer)
      yMap.doc?.off?.('update', docObserver)
    }
  }, [yMap])

  // HTTP safety net: Yjs is still the fast path, but the persisted TencentMind
  // snapshot is the authoritative fallback in production Docker deployments.
  useEffect(() => {
    if (!canvasId || !token) return

    let stopped = false
    const poll = async () => {
      if (stopped || !initialDataLoaded.current) return
      try {
        const res = await api.get(`/canvases/${canvasId}/tencentmind`)
        const data = res.data?.data
        if (!data?.rootTopic) return
        const snapshot = JSON.stringify(data)
        if (snapshot === lastObservedSnapshotRef.current) return
        lastObservedSnapshotRef.current = snapshot
        setTencentData(data)
        Promise.resolve().then(() => {
          setRemoteUpdateVersion((v) => v + 1)
        })
      } catch (err) {
        // The primary save path will surface real failures; polling must stay quiet.
      }
    }

    const interval = setInterval(poll, 1500)
    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [canvasId, token])

  // Fallback: load from HTTP if Yjs doesn't connect within 2 seconds
  const yMapRef = useRef(null)
  const fallbackTimeoutRef = useRef(null)
  if (yMap) yMapRef.current = yMap

  useEffect(() => {
    if (!yMap || initialDataLoaded.current || loading === false) return

    fallbackTimeoutRef.current = setTimeout(() => {
      if (initialDataLoaded.current) return

      const loadFromHttp = async () => {
        try {
          // HTTP API is the source of truth â€?always fetch from it.
          // The YMap shortcut was removed because Yjs may have stale
          // data from a previous session that lacks boundaries.
          const res = await api.get(`/canvases/${canvasId}/tencentmind`)
          const data = res.data?.data || DEFAULT_TENCENT_MIND
          setTencentData(data)
          tencentDataRef.current = data
          syncToYjs(data)
          Promise.resolve().then(() => {
            setRemoteUpdateVersion((v) => v + 1)
          })
          initialDataLoaded.current = true
          setLoading(false)
        } catch (err) {
          console.error('[useTencentMindYjs] Fallback HTTP failed, trying YMap:', err)
          // YMap data as fallback when HTTP fails
          const existingData = yMapRef.current?.get('__tencent_state')
          if (existingData) {
            setTencentData(existingData)
            tencentDataRef.current = existingData
          } else {
            setTencentData(DEFAULT_TENCENT_MIND)
            tencentDataRef.current = DEFAULT_TENCENT_MIND
            syncToYjs(DEFAULT_TENCENT_MIND)
          }
          setError(err.message)
          initialDataLoaded.current = true
          setLoading(false)
        }
      }

      loadFromHttp()
    }, 2000)

    return () => clearTimeout(fallbackTimeoutRef.current)
  }, [yMap, canvasId, loading, syncToYjs])

  // Primary loader: fires when Yjs is synced
  useEffect(() => {
    if (!yMap || !synced || initialDataLoaded.current) return

    const loadData = async () => {
      try {
        // Tier 1: HTTP API (source of truth for persistence)
        try {
          const res = await api.get(`/canvases/${canvasId}/tencentmind`)
          const data = res.data?.data || DEFAULT_TENCENT_MIND
          setTencentData(data)
          tencentDataRef.current = data
          // Seed Yjs with HTTP data so peers get the full state
          syncToYjs(data)
          // Increment version so the editor picks up this authoritative data
          // even if the Yjs observer already set stale data previously.
          Promise.resolve().then(() => {
            setRemoteUpdateVersion((v) => v + 1)
          })
        } catch {
          // Tier 2: Yjs data from peers (fallback when HTTP fails)
          const yjsData = extractTencentData(yMap)
          if (yjsData && yjsData.rootTopic) {
            setTencentData(yjsData)
            tencentDataRef.current = yjsData
          } else {
            // Tier 3: localStorage backup
            const backupKey = 'drawwork_tm_backup_' + canvasId
            const backupJson = localStorage.getItem(backupKey)
            if (backupJson) {
              try {
                const backup = JSON.parse(backupJson)
                if (backup?.rootTopic) {
                  setTencentData(backup)
                  tencentDataRef.current = backup
                  syncToYjs(backup)
                  api.put(`/canvases/${canvasId}/tencentmind`, { data: backup }).catch(() => {})
                  setTimeout(() => {
                    try { localStorage.removeItem(backupKey) } catch (e) {}
                  }, 5000)
                } else {
                  throw new Error('invalid backup')
                }
              } catch (e) {
                setTencentData(DEFAULT_TENCENT_MIND)
                tencentDataRef.current = DEFAULT_TENCENT_MIND
                syncToYjs(DEFAULT_TENCENT_MIND)
              }
            } else {
              // Tier 4: default
              setTencentData(DEFAULT_TENCENT_MIND)
              tencentDataRef.current = DEFAULT_TENCENT_MIND
              syncToYjs(DEFAULT_TENCENT_MIND)
            }
          }
        }

        initialDataLoaded.current = true
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current)
          fallbackTimeoutRef.current = null
        }
        setLoading(false)
      } catch (err) {
        console.error('[useTencentMindYjs] Failed to load data:', err)
        setTencentData(DEFAULT_TENCENT_MIND)
        tencentDataRef.current = DEFAULT_TENCENT_MIND
        syncToYjs(DEFAULT_TENCENT_MIND)
        initialDataLoaded.current = true
        setLoading(false)
      }
    }

    loadData()
  }, [yMap, synced, syncToYjs, canvasId])

  // Page-unload backup to localStorage
  useEffect(() => {
    if (!canvasId) return

    const handleBeforeUnload = () => {
      if (tencentDataRef.current) {
        try {
          localStorage.setItem('drawwork_tm_backup_' + canvasId, JSON.stringify(tencentDataRef.current))
        } catch (e) { /* localStorage full */ }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [canvasId])

  return {
    tencentData,
    loading,
    error,
    connected,
    synced,
    onlineCount,
    remoteUpdateVersion,
    syncToYjs,
    updateAwareness,
    getAwarenessStates
  }
}
