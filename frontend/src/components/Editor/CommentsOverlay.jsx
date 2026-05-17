import { useState, useRef, useEffect } from 'react'
import { useComments } from '../../hooks/useComments'
import CommentPin from './CommentPin'
import CommentPanel from './CommentPanel'

export default function CommentsOverlay({ canvasId, canComment, sceneToPixel, pixelToScene }) {
  const { comments, addComment, addReply, toggleResolve, deleteComment, updatePosition } = useComments(canvasId)
  const [selectedId, setSelectedId] = useState(null)
  const [addMode, setAddMode] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCommentText, setNewCommentText] = useState('')
  const [newCommentPos, setNewCommentPos] = useState(null)
  const inputRef = useRef(null)

  const selectedComment = comments.find(c => c.id === selectedId)

  const handlePinClick = (commentId) => {
    setSelectedId(prev => prev === commentId ? null : commentId)
    setAddMode(false)
    setCreating(false)
  }

  const handleOverlayClick = (e) => {
    if (!addMode || creating) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const scene = pixelToScene ? pixelToScene(px, py) : { x: px, y: py }
    setNewCommentPos(scene)
    setCreating(true)
    setNewCommentText('')
  }

  const handleSubmitComment = async () => {
    if (!newCommentText.trim() || !newCommentPos) return
    await addComment({ content: newCommentText.trim(), x: newCommentPos.x, y: newCommentPos.y })
    setCreating(false)
    setNewCommentPos(null)
    setNewCommentText('')
    setAddMode(false)
  }

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [creating])

  const newCommentPixel = newCommentPos
    ? (sceneToPixel ? sceneToPixel(newCommentPos.x, newCommentPos.y) : newCommentPos)
    : null

  return (
    <>
      {addMode && (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onClick={handleOverlayClick}
        />
      )}

      {comments.map(comment => {
        const pixel = sceneToPixel ? sceneToPixel(comment.x, comment.y) : { left: comment.x, top: comment.y }
        return (
          <CommentPin
            key={comment.id}
            comment={comment}
            isSelected={comment.id === selectedId}
            onClick={(e) => { e.stopPropagation(); handlePinClick(comment.id) }}
            style={{ left: pixel.left, top: pixel.top }}
            onDragEnd={(commentId, deltaX, deltaY) => {
              if (pixelToScene && sceneToPixel) {
                const newPixelLeft = pixel.left + deltaX
                const newPixelTop = pixel.top + deltaY
                const scene = pixelToScene(newPixelLeft, newPixelTop)
                updatePosition(commentId, scene.x, scene.y)
              }
            }}
          />
        )
      })}

      {creating && newCommentPixel && (
        <div
          className="absolute z-50 bg-white rounded-lg shadow-xl border p-2 w-64"
          style={{ left: newCommentPixel.left, top: newCommentPixel.top + 20 }}
          onClick={e => e.stopPropagation()}
        >
          <textarea
            ref={inputRef}
            className="w-full border rounded p-2 text-sm resize-none"
            rows={2}
            placeholder="输入评论..."
            value={newCommentText}
            onChange={e => setNewCommentText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmitComment()
              }
              if (e.key === 'Escape') {
                setCreating(false)
                setNewCommentPos(null)
                setAddMode(false)
              }
            }}
          />
          <div className="flex justify-between mt-2">
            <button
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={() => { setCreating(false); setNewCommentPos(null); setAddMode(false) }}
            >
              取消
            </button>
            <button
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
              disabled={!newCommentText.trim()}
              onClick={handleSubmitComment}
            >
              提交
            </button>
          </div>
        </div>
      )}

      {selectedComment && (
        <CommentPanel
          comment={selectedComment}
          position={(() => {
            const pixel = sceneToPixel ? sceneToPixel(selectedComment.x, selectedComment.y) : { left: selectedComment.x, top: selectedComment.y }
            return { x: pixel.left + 20, y: pixel.top + 20 }
          })()}
          onClose={() => setSelectedId(null)}
          onReply={(commentId, content) => addReply(commentId, content)}
          onResolve={(commentId, isResolved) => toggleResolve(commentId, isResolved)}
          onDelete={deleteComment}
          canComment={canComment}
        />
      )}

      {canComment && !addMode && !selectedComment && (
        <button
          className="absolute bottom-4 right-4 z-30 w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-xl"
          onClick={(e) => { e.stopPropagation(); setAddMode(true) }}
          title="添加评论"
        >
          +
        </button>
      )}

      {addMode && (
        <button
          className="absolute bottom-4 right-4 z-30 px-3 py-1.5 bg-gray-600 text-white rounded shadow-lg hover:bg-gray-700 text-sm"
          onClick={(e) => { e.stopPropagation(); setAddMode(false); setCreating(false); setNewCommentPos(null) }}
        >
          取消
        </button>
      )}
    </>
  )
}
