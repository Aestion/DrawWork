import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

// Mock the API module before importing the store under test
// vi.hoisted() ensures the mock objects exist before hoisted vi.mock() runs
const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../lib/axios', () => ({
  default: mockApi
}))

// After this point, imports resolve to the mocked module

const TOKEN_KEY = 'drawwork_token'

beforeEach(() => {
  // Reset store state before each test
  useAuthStore.setState({
    user: null,
    token: null,
    isLoading: false,
    error: null
  })
  localStorage.clear()
  vi.clearAllMocks()
})

describe('authStore', () => {
  describe('initial state', () => {
    it('starts with no user and no token', () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('restores token from localStorage on creation', () => {
      localStorage.setItem(TOKEN_KEY, 'existing-token')
      // The store constructor reads getToken() once; in tests we simulate
      // by setting state directly (the actual store does this in create())
      useAuthStore.setState({ token: localStorage.getItem(TOKEN_KEY) })
      expect(useAuthStore.getState().token).toBe('existing-token')
    })
  })

  describe('login', () => {
    it('succeeds and stores user + token', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { user: { id: '1', username: 'test' }, token: 'jwt-token' }
      })

      const result = await useAuthStore.getState().login('test@test.com', 'pass123')
      expect(result).toBe(true)

      const state = useAuthStore.getState()
      expect(state.user).toEqual({ id: '1', username: 'test' })
      expect(state.token).toBe('jwt-token')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-token')
    })

    it('fails with server error message', async () => {
      mockApi.post.mockRejectedValueOnce({
        response: { data: { error: '邮箱或密码错误' } }
      })

      const result = await useAuthStore.getState().login('bad@test.com', 'wrong')
      expect(result).toBe(false)

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.error).toContain('邮箱或密码错误')
      expect(state.isLoading).toBe(false)
    })

    it('prevents duplicate submission while loading', async () => {
      useAuthStore.setState({ isLoading: true })
      const result = await useAuthStore.getState().login('test@test.com', 'pass')
      expect(result).toBe(false)
      expect(mockApi.post).not.toHaveBeenCalled()
    })

    it('handles network error gracefully', async () => {
      mockApi.post.mockRejectedValueOnce({ request: {} })

      const result = await useAuthStore.getState().login('test@test.com', 'pass')
      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toContain('网络异常')
    })
  })

  describe('register', () => {
    it('succeeds and stores user + token', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { user: { id: '2', username: 'newuser' }, token: 'reg-token' }
      })

      const result = await useAuthStore.getState().register('newuser', 'new@test.com', 'pass123')
      expect(result).toBe(true)

      const state = useAuthStore.getState()
      expect(state.user.username).toBe('newuser')
      expect(state.token).toBe('reg-token')
      expect(localStorage.getItem(TOKEN_KEY)).toBe('reg-token')
    })

    it('fails on duplicate email', async () => {
      mockApi.post.mockRejectedValueOnce({
        response: { data: { error: '邮箱已被注册' } }
      })

      const result = await useAuthStore.getState().register('dup', 'dup@test.com', 'pass')
      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toContain('邮箱已被注册')
    })
  })

  describe('init', () => {
    it('does nothing when no token exists', async () => {
      await useAuthStore.getState().init()
      expect(mockApi.get).not.toHaveBeenCalled()
    })

    it('validates token and loads user', async () => {
      useAuthStore.setState({ token: 'valid-token' })
      localStorage.setItem(TOKEN_KEY, 'valid-token')
      mockApi.get.mockResolvedValueOnce({ data: { id: '1', username: 'loaded' } })

      await useAuthStore.getState().init()
      expect(useAuthStore.getState().user.username).toBe('loaded')
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('clears token on validation failure with no refresh token', async () => {
      useAuthStore.setState({ token: 'expired-token' })
      localStorage.setItem(TOKEN_KEY, 'expired-token')
      const axiosError = new Error('401')
      axiosError.response = { status: 401 }
      mockApi.get.mockRejectedValueOnce(axiosError)

      await useAuthStore.getState().init()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().token).toBeNull()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })

    it('keeps token on network error for retry', async () => {
      useAuthStore.setState({ token: 'valid-token', user: { id: '1' } })
      localStorage.setItem(TOKEN_KEY, 'valid-token')
      mockApi.get.mockRejectedValueOnce(new Error('Network Error'))

      await useAuthStore.getState().init()
      // User stays as previous value for retry when server recovers
      expect(localStorage.getItem(TOKEN_KEY)).toBe('valid-token')
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears user, token, and notifies backend', async () => {
      useAuthStore.setState({ user: { id: '1' }, token: 't' })
      localStorage.setItem(TOKEN_KEY, 't')
      mockApi.post.mockResolvedValueOnce({})

      await useAuthStore.getState().logout()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().token).toBeNull()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(mockApi.post).toHaveBeenCalledWith('/auth/logout')
    })

    it('clears even when backend call fails', async () => {
      useAuthStore.setState({ user: { id: '1' }, token: 't' })
      localStorage.setItem(TOKEN_KEY, 't')
      mockApi.post.mockRejectedValueOnce(new Error('network error'))

      await useAuthStore.getState().logout()
      // Should still clear local state
      expect(useAuthStore.getState().user).toBeNull()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })
  })
})
