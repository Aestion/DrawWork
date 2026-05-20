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

  const { connected, synced, onlineCount, yMap } = useYjs(roomId, token, { type: 'tencentmind' })

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

    const observer = (event) => {
      if (event.transaction?.origin === 'local-tencentmind-change') return
      const data = yMap.get('__tencent_state')
      if (!data) return

      setTencentData(data)
      initialDataLoaded.current = true
      setLoading(false)

      // Defer version increment so React processes the state first
      Promise.resolve().then(() => {
        setRemoteUpdateVersion((v) => v + 1)
      })
    }

    yMap.observe(observer)
    return () => yMap.unobserve(observer)
  }, [yMap])

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
          const existingData = yMapRef.current?.get('__tencent_state')
          if (existingData) {
            setTencentData(existingData)
          } else {
            const res = await api.get(`/canvases/${canvasId}/tencentmind`)
            const data = res.data?.data || DEFAULT_TENCENT_MIND
            setTencentData(data)
            tencentDataRef.current = data
            syncToYjs(data)
          }
          initialDataLoaded.current = true
          setLoading(false)
        } catch (err) {
          console.error('[useTencentMindYjs] Fallback load failed:', err)
          setError(err.message)
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
        // Tier 1: localStorage backup
        const backupKey = 'drawwork_tm_backup_' + canvasId
        const backupJson = localStorage.getItem(backupKey)
        if (backupJson) {
          try {
            const backup = JSON.parse(backupJson)
            if (backup?.rootTopic) {
              setTencentData(backup)
              initialDataLoaded.current = true
              if (fallbackTimeoutRef.current) {
                clearTimeout(fallbackTimeoutRef.current)
                fallbackTimeoutRef.current = null
              }
              setLoading(false)
              tencentDataRef.current = backup
              syncToYjs(backup)
              // Background save to API
              api.put(`/canvases/${canvasId}/tencentmind`, { data: backup }).catch(() => {})
              // Clean up backup after confirmed save
              setTimeout(() => {
                try { localStorage.removeItem(backupKey) } catch (e) {}
              }, 5000)
              return
            }
          } catch (e) { /* corrupt backup */ }
        }

        // Tier 2: Yjs data from peers
        const yjsData = extractTencentData(yMap)
        if (yjsData && yjsData.rootTopic) {
          setTencentData(yjsData)
        } else {
          // Tier 3: HTTP API
          try {
            const res = await api.get(`/canvases/${canvasId}/tencentmind`)
            const data = res.data?.data || DEFAULT_TENCENT_MIND
            setTencentData(data)
            tencentDataRef.current = data
            syncToYjs(data)
          } catch {
            // Tier 4: default
            setTencentData(DEFAULT_TENCENT_MIND)
            tencentDataRef.current = DEFAULT_TENCENT_MIND
            syncToYjs(DEFAULT_TENCENT_MIND)
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
    syncToYjs
  }
}
