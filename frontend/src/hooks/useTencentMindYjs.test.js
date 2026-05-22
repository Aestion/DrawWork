import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTencentMindYjs } from './useTencentMindYjs'

vi.mock('./useYjs', () => ({
  useYjs: vi.fn(() => ({
    connected: true,
    synced: true,
    onlineCount: 1,
    yMap: {
      doc: { transact: (fn, origin) => fn() },
      get: vi.fn(() => null),
      set: vi.fn(),
      toJSON: vi.fn(() => ({})),
      observe: vi.fn(() => {}),
      unobserve: vi.fn(),
      observeDeep: vi.fn(() => {}),
      unobserveDeep: vi.fn()
    }
  }))
}))

vi.mock('../lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.reject(new Error('not found'))),
    put: vi.fn(() => Promise.resolve({ data: {} }))
  }
}))

describe('useTencentMindYjs', () => {
  it('returns loading state initially', () => {
    const { result } = renderHook(() => useTencentMindYjs({ canvasId: 'test', roomId: 'room', canEdit: true }))
    expect(result.current.loading).toBe(true)
    expect(result.current.tencentData).toBeNull()
  })
  it('exposes connection state from useYjs', () => {
    const { result } = renderHook(() => useTencentMindYjs({ canvasId: 'test', roomId: 'room', canEdit: true }))
    expect(result.current.connected).toBe(true)
    expect(result.current.synced).toBe(true)
    expect(result.current.onlineCount).toBe(1)
  })
  it('provides syncToYjs function', () => {
    const { result } = renderHook(() => useTencentMindYjs({ canvasId: 'test', roomId: 'room', canEdit: true }))
    expect(typeof result.current.syncToYjs).toBe('function')
  })
  it('provides remoteUpdateVersion starting at 0', () => {
    const { result } = renderHook(() => useTencentMindYjs({ canvasId: 'test', roomId: 'room', canEdit: true }))
    expect(result.current.remoteUpdateVersion).toBe(0)
  })
})
