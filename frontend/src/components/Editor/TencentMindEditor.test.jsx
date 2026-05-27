import { describe, expect, it, vi } from 'vitest'
import {
  applyNodeDataPatch,
  canCompleteAssociativeLineControlDrag,
  canRunAssociativeLineControlDrag,
  decodeTencentMindSnapshotData,
  normalizeAssociativeLineDataForNode,
  patchAssociativeLineInstance,
  getTencentMindLayout,
  getTencentMindTheme,
  shouldRestoreTencentMindMediaNode,
  shouldSkipTencentRemoteApply,
  withTencentMindFormat
} from './TencentMindEditor'

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}))

vi.mock('../../hooks/useTencentMindYjs', () => ({
  useTencentMindYjs: () => ({
    tencentData: null,
    loading: true,
    connected: false,
    synced: false,
    onlineCount: 1,
    remoteUpdateVersion: 0,
    syncToYjs: vi.fn(),
    updateAwareness: vi.fn(),
    getAwarenessStates: () => new Map()
  })
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ token: 'token', user: { id: 'u1', username: 'tester' } })
}))

describe('TencentMind format helpers', () => {
  it('reads saved layout and theme from Tencent data for editor initialization', () => {
    const data = {
      layout: 'fishbone',
      theme: { topic: 'green' }
    }

    expect(getTencentMindLayout(data)).toBe('fishbone')
    expect(getTencentMindTheme(data)).toBe('green')
  })

  it('writes layout and theme without dropping relationships or extensions', () => {
    const data = {
      rootTopic: { id: 'root', title: 'Root' },
      relationships: [{ id: 'line-1', end1Id: 'a', end2Id: 'b' }],
      extensions: { custom: true },
      theme: { topic: 'default' },
      layout: 'mindMap'
    }

    expect(withTencentMindFormat(data, { layout: 'fishbone', theme: 'green' })).toEqual({
      ...data,
      layout: 'fishbone',
      theme: { topic: 'green' }
    })
  })
})

describe('decodeTencentMindSnapshotData', () => {
  it('decodes manual JSON snapshots with Chinese content', () => {
    const data = {
      rootTopic: { id: 'root', title: '中文版本' },
      theme: { topic: 'green' },
      layout: 'fishbone'
    }
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))))

    expect(decodeTencentMindSnapshotData(base64)).toEqual(data)
  })

  it('decodes Yjs binary snapshots that store TencentMind data', async () => {
    const Y = await import('yjs')
    const data = {
      rootTopic: { id: 'root', title: 'Yjs 版本' },
      theme: { topic: 'blue' }
    }
    const doc = new Y.Doc()
    doc.getMap('tencentmind').set('__tencent_state', data)
    const update = Y.encodeStateAsUpdate(doc)
    const base64 = btoa(String.fromCharCode(...update))
    doc.destroy()

    expect(decodeTencentMindSnapshotData(base64)).toEqual(data)
  })
})

describe('applyNodeDataPatch', () => {
  it('writes media metadata through setData and both node data objects', () => {
    const setData = vi.fn()
    const node = {
      setData,
      nodeData: { data: { text: 'Node' } },
      data: { text: 'Node' }
    }

    applyNodeDataPatch(node, {
      _uploadId: 'upload-1',
      _mediaType: 'image',
      _imageSize: { width: 100, height: 80, custom: true }
    })

    expect(setData).toHaveBeenCalledWith('_uploadId', 'upload-1')
    expect(setData).toHaveBeenCalledWith('_mediaType', 'image')
    expect(node.nodeData.data._uploadId).toBe('upload-1')
    expect(node.data._uploadId).toBe('upload-1')
  })
})

describe('shouldSkipTencentRemoteApply', () => {
  it('skips the local broadcast echo so the editor does not refresh its own active selection', () => {
    const snapshot = JSON.stringify({ rootTopic: { id: 'root', title: 'local edit' } })

    expect(shouldSkipTencentRemoteApply(snapshot, {
      lastBroadcastSnapshot: snapshot
    })).toBe(true)
  })

  it('skips the HTTP save echo after local persistence', () => {
    const snapshot = JSON.stringify({ rootTopic: { id: 'root', title: 'saved edit' } })

    expect(shouldSkipTencentRemoteApply(snapshot, {
      lastSavedSnapshot: snapshot
    })).toBe(true)
  })

  it('does not skip a distinct collaborator update', () => {
    expect(shouldSkipTencentRemoteApply(
      JSON.stringify({ rootTopic: { id: 'root', title: 'remote edit' } }),
      { lastBroadcastSnapshot: JSON.stringify({ rootTopic: { id: 'root', title: 'local edit' } }) }
    )).toBe(false)
  })

  it('skips semantic local echoes when relationship ids were regenerated during save', () => {
    const localBroadcast = {
      rootTopic: { id: 'root', title: 'same edit' },
      relationships: [{ id: 'line_old', end1Id: 'a', end2Id: 'b', controlPoints: { 0: { x: 1, y: 2 } } }]
    }
    const savedEcho = {
      rootTopic: { id: 'root', title: 'same edit' },
      relationships: [{ id: 'line_new', end1Id: 'a', end2Id: 'b', controlPoints: { 0: { x: 1, y: 2 } } }]
    }

    expect(shouldSkipTencentRemoteApply(JSON.stringify(savedEcho), {
      remoteComparableSnapshot: JSON.stringify({
        ...savedEcho,
        relationships: [{ end1Id: 'a', end2Id: 'b', controlPoints: { 0: { x: 1, y: 2 } } }]
      }),
      lastBroadcastComparableSnapshot: JSON.stringify({
        ...localBroadcast,
        relationships: [{ end1Id: 'a', end2Id: 'b', controlPoints: { 0: { x: 1, y: 2 } } }]
      })
    })).toBe(true)
  })
})

describe('shouldRestoreTencentMindMediaNode', () => {
  it('does not refetch or rerender an image node that already has restored media', () => {
    expect(shouldRestoreTencentMindMediaNode({
      _uploadId: 'upload-1',
      _mediaType: 'image',
      image: 'blob:http://localhost/image',
      imageSize: { width: 120, height: 90 }
    }, new Map())).toBe(false)
  })

  it('does not refetch or rerender a video node whose placeholder and blob are already present', () => {
    const blobs = new Map([['video-1', 'blob:http://localhost/video']])

    expect(shouldRestoreTencentMindMediaNode({
      _uploadId: 'video-1',
      _mediaType: 'video',
      image: 'data:image/svg+xml,%3Csvg',
      imageSize: { width: 120, height: 80 }
    }, blobs)).toBe(false)
  })

  it('restores media when a persisted node has metadata but no rendered image', () => {
    expect(shouldRestoreTencentMindMediaNode({
      _uploadId: 'upload-1',
      _mediaType: 'image'
    }, new Map())).toBe(true)
  })
})

describe('normalizeAssociativeLineDataForNode', () => {
  function createNode(data) {
    return {
      data,
      nodeData: { data },
      getData: vi.fn(key => (key ? data[key] : data)),
      setData: vi.fn((key, value) => {
        data[key] = value
      })
    }
  }

  it('repairs null associative line control offsets before plugin drag handlers read them', () => {
    const node = createNode({
      associativeLineTargets: ['target-1'],
      associativeLineTargetControlOffsets: [null],
      associativeLinePoint: [{
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 110, y: 120 }
      }]
    })

    expect(normalizeAssociativeLineDataForNode(node)).toBe(true)

    expect(node.data.associativeLineTargetControlOffsets[0]).toEqual([
      { x: 50, y: 0 },
      { x: -50, y: 0 }
    ])
    expect(node.data.associativeLinePoint[0]).toEqual({
      startPoint: { x: 10, y: 20 },
      endPoint: { x: 110, y: 120 }
    })
  })

  it('fills missing entries when a saved control offset array is shorter than targets', () => {
    const node = createNode({
      associativeLineTargets: ['target-1', 'target-2'],
      associativeLineTargetControlOffsets: [
        [{ x: 1, y: 2 }, { x: 3, y: 4 }]
      ],
      associativeLinePoint: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 10 } }]
    })

    expect(normalizeAssociativeLineDataForNode(node)).toBe(true)

    expect(node.data.associativeLineTargetControlOffsets).toHaveLength(2)
    expect(node.data.associativeLineTargetControlOffsets[0]).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 }
    ])
    expect(node.data.associativeLineTargetControlOffsets[1]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ])
    expect(node.data.associativeLinePoint).toEqual([
      { startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 10 } },
      {}
    ])
  })

  it('leaves lines without custom control points on the plugin default path', () => {
    const node = createNode({
      associativeLineTargets: ['target-1']
    })

    expect(normalizeAssociativeLineDataForNode(node)).toBe(false)
    expect(node.data.associativeLineTargetControlOffsets).toBeUndefined()
    expect(node.data.associativeLinePoint).toBeUndefined()
  })
})

describe('associative line control drag guards', () => {
  it('rejects mousemove when the plugin already cleared the active line', () => {
    expect(canRunAssociativeLineControlDrag({
      isControlPointMousedown: true,
      activeLine: null
    })).toBe(false)
  })

  it('rejects mouseup when no mousemove state was captured', () => {
    expect(canCompleteAssociativeLineControlDrag({
      isControlPointMousedown: true,
      activeLine: ['path', 'clickPath', 'text', {}, {}],
      controlPointMousemoveState: {
        pos: null,
        startPoint: null,
        endPoint: null,
        targetIndex: ''
      }
    })).toBe(false)
  })

  it('accepts mouseup only when active line and captured drag state are complete', () => {
    expect(canCompleteAssociativeLineControlDrag({
      isControlPointMousedown: true,
      activeLine: ['path', 'clickPath', 'text', {}, {}],
      controlPointMousemoveState: {
        pos: { x: 10, y: 20 },
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 100, y: 100 },
        targetIndex: 0
      }
    })).toBe(true)
  })

  it('patches the actual associative line instance listener and recovers plugin TypeErrors', () => {
    const listeners = new Map()
    const originalMouseup = vi.fn(() => {
      throw new TypeError('object null is not iterable (cannot read property Symbol(Symbol.iterator))')
    })
    const instance = {
      isControlPointMousedown: true,
      activeLine: ['path', 'clickPath', 'text', {}, {}],
      controlPointMousemoveState: {
        pos: { x: 10, y: 20 },
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 100, y: 100 },
        targetIndex: 0
      },
      onControlPointMousemove: vi.fn(),
      onControlPointMouseup: originalMouseup,
      resetControlPoint: vi.fn(function reset() {
        this.isControlPointMousedown = false
      }),
      renderAllLines: vi.fn(),
      mindMap: {
        off: vi.fn((event, fn) => {
          listeners.delete(event)
          expect(event).toBe('mouseup')
          expect(fn).toBe(originalMouseup)
        }),
        on: vi.fn((event, fn) => listeners.set(event, fn)),
        renderer: { root: null }
      }
    }

    expect(patchAssociativeLineInstance(instance)).toBe(true)
    expect(instance.mindMap.off).toHaveBeenCalledWith('mouseup', originalMouseup)
    expect(instance.mindMap.on).toHaveBeenCalledWith('mouseup', instance.onControlPointMouseup)

    expect(() => listeners.get('mouseup')({ stopPropagation: vi.fn(), preventDefault: vi.fn() })).not.toThrow()
    expect(originalMouseup).toHaveBeenCalled()
    expect(instance.resetControlPoint).toHaveBeenCalled()
    expect(instance.renderAllLines).toHaveBeenCalled()
  })
})
