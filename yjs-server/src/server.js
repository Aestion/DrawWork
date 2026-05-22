const path = require('path')
const fs = require('fs')

/**
 * Full-featured Yjs WebSocket server with persistence and multi-instance support.
 *
 * Production / development server — run standalone via "npm start" in yjs-server/.
 * Features: JWT auth (local + API fallback), SQLite/Postgres snapshot persistence,
 * Redis pub/sub for multi-instance broadcast, room-level permission checks.
 *
 * For E2E testing, see backend/src/ws-server.js (simpler, no persistence).
 */

// Load root config first, then local config (overrides root)
const rootEnv = path.resolve(__dirname, '../../.env')
const localEnv = path.resolve(__dirname, '../.env')
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv })
  console.log('[Config] Loaded root .env')
}
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv, override: true })
  console.log('[Config] Loaded local .env (overrides root)')
}

const WebSocket = require('ws')
const http = require('http')
const Y = require('yjs')
const { setupWSConnection, docs, getYDoc } = require('y-websocket/bin/utils')
const jwt = require('jsonwebtoken')
const Redis = require('ioredis')
const { Pool } = require('pg')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')

const PORT = process.env.YJS_PORT || process.env.PORT || 3001
const SAVE_INTERVAL = parseInt(process.env.YJS_SAVE_INTERVAL, 10) || 10000
const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '')

const permissionLevels = {
  owner: 4,
  editor: 3,
  commenter: 2,
  viewer: 1
}

function databasePath() {
  // Get project root (parent directory of yjs-server)
  const projectRoot = path.resolve(__dirname, '..', '..')

  if (process.env.DATABASE_URL?.startsWith('sqlite:')) {
    const dbPath = process.env.DATABASE_URL.replace('sqlite:', '')
    // If relative path, resolve from project root
    if (!path.isAbsolute(dbPath)) {
      // Handle both ./dev.db (backend) and ./data/dev.db (legacy)
      if (dbPath.startsWith('./')) {
        return path.join(projectRoot, 'backend', path.basename(dbPath))
      }
      return path.resolve(projectRoot, dbPath)
    }
    return dbPath
  }
  return process.env.SQLITE_PATH || path.join(projectRoot, 'backend', 'dev.db')
}

let db = null
let pgPool = null

function getSql(dialect, sqliteSql, postgresSql) {
  return dialect === 'postgres' ? postgresSql : sqliteSql
}

async function getDb() {
  if (db) return db

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('sqlite:')) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    })

    db = {
      dialect: 'postgres',
      get: async (sql, params = []) => {
        const result = await pgPool.query(sql, params)
        return result.rows[0] || null
      },
      run: async (sql, params = []) => pgPool.query(sql, params),
      close: async () => pgPool.end()
    }

    return db
  }

  const sqliteDb = await open({
    filename: databasePath(),
    driver: sqlite3.Database
  })

  db = {
    dialect: 'sqlite',
    get: (sql, params = []) => sqliteDb.get(sql, params),
    run: (sql, params = []) => sqliteDb.run(sql, params),
    close: () => sqliteDb.close()
  }

  return db
}

// Only set up Redis pub/sub for cross-instance message relay when explicitly configured.
// In single-server setups (common for dev), leave REDIS_URL unset and this is skipped.
const redisUrl = process.env.REDIS_URL
const redisSub = redisUrl ? new Redis(redisUrl) : null

const userConnections = new Map()
const roomConnections = new Map()
const roomMetaCache = new Map()
const dirtyRooms = new Set()
const initializedRooms = new Set()
const roomInitLocks = new Map()
const closingRooms = new Set()

function parseRoomName(reqUrl) {
  const url = new URL(reqUrl, 'http://localhost')
  const queryRoom = url.searchParams.get('room')
  if (queryRoom) return queryRoom

  const pathRoom = url.pathname
    .replace(/^\/ws\/?/, '')
    .replace(/^\/+/, '')

  return pathRoom ? decodeURIComponent(pathRoom) : null
}

function hasPermission(currentPermission, requiredPermission) {
  return (permissionLevels[currentPermission] || 0) >= (permissionLevels[requiredPermission] || 0)
}

function verifyLocalToken(token) {
  const secret = process.env.JWT_SECRET
  if (!secret) return null

  try {
    const decoded = jwt.verify(token, secret)
    if (decoded.type === 'refresh') {
      throw new Error('Refresh token is not allowed')
    }
    if (!decoded.userId) {
      throw new Error('Access token missing userId')
    }
    return { userId: decoded.userId, source: 'local' }
  } catch (err) {
    if (err.message === 'Refresh token is not allowed' || err.message === 'Access token missing userId') {
      throw err
    }
    return null
  }
}

/**
 * Verify JWT locally first; if that fails (e.g. wrong secret or env not set),
 * fall back to calling the REST API which uses the backend's own JWT verification.
 * The API fallback ensures tokens remain valid even if yjs-server and backend
 * use different JWT_SECRET values (e.g. during rotation).
 */
async function authenticateToken(token) {
  const localAuth = verifyLocalToken(token)
  if (localAuth) {
    return localAuth
  }

  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `API auth failed with status ${response.status}`)
  }

  const user = await response.json()
  if (!user?.id) {
    throw new Error('API auth response missing user id')
  }

  return { userId: user.id }
}

async function loadRoomMeta(roomName, userId) {
  const database = await getDb()

  const row = await database.get(
    getSql(
      database.dialect,
      `
        SELECT
          c.id AS canvas_id,
          c.board_id,
          b.owner_id,
          b.is_public,
          s.permission AS shared_permission,
          u.is_active
        FROM canvases c
        JOIN boards b ON b.id = c.board_id
        JOIN users u ON u.id = ?
        LEFT JOIN board_shares s ON s.board_id = b.id AND s.user_id = ?
        WHERE c.yjs_room_id = ?
          AND c.is_deleted = FALSE
          AND b.is_deleted = FALSE
        LIMIT 1
      `,
      `
        SELECT
          c.id AS canvas_id,
          c.board_id,
          b.owner_id,
          b.is_public,
          s.permission AS shared_permission,
          u.is_active
        FROM canvases c
        JOIN boards b ON b.id = c.board_id
        JOIN users u ON u.id = $1
        LEFT JOIN board_shares s ON s.board_id = b.id AND s.user_id = $2
        WHERE c.yjs_room_id = $3
          AND c.is_deleted = FALSE
          AND b.is_deleted = FALSE
        LIMIT 1
      `
    ),
    [userId, userId, roomName]
  )

  if (!row || !row.is_active) return null

  let permission = null
  if (row.owner_id === userId) permission = 'owner'
  else if (row.shared_permission) permission = row.shared_permission
  else if (row.is_public) permission = 'viewer'

  if (!permission) return null

  return {
    roomName,
    canvasId: row.canvas_id,
    boardId: row.board_id,
    permission
  }
}

async function loadCanvasId(roomName) {
  const cached = roomMetaCache.get(roomName)
  if (cached) return cached.canvasId

  const database = await getDb()
  const row = await database.get(
    getSql(
      database.dialect,
      'SELECT id FROM canvases WHERE yjs_room_id = ? AND is_deleted = FALSE LIMIT 1',
      'SELECT id FROM canvases WHERE yjs_room_id = $1 AND is_deleted = FALSE LIMIT 1'
    ),
    [roomName]
  )

  return row?.id || null
}

async function loadSnapshot(canvasId) {
  try {
    const database = await getDb()
    const row = await database.get(
      getSql(
        database.dialect,
        'SELECT content FROM yjs_snapshots WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 1',
        'SELECT content FROM yjs_snapshots WHERE canvas_id = $1 ORDER BY created_at DESC LIMIT 1'
      ),
      [canvasId]
    )
    return row?.content || null
  } catch (err) {
    console.error('[Yjs] Load snapshot error:', err.message)
    return null
  }
}

async function saveSnapshot(canvasId, update) {
  try {
    // Decode snapshot to verify content before saving
    const verifyDoc = new Y.Doc()
    Y.applyUpdate(verifyDoc, new Uint8Array(update))
    const verifyJson = verifyDoc.getMap('excalidraw').toJSON()
    // Support both old monolithic 'elements' key and new per-element keys (__el_{id})
    const elementCount = Array.isArray(verifyJson.elements)
      ? verifyJson.elements.length
      : Object.keys(verifyJson).filter(k => k.startsWith('__el_')).length
    verifyDoc.destroy()

    // CRITICAL FIX: Save as Yjs binary update, not JSON
    // JSON format loses CRDT metadata needed for proper sync
    const database = await getDb()

    // First, insert the new snapshot
    await database.run(
      getSql(
        database.dialect,
        `
          INSERT INTO yjs_snapshots (canvas_id, content, created_by, created_at, updated_at)
          VALUES (?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        `
          INSERT INTO yjs_snapshots (canvas_id, content, created_by, created_at, updated_at)
          VALUES ($1, $2, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      ),
      [canvasId, Buffer.from(update)]  // Save binary update, not JSON
    )

    // Keep only the latest 5 auto-save snapshots (created_by IS NULL).
    // This prevents data loss from a single corrupted empty-state save —
    // if elements are unexpectedly empty, prior snapshots are still available.
    const KEEP_LATEST = 5
    await database.run(
      getSql(
        database.dialect,
        `
          DELETE FROM yjs_snapshots
          WHERE canvas_id = ? AND created_by IS NULL
            AND rowid NOT IN (
              SELECT rowid FROM yjs_snapshots
              WHERE canvas_id = ? AND created_by IS NULL
              ORDER BY created_at DESC
              LIMIT ?
            )
        `,
        `
          DELETE FROM yjs_snapshots
          WHERE canvas_id = $1 AND created_by IS NULL
            AND id NOT IN (
              SELECT id FROM yjs_snapshots
              WHERE canvas_id = $2 AND created_by IS NULL
              ORDER BY created_at DESC
              LIMIT $3
            )
        `
      ),
      [canvasId, canvasId, KEEP_LATEST]
    )
    console.log(`[Yjs] Snapshot saved for canvas ${canvasId}, elements: ${elementCount}`)
  } catch (err) {
    console.error('[Yjs] Save snapshot error:', err.message)
  }
}

async function getOrCreateDoc(roomName, canvasId) {
  const doc = getYDoc(roomName)

  if (initializedRooms.has(roomName)) return doc

  while (roomInitLocks.has(roomName)) {
    await roomInitLocks.get(roomName)
    if (initializedRooms.has(roomName)) return doc
  }

  let resolveLock
  const lockPromise = new Promise((res) => { resolveLock = res })
  roomInitLocks.set(roomName, lockPromise)

  try {
    const snapshot = await loadSnapshot(canvasId)

    if (snapshot) {
      const bytes = new Uint8Array(snapshot)
      // Detect format: JSON starts with '{' (0x7B), Yjs binary does not
      if (bytes.length > 0 && bytes[0] === 0x7B) {
        try {
          const jsonStr = new TextDecoder().decode(bytes)
          const json = JSON.parse(jsonStr)
          const yMap = doc.getMap('excalidraw')
          // Migrate legacy JSON snapshots to per-element keys for CRDT merge
          for (const el of (json.elements || [])) {
            yMap.set('__el_' + el.id, el)
          }
          yMap.set('__appState', json.appState || {})
          yMap.set('__files', json.files || {})
          console.log(`[Yjs] Loaded JSON snapshot for room ${roomName}`)
        } catch (parseErr) {
          console.error('[Yjs] Failed to parse JSON snapshot:', parseErr.message)
        }
      } else {
        // Legacy Yjs binary format
        try {
          Y.applyUpdate(doc, bytes)
          console.log(`[Yjs] Loaded binary snapshot for room ${roomName}`)
        } catch (applyErr) {
          console.error('[Yjs] Failed to apply binary snapshot:', applyErr.message)
        }
      }
    }

    doc.on('update', (update, origin) => {
      dirtyRooms.add(roomName)
    })

    initializedRooms.add(roomName)
  } finally {
    resolveLock()
    roomInitLocks.delete(roomName)
  }

  return doc
}

async function saveRoom(roomName, doc, force = false) {
  // closingRooms check: only block periodic auto-saves, not explicit force saves
  if (!force && closingRooms.has(roomName)) return
  if (!force && !dirtyRooms.has(roomName)) return

  const canvasId = await loadCanvasId(roomName)
  if (!canvasId) {
    console.error(`[Yjs] Cannot save unknown room ${roomName}`)
    return
  }

  const update = Y.encodeStateAsUpdate(doc)
  if (update.length > 2) {
    await saveSnapshot(canvasId, update)
  }
  dirtyRooms.delete(roomName)
}

setInterval(async () => {
  for (const [roomName, doc] of docs) {
    try {
      await saveRoom(roomName, doc)
    } catch (err) {
      console.error('[Yjs] Auto-save error:', err.message)
    }
  }
}, SAVE_INTERVAL)

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const wss = new WebSocket.Server({ server })

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token')
  const roomName = parseRoomName(req.url)

  if (!token || !roomName) {
    ws.close(1008, 'Missing token or room')
    return
  }

  try {
    const authUser = await authenticateToken(token)

    const meta = await loadRoomMeta(roomName, authUser.userId)
    if (!meta || !hasPermission(meta.permission, 'viewer')) {
      ws.close(1008, 'No access permission')
      return
    }

    roomMetaCache.set(roomName, meta)
    ws.userId = authUser.userId
    ws.roomName = roomName
    ws.canvasId = meta.canvasId

    if (!userConnections.has(authUser.userId)) {
      userConnections.set(authUser.userId, new Set())
    }
    userConnections.get(authUser.userId).add(ws)
    roomConnections.set(roomName, (roomConnections.get(roomName) || 0) + 1)

    // Load the Yjs doc snapshot BEFORE registering the WS message handler.
    // If setupWSConnection runs first, it sends SyncStep1 with an empty doc
    // state while getOrCreateDoc is still loading. The client syncs to the
    // empty state, causing permanent data loss.
    await getOrCreateDoc(roomName, meta.canvasId)
    setupWSConnection(ws, req, { docName: roomName })

    ws.on('close', async () => {
      const connections = userConnections.get(authUser.userId)
      if (connections) {
        connections.delete(ws)
        if (connections.size === 0) {
          userConnections.delete(authUser.userId)
        }
      }

      const count = (roomConnections.get(roomName) || 1) - 1
      if (count <= 0) {
        roomConnections.delete(roomName)
        roomMetaCache.delete(roomName)

        const doc = docs.get(roomName)
        if (doc && !closingRooms.has(roomName)) {
          // CRITICAL FIX: Save immediately when last client disconnects (page refresh/close)
          // Don't wait for the 5-second delay which may lose data
          closingRooms.add(roomName)
          ;(async () => {
            try {
              await saveRoom(roomName, doc, true)
              console.log(`[Yjs] Immediate save completed for ${roomName}`)
            } catch (err) {
              console.error(`[Yjs] Immediate save error for ${roomName}:`, err.message)
            }
            // Delay cleanup only for reconnection window, not for save
            setTimeout(() => {
              if (roomConnections.has(roomName)) {
                closingRooms.delete(roomName)
                console.log(`[Yjs] Room ${roomName} cleanup cancelled (client reconnected)`)
                return
              }
              docs.delete(roomName)
              initializedRooms.delete(roomName)
              closingRooms.delete(roomName)
              doc.destroy()
              console.log(`[Yjs] Room ${roomName} cleaned up`)
            }, 5000)
          })()
        }
      } else {
        roomConnections.set(roomName, count)
      }

      console.log(`[Yjs] User ${authUser.userId} disconnected from room ${roomName} (clients: ${Math.max(count, 0)})`)
    })
  } catch (err) {
    console.error('[Yjs] Auth error:', err.stack || err.message)
    ws.close(1008, 'Unauthorized')
  }
})

if (redisSub) {
  redisSub.psubscribe('canvas:*', 'user:*').catch((err) => {
    console.error('[Redis] psubscribe failed:', err.message)
  })

  redisSub.on('pmessage', (pattern, channel, message) => {
    if (channel.startsWith('canvas:')) {
      const canvasId = channel.replace('canvas:', '')
      wss.clients.forEach((client) => {
        if (client.canvasId === canvasId && client.readyState === WebSocket.OPEN) {
          client.send(message)
        }
      })
    } else if (channel.startsWith('user:')) {
      const userId = channel.replace('user:', '')
      const connections = userConnections.get(userId)
      if (connections) {
        connections.forEach((socket) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(message)
          }
        })
      }
    }
  })

  redisSub.on('error', (err) => {
    console.error('[Redis] Subscriber error:', err.message)
  })
}

async function shutdown() {
  console.log('[Yjs] Shutting down, saving snapshots...')
  for (const [roomName, doc] of docs) {
    try {
      await saveRoom(roomName, doc, true)
    } catch (err) {
      console.error('[Yjs] Final save error:', err.message)
    }
  }
  if (redisSub) await redisSub.quit()
  if (db) await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Validate configuration before starting
async function validateSetup() {
  const usePostgres = process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('sqlite:')

  if (usePostgres) {
    console.log('[Yjs] Using PostgreSQL — skipping file check')
  } else {
    const dbPath = databasePath()
    console.log(`[Yjs] Validating database: ${dbPath}`)
    if (!fs.existsSync(dbPath)) {
      console.error(`[Yjs] FATAL: Database file not found: ${dbPath}`)
      console.error('[Yjs] Check DATABASE_URL configuration in root .env file')
      process.exit(1)
    }
  }

  // Check can query canvases table
  const db = await getDb()
  try {
    const result = await db.get('SELECT COUNT(*) as count FROM canvases WHERE is_deleted = FALSE')
    console.log(`[Yjs] Database OK: ${result.count} canvases found`)
  } catch (err) {
    console.error('[Yjs] FATAL: Cannot query canvases table:', err.message)
    process.exit(1)
  }

  // Check API is reachable
  try {
    const response = await fetch(`${API_URL}/health`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    console.log('[Yjs] API connection OK')
  } catch (err) {
    console.warn('[Yjs] Warning: Cannot connect to API:', err.message)
  }
}

// Start server after validation, with port fallback on EADDRINUSE
validateSetup().then(() => {
  const MAX_ATTEMPTS = 10
  function tryListen(port, attempt) {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_ATTEMPTS) {
        const next = port + 1
        console.warn(`[Yjs] Port ${port} in use, trying ${next}...`)
        server.removeAllListeners('error')
        tryListen(next, attempt + 1)
      } else {
        console.error(`[Yjs] Cannot bind to port ${port}: ${err.code}`)
        process.exit(1)
      }
    })
    server.listen(port, () => {
      console.log(`[Yjs] WebSocket server running on port ${port}`)
    })
  }
  tryListen(PORT, 1)
}).catch(err => {
  console.error('[Yjs] Startup validation failed:', err)
  process.exit(1)
})
