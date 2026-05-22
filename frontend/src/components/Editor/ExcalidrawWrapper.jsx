import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Excalidraw, sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import * as Y from 'yjs'
import { useYjs } from '../../hooks/useYjs'
import { useAuthStore } from '../../stores/authStore'
import api from '../../lib/axios'
import { createExcalidrawImageElement, prepareMediaForExcalidraw } from '../../lib/imageUtils'

const EMPTY_SCENE = { elements: [], appState: {}, files: {} }
const EMPTY_OVERLAY_STATE = { elements: [], appState: {} }
const RICH_MEDIA_PLACEHOLDER_FILE_ID = '__rich-media-placeholder__'
const LS_KEY_PREFIX = 'drawwork_scene_backup_'
const RICH_MEDIA_PLACEHOLDER_FILE = {
  id: RICH_MEDIA_PLACEHOLDER_FILE_ID,
  dataURL:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn1n8sAAAAASUVORK5CYII=',
  mimeType: 'image/png',
  created: 0,
  lastRetrieved: 0
}
const MAX_EMBEDDED_FILE_BYTES = 1.5 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 60_000
const MEDIA_FETCH_TIMEOUT_MS = 30_000

// Media overlay item that registers its DOM node for direct position updates.
// Positions are updated by a continuous RAF loop (bypassing React),
// so this component never receives position props — only identity + src.
// React.memo prevents re-render when src/mimeType/uploadId are stable.
const MediaOverlayItem = React.memo(function MediaOverlayItem({
  elementId, src, mimeType, uploadId, registerRef, unregisterRef
}) {
  const domRef = useRef(null)

  useEffect(() => {
    const el = domRef.current
    if (el) registerRef(elementId, el)
    return () => unregisterRef(elementId)
  }, [elementId, registerRef, unregisterRef])

  // Video autoplay: browsers often ignore the `autoPlay` attribute;
  // explicitly calling .play() handles promise rejection gracefully.
  useEffect(() => {
    if (mimeType.startsWith('video/')) {
      const video = domRef.current
      if (!video) return
      video.muted = true
      const playPromise = video.play()
      if (playPromise?.catch) {
        playPromise.catch(() => {}) // swallow autoplay rejection
      }
    }
  }, [src, mimeType])

  // Position starts at 0,0 — RAF loop immediately moves to correct place.
  // Must be 1x1 to ensure browser loads media (0-size might suppress load).
  const baseStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
    contain: 'layout style paint'
  }

  if (mimeType === 'image/gif') {
    return (
      <img
        ref={domRef}
        src={src}
        alt=""
        style={baseStyle}
        className="pointer-events-none select-none object-fill"
        draggable={false}
      />
    )
  }

  return (
    <video
      ref={domRef}
      src={src}
      style={baseStyle}
      className="pointer-events-none select-none object-fill"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
    />
  )
}, (prev, next) => {
  // Only re-render when source/type/identity changes (never for position changes)
  return prev.src === next.src
    && prev.mimeType === next.mimeType
    && prev.uploadId === next.uploadId
    && prev.elementId === next.elementId
})

function normalizeZoom(zoom) {
  if (typeof zoom === 'number') return zoom
  if (typeof zoom?.value === 'number') return zoom.value
  return 1
}

// View state (scrollX, scrollY, zoom) should NOT be synced between users
const VIEW_STATE_KEYS = ['scrollX', 'scrollY', 'zoom', 'scrollCenter']

// Local UI state that should NOT be synced between users
// Tool selection, dragging state, etc. should be per-user
const LOCAL_UI_STATE_KEYS = [
  'activeTool',
  'selectedElementIds',
  'previousSelectedElementIds',
  'editingElement',
  'draggingElement',
  'resizingElement',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemRoundness',
  'cursorButton',
  'pointer',
  'openDialog',
  'toast',
  'contextMenu',
  'showHelpDialog',
  'showStats',
  'showLibrary',
  'showHyperlinkPopup',
  'showColorPicker',
  'zenModeEnabled',
  'gridModeEnabled',
  'viewModeEnabled',
  'exportScale',
  'exportEmbedScene',
  'exportWithDarkMode',
  'exportBackground',
  'isSidebarDocked',
  'shouldCacheIgnoreZoom',
  'defaultSidebarDockedPreference',
]

const COLLABORATOR_COLORS = [
  { background: '#ff6b6b', stroke: '#c92a2a' },
  { background: '#4ecdc4', stroke: '#087f5b' },
  { background: '#45b7d1', stroke: '#1864ab' },
  { background: '#96ceb4', stroke: '#2b8a3e' },
  { background: '#feca57', stroke: '#e67700' },
  { background: '#ff9ff3', stroke: '#c2255c' },
  { background: '#54a0ff', stroke: '#1c7ed6' },
  { background: '#48dbfb', stroke: '#0b7285' },
  { background: '#ff9f43', stroke: '#d9480f' },
  { background: '#a29bfe', stroke: '#5f3dc4' }
]

function getUserColor(userId, colorMap) {
  if (colorMap.has(userId)) return colorMap.get(userId)
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length]
  colorMap.set(userId, color)
  return color
}

export function stableSceneSignature(elements, appState, files) {
  // Filter out view-only state that shouldn't trigger sync
  const { scrollX, scrollY, zoom, scrollCenter, ...syncableAppState } = appState || {}
  return JSON.stringify({
    elements: elements || [],
    appState: {
      viewBackgroundColor: syncableAppState?.viewBackgroundColor,
      gridSize: syncableAppState?.gridSize,
      theme: syncableAppState?.theme
    },
    fileIds: Object.keys(files || {}).sort()
  })
}

function isRichMediaElement(element) {
  const mimeType = element?.customData?.originalMimeType || ''
  return mimeType === 'image/gif' || mimeType.startsWith('video/')
}

function toRenderableElements(elements) {
  return elements || []
}

function buildRenderableFiles(files) {
  return { ...(files || {}) }
}

// Laser pointer fade timeout (remote elements received via Yjs)
const LASER_FADE_MS = 2000

export function shouldFadeDeletedElement(element) {
  return element?.type === 'freedraw' && element?.isDeleted === true
}

export function filterOversizedEmbeddedFiles(scene, maxBytes) {
  const validFileIds = new Set()
  const files = {}
  for (const [fileId, file] of Object.entries(scene.files || {})) {
    if ((file?.dataURL?.length || 0) <= maxBytes) {
      files[fileId] = file
      validFileIds.add(fileId)
    }
  }
  const elements = (scene.elements || []).filter(
    (el) => !(el.type === 'image' && el.fileId && !validFileIds.has(el.fileId))
  )
  return { elements, files }
}

export function sceneFromYMapJson(json = {}) {
  const elements = []
  const perElementKeys = Object.keys(json)
    .filter((key) => key.startsWith('__el_'))
    .sort()

  if (perElementKeys.length > 0) {
    perElementKeys.forEach((key) => {
      if (json[key]) elements.push(json[key])
    })
  } else if (Array.isArray(json.elements)) {
    elements.push(...json.elements)
  }

  return {
    elements,
    appState: json.__appState || json.appState || {},
    files: json.__files || json.files || {}
  }
}

function decodeBase64ToBinaryString(base64Data) {
  if (typeof atob === 'function') return atob(base64Data)
  return Buffer.from(base64Data, 'base64').toString('binary')
}

function decodeBase64ToUtf8(base64Data) {
  const binary = decodeBase64ToBinaryString(base64Data)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function decodeSnapshotScene(base64Data) {
  try {
    return sceneFromYMapJson(JSON.parse(decodeBase64ToUtf8(base64Data)))
  } catch {
    const binary = decodeBase64ToBinaryString(base64Data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, bytes)
      return sceneFromYMapJson(doc.getMap('excalidraw').toJSON())
    } finally {
      doc.destroy()
    }
  }
}

const ExcalidrawWrapper = forwardRef(function ExcalidrawWrapper({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const excalidrawRef = useRef(null)
  const fileInputRef = useRef(null)
  const remoteApplyRef = useRef(false)
  const hasInitialSyncRef = useRef(false)
  const lastSceneSignatureRef = useRef('')
  const sceneRef = useRef(EMPTY_SCENE)
  const mediaUrlCacheRef = useRef(new Map())
  const pendingMediaFetchesRef = useRef(new Set())
  const overlayFrameRef = useRef(null)
  const interactionDebounceRef = useRef(null)
  const laserElementsRef = useRef(new Map()) // elementId → timeoutId
  const syncFrameRef = useRef(null) // RAF batching for Yjs sync
  const restoredFromBackupRef = useRef(false) // True after localStorage restore on page load
  const [viewportVersion, setViewportVersion] = useState(0)
  const isInteractingRef = useRef(false) // Track interaction state without re-render

  const [ready, setReady] = useState(false)
  const [sceneData, setSceneData] = useState(EMPTY_SCENE)
  const [overlayState, setOverlayState] = useState(EMPTY_OVERLAY_STATE)
  const [mediaSources, setMediaSources] = useState({})
  const [mediaMimeTypes, setMediaMimeTypes] = useState({})
  const [isInteracting, setIsInteracting] = useState(false)
  const overlayStateRef = useRef(EMPTY_OVERLAY_STATE) // Mirror for RAF position loop
  const mediaDomRefs = useRef(new Map()) // elementId → DOM element

  const uiOptions = useMemo(() => ({
    canvasActions: {
      changeViewBackgroundColor: true,
      clearCanvas: true,
      export: false,
      loadScene: false,
      saveToActiveFile: false,
      saveAsImage: true,
      toggleTheme: null
    },
    tools: {
      image: false  // Hide native image tool; use "Insert Media" button instead
    }
  }), [])

  // initialData must be stable after mount; all subsequent updates go through applyScene
  const initialData = useMemo(() => {
    const { elements: filteredElements, files: filteredFiles } = filterOversizedEmbeddedFiles(
      EMPTY_SCENE,
      MAX_EMBEDDED_FILE_BYTES
    )
    return {
      elements: toRenderableElements(filteredElements),
      appState: { viewBackgroundColor: '#ffffff', collaborators: new Map() },
      files: buildRenderableFiles(filteredFiles)
    }
  }, [])

  // Use selectors to prevent unnecessary re-renders
  const token = useAuthStore((state) => state.token)

  // Always connect to Yjs when a roomId exists so viewers receive real-time updates
  const effectiveRoomId = useMemo(() => {
    return roomId || null
  }, [roomId])

  const { connected, synced, onlineCount, connectedRef, setData, observe, updateAwareness, getAwarenessStates } = useYjs(effectiveRoomId, token)

  // Collaboration cursors
  const { user } = useAuthStore()
  const collaboratorsRef = useRef(new Map())
  const collaboratorColorsRef = useRef(new Map())

  const syncedRef = useRef(synced)
  const canEditRef = useRef(canEdit)
  useEffect(() => { syncedRef.current = synced }, [synced])
  useEffect(() => { canEditRef.current = canEdit }, [canEdit])

  // When transitioning from inactive to active, trigger Excalidraw to
  // recalculate its dimensions (the container goes from display:none to visible)
  const wasActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      // Excalidraw reads container dimensions at mount; after a display change
      // from none → block, it needs a resize event to recalculate.
      window.dispatchEvent(new Event('resize'))
    }
    wasActiveRef.current = isActive
  }, [isActive])

  // 优化连接状态更新，避免切换画布时的闪烁
  const lastCanvasIdRef = useRef(canvasId)
  const isSwitchingCanvasRef = useRef(false)

  useEffect(() => {
    if (lastCanvasIdRef.current !== canvasId) {
      isSwitchingCanvasRef.current = true
      lastCanvasIdRef.current = canvasId
      // 给一点时间让新连接建立，避免瞬间显示 disconnected
      setTimeout(() => {
        isSwitchingCanvasRef.current = false
      }, 300)
    }
  }, [canvasId])

  useEffect(() => {
    if (!onConnectionChange || !isActive) return
    // 如果正在切换画布，暂时不更新状态，防止闪烁
    if (isSwitchingCanvasRef.current && !connected) return

    const label = !canEdit
      ? 'read-only'
      : connected
        ? (synced ? 'synced' : 'syncing')
        : 'disconnected'
    onConnectionChange({ connected, synced, label, onlineCount }, canvasId)
  }, [connected, synced, canEdit, onlineCount, onConnectionChange, isActive, canvasId])

  // Broadcast local cursor position via Yjs awareness
  useEffect(() => {
    if (!effectiveRoomId || !updateAwareness || !isActive) return

    const handleMouseMove = (e) => {
      const api = excalidrawRef.current
      if (!api) return
      const appState = api.getAppState()
      const sceneCoords = viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        appState
      )
      const tool = appState.activeTool?.type === 'laser' ? 'laser' : 'pointer'
      updateAwareness({
        userId: user?.id || 'anonymous',
        username: user?.username || '匿名用户',
        pointer: { x: sceneCoords.x, y: sceneCoords.y, tool },
        button: e.buttons > 0 ? 'down' : 'up',
        selectedElementIds: appState.selectedElementIds || {}
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [effectiveRoomId, updateAwareness, user, isActive])

  // Poll remote awareness states and build Excalidraw collaborators Map
  useEffect(() => {
    if (!effectiveRoomId || !getAwarenessStates || !isActive) return

    // Track serialized collaborators to detect actual changes.
    // Prevents calling api.updateScene() every 50ms with identical data,
    // which triggers Excalidraw re-renders and causes toolbar icon flickering.
    let lastSerialized = ''

    const interval = setInterval(() => {
      const states = getAwarenessStates()
      const nextCollaborators = new Map()
      states.forEach((state, clientId) => {
        if (!state || !state.userId || !state.pointer) return
        // Skip local user
        if (state.userId === user?.id) return
        const color = getUserColor(state.userId, collaboratorColorsRef.current)
        nextCollaborators.set(clientId, {
          id: clientId,
          pointer: state.pointer,
          button: state.button || 'up',
          selectedElementIds: state.selectedElementIds || {},
          username: state.username || '协作者',
          color
        })
      })
      collaboratorsRef.current = nextCollaborators

      // Serialize to detect meaningful changes (new/removed collaborators, cursor moves)
      const serialized = JSON.stringify([...nextCollaborators.entries()])
      if (serialized === lastSerialized) return
      lastSerialized = serialized

      // Push cursor update directly to Excalidraw without going through React state
      const api = excalidrawRef.current
      if (api && isActive) {
        api.updateScene({ appState: { collaborators: nextCollaborators } })
      }
    }, 50) // 20fps update

    return () => {
      clearInterval(interval)
    }
  }, [effectiveRoomId, getAwarenessStates, user, isActive])

  const queueOverlayStateUpdate = useCallback((elements, appState) => {
    overlayStateRef.current = { elements: elements || [], appState: appState || {} }

    // During drag/resize, skip React state to prevent reconciliation flickering.
    // RAF position loop still reads overlayStateRef.current and updates DOM directly.
    if (isInteractingRef.current) return

    if (overlayFrameRef.current) {
      cancelAnimationFrame(overlayFrameRef.current)
    }

    overlayFrameRef.current = requestAnimationFrame(() => {
      setOverlayState({
        elements: elements || [],
        appState: appState || {}
      })
    })
  }, [])

  // Register/unregister DOM refs for the RAF position loop
  const registerMediaRef = useCallback((elementId, domEl) => {
    mediaDomRefs.current.set(elementId, domEl)
  }, [])

  const unregisterMediaRef = useCallback((elementId) => {
    mediaDomRefs.current.delete(elementId)
  }, [])

  // Continuous RAF loop: updates overlay DOM positions directly,
  // bypassing React reconciliation so media elements never unmount during drag.
  useEffect(() => {
    let rafId

    const updatePositions = () => {
      const { elements, appState } = overlayStateRef.current
      if (elements.length > 0 && appState) {
        const containerRect = containerRef.current?.getBoundingClientRect()
        const canvasEl = containerRef.current?.querySelector('.excalidraw__canvas')
        const canvasRect = canvasEl?.getBoundingClientRect()

        const offsetLeft = canvasRect?.left ?? containerRect?.left ?? 0
        const offsetTop = canvasRect?.top ?? containerRect?.top ?? 0

        const zoom = normalizeZoom(appState?.zoom)
        const scrollX = appState?.scrollX || 0
        const scrollY = appState?.scrollY || 0
        const zoomValue = typeof appState?.zoom?.value === 'number'
          ? appState.zoom
          : { value: zoom }

        elements.forEach((element) => {
          if (element.type !== 'image' || element.isDeleted) return
          const domEl = mediaDomRefs.current.get(element.id)
          if (!domEl) return

          const topLeft = sceneCoordsToViewportCoords(
            { sceneX: element.x || 0, sceneY: element.y || 0 },
            { zoom: zoomValue, offsetLeft, offsetTop, scrollX, scrollY }
          )
          const bottomRight = sceneCoordsToViewportCoords(
            {
              sceneX: (element.x || 0) + Math.abs(element.width || 0),
              sceneY: (element.y || 0) + Math.abs(element.height || 0)
            },
            { zoom: zoomValue, offsetLeft, offsetTop, scrollX, scrollY }
          )

          const left = topLeft.x - (containerRect?.left ?? 0)
          const top = topLeft.y - (containerRect?.top ?? 0)
          const width = Math.max(1, Math.abs(bottomRight.x - topLeft.x))
          const height = Math.max(1, Math.abs(bottomRight.y - topLeft.y))
          const scaleX = element.scale?.[0] ?? 1
          const scaleY = element.scale?.[1] ?? 1

          domEl.style.left = `${left}px`
          domEl.style.top = `${top}px`
          domEl.style.width = `${width}px`
          domEl.style.height = `${height}px`
          domEl.style.transformOrigin = 'top left'
          domEl.style.transform = `rotate(${element.angle || 0}rad) scale(${scaleX}, ${scaleY})`
        })
      }

      rafId = requestAnimationFrame(updatePositions)
    }

    rafId = requestAnimationFrame(updatePositions)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const applyScene = useCallback((apiInstance, rawData) => {
    // 提取原始数据，sceneRef.current 永远存未过滤的原始版本
    const elements = Array.isArray(rawData?.elements) ? [...rawData.elements] : []
    const remoteAppState = rawData?.appState || {}
    const files = rawData?.files || {}

    // Preserve local view state (scroll, zoom) when applying remote changes
    const localAppState = apiInstance.getAppState()
    const appState = {
      ...remoteAppState,
      scrollX: localAppState.scrollX,
      scrollY: localAppState.scrollY,
      zoom: localAppState.zoom
    }

    sceneRef.current = { elements, appState, files }
    lastSceneSignatureRef.current = stableSceneSignature(elements, appState, files)
    queueOverlayStateUpdate(elements, appState)

    // 临时过滤超大文件，避免 Excalidraw 弹窗（只影响渲染，不写入存储）
    const { elements: filteredElements, files: filteredFiles } = filterOversizedEmbeddedFiles(
      { elements, files },
      MAX_EMBEDDED_FILE_BYTES
    )

    // 富媒体 placeholder 替换
    const renderableElements = toRenderableElements(filteredElements)
    const renderableFiles = buildRenderableFiles(filteredFiles)

    console.debug('[applyScene] applying', elements.length, 'elements,', Object.keys(files || {}).length, 'files -> renderable', renderableElements.length, 'elements')

    if (Object.keys(renderableFiles).length > 0) {
      apiInstance.addFiles(Object.values(renderableFiles))
    }

    // Laser pointer (freedraw) elements are marked isDeleted immediately after
    // the user releases the mouse, but remote users need time to see them.
    // Keep deleted freedraw elements visible for a short fade period.
    const elementIdsInScene = new Set(renderableElements.map((el) => el.id))
    const localElements = apiInstance.getSceneElements()
    const mergedElements = [...renderableElements]
    const mergedIds = new Set(elementIdsInScene)

    // 1. Retain local laser elements that remote has already removed
    localElements.forEach((el) => {
      if (laserElementsRef.current.has(el.id) && !mergedIds.has(el.id)) {
        mergedElements.push({ ...el, isDeleted: false })
        mergedIds.add(el.id)
      }
    })

    // 2. Start fade timer for newly deleted laser pointer elements
    mergedElements.forEach((el) => {
      if (shouldFadeDeletedElement(el) && !laserElementsRef.current.has(el.id)) {
        const timeoutId = setTimeout(() => {
          laserElementsRef.current.delete(el.id)
          const api = excalidrawRef.current
          if (api) {
            const currentElements = api.getSceneElements().filter((e) => e.id !== el.id)
            api.updateScene({ elements: currentElements })
          }
        }, LASER_FADE_MS)
        laserElementsRef.current.set(el.id, timeoutId)
      }
    })

    // 3. Temporarily undelete laser elements so they render during fade
    const visibleElements = mergedElements.map((el) => {
      if (shouldFadeDeletedElement(el) && laserElementsRef.current.has(el.id)) {
        return { ...el, isDeleted: false }
      }
      return el
    })

    apiInstance.updateScene({
      elements: visibleElements,
      appState: {
        ...appState,
        collaborators: collaboratorsRef.current
      }
    })
  }, [queueOverlayStateUpdate])

  useEffect(() => {
    setReady(true)

    const handleBeforeUnload = () => {
      if (syncFrameRef.current) {
        clearTimeout(syncFrameRef.current)
        syncFrameRef.current = null
      }
      // Flush to Yjs — removed connectedRef guard so it always attempts
      setData(sceneRef.current)

      // Synchronous localStorage backup (reliable even for large payloads, up to 5MB).
      // HTTP keepalive fetch is unreliable for payloads >64KB (silently dropped by browser).
      try {
        const { elements, appState, files } = sceneRef.current
        const json = JSON.stringify({ elements, appState, files })
        localStorage.setItem(LS_KEY_PREFIX + canvasId, json)
      } catch (e) {
        // localStorage full or unavailable — skip
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (overlayFrameRef.current) {
        cancelAnimationFrame(overlayFrameRef.current)
      }
      if (syncFrameRef.current) {
        clearTimeout(syncFrameRef.current)
      }
      mediaUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
      mediaUrlCacheRef.current.clear()
    }
  }, [canvasId])


  useEffect(() => {
    const handleViewportChange = () => {
      setViewportVersion((value) => value + 1)
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [])

  useEffect(() => {
    sceneRef.current = EMPTY_SCENE
    setSceneData(EMPTY_SCENE)
    setOverlayState(EMPTY_OVERLAY_STATE)
    hasInitialSyncRef.current = false
    lastSceneSignatureRef.current = ''
    remoteApplyRef.current = false
    restoredFromBackupRef.current = false
    pendingMediaFetchesRef.current.clear()
    // NOTE: Do NOT revoke blob URLs on canvas switch.
    // setMediaSources({}) below unmounts overlay elements immediately.
    // Revoking here causes a race where stale <img> tags still reference
    // the revoked URL before React removes them from the DOM.
    // URLs are revoked only when the component unmounts (see mount effect).
    setMediaSources({})
    setMediaMimeTypes({})

    return () => {
      const hadPendingSync = syncFrameRef.current !== null
      if (syncFrameRef.current) {
        clearTimeout(syncFrameRef.current)
        syncFrameRef.current = null
      }
      // Flush pending scene to Yjs before unmounting (canvas switch).
      // The timeout was cancelled above — write the latest scene directly
      // to prevent data loss from edits that haven't synced yet.
      if (hadPendingSync) {
        setData(sceneRef.current)
      }
      laserElementsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      laserElementsRef.current.clear()
    }
  }, [canvasId, roomId, setData])

  useEffect(() => {
    if (!canvasId) return
    let cancelled = false

    // Restore from localStorage backup first (fast, synchronous)
    const restoreLocalBackup = () => {
      try {
        const backup = localStorage.getItem(LS_KEY_PREFIX + canvasId)
        if (!backup) return false
        const parsed = JSON.parse(backup)
        if (!parsed?.elements?.length) return false

        const backupScene = {
          elements: parsed.elements,
          appState: parsed.appState || {},
          files: parsed.files || {}
        }

        sceneRef.current = backupScene
        setSceneData(backupScene)
        queueOverlayStateUpdate(backupScene.elements, backupScene.appState)

        if (excalidrawRef.current) {
          remoteApplyRef.current = true
          applyScene(excalidrawRef.current, backupScene)
          requestAnimationFrame(() => { remoteApplyRef.current = false })
        }
        restoredFromBackupRef.current = true
        return true
      } catch (e) {
        return false
      }
    }

    // Try localStorage restore before HTTP snapshot
    const lsRestored = restoreLocalBackup()
    if (lsRestored) {
      // Still attempt HTTP snapshot — may have newer data
    }

    api.get(`/canvases/${canvasId}/snapshot`)
      .then((res) => {
        if (cancelled || !res.data?.exists || !res.data?.data) return

        // If Yjs already synced, only apply HTTP snapshot when scene is empty.
        // This handles the case where Yjs server didn't persist before disconnect
        // but the keepalive HTTP snapshot has the latest state.
        if (hasInitialSyncRef.current) {
          const currentElements = sceneRef.current.elements || []
          if (currentElements.length > 0) return
        }

        let nextScene
        try {
          nextScene = decodeSnapshotScene(res.data.data)
        } catch {
          return
        }

        sceneRef.current = nextScene
        setSceneData(nextScene)
        queueOverlayStateUpdate(nextScene.elements, nextScene.appState)

        // Mark as restored from backup so Yjs stale data doesn't overwrite
        if (nextScene.elements.length > 0) {
          restoredFromBackupRef.current = true
        }

        if (excalidrawRef.current) {
          applyScene(excalidrawRef.current, nextScene)
        }
      })
      .catch((error) => {
        console.error('[Excalidraw] failed to load snapshot', error)
      })

    return () => {
      cancelled = true
    }
  }, [applyScene, canvasId, queueOverlayStateUpdate])

  useEffect(() => {
    if (!roomId) return

    const unsubscribe = observe((data, meta = { source: 'remote' }) => {
      if (!data) return

      const nextScene = {
        elements: Array.isArray(data?.elements) ? [...data.elements] : [],
        appState: data?.appState || {},
        files: data?.files || {}
      }

      // ✨ Guard: skip empty scene data while Yjs hasn't completed initial sync.
      // Prevents flooding applyScene with empty data during canvas switch,
      // which would erase the displayed scene while waiting for real data to arrive.
      // After sync completes, empty data is valid (genuinely empty canvas).
      const hasData = nextScene.elements.length > 0 || Object.keys(nextScene.files || {}).length > 0
      if (!hasData && !syncedRef.current && meta.source !== 'local') {
        return
      }

      // ✨ CRITICAL GUARD: Prefer locally-restored data over stale Yjs server data.
      // When page refreshes, localStorage backup (saved in beforeunload) has the
      // freshest state. Yjs may return stale server data if the WebSocket update
      // didn't flush before page close. Write local data to Yjs to correct server.
      if (meta.source === 'initial') {
        const currentElements = sceneRef.current.elements || []
        if (restoredFromBackupRef.current && currentElements.length > 0) {
          restoredFromBackupRef.current = false
          hasInitialSyncRef.current = true
          setData(sceneRef.current)
          return
        }
        // Original guard: Yjs has no data but we have local elements (HTTP snapshot or previous restore)
        if (!hasData && currentElements.length > 0) {
          hasInitialSyncRef.current = true
          setData(sceneRef.current)
          return
        }
      }

      sceneRef.current = nextScene

      if (meta.source === 'local') {
        // handleChange already called queueOverlayStateUpdate with the full
        // appState (including scroll/zoom). The Yjs data only stores the filtered
        // appState, so calling it again here would overwrite scroll/zoom with
        // defaults, causing the RAF position loop to compute wrong positions.
        return
      }

      // ✨ GUARD: Block stale remote data from initial Yjs sync when we restored
      // from localStorage backup. The Y.Map observer fires (source='remote') BEFORE
      // the provider fires 'sync' (source='initial'), so the 'initial' guard above
      // is not reached first — stale server data arrives via the remote path.
      // Without this, restored backup data is overwritten by stale server state.
      if (restoredFromBackupRef.current) {
        restoredFromBackupRef.current = false
        hasInitialSyncRef.current = true
        setData(sceneRef.current)
        return
      }

      hasInitialSyncRef.current = true
      setSceneData(nextScene)

      const signature = stableSceneSignature(nextScene.elements, nextScene.appState, nextScene.files)
      if (signature === lastSceneSignatureRef.current && meta.source !== 'initial') {
        queueOverlayStateUpdate(nextScene.elements, nextScene.appState)
        return
      }

      const apiInstance = excalidrawRef.current
      if (!apiInstance) {
        lastSceneSignatureRef.current = signature
        queueOverlayStateUpdate(nextScene.elements, nextScene.appState)
        console.debug('[observe] no apiInstance yet, queued overlay update')
        return
      }

      remoteApplyRef.current = true
      applyScene(apiInstance, nextScene)

      // Populate overlay state so media fetch fires for GIFs/videos.
      // The snapshot path calls queueOverlayStateUpdate before applyScene (line 611),
      // but the Yjs initial sync path was missing this call — the observer only
      // calls queueOverlayStateUpdate when signature matches (line 654), which
      // is never true on initial sync (signature always differs from empty default).
      queueOverlayStateUpdate(nextScene.elements, nextScene.appState)

      requestAnimationFrame(() => {
        remoteApplyRef.current = false
      })
    })

    return unsubscribe
  }, [applyScene, observe, queueOverlayStateUpdate, roomId])

  const handleChange = useCallback((elements, appState, files) => {
    queueOverlayStateUpdate(elements, appState)

    // Detect drag/resize/edit interaction from live appState to hide overlay and
    // prevent ghosting. RAF-based overlay updates lag behind immediate canvas redraws.
    const isDragging = !!appState?.draggingElement
    const isEditing = !!appState?.editingElement
    const isResizing = !!appState?.resizingElement
    if (isDragging || isEditing || isResizing) {
      if (interactionDebounceRef.current) {
        clearTimeout(interactionDebounceRef.current)
        interactionDebounceRef.current = null
      }
      if (!isInteractingRef.current) {
        isInteractingRef.current = true
        setIsInteracting(true)
      }
    } else {
      if (isInteractingRef.current && !interactionDebounceRef.current) {
        interactionDebounceRef.current = setTimeout(() => {
          isInteractingRef.current = false
          setIsInteracting(false)
          // Trigger one overlay update after interaction ends
          queueOverlayStateUpdate(elements, appState)
        }, 80)
      }
    }

    if (!canEditRef.current) return
    if (remoteApplyRef.current) return

    // ✨ CRITICAL GUARD: Don't write scene data to Yjs before initial sync completes.
    // Prevents empty scene data from overwriting server state. Race condition:
    // Excalidraw fires onChange (e.g. viewport change) before Yjs sync finishes,
    // causing empty elements to be written to the yMap. On CRDT merge, the empty
    // array wins due to higher clock, erasing all elements for all collaborators.
    if (!syncedRef.current && (!elements || elements.length === 0)) {
      return
    }

    // Exclude view-only state (scroll, zoom) and local UI state (tool selection)
    // from sync - these are per-user settings and should not be shared
    const {
      scrollX,
      scrollY,
      zoom,
      scrollCenter,
      collaborators,
      // Tool and interaction state - local only
      activeTool,
      selectedElementIds,
      previousSelectedElementIds,
      editingElement,
      draggingElement,
      resizingElement,
      currentItemFontFamily,
      currentItemFontSize,
      currentItemTextAlign,
      currentItemStrokeColor,
      currentItemBackgroundColor,
      currentItemFillStyle,
      currentItemStrokeWidth,
      currentItemStrokeStyle,
      currentItemRoughness,
      currentItemOpacity,
      currentItemRoundness,
      cursorButton,
      pointer,
      openDialog,
      toast,
      contextMenu,
      showHelpDialog,
      showStats,
      showLibrary,
      showHyperlinkPopup,
      showColorPicker,
      zenModeEnabled,
      gridModeEnabled,
      viewModeEnabled,
      exportScale,
      exportEmbedScene,
      exportWithDarkMode,
      exportBackground,
      isSidebarDocked,
      shouldCacheIgnoreZoom,
      defaultSidebarDockedPreference,
      ...syncableAppState
    } = appState || {}

    const nextScene = {
      elements: elements || [],
      appState: syncableAppState,
      files: files || {}
    }
    const signature = stableSceneSignature(nextScene.elements, nextScene.appState, nextScene.files)

    if (signature === lastSceneSignatureRef.current) {
      return
    }

    sceneRef.current = { elements: elements || [], appState: syncableAppState, files }
    lastSceneSignatureRef.current = signature

    // Debounce sync to 200ms to avoid overwhelming Yjs with rapid updates.
    // This prevents unnecessary Yjs transaction merging and reduces sync overhead.
    if (syncFrameRef.current) {
      clearTimeout(syncFrameRef.current)
    }
    syncFrameRef.current = setTimeout(() => {
      syncFrameRef.current = null
      setData(nextScene)
    }, 200)
  }, [queueOverlayStateUpdate, setData, isInteracting])

  const insertMediaToCanvas = useCallback(async (file) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Only images and videos are supported.')
      return
    }

    if (!boardId) {
      alert('Missing board context for upload.')
      return
    }

    const apiInstance = excalidrawRef.current
    if (!apiInstance) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('board_id', boardId)

      const uploadRes = await api.post('/upload', formData, {
        timeout: UPLOAD_TIMEOUT_MS
      })
      const preview = await prepareMediaForExcalidraw(file)
      const fileId = uploadRes.data.id || `file-${Date.now()}`

      apiInstance.addFiles([{
        id: fileId,
        dataURL: preview.dataURL,
        mimeType: preview.mimeType,
        created: Date.now(),
        lastRetrieved: Date.now()
      }])

      const appState = apiInstance.getAppState()
      const zoom = normalizeZoom(appState.zoom)
      const width = preview.width || 240
      const height = preview.height || 240
      const x = -appState.scrollX + appState.width / (2 * zoom) - width / 2
      const y = -appState.scrollY + appState.height / (2 * zoom) - height / 2

      const element = createExcalidrawImageElement({
        x,
        y,
        width,
        height,
        fileId,
        customData: {
          uploadId: uploadRes.data.id,
          originalMimeType: file.type,
          originalName: file.name,
          previewMode: preview.previewMode
        }
      })

      apiInstance.updateScene({
        elements: [...apiInstance.getSceneElements(), element],
        appState: {
          ...appState,
          selectedElementIds: { [element.id]: true }
        }
      })
    } catch (error) {
      console.error('[Excalidraw] media insert failed', error)
      const message = error.response?.data?.error || error.message || 'Upload failed'
      alert(`Media upload failed: ${message}`)
    }
  }, [boardId, token])

  const handlePaste = useCallback((data, event) => {
    const files = data?.files || event?.clipboardData?.files
    if (!files?.length) return true

    const mediaFiles = Array.from(files).filter((file) => (
      file.type.startsWith('image/') || file.type.startsWith('video/')
    ))
    if (mediaFiles.length === 0) return true

    event?.preventDefault?.()
    mediaFiles.forEach((file) => {
      void insertMediaToCanvas(file)
    })
    return false
  }, [insertMediaToCanvas])

  const handleFileInputChange = useCallback((event) => {
    const files = event.target.files
    if (files?.length) {
      Array.from(files).forEach((file) => {
        void insertMediaToCanvas(file)
      })
    }
    event.target.value = ''
  }, [insertMediaToCanvas])

  const handleAPI = useCallback((apiInstance) => {
    excalidrawRef.current = apiInstance
    // Expose for Playwright E2E tests
    if (process.env.NODE_ENV !== 'production') window.__EXCALIDRAW__ = apiInstance

    const currentScene = sceneRef.current
    if (currentScene.elements.length === 0 && Object.keys(currentScene.files || {}).length === 0) {
      // Empty scene: do NOT set hasInitialSyncRef here; wait for Yjs observe callback
      return
    }

    // Delay scene restoration until Excalidraw internals are fully mounted
    setTimeout(() => {
      remoteApplyRef.current = true
      applyScene(apiInstance, currentScene)
      requestAnimationFrame(() => {
        remoteApplyRef.current = false
      })
      // hasInitialSyncRef is set by Yjs observe callback, not here
    }, 0)
  }, [applyScene])

  const overlayDescriptors = useMemo(() => {
    const zoom = normalizeZoom(overlayState.appState?.zoom)
    const scrollX = overlayState.appState?.scrollX || 0
    const scrollY = overlayState.appState?.scrollY || 0
    const zoomValue = typeof overlayState.appState?.zoom?.value === 'number'
      ? overlayState.appState.zoom
      : { value: zoom }

    // Get the actual Excalidraw canvas element for accurate positioning
    const canvasEl = containerRef.current?.querySelector('.excalidraw__canvas')
    const canvasRect = canvasEl?.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()

    // offsetLeft/offsetTop should be the canvas position relative to the container
    const offsetLeft = canvasRect?.left ?? containerRect?.left ?? 0
    const offsetTop = canvasRect?.top ?? containerRect?.top ?? 0

    // Calculate the offset relative to container for positioning overlay inside container
    const relativeOffsetLeft = (canvasRect?.left ?? 0) - (containerRect?.left ?? 0)
    const relativeOffsetTop = (canvasRect?.top ?? 0) - (containerRect?.top ?? 0)

    const isLikelyUploadId = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)

    return (overlayState.elements || [])
      .map((element) => {
        if (element.type !== 'image' || element.isDeleted) return null

        const mimeType = element.customData?.originalMimeType || ''
        const uploadId = element.customData?.uploadId || (isLikelyUploadId(element.fileId) ? element.fileId : null)
        const topLeft = sceneCoordsToViewportCoords(
          {
            sceneX: element.x || 0,
            sceneY: element.y || 0
          },
          {
            zoom: zoomValue,
            offsetLeft,
            offsetTop,
            scrollX,
            scrollY
          }
        )
        const bottomRight = sceneCoordsToViewportCoords(
          {
            sceneX: (element.x || 0) + Math.abs(element.width || 0),
            sceneY: (element.y || 0) + Math.abs(element.height || 0)
          },
          {
            zoom: zoomValue,
            offsetLeft,
            offsetTop,
            scrollX,
            scrollY
          }
        )
        const width = Math.max(1, Math.abs(bottomRight.x - topLeft.x))
        const height = Math.max(1, Math.abs(bottomRight.y - topLeft.y))
        const scaleX = element.scale?.[0] ?? 1
        const scaleY = element.scale?.[1] ?? 1

        // Position relative to container, accounting for canvas offset within container
        return {
          id: element.id,
          uploadId,
          mimeType,
          left: topLeft.x - (containerRect?.left ?? 0),
          top: topLeft.y - (containerRect?.top ?? 0),
          width,
          height,
          angle: element.angle || 0,
          scaleX,
          scaleY,
        }
      })
      .filter(Boolean)
      .filter((item) => item.uploadId && item.width > 0 && item.height > 0)
  }, [overlayState, viewportVersion])

  // Build a stable list of all media upload IDs in the current scene for fetching.
  // This must include selected elements too so their media is fetched even while hidden.
  const sceneMediaUploadIds = useMemo(() => {
    const isLikelyUploadId = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
    const ids = new Set()
    ;(overlayState.elements || []).forEach((element) => {
      if (element.type !== 'image' || element.isDeleted) return
      const uploadId = element.customData?.uploadId || (isLikelyUploadId(element.fileId) ? element.fileId : null)
      const mimeType = element.customData?.originalMimeType || ''
      if (uploadId && (mimeType === 'image/gif' || mimeType.startsWith('video/'))) {
        ids.add(uploadId)
      }
    })
    return ids
  }, [overlayState.elements])

  useEffect(() => {
    let cancelled = false

    sceneMediaUploadIds.forEach((uploadId) => {
      if (mediaUrlCacheRef.current.has(uploadId) || pendingMediaFetchesRef.current.has(uploadId)) {
        return
      }

      pendingMediaFetchesRef.current.add(uploadId)

      api.get(`/upload/${uploadId}`, {
        responseType: 'blob',
        timeout: MEDIA_FETCH_TIMEOUT_MS
      })
        .then(async (response) => {
          const blob = response.data
          const mimeType = blob.type || 'application/octet-stream'
          const normalizedBlob = blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType })

          if (cancelled) return

          const objectUrl = URL.createObjectURL(normalizedBlob)
          mediaUrlCacheRef.current.set(uploadId, objectUrl)
          setMediaSources((prev) => ({
            ...prev,
            [uploadId]: objectUrl
          }))

          setMediaMimeTypes((prev) => ({
            ...prev,
            [uploadId]: mimeType
          }))
        })
        .catch((error) => {
          console.error('[Excalidraw] failed to load media asset', uploadId, error)
        })
        .finally(() => {
          pendingMediaFetchesRef.current.delete(uploadId)
        })
    })

    return () => {
      cancelled = true
    }
  }, [sceneMediaUploadIds])

  useEffect(() => {
    const activeUploadIds = sceneMediaUploadIds
    const staleUploadIds = []

    mediaUrlCacheRef.current.forEach((url, uploadId) => {
      if (!activeUploadIds.has(uploadId)) {
        URL.revokeObjectURL(url)
        staleUploadIds.push(uploadId)
      }
    })

    if (staleUploadIds.length === 0) {
      return
    }

    staleUploadIds.forEach((uploadId) => {
      mediaUrlCacheRef.current.delete(uploadId)
      pendingMediaFetchesRef.current.delete(uploadId)
    })

    setMediaSources((prev) => {
      const next = { ...prev }
      staleUploadIds.forEach((uploadId) => {
        delete next[uploadId]
      })
      return next
    })

    setMediaMimeTypes((prev) => {
      const next = { ...prev }
      staleUploadIds.forEach((uploadId) => {
        delete next[uploadId]
      })
      return next
    })
  }, [overlayDescriptors])

  useImperativeHandle(ref, () => ({
    getSnapshotData() {
      const { elements, appState, files } = sceneRef.current
      const json = JSON.stringify({ elements, appState, files })
      return btoa(unescape(encodeURIComponent(json)))
    },
    loadData(base64Data) {
      try {
        const nextScene = decodeSnapshotScene(base64Data)
        sceneRef.current = nextScene
        if (excalidrawRef.current) {
          remoteApplyRef.current = true
          applyScene(excalidrawRef.current, nextScene)
          requestAnimationFrame(() => { remoteApplyRef.current = false })
        }
      } catch (err) {
        console.error('[ExcalidrawWrapper] loadData failed:', err)
      }
    },
    getSceneViewport() {
      if (!excalidrawRef.current) return null
      const appState = excalidrawRef.current.getAppState()
      return { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom }
    },
    flushPendingSync() {
      if (syncFrameRef.current) {
        clearTimeout(syncFrameRef.current)
        syncFrameRef.current = null
      }
      setData(sceneRef.current)
    }
  }), [applyScene, setData])

  // Memoized to keep stable reference for Excalidraw's React.memo areEqual check.
  // Inline function would break isShallowEqual on every parent render, causing
  // a perpetual re-render loop: onChange → setOverlayState → re-render → Excalidraw re-render → onChange → ...
  const renderTopRightUI = useCallback(() => {
    if (!canEdit) return null
    return (
      <>
        <button
          className="sidebar-trigger default-sidebar-trigger"
          type="button"
          aria-label="插入媒体"
          title="插入图片或视频"
          onClick={() => fileInputRef.current?.click()}
        >
          <div>
            <svg
              aria-hidden="true"
              focusable="false"
              role="img"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <g strokeWidth="1.5">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M15 8h.01" />
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M4 15l4 -4a3 5 0 0 1 3 0l4 4" />
                <path d="M14 14l1 -1a3 5 0 0 1 3 0l2 2" />
              </g>
            </svg>
          </div>
          <div className="sidebar-trigger__label">插入媒体</div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      </>
    )
  }, [canEdit, handleFileInputChange])

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading editor...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <Excalidraw
        excalidrawAPI={handleAPI}
        onChange={handleChange}
        onPaste={handlePaste}
        initialData={initialData}
        theme="light"
        langCode="zh-CN"
        viewModeEnabled={!canEdit}
        UIOptions={uiOptions}
        renderTopRightUI={renderTopRightUI}
      />

      {/* Overlay for animated GIFs and videos.
          Positions are updated by a background RAF loop that directly
          manipulates DOM styles, so components stay mounted during drag
          and media continues playing uninterrupted. */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" style={{ contain: 'layout style paint' }}>
        {overlayDescriptors.map((overlay) => {
          const src = mediaSources[overlay.uploadId]
          const mimeType = mediaMimeTypes[overlay.uploadId] || overlay.mimeType
          if (!src) return null
          if (mimeType !== 'image/gif' && !mimeType.startsWith('video/')) return null

          return (
            <MediaOverlayItem
              key={overlay.id}
              elementId={overlay.id}
              src={src}
              mimeType={mimeType}
              uploadId={overlay.uploadId}
              registerRef={registerMediaRef}
              unregisterRef={unregisterMediaRef}
            />
          )
        })}
      </div>
    </div>
  )
})

export default ExcalidrawWrapper
