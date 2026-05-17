import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isRegister = location.pathname === '/register'

  const { user, login, register, error, isLoading } = useAuthStore()
  const [form, setForm] = useState({ username: '', email: '', password: '' })

  // Clear error when switching between login and register
  useEffect(() => {
    useAuthStore.setState({ error: null })
  }, [location.pathname])

  useEffect(() => {
    if (!user) return
    const shareToken = localStorage.getItem('drawwork_share_token')
    if (shareToken) {
      localStorage.removeItem('drawwork_share_token')
      localStorage.removeItem('drawwork_share_board_id')
      navigate(`/s/${shareToken}`)
      return
    }
    const shareBoardId = localStorage.getItem('drawwork_share_board_id')
    if (shareBoardId) {
      localStorage.removeItem('drawwork_share_board_id')
      navigate(`/board/${shareBoardId}`)
    } else {
      navigate('/')
    }
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = isRegister
      ? await register(form.username, form.email, form.password)
      : await login(form.email, form.password)
    // Navigation is handled by the useEffect above when user state updates
    if (!ok) return
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow">
        <h2 className="text-3xl font-bold text-center text-gray-900">DrawWork</h2>
        <p className="text-center text-gray-600">
          {isRegister ? '注册新账号' : '登录到协作白板'}
        </p>

        {error && (
          <div role="alert" aria-live="polite" className="p-3 bg-red-50 text-red-600 text-sm rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
              <input
                id="username"
                type="text"
                placeholder="用户名"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              id="email"
              type="email"
              placeholder="邮箱"
              required
              autoComplete="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              id="password"
              type="password"
              placeholder="密码"
              required
              minLength={6}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? '请稍候...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <div className="text-center text-sm">
          {isRegister ? (
            <>
              已有账号？<button onClick={() => navigate('/login')} className="text-blue-600 hover:underline">去登录</button>
            </>
          ) : (
            <>
              没有账号？<button onClick={() => navigate('/register')} className="text-blue-600 hover:underline">去注册</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
