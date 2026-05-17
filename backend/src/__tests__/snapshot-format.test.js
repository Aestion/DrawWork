process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, YjsSnapshot } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')
const Y = require('yjs')

const OWNER_EMAIL = generateUniqueEmail('fmt-owner')
const VIEWER_EMAIL = generateUniqueEmail('fmt-viewer')

let ownerToken, viewerToken, testBoard, testCanvas, viewer

describe('Snapshot Format Compatibility', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    await User.create({
      username: 'fmtowner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })
    viewer = await User.create({
      username: 'fmtviewer',
      email: VIEWER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = ownerLogin.body.token

    const viewerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: VIEWER_EMAIL, password: 'pass' })
    viewerToken = viewerLogin.body.token

    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Format Test Board' })
    testBoard = boardRes.body
    testCanvas = testBoard.canvases[0]
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ============================================================
  // HTTP Snapshot basic round-trip
  // ============================================================
  it('HTTP snapshot round-trips correctly', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Round Trip Board' })
    const canvas = boardRes.body.canvases[0]

    const originalJson = JSON.stringify({
      elements: [{ id: 'rect1', type: 'rectangle', x: 100, y: 200 }],
      appState: { theme: 'dark', viewBackgroundColor: '#ffffff' },
      files: {}
    })
    const base64 = Buffer.from(originalJson).toString('base64')

    // Save HTTP snapshot
    const saveRes = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: base64 })
    expect(saveRes.status).toBe(201)

    // Read back
    const readRes = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(readRes.status).toBe(200)
    expect(readRes.body.exists).toBe(true)
    expect(typeof readRes.body.data).toBe('string')

    // Verify round-trip: data is base64(JSON) that can be decoded and parsed
    const decoded = Buffer.from(readRes.body.data, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    expect(parsed.elements[0].id).toBe('rect1')
    expect(parsed.appState.theme).toBe('dark')
  })

  // ============================================================
  // Base64 validation on POST
  // ============================================================
  it('rejects snapshot with invalid base64 characters', async () => {
    const res = await request(app)
      .post(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: '!!!not-valid-base64!!!' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('快照数据格式无效')
  })

  it('rejects snapshot with missing data field', async () => {
    const res = await request(app)
      .post(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects snapshot with non-string data', async () => {
    const res = await request(app)
      .post(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: 12345 })
    expect(res.status).toBe(400)
  })

  // ============================================================
  // JSON format snapshot round-trip (Yjs server style)
  // ============================================================
  it('JSON-format snapshot (Yjs server style) is valid JSON and round-trips', async () => {
    // Simulate Yjs server's saveSnapshot after fix:
    // saves JSON.stringify(verifyJson) instead of Buffer.from(Y.encodeStateAsUpdate(doc))
    const snapshotData = {
      elements: [{ id: 'json-el', type: 'rectangle', x: 10, y: 20 }],
      appState: { theme: 'dark', viewBackgroundColor: '#222222' },
      files: {}
    }
    const jsonBytes = Buffer.from(JSON.stringify(snapshotData), 'utf8')

    await YjsSnapshot.create({
      canvas_id: testCanvas.id,
      content: jsonBytes,
      created_by: null
    })

    // Read via HTTP API — should be valid JSON
    const res = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.exists).toBe(true)

    // Must be parsable as JSON
    const decoded = Buffer.from(res.body.data, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    expect(parsed.elements[0].id).toBe('json-el')
    expect(parsed.appState.theme).toBe('dark')
    expect(parsed.appState.viewBackgroundColor).toBe('#222222')
  })

  // ============================================================
  // Yjs server-style save preserves HTTP snapshots (coexistence)
  // ============================================================
  it('Yjs server-style save preserves HTTP snapshots and uses compatible JSON format', async () => {
    // Create a new board for clean slate
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Coexist Board' })
    const canvas = boardRes.body.canvases[0]
    const { User } = require('../models')
    const owner = await User.findOne({ where: { email: OWNER_EMAIL } })

    // Step 1: Save HTTP snapshot (valid JSON, has created_by = user id)
    const httpData = JSON.stringify({
      elements: [{ id: 'http-el', type: 'text', text: 'from HTTP' }],
      appState: {}
    })
    const httpSaveRes = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from(httpData).toString('base64') })
    expect(httpSaveRes.status).toBe(201)

    // Step 2: Simulate Yjs server's fixed saveSnapshot behavior:
    // DELETE only WHERE created_by IS NULL, INSERT JSON format
    const yjsData = {
      elements: [{ id: 'yjs-el', type: 'ellipse' }],
      appState: {},
      files: {}
    }
    const yjsJsonBytes = Buffer.from(JSON.stringify(yjsData), 'utf8')

    // This is what the new saveSnapshot does:
    // DELETE FROM yjs_snapshots WHERE canvas_id = ? AND created_by IS NULL
    await YjsSnapshot.destroy({ where: { canvas_id: canvas.id, created_by: null } })
    await YjsSnapshot.create({
      canvas_id: canvas.id,
      content: yjsJsonBytes,
      created_by: null
    })

    // Step 3: HTTP snapshot should still exist (not deleted by Yjs)
    const httpSnapshot = await YjsSnapshot.findOne({
      where: { canvas_id: canvas.id, created_by: owner.id }
    })
    expect(httpSnapshot).not.toBeNull()

    // Step 4: Verify HTTP snapshot content is still valid JSON
    const httpContent = JSON.parse(httpSnapshot.content.toString('utf8'))
    expect(httpContent.elements[0].id).toBe('http-el')

    // Step 5: Latest snapshot API returns Yjs entry (most recent) — valid JSON
    const readRes = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(readRes.status).toBe(200)

    const decoded = Buffer.from(readRes.body.data, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    expect(parsed.elements[0].id).toBe('yjs-el')

    // Both rows still exist (HTTP version history not destroyed)
    const allSnapshots = await YjsSnapshot.findAll({ where: { canvas_id: canvas.id } })
    expect(allSnapshots).toHaveLength(2)
  })

  // ============================================================
  // Mixed writes produce compatible JSON format always
  // ============================================================
  it('mixed Yjs and HTTP snapshots are both JSON format and coexist', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Mixed Format Board' })
    const canvas = boardRes.body.canvases[0]
    const { User } = require('../models')
    const owner = await User.findOne({ where: { email: OWNER_EMAIL } })

    // Write HTTP snapshot (created_by = user)
    const httpData = JSON.stringify({ elements: [], appState: { theme: 'light' } })
    await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from(httpData).toString('base64') })

    // Verify HTTP snapshot readable
    const res1 = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
    const parsed1 = JSON.parse(Buffer.from(res1.body.data, 'base64').toString('utf8'))
    expect(parsed1.appState.theme).toBe('light')

    // Now write Yjs JSON-format snapshot (created_by = null)
    const yjsData = { elements: [{ id: 'el2', type: 'ellipse' }], appState: {}, files: {} }
    const yjsJsonBytes = Buffer.from(JSON.stringify(yjsData), 'utf8')

    // Simulate Yjs server: delete only NULL rows, insert JSON
    await YjsSnapshot.destroy({ where: { canvas_id: canvas.id, created_by: null } })
    await YjsSnapshot.create({
      canvas_id: canvas.id,
      content: yjsJsonBytes,
      created_by: null
    })

    // Latest snapshot returns Yjs entry — valid JSON
    const res2 = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(res2.body.exists).toBe(true)

    const decoded = Buffer.from(res2.body.data, 'base64').toString('utf8')
    const parsed2 = JSON.parse(decoded)
    expect(parsed2.elements[0].id).toBe('el2')

    // HTTP snapshot still exists in DB (version history preserved)
    const httpRows = await YjsSnapshot.findAll({
      where: { canvas_id: canvas.id, created_by: owner.id }
    })
    expect(httpRows.length).toBeGreaterThanOrEqual(1)
  })

  // ============================================================
  // GET snapshot by ID still works with HTTP format
  // ============================================================
  it('get snapshot by ID works with HTTP-format snapshots', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'By ID Format Board' })
    const canvas = boardRes.body.canvases[0]

    const jsonData = JSON.stringify({ elements: [{ id: 'byid' }], appState: {} })
    const base64 = Buffer.from(jsonData).toString('base64')

    const createRes = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: base64 })
    expect(createRes.status).toBe(201)

    // Read by ID
    const snapshotId = createRes.body.id
    const readRes = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots/${snapshotId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(readRes.status).toBe(200)

    // Verify it's valid JSON
    const decoded = Buffer.from(readRes.body.data, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    expect(parsed.elements[0].id).toBe('byid')
  })

  // ============================================================
  // Viewer permission for snapshot reading
  // ============================================================
  it('shared viewer can read snapshot but not write', async () => {
    const { BoardShare } = require('../models')
    await BoardShare.create({
      board_id: testBoard.id,
      user_id: viewer.id,
      permission: 'viewer'
    })

    // Viewer can read
    const readRes = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)
    expect(readRes.status).toBe(200)

    // Viewer cannot write
    const writeRes = await request(app)
      .post(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ data: Buffer.from('test').toString('base64') })
    expect(writeRes.status).toBe(403)
  })
})
