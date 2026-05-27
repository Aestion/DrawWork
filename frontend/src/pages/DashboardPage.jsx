import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useBoardStore } from '../stores/boardStore'
import BoardCard from '../components/Dashboard/BoardCard'
import BoardModal from '../components/Dashboard/BoardModal'
import NotificationBell from '../components/Notifications/NotificationBell'
import api from '../lib/axios'

const DEFAULT_GROUP_NAMES = {
  owned: '我的画板',
  shared: '别人分享给我',
  public: '内网共享'
}

const DEFAULT_DASHBOARD_PREFERENCES = {
  viewMode: 'grid',
  sortMode: 'created',
  groupNames: DEFAULT_GROUP_NAMES
}

const GROUP_ORDER = ['owned', 'shared', 'public']

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.2" fill="currentColor" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" fill="currentColor" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" fill="currentColor" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" fill="currentColor" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
      <rect x="3" y="4" width="3" height="3" rx="0.8" fill="currentColor" />
      <rect x="8" y="4.5" width="9" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="8.5" width="3" height="3" rx="0.8" fill="currentColor" />
      <rect x="8" y="9" width="9" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="13" width="3" height="3" rx="0.8" fill="currentColor" />
      <rect x="8" y="13.5" width="9" height="2" rx="1" fill="currentColor" />
    </svg>
  )
}

function normalizeDashboardPreferences(preferences) {
  const dashboard = preferences?.dashboard || {}
  return {
    viewMode: dashboard.viewMode === 'list' ? 'list' : 'grid',
    sortMode: dashboard.sortMode === 'name' ? 'name' : 'created',
    groupNames: {
      ...DEFAULT_GROUP_NAMES,
      ...(dashboard.groupNames || {})
    }
  }
}

function getBoardGroupKey(board, currentUserId) {
  if (board.access_type) return board.access_type
  if (board.permission === 'owner' || board.owner_id === currentUserId) return 'owned'
  if (board.share_source) return 'shared'
  if (board.is_public) return 'public'
  return 'shared'
}

function sortBoards(boards, sortMode) {
  const sorted = [...boards]
  if (sortMode === 'name') {
    return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
  }
  return sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

function BoardGroup({ groupKey, name, defaultName, boards, viewMode, onRename, onDelete, onEdit }) {
  const bodyClass = viewMode === 'list'
    ? 'space-y-3'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'

  return (
    <section data-testid={`board-group-${groupKey}`} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          <input
            aria-label={`${defaultName}分组名称`}
            value={name}
            onChange={(e) => onRename(groupKey, e.target.value)}
            className="mt-1 w-48 max-w-full rounded border border-transparent bg-transparent px-0 py-1 text-xs text-gray-500 outline-none hover:border-gray-200 hover:bg-white focus:border-blue-300 focus:bg-white focus:px-2"
          />
        </div>
        <span className="text-xs text-gray-400">{boards.length} 个画板</span>
      </div>
      {boards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-400">
          暂无画板
        </div>
      ) : (
        <div className={bodyClass}>
          {boards.map(board => (
            <BoardCard
              key={board.id}
              board={board}
              viewMode={viewMode}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, init, logout } = useAuthStore()
  const { boards, fetchBoards, createBoard, updateBoard, deleteBoard, isLoading } = useBoardStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBoard, setEditingBoard] = useState(null)
  const [preferences, setPreferences] = useState({ dashboard: DEFAULT_DASHBOARD_PREFERENCES })

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (user) fetchBoards()
    else if (user === null) navigate('/login')
  }, [user, fetchBoards, navigate])

  useEffect(() => {
    if (!user?.id) return
    let isCancelled = false

    api.get('/auth/preferences')
      .then((res) => {
        if (!isCancelled) {
          setPreferences({
            ...(res.data || {}),
            dashboard: normalizeDashboardPreferences(res.data)
          })
        }
      })
      .catch(() => {
        if (!isCancelled) setPreferences({ dashboard: DEFAULT_DASHBOARD_PREFERENCES })
      })

    return () => {
      isCancelled = true
    }
  }, [user?.id])

  const dashboardPreferences = normalizeDashboardPreferences(preferences)
  const viewMode = dashboardPreferences.viewMode
  const sortMode = dashboardPreferences.sortMode
  const groupNames = dashboardPreferences.groupNames

  const groupedBoards = useMemo(() => {
    const grouped = { owned: [], shared: [], public: [] }
    for (const board of boards) {
      const groupKey = getBoardGroupKey(board, user?.id)
      grouped[groupKey]?.push(board)
    }
    for (const key of GROUP_ORDER) {
      grouped[key] = sortBoards(grouped[key], sortMode)
    }
    return grouped
  }, [boards, sortMode, user?.id])

  const updateDashboardPreferences = (updater) => {
    setPreferences((current) => {
      const currentDashboard = normalizeDashboardPreferences(current)
      const nextPreferences = {
        ...current,
        dashboard: updater(currentDashboard)
      }
      api.put('/auth/preferences', { preferences: nextPreferences }).catch(() => {})
      return nextPreferences
    })
  }

  const changeViewMode = (mode) => {
    updateDashboardPreferences((current) => ({ ...current, viewMode: mode }))
  }

  const changeSortMode = (mode) => {
    updateDashboardPreferences((current) => ({ ...current, sortMode: mode }))
  }

  const renameGroup = (groupKey, value) => {
    updateDashboardPreferences((current) => ({
      ...current,
      groupNames: {
        ...current.groupNames,
        [groupKey]: value || DEFAULT_GROUP_NAMES[groupKey]
      }
    }))
  }

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
              onClick={() => setShowCreateModal(true)}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className="text-sm font-medium text-gray-500">画板</h2>
          {boards.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500" htmlFor="board-sort-mode">排序</label>
              <select
                id="board-sort-mode"
                aria-label="画板排序"
                value={sortMode}
                onChange={(e) => changeSortMode(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-300"
              >
                <option value="created">创建时间</option>
                <option value="name">名称</option>
              </select>
              <div className="inline-flex items-center bg-white border border-gray-200 rounded-md p-1 shadow-sm" aria-label="画板展示方式">
                <button
                  type="button"
                  aria-label="大图视图"
                  title="大图视图"
                  onClick={() => changeViewMode('grid')}
                  className={`w-8 h-8 flex items-center justify-center rounded ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <GridIcon />
                </button>
                <button
                  type="button"
                  aria-label="列表视图"
                  title="列表视图"
                  onClick={() => changeViewMode('list')}
                  className={`w-8 h-8 flex items-center justify-center rounded ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <ListIcon />
                </button>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center text-gray-500 py-12">加载中...</div>
        ) : boards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">还没有画板，创建一个吧</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              新建画板
            </button>
          </div>
        ) : (
          <div className="space-y-9">
            {GROUP_ORDER.map(groupKey => (
              <BoardGroup
                key={groupKey}
                groupKey={groupKey}
                name={groupNames[groupKey]}
                defaultName={DEFAULT_GROUP_NAMES[groupKey]}
                boards={groupedBoards[groupKey]}
                viewMode={viewMode}
                onRename={renameGroup}
                onDelete={deleteBoard}
                onEdit={setEditingBoard}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <BoardModal onClose={() => setShowCreateModal(false)} onCreate={createBoard} />
      )}

      {editingBoard && (
        <BoardModal
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
          onUpdate={updateBoard}
        />
      )}
    </div>
  )
}
