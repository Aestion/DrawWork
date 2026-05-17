import { useState, useRef } from 'react'

export default function CommentPin({ comment, isSelected, onClick, onDragEnd, style }) {
  const [position, setPosition] = useState({ left: style?.left || 0, top: style?.top || 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 })

  const handleMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: position.left,
      top: position.top
    }

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y
      setPosition({
        left: dragStartRef.current.left + deltaX,
        top: dragStartRef.current.top + deltaY
      })
    }

    const handleMouseUp = (e) => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (onDragEnd) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        onDragEnd(comment.id, deltaX, deltaY)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const displayPosition = isDragging ? position : style

  return (
    <button
      onClick={onClick}
      onMouseDown={handleMouseDown}
      style={displayPosition}
      className={`comment-pin absolute z-30 flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shadow-md border-2 transition-all transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'ring-2 ring-blue-400 scale-125 z-40'
          : ''
      } ${
        comment.is_resolved
          ? 'bg-green-500 border-white text-white'
          : 'bg-red-500 border-white text-white'
      }`}
      title={comment.content}
    >
      {comment.reply_count || 0}
    </button>
  )
}
