/**
 * Simplified Yjs WebSocket server (no persistence).
 *
 * Used by the E2E test runner (test/loop/runner.js) and for ad-hoc testing.
 * Provides basic Yjs collaboration with JWT auth but NO snapshot
 * persistence, NO Redis pub/sub, and NO permission checking.
 *
 * For development / production, see yjs-server/src/server.js
 * which adds SQL persistence, permission queries, and Redis.
 */
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const { setupWSConnection } = require('y-websocket/bin/utils');
const { verifyToken } = require('./utils/jwt');

const PORT = process.env.WS_PORT || 3001;

// In-memory docs storage (for persistence, use y-leveldb)
const docs = new Map();

function startWSServer() {
  const wss = new WebSocketServer({ port: PORT });

  console.log(`[WS] WebSocket server started on port ${PORT}`);

  wss.on('connection', (ws, req) => {
    // Extract token from URL query params
    const url = new URL(req.url || '', `http://localhost:${PORT}`);
    const token = url.searchParams.get('token');
    const room = url.pathname.slice(1); // Remove leading slash

    // Verify JWT token
    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded.type === 'refresh') {
          ws.close(1008, 'Invalid token type');
          return;
        }
        // Token valid, allow connection
        console.log(`[WS] User ${decoded.userId} connected to room ${room}`);
      } catch (err) {
        console.warn(`[WS] Token verification failed:`, err.message);
        ws.close(1008, 'Invalid token');
        return;
      }
    } else {
      console.warn(`[WS] Connection without token to room ${room}`);
      // Allow connection for share links (viewer mode)
    }

    // Setup Yjs connection
    setupWSConnection(ws, req, {
      doc: getDoc(room),
      gc: true,
    });
  });

  return wss;
}

function getDoc(room) {
  if (!docs.has(room)) {
    docs.set(room, new Y.Doc());
  }
  return docs.get(room);
}

// Start if run directly
if (require.main === module) {
  startWSServer();
}

module.exports = { startWSServer, getDoc };
