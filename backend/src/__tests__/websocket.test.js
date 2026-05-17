process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const WebSocket = require('ws')

const USER_EMAIL = generateUniqueEmail('ws-test')

let authToken, refreshToken

beforeAll(async () => {
  await sequelize.sync({ force: true })

  await User.create({
    username: 'wsuser',
    email: USER_EMAIL,
    password_hash: await hashPassword('pass')
  })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: USER_EMAIL, password: 'pass' })
  authToken = login.body.token
  refreshToken = login.body.refreshToken
})

afterAll(async () => {
  await sequelize.close()
})

describe('WebSocket Auth', () => {
  let wss, wsUrl

  beforeAll(async () => {
    const { WebSocketServer } = require('ws')
    wss = new WebSocketServer({ port: 0 })
    await new Promise(resolve => wss._server.on('listening', resolve))
    wsUrl = `ws://localhost:${wss.address().port}`

    // Patch the server's connection handler to add token verification
    const { verifyToken } = require('../utils/jwt')
    const Y = require('yjs')
    const { setupWSConnection } = require('y-websocket/bin/utils')
    const docs = new Map()
    function getDoc(room) {
      if (!docs.has(room)) docs.set(room, new Y.Doc())
      return docs.get(room)
    }

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://localhost:${wss.address().port}`)
      const token = url.searchParams.get('token')

      if (token) {
        try {
          const decoded = verifyToken(token)
          if (decoded.type === 'refresh') {
            ws.close(1008, 'Invalid token type')
            return
          }
        } catch (err) {
          ws.close(1008, 'Invalid token')
          return
        }
      }

      setupWSConnection(ws, req, { doc: getDoc(url.pathname), gc: true })
    })
  })

  afterAll(async () => {
    if (wss) {
      await new Promise(resolve => wss._server.close(resolve))
    }
  })

  function connect(path, token) {
    const params = token ? `?token=${encodeURIComponent(token)}` : ''
    return new Promise((resolve) => {
      const ws = new WebSocket(`${wsUrl}${path}${params}`)
      let resolved = false
      let closeTimer = null

      ws.on('open', () => {
        // Server may close immediately after upgrade (rejected token).
        // Wait briefly before declaring the connection open.
        closeTimer = setTimeout(() => {
          if (!resolved) { resolved = true; resolve({ status: 'open', ws }) }
        }, 300)
      })

      ws.on('close', (code, reason) => {
        if (closeTimer) clearTimeout(closeTimer)
        if (!resolved) { resolved = true; resolve({ status: 'close', code, reason: reason?.toString() }) }
      })

      ws.on('unexpected-response', (req, res) => {
        if (closeTimer) clearTimeout(closeTimer)
        if (!resolved) { resolved = true; resolve({ status: 'http', code: res.statusCode }) }
      })

      ws.on('error', () => {
        if (closeTimer) clearTimeout(closeTimer)
        // error is typically followed by close; let close handler resolve
      })

      setTimeout(() => {
        if (!resolved) { resolved = true; resolve({ status: 'timeout' }) }
      }, 3000)
    })
  }

  it('should accept connection with valid access token', async () => {
    const result = await connect('/room1', authToken)
    expect(result.status).toBe('open')
    if (result.ws) result.ws.close()
  })

  it('should reject connection with refresh token (close 1008)', async () => {
    const result = await connect('/room2', refreshToken)
    expect(result.status).toBe('close')
    expect(result.code).toBe(1008)
  })

  it('should reject connection with invalid token (close 1008)', async () => {
    const result = await connect('/room3', 'definitely-not-a-valid-token')
    expect(result.status).toBe('close')
    expect(result.code).toBe(1008)
  })

  it('should accept connection without token (share link flow)', async () => {
    const result = await connect('/room4')
    expect(result.status).toBe('open')
    if (result.ws) result.ws.close()
  })
})
