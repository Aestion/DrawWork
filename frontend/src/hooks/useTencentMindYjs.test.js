import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { cloneTencentDataForYjs, shouldApplyTencentHttpPollSnapshot, useTencentMindYjs } from './useTencentMindYjs'

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
  it('does not apply HTTP polling snapshots while Yjs is connected and synced', () => {
    expect(shouldApplyTencentHttpPollSnapshot({
      connected: true,
      synced: true,
      snapshot: JSON.stringify({ rootTopic: { id: 'root', title: 'stale http' } })
    })).toBe(false)
  })

  it('applies HTTP polling snapshots only as an offline fallback', () => {
    expect(shouldApplyTencentHttpPollSnapshot({
      connected: false,
      synced: false,
      snapshot: JSON.stringify({ rootTopic: { id: 'root', title: 'fallback' } })
    })).toBe(true)
  })

  it('does not apply HTTP polling snapshots that echo local changes', () => {
    const snapshot = JSON.stringify({ rootTopic: { id: 'root', title: 'local' } })
    expect(shouldApplyTencentHttpPollSnapshot({
      connected: false,
      synced: false,
      snapshot,
      lastLocalSnapshot: snapshot
    })).toBe(false)
  })

  it('clones Tencent data before writing it to Yjs', () => {
    const data = {
      rootTopic: {
        id: 'root',
        children: { attached: [{ id: 'child1', extensions: { 'drawwork.media': { uploadId: 'u1' } } }] }
      }
    }

    const cloned = cloneTencentDataForYjs(data)

    expect(cloned).toEqual(data)
    expect(cloned).not.toBe(data)
    expect(cloned.rootTopic.children.attached[0]).not.toBe(data.rootTopic.children.attached[0])
  })

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
