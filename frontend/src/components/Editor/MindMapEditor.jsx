import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext, forwardRef, useImperativeHandle } from 'react'
import { useAuthStore } from '../../stores/authStore'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Panel,
  Position,
  Handle,
  BaseEdge,
  EdgeLabelRenderer,
  getSimpleBezierPath,
  useStore,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  updateEdgeHandles,
  calculateMultiTreeLayout,
  applyLayoutWithOffsets,
  serializeSubtree,
  deserializeSubtree,
  treesToFlowData,
  flowDataToTrees,
  exportToMarkdown,
  importFromMarkdown
} from './mindmap-utils'
import api from '../../lib/axios'
import { useMindMapYjs } from '../../hooks/useMindMapYjs'

// Context for node callbacks
const NodeCallbacksContext = createContext(null)

// Context for mind map actions (per-root layout toggle)
const MindMapActionsContext = createContext(null)

// Context for editing node ID (direct, bypasses data pipeline)
const EditingNodeContext = createContext(null)

// Node types
const nodeTypes = {
  mindNode: MindNode
}

// Cross-connection edge component
function CrossConnectionEdge({ id, source, target, sourceX, sourceY, targetX, targetY, label, selected, data }) {
  const sourceNode = useStore(useCallback((store) => store.nodeLookup.get(source) || null, [source]))
  const targetNode = useStore(useCallback((store) => store.nodeLookup.get(target) || null, [target]))

  const [edgePath] = useMemo(() => {
    // Use shortest-distance routing between node bounding boxes
    if (sourceNode?.width > 0 && sourceNode?.height > 0 && targetNode?.width > 0 && targetNode?.height > 0) {
      const srcCx = sourceNode.position.x + sourceNode.width / 2
      const srcCy = sourceNode.position.y + sourceNode.height / 2
      const tgtCx = targetNode.position.x + targetNode.width / 2
      const tgtCy = targetNode.position.y + targetNode.height / 2
      const sp = getEdgePointOnRect(srcCx, srcCy, tgtCx, tgtCy, sourceNode.width / 2, sourceNode.height / 2)
      const tp = getEdgePointOnRect(tgtCx, tgtCy, srcCx, srcCy, targetNode.width / 2, targetNode.height / 2)
      return getSimpleBezierPath({
        sourceX: sp.x, sourceY: sp.y,
        sourcePosition: getSideFromCenter(srcCx, srcCy, sp.x, sp.y),
        targetX: tp.x, targetY: tp.y,
        targetPosition: getSideFromCenter(tgtCx, tgtCy, tp.x, tp.y),
      })
    }
    return getSimpleBezierPath({ sourceX, sourceY, targetX, targetY })
  }, [
    sourceNode?.position?.x, sourceNode?.position?.y,
    sourceNode?.width, sourceNode?.height,
    targetNode?.position?.x, targetNode?.position?.y,
    targetNode?.width, targetNode?.height,
    sourceX, sourceY, targetX, targetY
  ])

  const handleDelete = (e) => {
    e.stopPropagation()
    if (data?.onDelete) data.onDelete(id)
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#3b82f6' : '#999',
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: '5,5'
        }}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            className="px-1 py-0.5 text-xs bg-white border rounded shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`
            }}
          >
            {label}
          </div>
        )}
        {data?.canEdit && selected && (
          <button
            className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2 + 15}px, ${(sourceY + targetY) / 2}px)`
            }}
            onClick={handleDelete}
          >
            ×
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Helper: find where the ray from center to target exits this rectangle
function getEdgePointOnRect(centerX, centerY, targetCenterX, targetCenterY, halfW, halfH) {
  const dx = targetCenterX - centerX
  const dy = targetCenterY - centerY
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY }
  const t = Math.min(halfW / Math.abs(dx), halfH / Math.abs(dy))
  return { x: centerX + dx * t, y: centerY + dy * t }
}

function getSideFromCenter(centerX, centerY, pointX, pointY) {
  const dx = pointX - centerX
  const dy = pointY - centerY
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Position.Right : Position.Left
  } else {
    return dy > 0 ? Position.Bottom : Position.Top
  }
}

// Edge types
const edgeTypes = {
  crossConnection: CrossConnectionEdge,
  mindmap: MindMapEdge
}

// Mind map edge component - supports different path types based on node depth
function MindMapEdge({ id, source, target, sourceX, sourceY, targetX, targetY, selected }) {
  const sourceNode = useStore(useCallback((store) => store.nodeLookup.get(source) || null, [source]))
  const targetNode = useStore(useCallback((store) => store.nodeLookup.get(target) || null, [target]))

  const edgePath = useMemo(() => {
    const sourceDepth = sourceNode?.data?.depth || 0
    const targetDepth = targetNode?.data?.depth || 0

    // 判断是否是根节点与1级子节点连接
    const isRootToLevel1 = (sourceDepth === 0 && targetDepth === 1) || (sourceDepth === 1 && targetDepth === 0)

    if (isRootToLevel1) {
      // 保持现有的贝塞尔曲线
      const dx = Math.abs(targetX - sourceX)
      const controlOffset = Math.max(dx * 0.5, 50)
      let path
      if (targetX > sourceX) {
        path = `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`
      } else {
        path = `M ${sourceX} ${sourceY} C ${sourceX - controlOffset} ${sourceY}, ${targetX + controlOffset} ${targetY}, ${targetX} ${targetY}`
      }
      return path
    } else {
      // 其他级别使用直线+转角
      return getRectilinearPath({ sourceX, sourceY, targetX, targetY })
    }
  }, [sourceNode, targetNode, sourceX, sourceY, targetX, targetY])

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: selected ? '#3b82f6' : '#94a3b8',
        strokeWidth: selected ? 2.5 : 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        transition: 'stroke 0.15s, stroke-width 0.15s'
      }}
    />
  )
}

// 直线转角路径算法
function getRectilinearPath({ sourceX, sourceY, targetX, targetY }) {
  // Spread the bend point proportionally to the perpendicular distance,
  // so sibling paths fan out instead of overlapping. Clamped to stay
  // between source and target to prevent backward segments.
  const SPREAD = 0.6

  if (Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY)) {
    const midX = (sourceX + targetX) / 2
    const bendX = midX + (targetY - sourceY) * SPREAD
    const clampedX = Math.min(Math.max(bendX, Math.min(sourceX, targetX) + 5), Math.max(sourceX, targetX) - 5)
    return `M ${sourceX} ${sourceY} H ${clampedX} V ${targetY} H ${targetX}`
  } else {
    const midY = (sourceY + targetY) / 2
    const bendY = midY + (targetX - sourceX) * SPREAD
    const clampedY = Math.min(Math.max(bendY, Math.min(sourceY, targetY) + 5), Math.max(sourceY, targetY) - 5)
    return `M ${sourceX} ${sourceY} V ${clampedY} H ${targetX} V ${targetY}`
  }
}

// Media item component
function MediaItemView({ item, onDelete, canEdit }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get(`/upload/${item.uploadId}`, { responseType: 'blob' })
      .then((res) => {
        const objectUrl = URL.createObjectURL(res.data)
        setUrl(objectUrl)
      })
      .catch(() => setError(true))

    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [item.uploadId])

  if (error) {
    return <div className="text-xs text-red-500">[加载失败]</div>
  }

  if (!url) {
    return <div className="text-xs text-gray-400">[加载中...]</div>
  }

  return (
    <div className="relative group">
      {item.type === 'video' ? (
        <video src={url} className="w-20 h-20 object-cover rounded" muted loop autoPlay playsInline />
      ) : (
        <img src={url} alt={item.fileName} className="w-20 h-20 object-cover rounded" />
      )}
      {canEdit && (
        <button
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          ×
        </button>
      )}
    </div>
  )
}

// Custom node component with media support
function MindNode({ id, data, selected }) {
  // Use both React Flow's built-in selected (from clicks) and programmatic selected (from arrow nav)
  const isSelected = selected || data._programmaticSelected
  const callbacks = useContext(NodeCallbacksContext)
  const isCurrentMatch = data._searchCurrent
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(data.label)
  const [showMedia, setShowMedia] = useState(true)
  const inputRef = useRef(null)
  const media = data.media || []

  // 视觉反馈：检查当前节点是否是拖动目标
  const dragTargetNode = useContext(MindMapActionsContext)?.dragTargetNode
  const isDragTarget = dragTargetNode?.id === id

  const mindMapActions = useContext(MindMapActionsContext)
  const isRoot = mindMapActions?.rootIds?.has(id) || false
  const editingContext = useContext(EditingNodeContext)

  // Enter edit mode automatically for newly created nodes.
  // Single per-render effect checks all sources of truth (data flag, context ID, pending ref Set).
  // autoEditConsumedRef guards against firing more than once per component lifetime.
  // This is immune to: React Flow virtualization, component reuse, Yjs sync stripping flags.
  const autoEditRef = useRef(false)
  const autoEditConsumedRef = useRef(false)
  useEffect(() => {
    if (autoEditConsumedRef.current) return
    if (data._autoEdit || data._forceEdit || editingContext?.pendingAutoEditRef?.current?.has(id)) {
      autoEditConsumedRef.current = true
      editingContext?.pendingAutoEditRef?.current?.delete(id)
      autoEditRef.current = true
      setIsEditing(true)
    }
  })

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Defer focus to next tick to let React Flow finish selection updates
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isEditing])

  const handleSubmit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== data.label) {
      // Try context callback first, then fall back to data callback
      if (callbacks?.onChange) {
        callbacks.onChange(id, trimmed)
      } else if (data.onChange) {
        data.onChange(trimmed)
      }
    } else {
      setEditText(data.label)
    }
    setIsEditing(false)
    // Only clear editingNodeId if this node is still the editing target
    // (prevents stale onBlur closures from overwriting a newly created node's editing state)
    if (editingContext?.editingNodeIdRef?.current === id) {
      editingContext?.setEditingNodeId?.(null)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setEditText(data.label)
      setIsEditing(false)
      if (editingContext?.editingNodeIdRef?.current === id) {
        editingContext?.setEditingNodeId?.(null)
      }
    }
  }

  const handleAddMedia = (e) => {
    e.stopPropagation()
    if (callbacks?.onAddMedia) {
      callbacks.onAddMedia()
    } else if (data.onAddMedia) {
      data.onAddMedia()
    }
  }

  const handleDeleteMedia = (index) => {
    if (callbacks?.onDeleteMedia) {
      callbacks.onDeleteMedia(id, index)
    } else if (data.onDeleteMedia) {
      data.onDeleteMedia(index)
    }
  }

  return (
    <div
      data-node-id={id}
      className={`relative rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-lg'
          : isDragTarget
            ? 'border-green-500 bg-green-50 shadow-lg ring-2 ring-green-500 ring-offset-2'
            : data.depth === 0
              ? 'border-amber-400 bg-amber-50 hover:border-amber-500 font-bold'
              : data.depth === 1
                ? 'border-sky-400 bg-sky-50 hover:border-sky-500 font-medium'
                : 'border-gray-300 bg-white hover:border-gray-400'
      } ${isCurrentMatch ? '!ring-2 !ring-blue-500 !ring-offset-2' : ''}`}
      style={{
        ...(data.style?.bgColor ? { backgroundColor: data.style.bgColor } : {}),
        ...(data.style?.borderColor ? { borderColor: data.style.borderColor } : {}),
        ...(data.style?.borderWidth ? { borderWidth: data.style.borderWidth } : {}),
      }}
      onDoubleClick={() => data.canEdit && setIsEditing(true)}
    >
      {/* All handles always rendered to prevent Error 008 — invisible handles are hidden via opacity */}
      <Handle type="target" position={Position.Top} className={`!bg-gray-400 !w-2 !h-2 ${data.side ? 'opacity-0 pointer-events-none' : ''}`} />
      <Handle type="source" position={Position.Bottom} className={`!bg-gray-400 !w-2 !h-2 ${data.side ? 'opacity-0 pointer-events-none' : ''}`} />
      <Handle type="source" position={Position.Left} id="source-left" className={`!bg-gray-400 !w-2 !h-2 ${data.side !== 'center' && data.side !== 'left' ? 'opacity-0 pointer-events-none' : ''}`} />
      <Handle type="source" position={Position.Right} id="source-right" className={`!bg-gray-400 !w-2 !h-2 ${data.side !== 'center' && data.side !== 'right' ? 'opacity-0 pointer-events-none' : ''}`} />
      <Handle type="target" position={Position.Left} id="target-left" className={`!bg-gray-400 !w-2 !h-2 ${data.side !== 'center' && data.side !== 'right' ? 'opacity-0 pointer-events-none' : ''}`} />
      <Handle type="target" position={Position.Right} id="target-right" className={`!bg-gray-400 !w-2 !h-2 ${data.side !== 'center' && data.side !== 'left' ? 'opacity-0 pointer-events-none' : ''}`} />

      {/* Main content */}
      <div className="px-4 py-2">
        {isEditing ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none text-sm min-w-[80px]"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className="flex items-center gap-1">
            {data.hasChildren && (
              <button
                title={data.collapsed ? '展开' : '折叠'}
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-transform"
                onClick={(e) => { e.stopPropagation(); callbacks?.onToggleCollapse?.(id) }}
                style={{ transform: data.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              >
                ▼
              </button>
            )}
            <span className="text-sm whitespace-nowrap" style={{
              ...(data.style?.fontSize ? { fontSize: `${data.style.fontSize}px` } : {}),
              ...(data.style?.fontColor ? { color: data.style.fontColor } : {}),
            }}>{data.label}</span>
          </span>
        )}
      </div>

      {/* Media section */}
      {media.length > 0 && (
        <div className="px-4 pb-2 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1 mt-1">
            <span className="text-xs text-gray-500">{media.length} 个附件</span>
            <div className="flex items-center space-x-1">
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setShowMedia(!showMedia)}
              >
                {showMedia ? '收起' : '展开'}
              </button>
            </div>
          </div>
          {showMedia && (
            <div className="flex flex-wrap gap-2">
              {media.map((item, index) => (
                <MediaItemView
                  key={index}
                  item={item}
                  onDelete={() => handleDeleteMedia(index)}
                  canEdit={data.canEdit}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// Remote collaborative cursors overlay rendered inside ReactFlow
function CollaborativeCursors({ awarenessStates, screenToFlowPosition, currentUserId }) {
  const remoteStates = []
  awarenessStates.forEach((state, clientId) => {
    const clientStr = String(clientId)
    if (clientStr === currentUserId) return
    const pointer = state.mindmap?.pointer
    const username = state.mindmap?.username || 'anonymous'
    if (!pointer) return
    remoteStates.push({ clientId: clientStr, pointer, username })
  })
  if (remoteStates.length === 0) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}>
      {remoteStates.map(({ clientId, pointer, username }) => {
        const color = getCursorColor(clientId)
        // Use screen-to-flow conversion if available
        let x = pointer.x, y = pointer.y
        // offset so cursor tip aligns with mouse
        return (
          <div
            key={clientId}
            style={{
              position: 'absolute',
              left: x - 12,
              top: y - 12,
              pointerEvents: 'none',
              transition: 'left 0.1s ease, top 0.1s ease'
            }}
          >
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 2L14 22L17 15L22 15" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.3" strokeLinejoin="round"/>
              <circle cx="8" cy="5" r="4" fill={color} stroke="white" strokeWidth="1.5" />
            </svg>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: color,
                color: 'white',
                position: 'absolute',
                left: 10,
                top: 12,
                whiteSpace: 'nowrap'
              }}
            >
              {username}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Inject getCursorColor into the module scope for CollaborativeCursors
const CURSOR_COLORS_GLOBAL = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#48dbfb', '#ff9f43', '#a29bfe']
const colorMapGlobal = new Map()
function getCursorColor(userId) {
  if (colorMapGlobal.has(userId)) return colorMapGlobal.get(userId)
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = CURSOR_COLORS_GLOBAL[Math.abs(hash) % CURSOR_COLORS_GLOBAL.length]
  colorMapGlobal.set(userId, color)
  return color
}

// Style presets
const STYLE_COLORS = [
  { label: '默认', value: '' },
  { label: '红色', value: '#ef4444' },
  { label: '橙色', value: '#f97316' },
  { label: '琥珀', value: '#f59e0b' },
  { label: '黄色', value: '#eab308' },
  { label: '黄绿', value: '#84cc16' },
  { label: '绿色', value: '#22c55e' },
  { label: '青色', value: '#06b6d4' },
  { label: '天蓝', value: '#0ea5e9' },
  { label: '蓝色', value: '#3b82f6' },
  { label: '靛蓝', value: '#6366f1' },
  { label: '紫色', value: '#a855f7' },
  { label: '粉色', value: '#ec4899' },
  { label: '灰色', value: '#6b7280' },
  { label: '白色', value: '#ffffff' },
]

const FONT_SIZES = [
  { label: '小', value: 12 },
  { label: '中', value: 14 },
  { label: '大', value: 18 },
  { label: '特大', value: 24 },
]

const BORDER_WIDTHS = [
  { label: '细', value: 1 },
  { label: '中', value: 2 },
  { label: '粗', value: 3 },
  { label: '特粗', value: 4 },
]

// Style panel for customising node appearance
function StylePanel({ style, onChange, onClose }) {
  const current = style || {}

  const set = (key, value) => {
    onChange({ ...current, [key]: value || undefined })
  }

  const clearAll = () => {
    onChange({})
  }

  const hasCustomStyle = current.bgColor || current.borderColor || current.borderWidth || current.fontSize || current.fontColor

  return (
    <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg p-3 z-50 w-64" onClick={(e) => e.stopPropagation()}>
      {/* Background color */}
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1">背景色</div>
        <div className="flex flex-wrap gap-1">
          {STYLE_COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-6 h-6 rounded-full border ${current.bgColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ backgroundColor: c.value || 'transparent', borderColor: c.value ? c.value : '#ccc' }}
              title={c.label}
              onClick={() => set('bgColor', c.value)}
            />
          ))}
        </div>
      </div>

      {/* Font color */}
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1">字体颜色</div>
        <div className="flex flex-wrap gap-1">
          {STYLE_COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-6 h-6 rounded-full border flex items-center justify-center ${current.fontColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ backgroundColor: c.value || 'transparent', borderColor: c.value ? c.value : '#ccc' }}
              title={c.label}
              onClick={() => set('fontColor', c.value)}
            >
              {c.value === '' && <span className="text-[8px] text-gray-400">A</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Border color */}
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1">边框色</div>
        <div className="flex flex-wrap gap-1">
          {STYLE_COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-6 h-6 rounded-full border ${current.borderColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ backgroundColor: c.value || 'transparent', borderColor: c.value ? c.value : '#ccc' }}
              title={c.label}
              onClick={() => set('borderColor', c.value)}
            />
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1">字体大小</div>
        <div className="flex gap-1">
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              className={`flex-1 py-1 text-xs rounded border ${current.fontSize === s.value ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'}`}
              onClick={() => set('fontSize', s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Border width */}
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1">边框粗细</div>
        <div className="flex gap-1">
          {BORDER_WIDTHS.map((w) => (
            <button
              key={w.value}
              className={`flex-1 py-1 text-xs rounded border ${current.borderWidth === w.value ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'}`}
              onClick={() => set('borderWidth', w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      {hasCustomStyle && (
        <button
          className="w-full mt-1 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
          onClick={clearAll}
        >
          清除样式
        </button>
      )}
    </div>
  )
}

const MindMapEditor = forwardRef(function MindMapEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const [showHelp, setShowHelp] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const selectedNodeRef = useRef(selectedNode)
  const dragStartPosRef = useRef(null)
  const edgesRef = useRef(null)
  const searchInputRef = useRef(null)
  const clipboardRef = useRef(null)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })

  // 视觉反馈状态
  const [dragTargetNode, setDragTargetNode] = useState(null)
  const [dragDistance, setDragDistance] = useState(null)

  // Cross-connection state
  const [pendingCrossSource, setPendingCrossSource] = useState(null)

  // Programmatic selection tracking — prevents onSelectionChange from overriding
  const programmaticSelectionRef = useRef(null)

  // Track which node should auto-enter edit mode (separate from selectedNode)
  const [editingNodeId, setEditingNodeId] = useState(null)
  const editingNodeIdRef = useRef(null)
  editingNodeIdRef.current = editingNodeId
  // Ref-based auto-edit set — immune to Yjs sync / data pipeline stripping
  const pendingAutoEditRef = useRef(new Set())

  // Get auth token from store (consistent with ExcalidrawWrapper)
  const token = useAuthStore((state) => state.token)
  const currentUser = useAuthStore((state) => state.user)

  // Yjs real-time sync
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    setNodesAndEdges,
    setNodesLocal,
    setEdgesLocal,
    loading: yjsLoading,
    error: yjsError,
    connected,
    synced,
    onlineCount,
    awareness,
    awarenessStates,
    updateAwareness,
    remoteUpdateVersion
  } = useMindMapYjs({
    canvasId,
    roomId,
    token,
    canEdit
  })

  // Expose snapshot/restore methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSnapshotData() {
      return flowDataToTrees(nodesRef.current, edgesRef.current)
    },
    loadData(newNodes, newEdges) {
      setNodesAndEdges(newNodes, newEdges)
      const { roots, crossConnections } = flowDataToTrees(newNodes, newEdges)
      api.put(`/canvases/${canvasId}/mindmap`, { roots, crossConnections })
    },
    getViewport() {
      return viewportRef.current
    }
  }), [canvasId, setNodesAndEdges])

  const [saving, setSaving] = useState(false)

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Modal state (replaces native alert/confirm)
  const [modal, setModal] = useState(null)
  const showAlert = useCallback((message) => setModal({ message, type: 'alert' }), [])
  const showConfirm = useCallback((message, onConfirm) => setModal({ message, type: 'confirm', onConfirm }), [])

  // Style panel
  const [showStylePanel, setShowStylePanel] = useState(false)
  const selectedStyleNode = useRef(null)

  // Undo/redo
  const MAX_UNDO = 50
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const undoSkipRef = useRef(false)

  // Recalculate layout after remote Yjs updates (each root reads its own data.layout)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  edgesRef.current = edges

  useEffect(() => {
    if (remoteUpdateVersion > 0) {
      const savedPositions = new Map(nodesRef.current.map(n => [n.id, n.position]))
      const result = calculateMultiTreeLayout(nodesRef.current, edgesRef.current)
      result.nodes = result.nodes.map(n => {
        const saved = savedPositions.get(n.id)
        if (saved) return { ...n, position: { ...saved } }
        return n
      })
      // Use local setters — the data already came from Yjs and syncing it
      // back would broadcast to all peers, triggering their layout effects
      // and creating an infinite sync loop (causing edge flickering).
      setNodesLocal(result.nodes)
      setEdgesLocal(result.edges)
    }
  }, [remoteUpdateVersion, setNodesLocal, setEdgesLocal])

  // Recalculate layout once after Yjs initial load completes
  const initialLayoutApplied = useRef(false)
  // Reset flag when canvas changes so new data gets layout applied
  useEffect(() => {
    initialLayoutApplied.current = false
  }, [canvasId])
  useEffect(() => {
    // Wait for nodes to be loaded before applying layout
    if (!yjsLoading && nodes.length > 0 && !initialLayoutApplied.current) {
      initialLayoutApplied.current = true
      const result = calculateMultiTreeLayout(nodesRef.current, edges)
      // Use local setters — each client independently computes layout from
      // shared data, so syncing back is unnecessary and would cause a flood
      // of Yjs broadcasts to all peers on every initial load.
      setNodesLocal(result.nodes)
      setEdgesLocal(result.edges)
    }
  }, [yjsLoading, nodes.length, edges, setNodesLocal, setEdgesLocal])

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

  // Report connection status to parent (EditorPage) - with debounce!
  const lastReportedStatusRef = useRef(null)
  useEffect(() => {
    if (!onConnectionChange) return
    // 如果正在切换画布或编辑器未激活，暂时不更新状态
    if (!isActive || (isSwitchingCanvasRef.current && !connected)) return

    const label = !canEdit
      ? 'read-only'
      : connected
        ? (synced ? 'synced' : 'syncing')
        : 'disconnected'

    const statusToReport = { connected, synced, label, onlineCount }

    // 只有状态真的变化时才报告（避免不必要的更新）
    const lastStatus = lastReportedStatusRef.current
    if (!lastStatus ||
        lastStatus.connected !== connected ||
        lastStatus.synced !== synced ||
        lastStatus.onlineCount !== onlineCount ||
        lastStatus.label !== label) {
      lastReportedStatusRef.current = statusToReport
      onConnectionChange(statusToReport, canvasId)
    }
  }, [connected, synced, onlineCount, canEdit, onConnectionChange, isActive, canvasId])

  // React Flow change handlers.
  // Use LOCAL setters (no Yjs sync) because React Flow fires dimension-change
  // events on every re-render with new node objects. Syncing those back would
  // broadcast to all peers, whose React Flow would also fire dimension changes,
  // creating an infinite sync loop across all collaborators.
  const onNodesChange = useCallback((changes) => {
    setNodesLocal((prevNodes) => {
      const updated = applyNodeChanges(changes, prevNodes)
      return updated
    })
  }, [setNodesLocal])

  const onEdgesChange = useCallback((changes) => {
    setEdgesLocal((prevEdges) => {
      const updated = applyEdgeChanges(changes, prevEdges)
      return updated
    })
  }, [setEdgesLocal])

  // Drag handlers for subtree dragging
  const onNodeDragStart = useCallback((event, node) => {
    dragStartPosRef.current = { id: node.id, x: node.position.x, y: node.position.y }
    setDragTargetNode(null)
    setDragDistance(null)
  }, [])

  const onNodeDrag = useCallback((event, node) => {
    // 检查与其他节点的重叠情况，并更新视觉反馈
    const isRoot = !edgesRef.current.some(
      e => e.target === node.id && !e.data?.crossConnection && e.type !== 'crossConnection'
    )

    if (canEdit && !isRoot) {
      // Collect IDs to exclude: self + all descendants + current parent
      const excludeIds = new Set([node.id])
      const queue = [node.id]
      const visited = new Set()
      while (queue.length > 0) {
        const currentId = queue.shift()
        if (visited.has(currentId)) continue
        visited.add(currentId)
        for (const edge of edgesRef.current) {
          if (edge.data?.crossConnection || edge.type === 'crossConnection') continue
          if (edge.source === currentId && !visited.has(edge.target)) {
            excludeIds.add(edge.target)
            queue.push(edge.target)
          }
        }
      }
      // Exclude current parent
      for (const edge of edgesRef.current) {
        if (edge.data?.crossConnection || edge.type === 'crossConnection') continue
        if (edge.target === node.id) {
          excludeIds.add(edge.source)
          break
        }
      }

      // 查找重叠的节点
      const NODE_WIDTH = 150
      const NODE_HEIGHT = 50
      const OVERLAP_THRESHOLD = 0.3 // 视觉反馈使用较低的阈值，给用户提前提示

      let targetNode = null
      let maxOverlap = 0

      for (const n of nodesRef.current) {
        if (excludeIds.has(n.id)) continue

        // 计算两个节点的边界框
        const nodeA = {
          left: node.position.x - NODE_WIDTH / 2,
          right: node.position.x + NODE_WIDTH / 2,
          top: node.position.y - NODE_HEIGHT / 2,
          bottom: node.position.y + NODE_HEIGHT / 2
        }
        const nodeB = {
          left: n.position.x - NODE_WIDTH / 2,
          right: n.position.x + NODE_WIDTH / 2,
          top: n.position.y - NODE_HEIGHT / 2,
          bottom: n.position.y + NODE_HEIGHT / 2
        }

        // 计算重叠区域
        const overlapLeft = Math.max(nodeA.left, nodeB.left)
        const overlapRight = Math.min(nodeA.right, nodeB.right)
        const overlapTop = Math.max(nodeA.top, nodeB.top)
        const overlapBottom = Math.min(nodeA.bottom, nodeB.bottom)

        // 检查是否有重叠
        if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
          const overlapWidth = overlapRight - overlapLeft
          const overlapHeight = overlapBottom - overlapTop
          const overlapArea = overlapWidth * overlapHeight
          const nodeArea = NODE_WIDTH * NODE_HEIGHT
          const overlapRatio = overlapArea / nodeArea

          // 记录重叠面积最大的节点
          if (overlapRatio > maxOverlap && overlapRatio >= OVERLAP_THRESHOLD) {
            maxOverlap = overlapRatio
            targetNode = n
          }
        }
      }

      setDragTargetNode(targetNode)
      setDragDistance(targetNode ? (1 - maxOverlap) : null)
    }
  }, [canEdit])

  const captureUndoRef = useRef(null)
  // Will be set after captureUndo is defined

  const onNodeDragStop = useCallback((event, node) => {
    const start = dragStartPosRef.current
    if (!start || start.id !== node.id) return

    dragStartPosRef.current = null

    // 清除视觉反馈
    setDragTargetNode(null)
    setDragDistance(null)

    // Ignore tiny movements (clicks, not drags)
    if (Math.abs(node.position.x - start.x) < 5 && Math.abs(node.position.y - start.y) < 5) return

    // --- CHECK: if it's a level 1 node (child of root) ---
    let rootNode = null
    let isLevel1Node = false
    for (const edge of edgesRef.current) {
      if (edge.data?.crossConnection || edge.type === 'crossConnection') continue
      if (edge.target === node.id) {
        const potentialRoot = nodesRef.current.find(n => n.id === edge.source)
        if (potentialRoot && potentialRoot.data?.side === 'center') {
          isLevel1Node = true
          rootNode = potentialRoot
          break
        }
      }
    }

    // --- CASE 1: level 1 node, check if we should switch sides ---
    if (isLevel1Node && rootNode && canEdit) {
      const rootX = rootNode.position.x
      const nodeX = node.position.x
      const currentSide = node.data?.side

      // 判断是否需要切换侧
      const shouldSwitchSide =
        (nodeX < rootX && currentSide === 'right') ||
        (nodeX > rootX && currentSide === 'left')

      const MIN_SWITCH_DISTANCE = 50

      if (shouldSwitchSide && Math.abs(nodeX - rootX) > MIN_SWITCH_DISTANCE) {
        captureUndoRef.current()

        // 更新节点 side 属性
        const updatedNodes = nodesRef.current.map(n => {
          if (n.id === node.id) {
            return {
              ...n,
              data: {
                ...n.data,
                side: currentSide === 'left' ? 'right' : 'left'
              }
            }
          }
          return n
        })

        // 重新计算布局
        const savedPositions = new Map(nodesRef.current.map(n => [n.id, n.position]))
        const savedLayouts = new Map(nodesRef.current.filter(n => n.data?.side === 'center').map(n => [n.id, n.data?.layout]))
        const getLayoutForRoot = (rootId) => savedLayouts.get(rootId) || 'horizontal'
        const result = calculateMultiTreeLayout(updatedNodes, edgesRef.current, getLayoutForRoot)

        // 保持原有位置
        result.nodes = result.nodes.map(n => {
          const saved = savedPositions.get(n.id)
          if (saved) return { ...n, position: { ...saved } }
          return n
        })

        setNodes(result.nodes)
        setEdges(result.edges)
        return
      }
    }

    // --- CASE 2: REPARENTING: check if dropped overlapping another node ---
    const isRoot = !edgesRef.current.some(
      e => e.target === node.id && !e.data?.crossConnection && e.type !== 'crossConnection'
    )

    if (canEdit && !isRoot) {
      // Collect IDs to exclude: self + all descendants + current parent
      const excludeIds = new Set([node.id])
      const queue = [node.id]
      const visited = new Set()
      while (queue.length > 0) {
        const currentId = queue.shift()
        if (visited.has(currentId)) continue
        visited.add(currentId)
        for (const edge of edgesRef.current) {
          if (edge.data?.crossConnection || edge.type === 'crossConnection') continue
          if (edge.source === currentId && !visited.has(edge.target)) {
            excludeIds.add(edge.target)
            queue.push(edge.target)
          }
        }
      }
      // Exclude current parent
      let currentParentId = null
      for (const edge of edgesRef.current) {
        if (edge.data?.crossConnection || edge.type === 'crossConnection') continue
        if (edge.target === node.id) {
          excludeIds.add(edge.source)
          currentParentId = edge.source
          break
        }
      }

      // 查找重叠的节点：检查节点是否与另一个节点重叠
      // 使用节点的位置和大小来判断是否重叠
      // 假设节点大小为：宽度 150，高度 50（根据实际UI调整）
      const NODE_WIDTH = 150
      const NODE_HEIGHT = 50
      const OVERLAP_THRESHOLD = 0.5 // 重叠面积超过 50% 才触发

      let targetNode = null

      for (const n of nodesRef.current) {
        if (excludeIds.has(n.id)) continue

        // 计算两个节点的边界框
        const nodeA = {
          left: node.position.x - NODE_WIDTH / 2,
          right: node.position.x + NODE_WIDTH / 2,
          top: node.position.y - NODE_HEIGHT / 2,
          bottom: node.position.y + NODE_HEIGHT / 2
        }
        const nodeB = {
          left: n.position.x - NODE_WIDTH / 2,
          right: n.position.x + NODE_WIDTH / 2,
          top: n.position.y - NODE_HEIGHT / 2,
          bottom: n.position.y + NODE_HEIGHT / 2
        }

        // 计算重叠区域
        const overlapLeft = Math.max(nodeA.left, nodeB.left)
        const overlapRight = Math.min(nodeA.right, nodeB.right)
        const overlapTop = Math.max(nodeA.top, nodeB.top)
        const overlapBottom = Math.min(nodeA.bottom, nodeB.bottom)

        // 检查是否有重叠
        if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
          const overlapWidth = overlapRight - overlapLeft
          const overlapHeight = overlapBottom - overlapTop
          const overlapArea = overlapWidth * overlapHeight
          const nodeArea = NODE_WIDTH * NODE_HEIGHT

          // 如果重叠面积超过阈值，则触发父节点更换
          if (overlapArea / nodeArea >= OVERLAP_THRESHOLD) {
            targetNode = n
            break
          }
        }
      }

      if (targetNode) {
        captureUndoRef.current()
        const targetId = targetNode.id
        const savedLayouts = new Map(nodesRef.current.filter(n => !edgesRef.current.some(e => e.target === n.id)).map(n => [n.id, n.data?.layout]))
        const getLayoutForRoot = (rootId) => savedLayouts.get(rootId) || 'horizontal'

        // Create new edge (source = target parent)
        const newEdgeId = `edge-${targetId}-${node.id}`
        const newEdge = { id: newEdgeId, source: targetId, target: node.id, type: 'mindmap' }

        // Build edges: replace old edge with new edge, ordered by Y for insert position
        const oldEdgeId = edgesRef.current.find(
          e => e.target === node.id && !e.data?.crossConnection && e.type !== 'crossConnection'
        )?.id
        const edgesWithoutNew = edgesRef.current.filter(e => e.id !== oldEdgeId && e.id !== newEdgeId)
        const siblingEdgeData = edgesWithoutNew
          .filter(e => e.source === targetId && !e.data?.crossConnection && e.type !== 'crossConnection')
          .map(e => ({
            edge: e,
            y: nodesRef.current.find(n => n.id === e.target)?.position?.y || 0
          })).sort((a, b) => a.y - b.y)
        let insertIdx = siblingEdgeData.length
        for (let i = 0; i < siblingEdgeData.length; i++) {
          if (node.position.y < siblingEdgeData[i].y) { insertIdx = i; break }
        }
        const nonSiblingEdges = edgesWithoutNew.filter(
          e => !(e.source === targetId && !e.data?.crossConnection && e.type !== 'crossConnection')
        )
        const siblingEdges = siblingEdgeData.map(d => d.edge)
        siblingEdges.splice(insertIdx, 0, newEdge)
        const newEdges = [...nonSiblingEdges, ...siblingEdges]

        // Compute full layout from scratch with new tree structure
        const result = calculateMultiTreeLayout(nodesRef.current, newEdges, getLayoutForRoot)
        const layoutPositions = new Map(result.nodes.map(n => [n.id, n.position]))

        // Helper: find the root ancestor of a node in the new edge structure
        const findRoot = (nodeId) => {
          let current = nodeId
          while (true) {
            const parentEdge = newEdges.find(e => e.target === current && !e.data?.crossConnection && e.type !== 'crossConnection')
            if (!parentEdge) return current
            current = parentEdge.source
          }
        }

        // Identify affected roots: old parent's root and new parent's root
        const oldParentEdge = edgesRef.current.find(
          e => e.target === node.id && !e.data?.crossConnection && e.type !== 'crossConnection'
        )
        const newParentRoot = findRoot(targetId)
        const oldParentRoot = oldParentEdge ? findRoot(oldParentEdge.source) : null
        const affectedRoots = new Set([newParentRoot])
        if (oldParentRoot) affectedRoots.add(oldParentRoot)

        // For each node: if its root is affected → translate layout pos; else → preserve actual pos
        result.nodes = result.nodes.map(n => {
          const nodeRoot = findRoot(n.id)
          if (affectedRoots.has(nodeRoot)) {
            const rootLayoutPos = layoutPositions.get(nodeRoot)
            const rootActualPos = nodesRef.current.find(p => p.id === nodeRoot)?.position
            if (rootLayoutPos && rootActualPos) {
              const dx = rootActualPos.x - rootLayoutPos.x
              const dy = rootActualPos.y - rootLayoutPos.y
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            }
          }
          const actual = nodesRef.current.find(p => p.id === n.id)
          if (actual) return { ...n, position: { ...actual.position } }
          return n
        })
        setNodes(result.nodes)
        setEdges(result.edges)
        return
      }
    }

    // --- NO REPARENT: snap dragged node back to original position ---
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id === node.id) {
          return { ...n, position: { x: start.x, y: start.y } }
        }
        return n
      })
    )
  }, [setNodes, setEdges, canEdit])

  useEffect(() => {
    selectedNodeRef.current = selectedNode
  }, [selectedNode])


  // Update awareness when selection changes
  useEffect(() => {
    if (selectedNode) {
      updateAwareness({ selectedNode })
    }
  }, [selectedNode, updateAwareness])

  // Save data (supports multiple roots and cross-connections)
  const save = async () => {
    const { roots, crossConnections } = flowDataToTrees(nodes, edges)
    if (roots.length === 0) return

    setSaving(true)
    try {
      await api.put(`/canvases/${canvasId}/mindmap`, {
        roots,
        crossConnections,
        layout: 'vertical'
      })
    } finally {
      setSaving(false)
    }
  }

  // Manual save on Ctrl+S (for HTTP backup)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [save])

  // Update node text
  const updateNodeText = useCallback(
    (nodeId, newText) => {
      captureUndo()
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, label: newText, onChange: node.data.onChange, onAddMedia: node.data.onAddMedia, onDeleteMedia: node.data.onDeleteMedia, canEdit } }
          }
          return node
        })
      )
    },
    [setNodes, canEdit]
  )

  // Update node media
  const updateNodeMedia = useCallback(
    (nodeId, newMedia) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, media: newMedia, onChange: node.data.onChange, onAddMedia: node.data.onAddMedia, onDeleteMedia: node.data.onDeleteMedia, canEdit } }
          }
          return node
        })
      )
    },
    [setNodes, canEdit]
  )

  // Update node style
  const updateNodeStyle = useCallback(
    (nodeId, newStyle) => {
      captureUndo()
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, style: newStyle } }
          }
          return node
        })
      )
    },
    [setNodes]
  )

  // Undo/redo
  const captureUndo = useCallback(() => {
    if (undoSkipRef.current) return
    setUndoStack((prev) => {
      const entry = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
      const next = [...prev.slice(-(MAX_UNDO - 1)), entry]
      return next
    })
    setRedoStack([])
  }, [nodes, edges])

  // Keep captureUndoRef in sync (used by onNodeDragStop to avoid circular init)
  useEffect(() => { captureUndoRef.current = captureUndo }, [captureUndo])

  const handleUndo = useCallback(() => {
    const prev = undoStack[undoStack.length - 1]
    if (!prev) return
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }])
    undoSkipRef.current = true
    setNodesAndEdges(prev.nodes, prev.edges)
    setTimeout(() => { undoSkipRef.current = false }, 0)
  }, [undoStack, nodes, edges, setNodesAndEdges])

  const handleRedo = useCallback(() => {
    const next = redoStack[redoStack.length - 1]
    if (!next) return
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }])
    undoSkipRef.current = true
    setNodesAndEdges(next.nodes, next.edges)
    setTimeout(() => { undoSkipRef.current = false }, 0)
  }, [redoStack, nodes, edges, setNodesAndEdges])

  // Search logic
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set()
    const q = searchQuery.toLowerCase()
    return new Set(nodes.filter((n) => (n.data.label || '').toLowerCase().includes(q)).map((n) => n.id))
  }, [searchQuery, nodes])

  const searchActive = searchQuery.trim().length > 0

  const handleSearchNext = useCallback(() => {
    const ids = Array.from(searchMatches)
    if (ids.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % ids.length)
  }, [searchMatches])

  const handleSearchPrev = useCallback(() => {
    const ids = Array.from(searchMatches)
    if (ids.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + ids.length) % ids.length)
  }, [searchMatches])

  const currentMatchId = useMemo(() => {
    const ids = Array.from(searchMatches)
    return ids.length > 0 ? ids[currentMatchIndex % ids.length] : null
  }, [searchMatches, currentMatchIndex])

  // Fit view to current search match using React Flow API

  // Compute hidden node IDs (descendants of collapsed nodes)
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set()
    const childrenByParent = new Map()
    edges.forEach(e => {
      if (e.data?.crossConnection || e.type === 'crossConnection') return
      if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, [])
      childrenByParent.get(e.source).push(e.target)
    })
    const collapsedNodes = nodes.filter(n => n.data?.collapsed)
    for (const cn of collapsedNodes) {
      const queue = [...(childrenByParent.get(cn.id) || [])]
      while (queue.length > 0) {
        const id = queue.shift()
        hidden.add(id)
        const children = childrenByParent.get(id) || []
        queue.push(...children)
      }
    }
    return hidden
  }, [nodes, edges])

  // Compute root node IDs for MindNode context - MOVED BEFORE searchEnhancedNodes
  const rootIds = useMemo(() => {
    return new Set(nodes.filter(n => !edges.some(e => e.target === n.id)).map(n => n.id))
  }, [nodes, edges])

  // Inject search state into node data so ReactFlow passes it as props to MindNode
  // Also enrich with hasChildren and collapsed info
  const searchEnhancedNodes = useMemo(() => {
    const active = searchQuery.trim().length > 0
    // Compute which nodes have children
    const hasChildrenSet = new Set()
    edges.forEach(e => {
      if (e.data?.crossConnection || e.type === 'crossConnection') return
      hasChildrenSet.add(e.source)
    })
    const baseStyle = (n) => ({
      display: hiddenNodeIds.has(n.id) ? 'none' : undefined,
      opacity: undefined,
    })
    if (!active) {
      return nodes.map(n => ({
        ...n,
        draggable: canEdit,
        data: {
          ...n.data,
          canEdit,
          _searchActive: false,
          _searchMatch: true,
          _searchCurrent: false,
          _programmaticSelected: n.id === selectedNode,
          _forceEdit: n.id === editingNodeId,
          hasChildren: hasChildrenSet.has(n.id)
        },
        style: baseStyle(n)
      }))
    }
    const q = searchQuery.toLowerCase()
    const matchIds = new Set(
      nodes.filter((n) => (n.data.label || '').toLowerCase().includes(q)).map((n) => n.id)
    )
    return nodes.map(n => ({
      ...n,
      draggable: canEdit,
      style: {
        ...baseStyle(n),
        opacity: matchIds.has(n.id) ? 1 : 0.25
      },
      data: {
        ...n.data,
        canEdit,
        _searchActive: true,
        _searchMatch: matchIds.has(n.id),
        _searchCurrent: n.id === currentMatchId,
        _programmaticSelected: n.id === selectedNode,
        _forceEdit: n.id === editingNodeId,
        hasChildren: hasChildrenSet.has(n.id)
      }
    }))
  }, [nodes, searchQuery, currentMatchId, edges, hiddenNodeIds, selectedNode, canEdit, rootIds, editingNodeId])

  // Add media to selected node
  const handleAddMedia = useCallback(() => {
    if (!canEdit) return
    const nodeId = selectedNodeRef.current
    if (!nodeId) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*,.gif'

    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showAlert('文件大小不能超过 10MB')
        return
      }

      setNodes((currentNodes) => {
        const node = currentNodes.find((n) => n.id === nodeId)
        if (!node) return currentNodes

        const currentMedia = node.data.media || []
        if (currentMedia.length >= 5) {
          showAlert('单个节点最多支持 5 个媒体文件')
          return currentNodes
        }

        const formData = new FormData()
        formData.append('file', file)

        api.post(`/upload?board_id=${boardId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        }).then((response) => {
          const uploadId = response.data.uploadId || response.data.id
          const type = file.type.startsWith('video/') ? 'video' : 'image'

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    media: [...currentMedia, { type, uploadId, fileName: file.name }],
                    onChange: n.data.onChange,
                    onAddMedia: n.data.onAddMedia,
                    onDeleteMedia: n.data.onDeleteMedia,
                    canEdit: n.data.canEdit
                  }
                }
              }
              return n
            })
          )
        }).catch((err) => {
          showAlert('上传失败: ' + (err.response?.data?.error || err.message))
        })

        return currentNodes
      })
    }

    input.click()
  }, [canEdit, setNodes])

  // Delete media from node
  const handleDeleteMedia = useCallback((nodeId, index) => {
    if (!canEdit) return
    captureUndo()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const currentMedia = node.data.media || []
    const newMedia = currentMedia.filter((_, i) => i !== index)
    updateNodeMedia(nodeId, newMedia)
  }, [nodes, canEdit, updateNodeMedia, captureUndo])

  // Toggle a single root node's layout between vertical and horizontal
  const toggleRootLayout = useCallback((rootId) => {
    if (!canEdit) return
    captureUndo()
    const updatedNodes = nodes.map((n) => {
      if (n.id === rootId) {
        const currentLayout = n.data?.layout || 'vertical'
        const nextLayout = currentLayout === 'vertical' ? 'horizontal' : 'vertical'
        return { ...n, data: { ...n.data, layout: nextLayout, side: undefined } }
      }
      return n
    })
    const result = calculateMultiTreeLayout(updatedNodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
  }, [setNodes, setEdges, canEdit, nodes, edges])

  // Toggle collapse state of a node
  const toggleCollapse = useCallback((nodeId) => {
    if (!canEdit) return
    captureUndo()
    setNodes((nds) => {
      const updated = nds.map(n => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, collapsed: !n.data?.collapsed } }
        }
        return n
      })
      const result = calculateMultiTreeLayout(updated, edgesRef.current || [])
      const savedPositions = new Map(nds.map(n => [n.id, n.position]))
      result.nodes = result.nodes.map(n => {
        const saved = savedPositions.get(n.id)
        if (saved) return { ...n, position: { ...saved } }
        return n
      })
      setEdges(result.edges)
      return result.nodes
    })
  }, [setNodes, setEdges, canEdit])

  // Collaborative cursor: publish pointer position on mouse move
  const lastPointerPublishRef = useRef(0)
  const onMouseMove = useCallback((event) => {
    if (!canEdit || !isActive) return
    const now = Date.now()
    if (now - lastPointerPublishRef.current < 50) return
    lastPointerPublishRef.current = now
    updateAwareness({
      pointer: { x: event.clientX, y: event.clientY },
      username: currentUser?.username || 'anonymous'
    })
  }, [canEdit, updateAwareness, currentUser, isActive])

  // Add child node (Tab)
  const addChildNode = useCallback(() => {
    if (!selectedNode || !canEdit) return
    captureUndo()

    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const parentNode = nodes.find((n) => n.id === selectedNode)
    if (!parentNode) return

    const newNode = {
      id: newId,
      type: 'mindNode',
      position: { x: parentNode.position.x, y: parentNode.position.y + 100 },
      data: { label: '新节点', media: [], _autoEdit: true, onChange: (text) => updateNodeText(newId, text), onAddMedia: () => handleAddMedia(), onDeleteMedia: (index) => handleDeleteMedia(newId, index), canEdit, layout: 'vertical' }
    }

    // Determine handle IDs for horizontal layout
    const parentSide = parentNode.data?.side
    let newSourceHandle, newTargetHandle
    if (parentSide) {
      if (parentSide === 'center') {
        const existingChildCount = edges.filter(
          (e) => e.source === selectedNode && !e.data?.crossConnection
        ).length
        if (existingChildCount % 2 === 0) {
          newSourceHandle = 'source-right'
          newTargetHandle = 'target-left'
        } else {
          newSourceHandle = 'source-left'
          newTargetHandle = 'target-right'
        }
      } else if (parentSide === 'right') {
        newSourceHandle = 'source-right'
        newTargetHandle = 'target-left'
      } else if (parentSide === 'left') {
        newSourceHandle = 'source-left'
        newTargetHandle = 'target-right'
      }
    }

    // Edge without explicit handle IDs — updateEdgeHandles in calculateMultiTreeLayout computes them
    const newEdge = {
      id: `edge-${selectedNode}-${newId}`,
      source: selectedNode,
      target: newId,
      type: 'mindmap'
    }

    const savedPositions = new Map(nodes.map(n => [n.id, n.position]))
    const savedLayouts = new Map(nodes.filter(n => !edges.some(e => e.target === n.id)).map(n => [n.id, n.data?.layout]))
    const getLayoutForRoot = (rootId) => savedLayouts.get(rootId) || 'horizontal'
    const result = calculateMultiTreeLayout([...nodes, newNode], [...edges, newEdge], getLayoutForRoot)
    const refLayoutPos = result.nodes.find(n => n.id === selectedNode)?.position
    const refSavedPos = savedPositions.get(selectedNode)
    if (refLayoutPos && refSavedPos) {
      const dx = refSavedPos.x - refLayoutPos.x
      const dy = refSavedPos.y - refLayoutPos.y
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        result.nodes = result.nodes.map(n => ({
          ...n,
          position: { x: n.position.x + dx, y: n.position.y + dy }
        }))
      }
    }
    pendingAutoEditRef.current.add(newId)
    programmaticSelectionRef.current = newId
    setNodes((prev) => result.nodes.map(n => {
      const p = prev.find(pn => pn.id === n.id)
      if (p && p.data.label !== n.data.label) return { ...n, data: { ...n.data, label: p.data.label }, selected: false }
      return { ...n, selected: false }
    }))
    setEdges(result.edges)
    setSelectedNode(newId)
    setEditingNodeId(newId)
    queueMicrotask(() => { programmaticSelectionRef.current = null })
  }, [selectedNode, nodes, edges, canEdit, updateNodeText, setNodes, setEdges, handleAddMedia, handleDeleteMedia, setEditingNodeId])

  // Add sibling node (Enter)
  const addSiblingNode = useCallback(() => {
    if (!selectedNode || !canEdit) return
    captureUndo()

    // Find parent
    const parentEdge = edges.find((e) => e.target === selectedNode)
    if (!parentEdge) {
      // Root node: Enter = Tab (create child instead of sibling)
      addChildNode()
      return
    }

    const parentId = parentEdge.source
    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const newNode = {
      id: newId,
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: { label: '新节点', media: [], _autoEdit: true, onChange: (text) => updateNodeText(newId, text), onAddMedia: () => handleAddMedia(), onDeleteMedia: (index) => handleDeleteMedia(newId, index), canEdit, layout: 'vertical' }
    }

    // Edge without explicit handle IDs — updateEdgeHandles computes them
    const newEdge = {
      id: `edge-${parentId}-${newId}`,
      source: parentId,
      target: newId,
      type: 'mindmap'
    }

    const savedPositions = new Map(nodes.map(n => [n.id, n.position]))
    const savedLayouts = new Map(nodes.filter(n => !edges.some(e => e.target === n.id)).map(n => [n.id, n.data?.layout]))
    const getLayoutForRoot = (rootId) => savedLayouts.get(rootId) || 'horizontal'
    const result = calculateMultiTreeLayout([...nodes, newNode], [...edges, newEdge], getLayoutForRoot)
    const refLayoutPos = result.nodes.find(n => n.id === parentId)?.position
    const refSavedPos = savedPositions.get(parentId)
    if (refLayoutPos && refSavedPos) {
      const dx = refSavedPos.x - refLayoutPos.x
      const dy = refSavedPos.y - refLayoutPos.y
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        result.nodes = result.nodes.map(n => ({
          ...n,
          position: { x: n.position.x + dx, y: n.position.y + dy }
        }))
      }
    }
    pendingAutoEditRef.current.add(newId)
    programmaticSelectionRef.current = newId
    setNodes((prev) => result.nodes.map(n => {
      const p = prev.find(pn => pn.id === n.id)
      if (p && p.data.label !== n.data.label) return { ...n, data: { ...n.data, label: p.data.label }, selected: false }
      return { ...n, selected: false }
    }))
    setEdges(result.edges)
    setSelectedNode(newId)
    setEditingNodeId(newId)
    queueMicrotask(() => { programmaticSelectionRef.current = null })
  }, [selectedNode, nodes, edges, canEdit, updateNodeText, setNodes, setEdges, handleAddMedia, handleDeleteMedia, addChildNode, setEditingNodeId])

  // Add root node (Ctrl+Enter)
  const addRootNode = useCallback(() => {
    if (!canEdit) return
    captureUndo()

    // Check root limit
    const rootCount = nodes.filter((n) => !edges.some((e) => e.target === n.id)).length
    if (rootCount >= 10) {
      showAlert('最多支持 10 个中心节点')
      return
    }

    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newNode = {
      id: newId,
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: { label: '新中心', media: [], onChange: (text) => updateNodeText(newId, text), onAddMedia: () => handleAddMedia(), onDeleteMedia: (index) => handleDeleteMedia(newId, index), canEdit, layout: 'horizontal' }
    }

    const result = applyLayoutWithOffsets(nodes, edges, [...nodes, newNode], edges)
    programmaticSelectionRef.current = newId
    setNodes(result.nodes.map(n => ({ ...n, selected: false })))
    setEdges(result.edges)
    setSelectedNode(newId)
    setEditingNodeId(newId)
    queueMicrotask(() => { programmaticSelectionRef.current = null })
  }, [nodes, edges, canEdit, updateNodeText, setNodes, setEdges, setEditingNodeId])

  const deleteNode = useCallback(() => {
    if (!selectedNode || !canEdit) return
    captureUndo()

    // Check if it's a root node
    const isRoot = !edges.some((e) => e.target === selectedNode)
    if (isRoot) {
      showConfirm('删除中心节点将同时删除其所有子节点，确定吗？', () => {
        // Delete root and all its children
        const toDelete = new Set([selectedNode])
        const queue = [selectedNode]

      while (queue.length > 0) {
        const current = queue.shift()
        const children = edges.filter((e) => e.source === current).map((e) => e.target)
        children.forEach((child) => {
          toDelete.add(child)
          queue.push(child)
        })
      }

      // Save positions of remaining nodes
      const savedPositions = new Map(nodes.filter(n => !toDelete.has(n.id)).map(n => [n.id, n.position]))
      const newNodes = nodes.filter((n) => !toDelete.has(n.id))
      const newEdges = edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target))

      const result = calculateMultiTreeLayout(newNodes, newEdges)
      result.nodes = result.nodes.map(n => {
        const saved = savedPositions.get(n.id)
        if (saved) return { ...n, position: { ...saved } }
        return n
      })
      setNodes(result.nodes)
      setEdges(result.edges)
      setSelectedNode(null)
      })
      return
    }

    // Recursively delete children
    const toDelete = new Set([selectedNode])
    const queue = [selectedNode]

    while (queue.length > 0) {
      const current = queue.shift()
      const children = edges.filter((e) => e.source === current).map((e) => e.target)
      children.forEach((child) => {
        toDelete.add(child)
        queue.push(child)
      })
    }

    // Save positions of remaining nodes
    const savedPositions = new Map(nodes.filter(n => !toDelete.has(n.id)).map(n => [n.id, n.position]))
    const newNodes = nodes.filter((n) => !toDelete.has(n.id))
    const newEdges = edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target))

    const result = calculateMultiTreeLayout(newNodes, newEdges)
    result.nodes = result.nodes.map(n => {
      const saved = savedPositions.get(n.id)
      if (saved) return { ...n, position: { ...saved } }
      return n
    })
    setNodes(result.nodes)
    setEdges(result.edges)
    setSelectedNode(null)
  }, [selectedNode, nodes, edges, canEdit, setNodes, setEdges])

  // Arrow key navigation between nodes
  const navigateArrow = useCallback((direction) => {
    const parentMap = new Map()
    const childrenMap = new Map()
    edges.forEach(e => {
      if (e.data?.crossConnection || e.type === 'crossConnection') return
      parentMap.set(e.target, e.source)
      if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
      childrenMap.get(e.source).push(e.target)
    })

    // Get DFS order of visible nodes
    const rootIds = nodes.filter(n => !parentMap.has(n.id)).map(n => n.id)
    const visibleNodes = []
    function dfs(nodeIds) {
      for (const id of nodeIds) {
        visibleNodes.push(id)
        const children = childrenMap.get(id) || []
        if (children.length > 0 && !nodes.find(n => n.id === id)?.data?.collapsed) {
          dfs(children)
        }
      }
    }
    // Sort rootIds by their Y position for consistent ordering
    rootIds.sort((a, b) => {
      const na = nodes.find(n => n.id === a)
      const nb = nodes.find(n => n.id === b)
      return (na?.position?.y || 0) - (nb?.position?.y || 0)
    })
    dfs(rootIds)

    const currentIdx = selectedNode ? visibleNodes.indexOf(selectedNode) : -1

    let nextId = null
    switch (direction) {
      case 'down':
        if (currentIdx < 0) nextId = visibleNodes[0]
        else nextId = visibleNodes[Math.min(currentIdx + 1, visibleNodes.length - 1)]
        break
      case 'up':
        if (currentIdx <= 0) nextId = visibleNodes[0]
        else nextId = visibleNodes[currentIdx - 1]
        break
      case 'right': {
        const children = childrenMap.get(selectedNode) || []
        const currentNode = nodes.find(n => n.id === selectedNode)
        if (currentNode?.data?.collapsed) {
          toggleCollapse(selectedNode)
        } else if (children.length > 0) {
          nextId = children[0]
        }
        break
      }
      case 'left': {
        const currentNode = nodes.find(n => n.id === selectedNode)
        const children = childrenMap.get(selectedNode) || []
        if (children.length > 0 && !currentNode?.data?.collapsed) {
          toggleCollapse(selectedNode)
        } else {
          nextId = parentMap.get(selectedNode)
        }
        break
      }
    }

    if (nextId && nextId !== selectedNode) {
      programmaticSelectionRef.current = nextId
      setSelectedNode(nextId)
      queueMicrotask(() => { programmaticSelectionRef.current = null })
    }
  }, [nodes, edges, selectedNode, setSelectedNode, toggleCollapse])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!canEdit) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Allow Tab/Enter through when editing a mind map node for node creation
        if (e.target.closest('[data-node-id]')) {
          if (e.key !== 'Tab' && e.key !== 'Enter') return
        } else {
          return
        }
      }

      // Ctrl+F to focus search input
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // Arrow key navigation
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault()
        navigateArrow(e.key.replace('Arrow', '').toLowerCase())
        return
      }

      // Ctrl+Z undo (skip when holding Shift for redo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }

      // Ctrl+Shift+Z or Ctrl+Y redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault()
        handleRedo()
        return
      }

      // Ctrl+Enter to add root node
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        addRootNode()
        return
      }

      // Ctrl+C to copy selected node with subtree
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        const selId = selectedNodeRef.current
        if (selId) {
          const tree = serializeSubtree(selId, nodesRef.current || [], edgesRef.current || [])
          if (tree) clipboardRef.current = tree
        }
        return
      }

      // Ctrl+V to paste subtree as child of selected node
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        const selId = selectedNodeRef.current
        if (clipboardRef.current && selId && canEdit) {
          captureUndo()
          const { nodes: pasteNodes, edges: pasteEdges } = deserializeSubtree(clipboardRef.current, selId)
          // Add new nodes/edges alongside existing ones, then recalculate layout
          const allNodes = [...(nodesRef.current || []), ...pasteNodes]
          const allEdges = [...(edgesRef.current || []), ...pasteEdges]
          const result = calculateMultiTreeLayout(allNodes, allEdges)
          const savedPositions = new Map(nodesRef.current?.map(n => [n.id, n.position]) || [])
          result.nodes = result.nodes.map(n => {
            const saved = savedPositions.get(n.id)
            if (saved) return { ...n, position: { ...saved } }
            return n
          })
          setNodes(result.nodes)
          setEdges(result.edges)
        }
        return
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          addChildNode()
          break
        case 'Enter':
          e.preventDefault()
          addSiblingNode()
          break
        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          // Check if a cross-connection edge is selected first
          const selectedCrossEdge = edgesRef.current?.find(e => e.selected && e.data?.crossConnection)
          if (selectedCrossEdge) {
            handleDeleteCrossConnection(selectedCrossEdge.id)
          } else {
            deleteNode()
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addChildNode, addSiblingNode, deleteNode, addRootNode, canEdit, handleUndo, handleRedo, navigateArrow])

  // Update node data callbacks when nodes change
  // Use refs to avoid circular dependencies
  const updateNodeTextRef = useRef(updateNodeText)
  const handleAddMediaRef = useRef(handleAddMedia)
  const handleDeleteMediaRef = useRef(handleDeleteMedia)

  useEffect(() => {
    updateNodeTextRef.current = updateNodeText
  }, [updateNodeText])

  useEffect(() => {
    handleAddMediaRef.current = handleAddMedia
  }, [handleAddMedia])

  useEffect(() => {
    handleDeleteMediaRef.current = handleDeleteMedia
  }, [handleDeleteMedia])

  // Node callbacks for context
  const nodeCallbacks = useMemo(() => ({
    onChange: updateNodeText,
    onAddMedia: handleAddMedia,
    onDeleteMedia: handleDeleteMedia,
    onToggleCollapse: toggleCollapse
  }), [updateNodeText, handleAddMedia, handleDeleteMedia, toggleCollapse])

  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    // If a programmatic selection is in progress, block React Flow's selection
    // override entirely. Do NOT consume the ref here — React Flow may call
    // onSelectionChange multiple times per render cycle, and consuming it on
    // the first call would let a subsequent call override the programmatic
    // selection with an empty selection, triggering an extra re-render that
    // races with the auto-edit focus timer.
    if (programmaticSelectionRef.current) {
      return
    }
    const next = selectedNodes[0]?.id || null
    selectedNodeRef.current = next
    // Defer state update to break React Flow's internal render loop.
    // React Flow calls onSelectionChange inside its own useEffect, and
    // synchronously calling setState here would re-trigger it.
    queueMicrotask(() => {
      setSelectedNode(prev => prev === next ? prev : next)
    })
  }, [])

  const onConnect = useCallback(
    (params) => { captureUndo(); setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)) },
    [setEdges]
  )

  // Create cross-connection between trees (Shift+click on second node)
  const handleNodeClick = useCallback((event, node) => {
    if (!canEdit) return

    if (event.shiftKey && selectedNode && selectedNode !== node.id) {
      // Create cross-connection
      event.preventDefault()

      // Check if connection already exists
      const existingEdge = edges.find((e) =>
        e.data?.crossConnection &&
        e.source === selectedNode &&
        e.target === node.id
      )

      if (existingEdge) {
        showAlert('连接已存在')
        return
      }

      // Check if trying to connect within same tree (would be a regular edge)
      const isSameTree = edges.some((e) => {
        const sourceInTree = e.source === selectedNode || e.target === selectedNode
        const targetInTree = e.source === node.id || e.target === node.id
        return sourceInTree && targetInTree
      })

      if (isSameTree) {
        showAlert('同一棵树内的节点请使用普通连接')
        return
      }

      const newEdge = {
        id: `cross-${selectedNode}-${node.id}`,
        source: selectedNode,
        target: node.id,
        type: 'crossConnection',
        data: { crossConnection: true, canEdit, onDelete: handleDeleteCrossConnection }
      }

      captureUndo()
      setEdges((eds) => [...eds, newEdge])
      setPendingCrossSource(null)
    }
  }, [canEdit, selectedNode, edges, setEdges])

  // Delete cross-connection
  const handleDeleteCrossConnection = useCallback((edgeId) => {
    if (!canEdit) return
    captureUndo()
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
  }, [canEdit, setEdges])

  // Update edge data when canEdit changes
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.data?.crossConnection) {
          return {
            ...edge,
            data: { ...edge.data, canEdit, onDelete: handleDeleteCrossConnection }
          }
        }
        return edge
      })
    )
  }, [canEdit, handleDeleteCrossConnection])

  // Export/Import Markdown
  const exportMarkdown = () => {
    const { roots, crossConnections } = flowDataToTrees(nodes, edges)
    const md = exportToMarkdown(roots, crossConnections)

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mindmap.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importMarkdown = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt'

    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      const text = await file.text()
      const roots = importFromMarkdown(text)
      const { nodes: newNodes, edges: newEdges } = treesToFlowData(roots)
      const result = calculateMultiTreeLayout(newNodes, newEdges)
      captureUndo()
      setNodes(result.nodes)
      setEdges(result.edges)
    }

    input.click()
  }

  // Export the mind map as a PNG image
  const handleExportImage = useCallback(async () => {
    try {
      const { toPng } = await import('html-to-image')
      const el = document.querySelector('.react-flow__renderer')
      if (!el) return
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: (node) => {
          // Exclude controls and minimap from the exported image
          if (node.classList?.contains('react-flow__controls')) return false
          if (node.classList?.contains('react-flow__minimap')) return false
          return true
        }
      })
      const link = document.createElement('a')
      link.download = `mindmap-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Failed to export image:', err)
    }
  }, [])

  const mindMapActions = useMemo(() => ({
    toggleLayout: toggleRootLayout,
    rootIds,
    dragTargetNode
  }), [toggleRootLayout, rootIds, dragTargetNode])

  if (yjsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (yjsError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-red-500">{yjsError}</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar - positioned below the EditorPage header */}
      <div className="h-14 border-b bg-white px-4 flex items-center shrink-0">
        <h2 className="text-lg font-semibold mr-4">思维导图</h2>
        {canEdit && (
          <div className="flex items-center space-x-1">
            <button
              className="h-8 px-3 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              onClick={addRootNode}
            >
              + 中心
            </button>
            <button
              className="h-7 px-2 rounded-md text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={exportMarkdown}
            >
              导出
            </button>
            <button
              className="h-7 px-2 rounded-md text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={importMarkdown}
            >
              导入
            </button>
            <button
              className="h-7 px-2 rounded-md text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={handleExportImage}
            >
              图片
            </button>
          </div>
        )}

        {canEdit && (
          <div className="flex items-center space-x-1 ml-2">
            <div className="w-px h-6 bg-gray-200 mr-1"></div>
            {/* Undo */}
            <button
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="撤销 (Ctrl+Z)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            {/* Redo */}
            <button
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="重做 (Ctrl+Shift+Z)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>

            {/* Style button — disabled when no node selected */}
            <div className="relative">
              <button
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
                onClick={() => { if (selectedNode) { setShowStylePanel((v) => !v); selectedStyleNode.current = selectedNode } }}
                disabled={!selectedNode}
                title="节点样式"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"></circle>
                  <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"></circle>
                  <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"></circle>
                  <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"></circle>
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                </svg>
              </button>
              {showStylePanel && selectedNode === selectedStyleNode.current && (
                <StylePanel
                  style={nodes.find((n) => n.id === selectedNode)?.data?.style}
                  onChange={(newStyle) => { updateNodeStyle(selectedNode, newStyle) }}
                  onClose={() => setShowStylePanel(false)}
                />
              )}
            </div>
            {/* Layout toggle button — disabled when no root node selected */}
            <button
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
              onClick={() => { if (selectedNode && rootIds.has(selectedNode)) toggleRootLayout(selectedNode) }}
              disabled={!selectedNode || !rootIds.has(selectedNode)}
              title="切换布局"
            >
                {nodes.find((n) => n.id === selectedNode)?.data?.layout === 'horizontal' ? (
                  // Tree layout icon (vertical hierarchy)
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                    <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                    <line x1="8" y1="4.5" x2="8" y2="8"/>
                    <line x1="8" y1="8" x2="4" y2="10.5"/>
                    <line x1="8" y1="8" x2="12" y2="10.5"/>
                  </svg>
                ) : (
                  // Center layout icon (horizontal structure)
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
                    <line x1="4.5" y1="8" x2="6.5" y2="8"/>
                    <line x1="9.5" y1="8" x2="11.5" y2="8"/>
                  </svg>
                )}
              </button>
            {/* Media button — disabled when no node selected */}
            <button
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
              onClick={handleAddMedia}
              disabled={!selectedNode}
              title="添加媒体"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
          </div>
        )}

        {/* Search input */}
        <div className="flex-1 flex justify-center px-4">
          <div className="relative max-w-xs w-full">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="w-full h-8 pl-8 pr-2 text-xs border rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-400"
              placeholder="搜索节点..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentMatchIndex(0) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSearchNext() }
                if (e.key === 'Escape') { setSearchQuery(''); setCurrentMatchIndex(0) }
              }}
            />
            {searchActive && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <span className="text-xs text-gray-400">{searchMatches.size > 0 ? `${currentMatchIndex + 1}/${searchMatches.size}` : '0'}</span>
                <button className="text-gray-400 hover:text-gray-600" onClick={handleSearchPrev} title="上一个">▲</button>
                <button className="text-gray-400 hover:text-gray-600" onClick={handleSearchNext} title="下一个">▼</button>
              </div>
            )}
          </div>
        </div>

        <button
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          onClick={() => setShowHelp(true)}
          title="帮助"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <line x1="12" y1="17" x2="12" y2="17.01"></line>
            <path d="M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"></path>
          </svg>
        </button>
      </div>

      {/* Help Dialog */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">快捷键</h3>
              <button
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                onClick={() => setShowHelp(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Tab</kbd>
                <span className="ml-3 text-gray-700">创建子节点</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Enter</kbd>
                <span className="ml-3 text-gray-700">创建兄弟节点</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Ctrl+Enter</kbd>
                <span className="ml-3 text-gray-700">创建新中心（多根）</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Delete</kbd>
                <span className="ml-3 text-gray-700">删除节点</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Ctrl+Z</kbd>
                <span className="ml-3 text-gray-700">撤销</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Ctrl+Shift+Z</kbd>
                <span className="ml-3 text-gray-700">重做</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">Ctrl+F</kbd>
                <span className="ml-3 text-gray-700">聚焦搜索</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">↑↓←→</kbd>
                <span className="ml-3 text-gray-700">导航节点</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">双击</kbd>
                <span className="ml-3 text-gray-700">编辑文本</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <h4 className="font-medium mb-2 text-sm">跨树连接</h4>
              <p className="text-sm text-gray-600">
                选中节点A，按住 <kbd className="px-1 bg-gray-100 rounded">Shift</kbd> 点击节点B
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        <EditingNodeContext.Provider value={{ editingNodeId, setEditingNodeId, editingNodeIdRef, pendingAutoEditRef }}>
        <NodeCallbacksContext.Provider value={nodeCallbacks}>
          <MindMapActionsContext.Provider value={mindMapActions}>
          <ReactFlow
              nodes={searchEnhancedNodes}
              edges={edges.filter(e => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={canEdit ? onNodeDragStart : undefined}
            onNodeDrag={canEdit ? onNodeDrag : undefined}
            onNodeDragStop={canEdit ? onNodeDragStop : undefined}
            onSelectionChange={onSelectionChange}
            onConnect={canEdit ? onConnect : undefined}
            onNodeClick={handleNodeClick}
            onMouseMove={canEdit ? onMouseMove : undefined}
            onMouseLeave={() => updateAwareness({ pointer: null })}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0.5]}
            attributionPosition="bottom-left"
            nodesDraggable={false}
            nodesConnectable={canEdit}
            elementsSelectable={true}
            deleteKeyCode={null}
            style={{ height: '100%' }}
          >
            <SearchLocator currentMatchId={currentMatchId} nodes={nodes} />
            <ViewportTracker viewportRef={viewportRef} />
            <CollaborativeCursors
              awarenessStates={awarenessStates}
              currentUserId={String(awareness?.clientID ?? 'anonymous')}
            />
            <Background color="#f9fafb" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
          </MindMapActionsContext.Provider>
        </NodeCallbacksContext.Provider>
        </EditingNodeContext.Provider>
      </div>

      {/* Modal overlay */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { if (modal.type === 'alert') setModal(null) }}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-gray-800 mb-6">{modal.message}</p>
            <div className="flex justify-end space-x-3">
              {modal.type === 'confirm' && (
                <button
                  className="px-4 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                  onClick={() => setModal(null)}
                >
                  取消
                </button>
              )}
              <button
                className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                onClick={() => {
                  if (modal.type === 'confirm' && modal.onConfirm) modal.onConfirm()
                  setModal(null)
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default MindMapEditor


// Tracks React Flow viewport changes for comment pin coordinate conversion
function ViewportTracker({ viewportRef }) {
  const transform = useStore(state => state.transform)
  useEffect(() => {
    viewportRef.current = { x: transform[0], y: transform[1], zoom: transform[2] }
  }, [transform, viewportRef])
  return null
}

// Inner component to handle search match centering via React Flow API
function SearchLocator({ currentMatchId, nodes }) {
  const { setCenter } = useReactFlow()
  useEffect(() => {
    if (!currentMatchId) return
    const matchNode = nodes.find(n => n.id === currentMatchId)
    if (!matchNode) return
    const t = setTimeout(() => {
      setCenter(matchNode.position.x + 80, matchNode.position.y + 24, { zoom: 1.5, duration: 300 })
    }, 100)
    return () => clearTimeout(t)
  }, [currentMatchId, nodes, setCenter])
  return null
}


