import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useBoardStore } from '../stores/boardStore'
import BoardCard from '../components/Dashboard/BoardCard'
import BoardModal from '../components/Dashboard/BoardModal'
import NotificationBell from '../components/Notifications/NotificationBell'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, init, logout } = useAuthStore()
  const { boards, fetchBoards, createBoard, deleteBoard, isLoading } = useBoardStore()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (user) fetchBoards()
    else if (user === null) navigate('/login')
  }, [user])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">DrawWork</h1>
            <span className="text-sm text-gray-500">你好, {user.username}</span>
          </div>
          <div className="flex items-center space-x-3">
            <NotificationBell />
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + 新建画板
            </button>
            <button
              onClick={logout}
              className="px-3 py-2 text-gray-600 hover:text-gray-900"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center text-gray-500 py-12">加载中...</div>
        ) : boards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">还没有画板，创建一个吧</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              新建画板
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boards.map(board => (
              <BoardCard key={board.id} board={board} onDelete={deleteBoard} />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <BoardModal onClose={() => setShowModal(false)} onCreate={createBoard} />
      )}
    </div>
  )
}
