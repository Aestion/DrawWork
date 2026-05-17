import { useNavigate } from 'react-router-dom'
import { PERMISSION_LABELS } from '../../lib/constants'

export default function BoardCard({ board, onDelete }) {
  const navigate = useNavigate()

  return (
    <div
      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
      onClick={() => navigate(`/board/${board.id}`)}
    >
      <div className="h-32 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        {board.cover_url ? (
          <img src={board.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🎨</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-gray-900 truncate">{board.name}</h3>
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
            {PERMISSION_LABELS[board.permission]}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">{board.canvas_count} 个画布</p>
        {board.description && (
          <p className="text-xs text-gray-400 mt-1 truncate">{board.description}</p>
        )}
        {board.permission === 'owner' && (
          <button
            className="mt-3 text-xs text-red-500 hover:text-red-700"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('确定删除此画板？')) onDelete(board.id)
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}
