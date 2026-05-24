import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import * as Y from 'yjs'
import {
  extractData,
  hasSceneData,
  shouldEmitCurrentDataOnObserve,
  shouldEmitSyncEvent,
  writeSceneToYMap,
  useYjs
} from './useYjs'

describe('writeSceneToYMap', () => {
  it('keeps existing elements when a partial local update writes a new element', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('excalidraw')

    writeSceneToYMap(yMap, {
      elements: [
        { id: 'old-1', type: 'rectangle' },
        { id: 'old-2', type: 'ellipse' }
      ],
      appState: {},
      files: {}
    })

    writeSceneToYMap(yMap, {
      elements: [{ id: 'new-1', type: 'diamond' }],
      appState: {},
      files: {}
    })

    expect(extractData(yMap).elements.map((element) => element.id).sort()).toEqual([
      'new-1',
      'old-1',
      'old-2'
    ])

    doc.destroy()
  })

  it('marks existing elements as deleted when an explicit empty scene is written', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('excalidraw')

    writeSceneToYMap(yMap, {
      elements: [{ id: 'old-1', type: 'rectangle' }],
      appState: {},
      files: {}
    })

    writeSceneToYMap(yMap, {
      elements: [],
      appState: {},
      files: {}
    })

    expect(extractData(yMap).elements).toEqual([
      expect.objectContaining({ id: 'old-1', isDeleted: true, version: 1 })
    ])

    doc.destroy()
  })
})

describe('shouldEmitSyncEvent', () => {
  it('emits every successful sync event even when last state was already synced', () => {
    expect(shouldEmitSyncEvent(true, true)).toBe(true)
  })

  it('deduplicates repeated unsynced events', () => {
    expect(shouldEmitSyncEvent(false, false)).toBe(false)
  })
})

describe('shouldEmitCurrentDataOnObserve', () => {
  it('emits a non-empty room snapshot even when provider synced flag is not ready yet', () => {
    expect(shouldEmitCurrentDataOnObserve(false, {
      elements: [{ id: 'el1', type: 'rectangle' }],
      appState: {},
      files: {}
    })).toBe(true)
  })

  it('does not emit an empty unsynced room snapshot', () => {
    expect(shouldEmitCurrentDataOnObserve(false, {
      elements: [],
      appState: {},
      files: {}
    })).toBe(false)
  })

  it('treats appState-only and file-only snapshots as data', () => {
    expect(hasSceneData({ elements: [], appState: { theme: 'light' }, files: {} })).toBe(true)
    expect(hasSceneData({ elements: [], appState: {}, files: { f1: { id: 'f1' } } })).toBe(true)
  })
})

describe('useYjs', () => {
  it('getData returns files when setData saved them', async () => {
    const { result } = renderHook(() => useYjs('room1', 'token1'))

    await waitFor(() => expect(result.current.connected).toBe(false))

    act(() => {
      result.current.setData({
        elements: [{ id: 'img1', type: 'image', fileId: 'f1' }],
        appState: {},
        files: { f1: { mimeType: 'image/png', dataURL: 'data:image/png;base64,abc' } }
      })
    })

    const data = result.current.getData()
    expect(data.files).toBeDefined()
    expect(data.files.f1).toBeDefined()
  })

  it('setData marks existing elements deleted for an explicit empty scene', async () => {
    const { result } = renderHook(() => useYjs('room2', 'token2'))

    await waitFor(() => expect(result.current.connected).toBe(false))

    // Set some elements first
    act(() => {
      result.current.setData({
        elements: [{ id: 'el1', type: 'rectangle' }, { id: 'el2', type: 'text' }],
        appState: { theme: 'light' },
        files: {}
      })
    })

    let data = result.current.getData()
    expect(data.elements).toHaveLength(2)

    // setData with empty elements — setData itself doesn't guard,
    // protection is in ExcalidrawWrapper's handleChange callback
    act(() => {
      result.current.setData({
        elements: [],
        appState: { theme: 'dark' },
        files: {}
      })
    })

    // setData directly overwrites (guard is in handleChange, not here)
    data = result.current.getData()
    expect(data.elements).toHaveLength(2)
    expect(data.elements.every((element) => element.isDeleted)).toBe(true)
    expect(data.appState.theme).toBe('dark')
  })

  it('setData overwrites elements when both existing and new are empty', async () => {
    const { result } = renderHook(() => useYjs('room3', 'token3'))

    await waitFor(() => expect(result.current.connected).toBe(false))

    act(() => {
      result.current.setData({
        elements: [],
        appState: {},
        files: {}
      })
    })

    const data = result.current.getData()
    expect(data.elements).toEqual([])
  })
})
