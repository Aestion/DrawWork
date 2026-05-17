// Test script to verify Yjs WebSocket connection
const WebSocket = require('ws')
const Y = require('yjs')

const PORT = process.env.PORT || 3001
const TOKEN = 'test-token'  // This would need to be a valid token

console.log(`Testing Yjs WebSocket connection to ws://localhost:${PORT}`)

// Create a Y.Doc
const doc = new Y.Doc()
const yMap = doc.getMap('excalidraw')

// Track updates
doc.on('update', (update, origin) => {
  console.log('[Test] Y.Doc update, size:', update.length, 'origin:', origin)
  const json = yMap.toJSON()
  console.log('[Test] yMap elements:', (json.elements || []).length)
})

// Connect to server
const wsUrl = `ws://localhost:${PORT}/test-room?token=${TOKEN}`
const ws = new WebSocket(wsUrl)

ws.on('open', () => {
  console.log('[Test] WebSocket connected')

  // Wait a bit for sync
  setTimeout(() => {
    console.log('[Test] Writing data to Y.Doc')
    doc.transact(() => {
      yMap.set('elements', [{ id: 'test-1', type: 'rectangle', x: 100, y: 100 }])
      yMap.set('appState', { viewBackgroundColor: '#ffffff' })
      yMap.set('files', {})
    }, 'test-origin')

    console.log('[Test] Data written, checking...')
    const json = yMap.toJSON()
    console.log('[Test] yMap now has elements:', (json.elements || []).length)

    // Wait for potential sync
    setTimeout(() => {
      console.log('[Test] Closing connection')
      ws.close()
    }, 2000)
  }, 1000)
})

ws.on('message', (data) => {
  console.log('[Test] Received message, size:', data.length)
})

ws.on('error', (error) => {
  console.error('[Test] WebSocket error:', error.message)
})

ws.on('close', () => {
  console.log('[Test] WebSocket closed')
  process.exit(0)
})

// Timeout after 10 seconds
setTimeout(() => {
  console.log('[Test] Timeout - closing')
  ws.close()
  process.exit(1)
}, 10000)
