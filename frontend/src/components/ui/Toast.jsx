import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const TOAST_DURATION = 2000
const ANIMATION_DURATION = 300

let addToastFn = null

const toastTypes = {
  success: { bg: 'bg-green-600', icon: '✓' },
  error: { bg: 'bg-red-600', icon: '✕' },
  warning: { bg: 'bg-yellow-500', icon: '⚠' },
  info: { bg: 'bg-blue-600', icon: 'ℹ' },
}

function ToastItem({ toast: t, onRemove }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  const startExit = useCallback(() => {
    setExiting(true)
    setTimeout(() => onRemove(t.id), ANIMATION_DURATION)
  }, [t.id, onRemove])

  useEffect(() => {
    timerRef.current = setTimeout(startExit, TOAST_DURATION)
    return () => clearTimeout(timerRef.current)
  }, [startExit])

  const handleUndo = () => {
    clearTimeout(timerRef.current)
    if (t.onUndo) t.onUndo()
    startExit()
  }

  const typeStyle = toastTypes[t.type] || toastTypes.info

  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm
        ${typeStyle.bg}
        transition-all duration-300 ease-in-out
        ${exiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      <span className="font-bold text-base leading-none shrink-0">{typeStyle.icon}</span>
      <span className="flex-1 min-w-0">{t.message}</span>
      {t.onUndo && (
        <button
          className="font-semibold text-white/90 hover:text-white ml-2 shrink-0 underline underline-offset-2"
          onClick={handleUndo}
        >
          撤销
        </button>
      )}
    </div>
  )
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const idCounter = useRef(0)

  addToastFn = useCallback((type, message, onUndo) => {
    const id = ++idCounter.current
    setToasts(prev => [...prev, { id, type, message, onUndo }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleUndo = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  )
}

export const toast = {
  success: (msg, onUndo) => addToastFn && addToastFn('success', msg, onUndo),
  error: (msg, onUndo) => addToastFn && addToastFn('error', msg, onUndo),
  warning: (msg, onUndo) => addToastFn && addToastFn('warning', msg, onUndo),
  info: (msg, onUndo) => addToastFn && addToastFn('info', msg, onUndo),
}
