process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, BoardShare, YjsSnapshot } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const OWNER_EMAIL = generateUniqueEmail('snap-owner')
const VIEWER_EMAIL = generateUniqueEmail('snap-viewer')

let ownerToken, viewerToken, testBoard, testCanvas, viewer

describe('Snapshots API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    await User.create({
      username: 'snapowner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })
    viewer = await User.create({
      username: 'snapviewer',
      email: VIEWER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const ownerLogin = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = ownerLogin.body.token

    const viewerLogin = await request(app).post('/api/auth/login').send({ email: VIEWER_EMAIL, password: 'pass' })
    viewerToken = viewerLogin.body.token

    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Snapshot Board' })
    testBoard = boardRes.body
    testCanvas = testBoard.canvases[0]

    await YjsSnapshot.create({
      canvas_id: testCanvas.id,
      content: Buffer.from('snapshot')
    })
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('should allow the owner to read a snapshot', async () => {
    const res = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.exists).toBe(true)
  })

  it('should reject users without board permission', async () => {
    const res = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)

    expect(res.status).toBe(403)
  })

  it('should allow shared viewers to read but not write snapshots', async () => {
    await BoardShare.create({
      board_id: testBoard.id,
      user_id: viewer.id,
      permission: 'viewer'
    })

    const readRes = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)

    expect(readRes.status).toBe(200)

    const writeRes = await request(app)
      .post(`/api/canvases/${testCanvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ data: Buffer.from('new snapshot').toString('base64') })

    expect(writeRes.status).toBe(403)
  })

  // ============================================================
  // Snapshot list endpoint tests
  // ============================================================
  it('list snapshots returns empty array for canvas with no snapshots', async () => {
    // Create a new board (no snapshots yet)
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Empty Snap Board' })
    const emptyCanvas = boardRes.body.canvases[0]

    const res = await request(app)
      .get(`/api/canvases/${emptyCanvas.id}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('list snapshots returns all snapshots ordered by created_at DESC', async () => {
    // Create a new board for clean slate
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'List Snap Board' })
    const canvas = boardRes.body.canvases[0]

    // Create 2 snapshots
    const snap1 = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from('snap-1').toString('base64') })
    expect(snap1.status).toBe(201)

    const snap2 = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from('snap-2').toString('base64') })
    expect(snap2.status).toBe(201)

    const res = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })

  it('list returns metadata only — no data or content field', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Meta Only Board' })
    const canvas = boardRes.body.canvases[0]

    await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from('meta-test').toString('base64') })

    const res = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('created_at')
    expect(res.body[0]).not.toHaveProperty('data')
    expect(res.body[0]).not.toHaveProperty('content')
  })

  // ============================================================
  // Get snapshot by ID endpoint tests
  // ============================================================
  it('get snapshot by ID returns full data', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Get By ID Board' })
    const canvas = boardRes.body.canvases[0]
    const originalContent = 'unique-content-123'

    const createRes = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from(originalContent).toString('base64') })
    expect(createRes.status).toBe(201)

    const snapshotId = createRes.body.id
    const res = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots/${snapshotId}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(snapshotId)
    expect(res.body.data).toBe(Buffer.from(originalContent).toString('base64'))
    expect(res.body).toHaveProperty('created_at')
  })

  it('get non-existent snapshot returns 404', async () => {
    const res = await request(app)
      .get(`/api/canvases/${testCanvas.id}/snapshots/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('快照不存在')
  })

  it('shared viewer can list snapshots but cannot create', async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Viewer Perm Board' })
    const canvas = boardRes.body.canvases[0]

    // Owner creates a snapshot
    await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: Buffer.from('viewer-test').toString('base64') })

    // Share with viewer
    await BoardShare.create({
      board_id: boardRes.body.id,
      user_id: viewer.id,
      permission: 'viewer'
    })

    // Viewer can list
    const listRes = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots`)
      .set('Authorization', `Bearer ${viewerToken}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.length).toBeGreaterThanOrEqual(1)

    // Viewer can get by ID
    const snapshotId = listRes.body[0].id
    const getRes = await request(app)
      .get(`/api/canvases/${canvas.id}/snapshots/${snapshotId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.data).toBeTruthy()

    // Viewer cannot create
    const createRes = await request(app)
      .post(`/api/canvases/${canvas.id}/snapshot`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ data: Buffer.from('should-fail').toString('base64') })
    expect(createRes.status).toBe(403)
  })
})
