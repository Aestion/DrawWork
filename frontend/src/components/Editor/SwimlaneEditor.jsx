import { useEffect, useState, useCallback, useRef, memo } from 'react'
import { useSwimlaneYjs } from '../../hooks/useSwimlaneYjs'
import { useAuthStore } from '../../stores/authStore'
import { nextElementPosition } from '../../lib/swimlane'
import SyncIndicator from '../ui/SyncIndicator'
import { toast } from '../ui/Toast'

export default function SwimlaneEditor({ canvasId, roomId, canEdit, onConnectionChange, isActive = true }) {
  const token = useAuthStore((state) => state.token)
  const {
    direction,
    lanes,
    elements,
    setDirection,
    setLanes,
    setElements,
    loading,
    error,
    connected,
    synced,
    onlineCount
  } = useSwimlaneYjs({ canvasId, roomId, token, canEdit })

  // Track canvas switching to prevent connection status flicker
  const lastCanvasIdRef = useRef(canvasId)
  const isSwitchingCanvasRef = useRef(false)

  useEffect(() => {
    if (lastCanvasIdRef.current !== canvasId) {
      isSwitchingCanvasRef.current = true
      lastCanvasIdRef.current = canvasId
      setTimeout(() => {
        isSwitchingCanvasRef.current = false
      }, 300)
    }
  }, [canvasId])

  const [newLane, setNewLane] = useState('')
  const [connectMode, setConnectMode] = useState(null) // source element id while connecting
  const [dragId, setDragId] = useState(null)
  const containerRef = useRef(null)

  const addLane = () => {
    if (!newLane.trim()) return
    setLanes([...lanes, { id: `lane-${Date.now()}`, title: newLane.trim(), order: lanes.length }])
    setNewLane('')
  }

  const removeLane = (laneId) => {
    if (!confirm('删除此泳道及其中所有元素？')) return
    setLanes(lanes.filter(l => l.id !== laneId))
    setElements(elements.filter(e => e.laneId !== laneId))
  }

  const addElement = (laneId, text) => {
    if (!text.trim()) return
    const laneEls = elements.filter(e => e.laneId === laneId)
    const pos = nextElementPosition(laneEls)
    const newEl = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      laneId,
      text: text.trim(),
      x: pos.x,
      y: pos.y
    }
    setElements([...elements, newEl])
  }

  const removeElement = (elId) => {
    // Also remove arrows targeting this element
    setElements(elements.filter(e => e.id !== elId).map(e =>
      e.targetId === elId ? { ...e, targetId: undefined } : e
    ))
  }

  const updateElementText = (elId, text) => {
    setElements(elements.map(e => e.id === elId ? { ...e, text } : e))
  }

  // Drag-and-drop for reordering elements
  const handleDragStart = (e, elId) => {
    if (!canEdit) return
    setDragId(elId)
    e.dataTransfer.setData('application/json', JSON.stringify({ id: elId }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDropOnLane = (e, targetLaneId) => {
    e.preventDefault()
    const data = JSON.parse(e.dataTransfer.getData('application/json'))
    if (data.id) {
      setElements(prev => prev.map(el =>
        el.id === data.id ? { ...el, laneId: targetLaneId } : el
      ))
    }
    setDragId(null)
  }

  // Connection arrows
  const handleElementClick = (elId) => {
    if (!canEdit) return
    if (connectMode === null) {
      // Start connect mode
      setConnectMode(elId)
    } else if (connectMode === elId) {
      // Click same element — cancel
      setConnectMode(null)
    } else {
      // Connect source to target
      setElements(prev => prev.map(el =>
        el.id === connectMode ? { ...el, targetId: elId } : el
      ))
      setConnectMode(null)
    }
  }

  const removeConnection = useCallback((elId) => {
    setElements(prev => prev.map(el =>
      el.id === elId ? { ...el, targetId: undefined } : el
    ))
  }, [setElements])

  const isHorizontal = direction === 'horizontal'

  // Report connection status to parent
  useEffect(() => {
    if (!onConnectionChange || !isActive) return

    // Skip reporting disconnected status when switching canvases
    if (isSwitchingCanvasRef.current && !connected) return

    const label = !canEdit
      ? 'read-only'
      : connected
        ? synced
          ? 'synced'
          : 'syncing'
        : 'disconnected'
    onConnectionChange({ connected, synced, label, onlineCount }, canvasId)
  }, [connected, synced, onlineCount, canEdit, onConnectionChange, isActive, canvasId])

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-500">加载中...</div>
  if (error) return <div className="flex-1 flex items-center justify-center text-red-500">{error}</div>

  const renderArrow = (source, target) => {
    // Get DOM elements for accurate positioning
    const sourceEl = document.querySelector(`[data-element-id="${source.id}"]`)
    const targetEl = document.querySelector(`[data-element-id="${target.id}"]`)

    if (!sourceEl || !targetEl) return null

    const containerRect = containerRef.current?.getBoundingClientRect()
    const sourceRect = sourceEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()

    if (!containerRect) return null

    // Calculate center points relative to SVG container
    const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left
    const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top
    const x2 = targetRect.left + targetRect.width / 2 - containerRect.left
    const y2 = targetRect.top + targetRect.height / 2 - containerRect.top

    return (
      <line
        key={`arrow-${source.id}`}
        x1={x1} y1={y1}
        x2={x2} y2={y2}
        stroke="#3b82f6" strokeWidth="2"
        markerEnd="url(#arrowhead)"
        className="pointer-events-none"
      />
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4 bg-white">
      {/* SVG defs for arrow markers */}
      <svg className="absolute w-0 h-0">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>
      </svg>

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold">泳道图</h2>
          <SyncIndicator connected={connected} synced={synced} label={connected ? (synced ? 'synced' : 'syncing') : 'disconnected'} onlineCount={onlineCount} />
          {canEdit && (
            <select
              className="text-sm border rounded px-2 py-1"
              value={direction}
              onChange={e => setDirection(e.target.value)}
            >
              <option value="horizontal">水平</option>
              <option value="vertical">垂直</option>
            </select>
          )}
          {canEdit && (
            <span className="text-xs text-gray-400">
              {connectMode !== null
                ? '点击另一个元素创建连接，点击同一元素取消'
                : '点击元素后点击另一个元素创建箭头连线'}
            </span>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        {/* SVG arrows overlay */}
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {elements.filter(e => e.targetId).map(e => {
            const target = elements.find(el => el.id === e.targetId)
            if (!target) return null
            return renderArrow(e, target)
          })}
        </svg>

        <div className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} gap-4`}>
          {lanes.map(lane => (
            <div
              key={lane.id}
              className={`${isHorizontal ? 'flex' : 'flex-col'} border-2 border-gray-200 rounded-lg overflow-hidden`}
              onDragOver={handleDragOver}
              onDrop={e => handleDropOnLane(e, lane.id)}
            >
              <div className={`bg-gray-100 p-3 font-medium text-sm flex justify-between items-center ${isHorizontal ? 'w-32 border-r' : 'border-b'}`}>
                <span>{lane.title}</span>
                {canEdit && (
                  <button className="text-xs text-red-500 hover:underline" onClick={() => removeLane(lane.id)}>删除</button>
                )}
              </div>
              <div className={`p-3 ${isHorizontal ? 'flex-1 flex flex-wrap gap-3 content-start' : 'space-y-3'}`}>
                {elements.filter(e => e.laneId === lane.id).map(el => (
                  <SwimlaneElement
                    key={el.id}
                    el={el}
                    canEdit={canEdit}
                    dragId={dragId}
                    connectMode={connectMode}
                    onDragStart={handleDragStart}
                    onDragEnd={() => setDragId(null)}
                    onClick={handleElementClick}
                    onUpdateText={updateElementText}
                    onRemoveConnection={removeConnection}
                    onRemoveElement={removeElement}
                  />
                ))}
                {canEdit && (
                  <AddElementInput onAdd={text => addElement(lane.id, text)} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="mt-4 flex items-center space-x-2">
          <input
            className="px-2 py-1 border rounded text-sm w-48"
            placeholder="新泳道名称"
            value={newLane}
            onChange={e => setNewLane(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addLane()}
          />
          <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm" onClick={addLane}>+ 添加泳道</button>
        </div>
      )}
    </div>
  )
}

const SwimlaneElement = memo(function SwimlaneElement({ el, canEdit, dragId, connectMode, onDragStart, onDragEnd, onClick, onUpdateText, onRemoveConnection, onRemoveElement }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(el.text)

  // Handle click - select/connect
  const handleClick = () => {
    if (isEditing) return
    onClick(el.id)
  }

  // Handle double click - enter edit mode
  const handleDoubleClick = () => {
    if (!canEdit) return
    setIsEditing(true)
    setEditText(el.text)
  }

  // Save edit
  const handleSave = () => {
    onUpdateText(el.id, editText)
    setIsEditing(false)
  }

  // Cancel edit
  const handleCancel = () => {
    setEditText(el.text)
    setIsEditing(false)
  }

  // Keyboard handling
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  return (
    <div
      data-element-id={el.id}
      draggable={canEdit}
      onDragStart={e => onDragStart(e, el.id)}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`bg-blue-50 border rounded px-3 py-2 text-sm min-w-[100px] transition-all ${
        connectMode === el.id
          ? 'border-green-500 ring-2 ring-green-300 cursor-pointer'
          : el.targetId
            ? 'border-blue-400 border-dashed'
            : 'border-blue-200'
      } ${dragId === el.id ? 'opacity-50' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex justify-between items-center">
        {isEditing ? (
          <input
            autoFocus
            className="bg-transparent border-b border-blue-500 outline-none w-full mr-2"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="select-none">{el.text}</span>
        )}
        <div className="flex items-center gap-1 ml-2">
          {el.targetId && (
            <button
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); onRemoveConnection(el.id) }}
              title="删除连接"
            >⊘</button>
          )}
          {canEdit && !isEditing && (
            <button
              className="text-xs text-red-400 hover:text-red-600"
              onClick={e => { e.stopPropagation(); onRemoveElement(el.id) }}
            >✕</button>
          )}
        </div>
      </div>
    </div>
  )
})

function AddElementInput({ onAdd }) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(false)

  if (!active) {
    return (
      <button className="text-sm text-gray-500 hover:text-gray-700 py-1 px-2" onClick={() => setActive(true)}>
        + 添加元素
      </button>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <input
        className="px-2 py-1 border rounded text-sm w-32"
        placeholder="元素内容"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onAdd(text); setText(''); setActive(false) }
          if (e.key === 'Escape') { setText(''); setActive(false) }
        }}
        autoFocus
      />
      <button className="text-xs bg-blue-600 text-white px-2 py-1 rounded" onClick={() => { onAdd(text); setText(''); setActive(false) }}>添加</button>
    </div>
  )
}
