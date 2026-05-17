import { useEffect, useState, useCallback, useRef, memo } from 'react'
import { useKanbanYjs } from '../../hooks/useKanbanYjs'
import { useAuthStore } from '../../stores/authStore'
import { moveCard } from '../../lib/kanban'
import SyncIndicator from '../ui/SyncIndicator'
import { toast } from '../ui/Toast'

export default function KanbanEditor({ canvasId, roomId, canEdit, onConnectionChange, isActive = true }) {
  const token = useAuthStore((state) => state.token)
  const {
    columns,
    cards,
    setColumns,
    setCards,
    loading,
    error,
    connected,
    synced,
    onlineCount
  } = useKanbanYjs({ canvasId, roomId, token, canEdit })

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

  const [newColumn, setNewColumn] = useState('')
  const [editCard, setEditCard] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const addColumn = () => {
    if (!newColumn.trim()) return
    setColumns([...columns, { id: `col-${Date.now()}`, title: newColumn.trim(), order: columns.length }])
    setNewColumn('')
  }

  const removeColumn = (colId) => {
    if (!confirm('删除此列及列中所有卡片？')) return
    setColumns(columns.filter(c => c.id !== colId))
    setCards(cards.filter(c => c.columnId !== colId))
  }

  const moveColumn = (colId, direction) => {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.id === colId)
      if (idx === -1) return prev
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      next.splice(newIdx, 0, moved)
      return next.map((c, i) => ({ ...c, order: i }))
    })
  }

  const addCard = (colId, title) => {
    if (!title.trim()) return
    setCards([...cards, { id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, columnId: colId, title: title.trim(), order: cards.filter(c => c.columnId === colId).length }])
    toast.success('卡片已添加')
  }

  // Undo-aware card removal
  const pendingRemovals = useRef({})

  const removeCard = (cardId) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return

    // Immediately mark as removed from UI
    setCards(prev => prev.filter(c => c.id !== cardId))
    setEditCard(null)

    const timerId = setTimeout(() => {
      // Timer expired — card is truly gone
      delete pendingRemovals.current[cardId]
    }, 3000)

    pendingRemovals.current[cardId] = { card, timerId }

    toast.success('已删除', () => {
      // Undo: restore the card
      clearTimeout(timerId)
      delete pendingRemovals.current[cardId]
      setCards(prev => [...prev, card])
    })
  }

  const handleMoveCard = (cardId, targetColId) => {
    setCards(prev => moveCard(prev, cardId, targetColId))
  }

  // Drag-and-drop handlers
  const [dragId, setDragId] = useState(null)

  const handleDragStart = (e, cardId) => {
    if (!canEdit) return
    setDragId(cardId)
    e.dataTransfer.setData('text/plain', cardId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, colId) => {
    e.preventDefault()
    const cardId = e.dataTransfer.getData('text/plain')
    if (cardId) {
      handleMoveCard(cardId, colId)
    }
    setDragId(null)
  }

  const openEditModal = (card) => {
    setEditCard(card.id)
    setEditTitle(card.title)
  }

  const saveEditTitle = () => {
    if (!editTitle.trim()) return
    setCards(prev => prev.map(c => c.id === editCard ? { ...c, title: editTitle.trim() } : c))
    setEditCard(null)
    setEditTitle('')
  }

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

  return (
    <div className="flex-1 overflow-auto p-4 bg-gray-50">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">看板</h2>
        <SyncIndicator connected={connected} synced={synced} label={connected ? (synced ? 'synced' : 'syncing') : 'disconnected'} onlineCount={onlineCount} />
      </div>
      <div className="flex space-x-4 min-w-max">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            col={col}
            cards={cards}
            canEdit={canEdit}
            dragId={dragId}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onMoveColumn={moveColumn}
            onRemoveColumn={removeColumn}
            onDragStart={handleDragStart}
            onDragEnd={() => setDragId(null)}
            onOpenEdit={openEditModal}
            onRemoveCard={removeCard}
            onAddCard={addCard}
          />
        ))}
        {canEdit && (
          <div className="w-64 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <input
                className="flex-1 px-2 py-1 border rounded text-sm"
                placeholder="新列名称"
                value={newColumn}
                onChange={e => setNewColumn(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColumn()}
              />
              <button className="px-2 py-1 bg-blue-600 text-white rounded text-sm" onClick={addColumn}>+</button>
            </div>
          </div>
        )}
      </div>

      {/* Card edit modal */}
      {editCard && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setEditCard(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-80 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">编辑卡片</h3>
            <input
              className="w-full px-3 py-2 border rounded text-sm mb-3"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEditTitle()
                if (e.key === 'Escape') setEditCard(null)
              }}
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded" onClick={() => setEditCard(null)}>取消</button>
              <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700" onClick={saveEditTitle}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const KanbanCard = memo(function KanbanCard({ card, canEdit, dragId, onDragStart, onDragEnd, onOpenEdit, onRemoveCard }) {
  return (
    <div
      draggable={canEdit}
      onDragStart={e => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      className={`bg-white p-2 rounded shadow-sm text-sm cursor-grab active:cursor-grabbing transition-opacity ${dragId === card.id ? 'opacity-50' : ''}`}
      onClick={() => canEdit && onOpenEdit(card)}
    >
      <div className="flex justify-between items-start">
        <span>{card.title}</span>
        {canEdit && (
          <button className="text-xs text-red-400 hover:text-red-600 ml-1" onClick={e => { e.stopPropagation(); onRemoveCard(card.id) }}>✕</button>
        )}
      </div>
    </div>
  )
})

const KanbanColumn = memo(function KanbanColumn({ col, cards, canEdit, dragId, onDragOver, onDrop, onMoveColumn, onRemoveColumn, onDragStart, onDragEnd, onOpenEdit, onRemoveCard, onAddCard }) {
  const colCards = cards.filter(c => c.columnId === col.id)
  return (
    <div
      className="w-64 bg-gray-100 rounded-lg p-3 flex-shrink-0"
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, col.id)}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium text-sm">{col.title}<span className="text-gray-400 ml-1">({colCards.length})</span></span>
        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => onMoveColumn(col.id, -1)} title="左移">◀</button>
              <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => onMoveColumn(col.id, 1)} title="右移">▶</button>
              <button className="text-xs text-red-500 hover:underline" onClick={() => onRemoveColumn(col.id)}>删除</button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2 min-h-[60px]">
        {colCards.map(card => (
          <KanbanCard
            key={card.id}
            card={card}
            canEdit={canEdit}
            dragId={dragId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onOpenEdit={onOpenEdit}
            onRemoveCard={onRemoveCard}
          />
        ))}
        {canEdit && (
          <AddCardInput onAdd={title => onAddCard(col.id, title)} />
        )}
      </div>
    </div>
  )
})

function AddCardInput({ onAdd }) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(false)

  if (!active) {
    return (
      <button className="text-sm text-gray-500 hover:text-gray-700 w-full text-left py-1" onClick={() => setActive(true)}>
        + 添加卡片
      </button>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <input
        className="flex-1 px-2 py-1 border rounded text-sm"
        placeholder="卡片内容"
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
