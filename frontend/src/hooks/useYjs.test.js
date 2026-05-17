import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useYjs } from './useYjs'

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

  it('setData writes whatever data it receives (guard is in handleChange)', async () => {
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
    expect(data.elements).toHaveLength(0)
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
