import axios from 'axios'

let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  const token = localStorage.getItem('drawwork_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    // Only attempt refresh on 401, and only once per request
    if (err.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('drawwork_refresh_token')

      if (!refreshToken) {
        localStorage.removeItem('drawwork_token')
        if (!originalRequest.url.includes('/auth/')) {
          window.location.href = '/login'
        }
        return Promise.reject(err)
      }

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post('/api/auth/refresh', { refreshToken })
        const { token: newToken, refreshToken: newRefreshToken } = res.data

        localStorage.setItem('drawwork_token', newToken)
        if (newRefreshToken) {
          localStorage.setItem('drawwork_refresh_token', newRefreshToken)
        }

        processQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshError) {
        console.warn('[Auth] Token refresh failed, clearing credentials:', refreshError.message)
        processQueue(refreshError, null)
        localStorage.removeItem('drawwork_token')
        localStorage.removeItem('drawwork_refresh_token')
        if (!originalRequest.url.includes('/auth/')) {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

// Proactive token refresh — check before each request if token is near expiry
// Decodes JWT payload (no verification needed for expiry check)
function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1]
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

const PROACTIVE_REFRESH_THRESHOLD_MS = 60 * 60 * 1000 // refresh if <1h left

api.interceptors.request.use(async (config) => {
  // Skip proactive refresh for auth endpoints (login, refresh, etc.)
  if (config.url?.includes('/auth/')) return config

  const token = localStorage.getItem('drawwork_token')
  if (!token) return config

  const payload = parseJwtPayload(token)
  if (!payload?.exp) return config

  const expiresAt = payload.exp * 1000 // JWT exp is in seconds
  const now = Date.now()

  if (expiresAt - now < PROACTIVE_REFRESH_THRESHOLD_MS) {
    const refreshToken = localStorage.getItem('drawwork_refresh_token')
    if (refreshToken && !isRefreshing) {
      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/refresh', { refreshToken })
        const { token: newToken, refreshToken: newRefreshToken } = res.data
        localStorage.setItem('drawwork_token', newToken)
        if (newRefreshToken) {
          localStorage.setItem('drawwork_refresh_token', newRefreshToken)
        }
        config.headers.Authorization = `Bearer ${newToken}`
      } catch {
        // Proactive refresh failed — let the response interceptor handle the 401
      } finally {
        isRefreshing = false
      }
    }
  }

  return config
})

export default api
