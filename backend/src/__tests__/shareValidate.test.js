process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, ShareToken, BoardShare } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const OWNER_EMAIL = generateUniqueEmail('sv-owner')
const VIEWER_EMAIL = generateUniqueEmail('sv-viewer')

let ownerToken, viewerToken, viewer, testBoard

describe('Share Token Validation', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    const owner = await User.create({
      username: 'owner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    viewer = await User.create({
      username: 'viewer',
      email: VIEWER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const login = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = login.body.token

    const viewerLogin = await request(app).post('/api/auth/login').send({ email: VIEWER_EMAIL, password: 'pass' })
    viewerToken = viewerLogin.body.token

    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Token Test Board' })
    testBoard = boardRes.body
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('should validate a valid share token', async () => {
    const tokenRes = await request(app)
      .post(`/api/boards/${testBoard.id}/tokens`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'viewer' })

    const token = tokenRes.body.token

    const res = await request(app)
      .get('/api/shares/validate')
      .query({ token })

    expect(res.status).toBe(200)
    expect(res.body.board_id).toBe(testBoard.id)
    expect(res.body.permission).toBe('viewer')
  })

  it('should reject an invalid token', async () => {
    const res = await request(app)
      .get('/api/shares/validate')
      .query({ token: 'invalid-token-123' })

    expect(res.status).toBe(404)
  })

  it('should reject a revoked token', async () => {
    const tokenRes = await request(app)
      .post(`/api/boards/${testBoard.id}/tokens`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'editor' })

    const shareToken = tokenRes.body

    await request(app)
      .delete(`/api/boards/${testBoard.id}/tokens/${shareToken.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    const res = await request(app)
      .get('/api/shares/validate')
      .query({ token: shareToken.token })

    expect(res.status).toBe(400)
  })

  it('does not consume max_uses for anonymous link preview', async () => {
    const tokenRes = await request(app)
      .post(`/api/boards/${testBoard.id}/tokens`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'viewer', max_uses: 1 })

    const res = await request(app)
      .get('/api/shares/validate')
      .query({ token: tokenRes.body.token, consume: 'true' })

    expect(res.status).toBe(200)

    const tokenRecord = await ShareToken.findByPk(tokenRes.body.id)
    expect(tokenRecord.used_count).toBe(0)
  })

  it('counts exactly one use when a logged-in user first gains access from a token', async () => {
    await BoardShare.destroy({ where: { board_id: testBoard.id, user_id: viewer.id } })

    const tokenRes = await request(app)
      .post(`/api/boards/${testBoard.id}/tokens`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'viewer', max_uses: 1 })

    const firstUse = await request(app)
      .get('/api/shares/validate')
      .set('Authorization', `Bearer ${viewerToken}`)
      .query({ token: tokenRes.body.token, consume: 'false' })

    expect(firstUse.status).toBe(200)

    const share = await BoardShare.findOne({ where: { board_id: testBoard.id, user_id: viewer.id } })
    expect(share).toBeTruthy()
    expect(share.permission).toBe('viewer')
    expect(share.source).toBe('token')

    const tokenRecord = await ShareToken.findByPk(tokenRes.body.id)
    expect(tokenRecord.used_count).toBe(1)
  })
})
