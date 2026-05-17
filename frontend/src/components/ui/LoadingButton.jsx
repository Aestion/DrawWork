export default function LoadingButton({
  loading = false,
  disabled = false,
  children,
  onClick,
  className = '',
  variant = 'primary',
}) {
  const baseClass =
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : variant === 'ghost'
        ? 'bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-300'
        : 'bg-blue-600 text-white hover:bg-blue-700'

  const isDisabled = loading || disabled

  return (
    <button
      disabled={isDisabled}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded text-sm font-medium
        transition-all duration-200
        ${baseClass}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {loading ? '处理中...' : children}
    </button>
  )
}
