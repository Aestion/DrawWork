import { create } from 'zustand'
import api from '../lib/axios'

const TOKEN_KEY = 'drawwork_token'
const REFRESH_TOKEN_KEY = 'drawwork_refresh_token'
const getToken = () => localStorage.getItem(TOKEN_KEY)
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

const getErrorMessage = (err, defaultMsg) => {
  if (err.response) {
    return err.response.data?.error || `服务器错误 (${err.response.status})`
  }
  if (err.request) return '网络异常，请检查连接'
  return err.message || defaultMsg
}

export const useAuthStore = create((set, get) => ({
  user: null,
  token: getToken(),
  isLoading: false,
  error: null,

  init: async () => {
    const token = get().token
    if (!token) return
    set({ isLoading: true })
    try {
      const res = await api.get('/auth/me')
      // Re-read token from localStorage in case the axios interceptor refreshed it
      const currentToken = getToken()
      set({ user: res.data, token: currentToken, isLoading: false })
    } catch (err) {
      // Try token refresh on 401
      if (err.response?.status === 401) {
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          try {
            const refreshRes = await api.post('/auth/refresh', { refreshToken })
            localStorage.setItem(TOKEN_KEY, refreshRes.data.token)
            if (refreshRes.data.refreshToken) {
              localStorage.setItem(REFRESH_TOKEN_KEY, refreshRes.data.refreshToken)
            }
            // Retry /auth/me with new token
            const meRes = await api.get('/auth/me')
            set({ user: meRes.data, token: refreshRes.data.token, isLoading: false })
            return
          } catch {
            // Refresh failed, fall through to clear
          }
        }
        // No refresh token or refresh failed — clear auth
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        set({ token: null, user: null, isLoading: false })
        return
      }

      // Network error (server restart, etc.) — keep token for next retry
      if (!err.response) {
        set({ isLoading: false })
        return
      }

      // Other errors — clear auth
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      set({ token: null, user: null, isLoading: false })
    }
  },

  login: async (email, password) => {
    if (get().isLoading) return false
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/login', { email, password })
      localStorage.setItem(TOKEN_KEY, res.data.token)
      localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refreshToken)
      set({ user: res.data.user, token: res.data.token, isLoading: false })
      return true
    } catch (err) {
      set({ error: getErrorMessage(err, '登录失败'), isLoading: false })
      return false
    }
  },

  register: async (username, email, password) => {
    if (get().isLoading) return false
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/register', { username, email, password })
      localStorage.setItem(TOKEN_KEY, res.data.token)
      localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refreshToken)
      set({ user: res.data.user, token: res.data.token, isLoading: false })
      return true
    } catch (err) {
      set({ error: getErrorMessage(err, '注册失败'), isLoading: false })
      return false
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // 后端可选，不必阻塞退出
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      set({ user: null, token: null, error: null })
    }
  },

  setError: (error) => set({ error })
}))
