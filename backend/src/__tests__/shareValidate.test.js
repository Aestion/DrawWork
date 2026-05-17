process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, ShareToken } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const OWNER_EMAIL = generateUniqueEmail('sv-owner')

let ownerToken, testBoard

describe('Share Token Validation', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    const owner = await User.create({
      username: 'owner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const login = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = login.body.token

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
})
