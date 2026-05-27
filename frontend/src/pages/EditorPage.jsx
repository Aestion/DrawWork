import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useBoardStore } from '../stores/boardStore'
import { useCanvasStore } from '../stores/canvasStore'
import CanvasSidebar from '../components/Editor/CanvasSidebar'
const ExcalidrawWrapper = lazy(() => import('../components/Editor/ExcalidrawWrapper'))
const TencentMindEditor = lazy(() => import('../components/Editor/TencentMindEditor'))
import KanbanEditor from '../components/Editor/KanbanEditor'
import SwimlaneEditor from '../components/Editor/SwimlaneEditor'
import SharePanel from '../components/Editor/SharePanel'
import VersionHistory from '../components/Editor/VersionHistory'
import NotificationBell from '../components/Notifications/NotificationBell'
import ErrorBoundary from '../components/ErrorBoundary'
import CommentsOverlay from '../components/Editor/CommentsOverlay'
import VotePanel from '../components/Editor/VotePanel'
import { ToastContainer, toast } from '../components/ui/Toast'
import api from '../lib/axios'

const DISABLED_CANVAS_TYPES = new Set(['simplemindmap', 'mindelixir', 'mindmap'])

function DisabledCanvasNotice() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500">
      <div className="text-center">
        <div className="text-sm font-medium text-gray-700">此画布类型已停用</div>
        <div className="mt-1 text-xs text-gray-400">请新建推荐画布类型继续使用。</div>
      </div>
    </div>
  )
}

export default function EditorPage() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user, init } = useAuthStore()
  const { boards, fetchBoards, isLoading: boardsLoading } = useBoardStore()
  const { canvases, currentCanvas, fetchCanvases, createCanvas, deleteCanvas, updateCanvas, setCurrentCanvas, reset, isLoading: canvasesLoading } = useCanvasStore()
  const [board, setBoard] = useState(null)
  // Keep connection status stable while canvases switch.
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, synced: false, label: 'disconnected', onlineCount: 1 })
  const lastStatusRef = useRef(connectionStatus)
  const activeCanvasIdRef = useRef(null)

  const handleConnectionChange = useCallback((status, canvasId) => {
    // Only accept updates from the active canvas.
    if (canvasId && canvasId !== activeCanvasIdRef.current) {
      return
    }

    // Avoid repeating identical connection-status updates.
    const newStatus = {
      connected: status.connected,
      synced: status.synced,
      label: status.label,
      onlineCount: status.onlineCount
    }

    // Ref comparison avoids update loops from repeated equivalent status.
    const lastStatus = lastStatusRef.current
    const hasChanged = lastStatus.connected !== status.connected ||
                      lastStatus.synced !== status.synced ||
                      lastStatus.onlineCount !== status.onlineCount

    if (hasChanged &&
        newStatus.connected !== undefined &&
        newStatus.synced !== undefined &&
        newStatus.label) {
      lastStatusRef.current = newStatus
      setConnectionStatus(newStatus)
    }
  }, [])
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showVotePanel, setShowVotePanel] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [authInitDone, setAuthInitDone] = useState(false)
  const [mountedCanvases, setMountedCanvases] = useState(new Set())

  // Track which canvases have been mounted for keep-alive
  useEffect(() => {
    if (currentCanvas?.id) {
      activeCanvasIdRef.current = currentCanvas.id
      setMountedCanvases(prev => new Set([...prev, currentCanvas.id]))
    } else {
      activeCanvasIdRef.current = null
    }
  }, [currentCanvas?.id])

  // Version restore
  const excalidrawRef = useRef(null)
  const tencentMindRef = useRef(null)
  const [snapshotSaving, setSnapshotSaving] = useState(false)

  const saveSnapshot = async (name) => {
    if (!currentCanvas) return
    if (DISABLED_CANVAS_TYPES.has(currentCanvas.type)) return
    setSnapshotSaving(true)
    try {
      let base64
      if (currentCanvas.type === 'excalidraw') {
        base64 = excalidrawRef.current?.getSnapshotData?.()
      } else if (currentCanvas.type === 'tencentmind') {
        base64 = tencentMindRef.current?.getSnapshotData?.()
      } else {
        return
      }
      if (!base64) return
      await api.post(`/canvases/${currentCanvas.id}/snapshot`, { data: base64, name })
    } finally {
      setSnapshotSaving(false)
    }
  }

  const restoreSnapshot = async (snapshotId) => {
    if (!currentCanvas) return
    if (DISABLED_CANVAS_TYPES.has(currentCanvas.type)) return
    const res = await api.get(`/canvases/${currentCanvas.id}/snapshots/${snapshotId}`)
    if (currentCanvas.type === 'excalidraw') {
      await excalidrawRef.current?.loadData?.(res.data.data)
    } else if (currentCanvas.type === 'tencentmind') {
      await tencentMindRef.current?.loadData?.(res.data.data)
    }
  }

  const deleteSnapshot = async (snapshotId) => {
    if (!currentCanvas) return
    await api.delete(`/canvases/${currentCanvas.id}/snapshots/${snapshotId}`)
  }

  // Coordinate conversion for comment overlay
  const sceneToPixel = useCallback((x, y) => {
    const vp = excalidrawRef.current?.getSceneViewport()
    if (!vp) return { left: x, top: y }
    return {
      left: (x - vp.scrollX) * vp.zoom,
      top: (y - vp.scrollY) * vp.zoom
    }
  }, [])

  const pixelToScene = useCallback((px, py) => {
    const vp = excalidrawRef.current?.getSceneViewport()
    if (!vp) return { x: px, y: py }
    return {
      x: px / vp.zoom + vp.scrollX,
      y: py / vp.zoom + vp.scrollY
    }
  }, [])

  // Reset when boardId changes
  useEffect(() => {
    setInitialLoadDone(false)
    setBoard(null)
  }, [boardId])

  useEffect(() => {
    init().finally(() => setAuthInitDone(true))
    return () => reset()
  }, [])

  // Redirect to login if auth init completed without a user (expired session)
  useEffect(() => {
    if (authInitDone && !user) {
      navigate('/login')
    }
  }, [authInitDone, user, navigate])

  // Fetch boards if not loaded
  useEffect(() => {
    if (user && boards.length === 0 && !boardsLoading) {
      fetchBoards()
    }
  }, [user, boards.length, boardsLoading, fetchBoards])

  // Set board and fetch canvases when boards are loaded
  useEffect(() => {
    if (!user || initialLoadDone) return

    const b = boards.find(b => b.id === boardId)
    if (b) {
      setBoard(b)
      fetchCanvases(boardId)
      setInitialLoadDone(true)
    }
  }, [user, boardId, boards, initialLoadDone, fetchCanvases])

  // Fallback: fetch board directly if not found in boards list (for shared boards)
  useEffect(() => {
    if (!user || initialLoadDone || board) return

    const timeoutId = setTimeout(async () => {
      try {
        const res = await api.get(`/boards/${boardId}`)
        setBoard(res.data)
        fetchCanvases(boardId)
        setInitialLoadDone(true)
      } catch (err) {
        console.error('Failed to fetch board:', err)
        toast.error('加载画板失败：' + (err.response?.data?.detail || err.message))
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [user, boardId, board, initialLoadDone, fetchCanvases])

  // Poll for canvas list changes so collaborators see new/renamed/deleted canvases
  useEffect(() => {
    if (!boardId || !board) return
    const interval = setInterval(() => {
      fetchCanvases(boardId)
    }, 3000)
    return () => clearInterval(interval)
  }, [boardId, board, fetchCanvases])

  // For newly created boards, if permission is undefined but user is the owner via board.owner_id, allow edit
  const canEdit = board?.permission === 'owner' || board?.permission === 'editor' ||
    (board && user && board.owner_id === user.id)

  const handleSwitchCanvas = (canvas) => {
    // Flush pending Yjs sync before switching (prevents data loss)
    if (currentCanvas?.type === 'excalidraw') {
      excalidrawRef.current?.flushPendingSync?.()
    }
    activeCanvasIdRef.current = canvas?.id || null
    setCurrentCanvas(canvas)
  }

  const handleCreateCanvas = async (type) => {
    const name = `画布 ${canvases.length + 1}`
    await createCanvas(boardId, { name, type })
  }

  const handleDeleteCanvas = async (id) => {
    await deleteCanvas(id)
  }

  const handleRenameCanvas = async (id, name) => {
    await updateCanvas(id, { name })
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (boardsLoading || !initialLoadDone) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">加载画板...</div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">画板不存在或无权访问</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white shadow px-4 py-2 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-4">
          <button
            className="text-gray-600 hover:text-gray-900"
            onClick={() => navigate('/')}
          >
            ← 返回
          </button>
          <h1 className="text-lg font-semibold">{board.name}</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500 flex items-center space-x-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connectionStatus.label === 'synced'
                  ? 'bg-green-500'
                  : connectionStatus.label === 'syncing'
                    ? 'bg-blue-500 animate-pulse'
                    : connectionStatus.label === 'read-only'
                      ? 'bg-gray-400'
                      : 'bg-yellow-500'
              }`}
              title={connectionStatus.label}
            />
            <span>{connectionStatus.onlineCount || 1} 人在线</span>
          </span>
          <NotificationBell />
          <button
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            onClick={() => setShowVersionHistory(true)}
          >
            版本
          </button>
          <button
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            onClick={() => setShowVotePanel(true)}
          >
            投票
          </button>
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            onClick={() => setShowSharePanel(true)}
          >
            分享
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <CanvasSidebar
          canvases={canvases}
          currentCanvas={currentCanvas}
          onSwitch={handleSwitchCanvas}
          onCreate={handleCreateCanvas}
          onDelete={handleDeleteCanvas}
          onRename={handleRenameCanvas}
          canEdit={canEdit}
        />

        <div className="flex-1 flex overflow-hidden">
          {currentCanvas && mountedCanvases.size > 0 ? (
            <div className="flex-1 relative flex flex-col overflow-hidden">
              {Array.from(mountedCanvases).map(canvasId => {
                const canvas = canvases.find(c => c.id === canvasId)
                if (!canvas) return null
                const isActive = canvas.id === currentCanvas.id
                return (
                  <div
                    key={canvas.id}
                    className="absolute inset-0 flex flex-col overflow-hidden"
                    style={{ display: isActive ? '' : 'none' }}
                  >
                    {canvas.type === 'excalidraw' ? (
                      <ErrorBoundary>
                        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">加载编辑器...</div>}>
                          <ExcalidrawWrapper
                            ref={excalidrawRef}
                            canvasId={canvas.id}
                            roomId={canvas.yjs_room_id}
                            canEdit={canEdit}
                            boardId={boardId}
                            onConnectionChange={handleConnectionChange}
                            isActive={isActive}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    ) : ['simplemindmap', 'mindelixir', 'mindmap'].includes(canvas.type) ? (
                      <DisabledCanvasNotice />
                    ) : canvas.type === 'kanban' ? (
                      <KanbanEditor
                        canvasId={canvas.id}
                        roomId={canvas.yjs_room_id}
                        canEdit={canEdit}
                        onConnectionChange={handleConnectionChange}
                        isActive={isActive}
                      />
                    ) : canvas.type === 'swimlane' ? (
                      <SwimlaneEditor
                        canvasId={canvas.id}
                        roomId={canvas.yjs_room_id}
                        canEdit={canEdit}
                        onConnectionChange={handleConnectionChange}
                        isActive={isActive}
                      />
                    ) : canvas.type === 'tencentmind' ? (
                      <ErrorBoundary>
                        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">加载腾讯思维...</div>}>
                          <TencentMindEditor
                            ref={tencentMindRef}
                            canvasId={canvas.id}
                            roomId={canvas.yjs_room_id}
                            canEdit={canEdit}
                            boardId={boardId}
                            onConnectionChange={handleConnectionChange}
                            isActive={isActive}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    ) : (
                      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
                        未知画布类型
                      </div>
                    )}
                  </div>
                )
              })}
              {currentCanvas && (
                <CommentsOverlay
                  canvasId={currentCanvas.id}
                  canComment={canEdit}
                  sceneToPixel={currentCanvas.type === 'excalidraw' ? sceneToPixel : undefined}
                  pixelToScene={currentCanvas.type === 'excalidraw' ? pixelToScene : undefined}
                />
              )}
              {showVotePanel && (
                <VotePanel
                  canvasId={currentCanvas.id}
                  canEdit={canEdit}
                  onClose={() => setShowVotePanel(false)}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
              选择或创建一个画布
            </div>
          )}
        </div>
      </div>

      {showSharePanel && (
        <SharePanel
          boardId={boardId}
          onClose={() => setShowSharePanel(false)}
        />
      )}

      {showVersionHistory && currentCanvas && (
        <VersionHistory
          canvasId={currentCanvas.id}
          onClose={() => setShowVersionHistory(false)}
          onSave={canEdit ? saveSnapshot : null}
          onRestore={canEdit ? restoreSnapshot : null}
          onDelete={canEdit ? deleteSnapshot : null}
        />
      )}

      <ToastContainer />
    </div>
  )
}

