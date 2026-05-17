import { vi, describe, it, expect } from 'vitest'

// Mock heavy dependencies before importing the module under test
vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: () => null,
  sceneCoordsToViewportCoords: (coords) => ({ x: 0, y: 0 }),
  viewportCoordsToSceneCoords: (coords) => ({ x: 0, y: 0 })
}))

vi.mock('../../hooks/useYjs', () => ({
  useYjs: () => ({
    connected: false,
    synced: false,
    onlineCount: 1,
    connectedRef: { current: false },
    setData: vi.fn(),
    observe: () => () => {},
    updateAwareness: vi.fn(),
    getAwarenessStates: () => new Map()
  })
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ token: 'test-token', user: { id: 'u1', username: 'tester' } })
}))

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} }))
  }
}))

// Path2D polyfill for Excalidraw's canvas dependencies in jsdom
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    rect() {}
    roundRect() {}
    ellipse() {}
  }
}

import { stableSceneSignature, filterOversizedEmbeddedFiles } from './ExcalidrawWrapper'

describe('stableSceneSignature', () => {
  it('produces same signature for identical data', () => {
    const elements = [{ id: 'a', type: 'rectangle', x: 0, y: 0 }]
    const appState = { viewBackgroundColor: '#ffffff', gridSize: 20, theme: 'light' }
    const files = {}

    const sig1 = stableSceneSignature(elements, appState, files)
    const sig2 = stableSceneSignature(elements, appState, files)

    expect(sig1).toBe(sig2)
  })

  it('ignores view state changes (scrollX, scrollY, zoom, scrollCenter)', () => {
    const elements = [{ id: 'a', type: 'rectangle' }]
    const baseAppState = { viewBackgroundColor: '#ffffff' }

    const sigNoScroll = stableSceneSignature(elements, baseAppState, {})
    const sigWithScroll = stableSceneSignature(
      elements,
      { ...baseAppState, scrollX: 100, scrollY: 200, zoom: 2 },
      {}
    )
    const sigWithScrollCenter = stableSceneSignature(
      elements,
      { ...baseAppState, scrollX: 999, scrollY: 500, zoom: 0.5, scrollCenter: true },
      {}
    )
    const sigWithZoomObject = stableSceneSignature(
      elements,
      { ...baseAppState, scrollX: 0, scrollY: 0, zoom: { value: 1.5 } },
      {}
    )

    expect(sigNoScroll).toBe(sigWithScroll)
    expect(sigWithScroll).toBe(sigWithScrollCenter)
    expect(sigWithScrollCenter).toBe(sigWithZoomObject)
  })

  it('detects element content changes', () => {
    const baseAppState = { viewBackgroundColor: '#ffffff' }

    const sig1 = stableSceneSignature([{ id: 'a' }], baseAppState, {})
    const sig2 = stableSceneSignature([{ id: 'b' }], baseAppState, {})

    expect(sig1).not.toBe(sig2)
  })

  it('detects element property changes', () => {
    const baseAppState = { viewBackgroundColor: '#ffffff' }

    const sig1 = stableSceneSignature([{ id: 'a', x: 0 }], baseAppState, {})
    const sig2 = stableSceneSignature([{ id: 'a', x: 100 }], baseAppState, {})

    expect(sig1).not.toBe(sig2)
  })

  it('detects background color changes', () => {
    const elements = [{ id: 'a' }]

    const sig1 = stableSceneSignature(elements, { viewBackgroundColor: '#ffffff' }, {})
    const sig2 = stableSceneSignature(elements, { viewBackgroundColor: '#000000' }, {})

    expect(sig1).not.toBe(sig2)
  })

  it('detects theme changes', () => {
    const elements = [{ id: 'a' }]

    const sig1 = stableSceneSignature(elements, { theme: 'light' }, {})
    const sig2 = stableSceneSignature(elements, { theme: 'dark' }, {})

    expect(sig1).not.toBe(sig2)
  })

  it('detects grid size changes', () => {
    const elements = [{ id: 'a' }]

    const sig1 = stableSceneSignature(elements, { gridSize: null }, {})
    const sig2 = stableSceneSignature(elements, { gridSize: 20 }, {})

    expect(sig1).not.toBe(sig2)
  })

  it('detects file additions', () => {
    const sig1 = stableSceneSignature([], {}, {})
    const sig2 = stableSceneSignature([], {}, { f1: { mimeType: 'image/png' } })

    expect(sig1).not.toBe(sig2)
  })

  it('same files in different order produce same signature', () => {
    const filesA = { f1: { mimeType: 'image/gif' }, f2: { mimeType: 'video/mp4' } }
    const filesB = { f2: { mimeType: 'video/mp4' }, f1: { mimeType: 'image/gif' } }

    const sig1 = stableSceneSignature([], {}, filesA)
    const sig2 = stableSceneSignature([], {}, filesB)

    expect(sig1).toBe(sig2)
  })

  it('detects file removal', () => {
    const sig1 = stableSceneSignature([], {}, { f1: {}, f2: {} })
    const sig2 = stableSceneSignature([], {}, { f1: {} })

    expect(sig1).not.toBe(sig2)
  })

  it('handles empty/null/undefined inputs without throwing', () => {
    expect(() => stableSceneSignature()).not.toThrow()
    expect(() => stableSceneSignature(null, null, null)).not.toThrow()
    expect(() => stableSceneSignature([], {}, {})).not.toThrow()
    expect(() => stableSceneSignature(undefined, undefined, undefined)).not.toThrow()
  })

  it('produces deterministic signatures', () => {
    const input = {
      elements: [
        { id: 'n1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
        { id: 'n2', type: 'text', text: 'hello', x: 50, y: 50 }
      ],
      appState: { viewBackgroundColor: '#f0f0f0', gridSize: null, theme: 'light' },
      files: { f1: { mimeType: 'image/png' }, f2: { mimeType: 'video/mp4' } }
    }

    const results = new Set()
    for (let i = 0; i < 10; i++) {
      results.add(stableSceneSignature(input.elements, input.appState, input.files))
    }
    expect(results.size).toBe(1)
  })

  it('same scene data with different local UI state has same signature', () => {
    const elements = [{ id: 'a', type: 'rectangle' }]
    const sceneAppState = { viewBackgroundColor: '#ffffff' }

    const localUiStates = [
      { activeTool: { type: 'selection' } },
      { activeTool: { type: 'rectangle' } },
      { selectedElementIds: { a: true } },
      { editingElement: { id: 'a' } },
      { zenModeEnabled: true },
      { gridModeEnabled: true },
      { viewModeEnabled: true }
    ]

    const baseSig = stableSceneSignature(elements, sceneAppState, {})
    localUiStates.forEach((uiState) => {
      const sig = stableSceneSignature(elements, { ...sceneAppState, ...uiState }, {})
      expect(sig).toBe(baseSig)
    })
  })

  it('scene with collaborators data does not change signature', () => {
    const elements = [{ id: 'a' }]
    const appState = { viewBackgroundColor: '#fff' }
    const appStateWithCollab = {
      viewBackgroundColor: '#fff',
      collaborators: new Map([['user1', { pointer: { x: 100, y: 200 } }]])
    }

    const sig1 = stableSceneSignature(elements, appState, {})
    const sig2 = stableSceneSignature(elements, appStateWithCollab, {})

    expect(sig1).toBe(sig2)
  })

  it('appState.null does not crash', () => {
    const sig = stableSceneSignature([{ id: 'a' }], null, {})
    expect(typeof sig).toBe('string')
  })
})

describe('filterOversizedEmbeddedFiles', () => {
  it('keeps files under the size limit', () => {
    const scene = {
      elements: [{ id: 'img1', type: 'image', fileId: 'f1' }],
      files: { f1: { dataURL: 'data:image/png;base64,small', mimeType: 'image/png' } }
    }
    const result = filterOversizedEmbeddedFiles(scene, 10 * 1024 * 1024)
    expect(result.files.f1).toBeDefined()
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].id).toBe('img1')
  })

  it('filters out files exceeding the size limit and their image elements', () => {
    const largeData = 'x'.repeat(2000)
    const scene = {
      elements: [
        { id: 'img-small', type: 'image', fileId: 'f-small' },
        { id: 'img-large', type: 'image', fileId: 'f-large' },
        { id: 'non-image', type: 'rectangle' }
      ],
      files: {
        'f-small': { dataURL: 'tiny', mimeType: 'image/png' },
        'f-large': { dataURL: largeData, mimeType: 'video/mp4' }
      }
    }
    const result = filterOversizedEmbeddedFiles(scene, 500)
    expect(result.files['f-small']).toBeDefined()
    expect(result.files['f-large']).toBeUndefined()
    expect(result.elements.find((e) => e.id === 'img-small')).toBeDefined()
    expect(result.elements.find((e) => e.id === 'img-large')).toBeUndefined()
    expect(result.elements.find((e) => e.id === 'non-image')).toBeDefined()
  })

  it('keeps non-image elements even when their fileId is oversized', () => {
    const scene = {
      elements: [{ id: 'unknown', fileId: 'f-big' }],
      files: { 'f-big': { dataURL: 'x'.repeat(2000), mimeType: 'application/octet-stream' } }
    }
    const result = filterOversizedEmbeddedFiles(scene, 100)
    expect(result.elements).toHaveLength(1)
    expect(result.files).toEqual({})
  })

  it('handles empty scene', () => {
    const result = filterOversizedEmbeddedFiles({ elements: [], files: {} }, 1000)
    expect(result.elements).toEqual([])
    expect(result.files).toEqual({})
  })

  it('handles null/undefined scene gracefully', () => {
    expect(filterOversizedEmbeddedFiles({}, 1000).elements).toEqual([])
    expect(filterOversizedEmbeddedFiles({ elements: null, files: null }, 1000).elements).toEqual([])
    expect(filterOversizedEmbeddedFiles({ elements: null, files: null }, 1000).files).toEqual({})
  })

  it('handles files with missing dataURL gracefully', () => {
    const scene = {
      elements: [{ id: 'img1', type: 'image', fileId: 'f1' }],
      files: { f1: { mimeType: 'image/png' } }
    }
    const result = filterOversizedEmbeddedFiles(scene, 100)
    expect(result.files.f1).toBeDefined()
    expect(result.elements).toHaveLength(1)
  })

  it('zero maxBytes filters out all files with dataURL', () => {
    const scene = {
      elements: [{ id: 'img1', type: 'image', fileId: 'f1' }],
      files: { f1: { dataURL: 'a', mimeType: 'image/png' } }
    }
    const result = filterOversizedEmbeddedFiles(scene, 0)
    expect(result.files.f1).toBeUndefined()
    expect(result.elements).toHaveLength(0)
  })
})
