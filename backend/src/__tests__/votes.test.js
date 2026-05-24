process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, Canvas, Vote, VoteRecord } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('vote')

let authToken, testUser, testBoard, testCanvas

describe('Votes API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    testUser = await User.create({
      username: 'voter',
      email: USER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: USER_EMAIL, password: 'pass' })
    authToken = login.body.token

    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Vote Test' })
    testBoard = boardRes.body
    testCanvas = testBoard.canvases[0]
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('POST /api/canvases/:id/votes', () => {
    it('should create a vote', async () => {
      const res = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Which color?', votes_per_user: 2, is_anonymous: false })

      expect(res.status).toBe(201)
      expect(res.body.title).toBe('Which color?')
      expect(res.body.votes_per_user).toBe(2)
      expect(res.body.is_closed).toBe(false)
    })

    it('should cap votes_per_user at 100', async () => {
      const res = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Too many votes', votes_per_user: 999 })

      expect(res.status).toBe(201)
      expect(res.body.votes_per_user).toBe(100)
    })
  })

  describe('GET /api/canvases/:id/votes', () => {
    it('should return votes list with my_vote_count', async () => {
      const res = await request(app)
        .get(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
      // 每个投票都应包含 my_vote_count 字段
      res.body.forEach(v => {
        expect(v).toHaveProperty('my_vote_count')
        expect(typeof v.my_vote_count).toBe('number')
      })
    })
  })

  describe('POST /api/votes/:id/records', () => {
    it('should submit a vote record', async () => {
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Pick one' })
      const voteId = voteRes.body.id

      const res = await request(app)
        .post(`/api/votes/${voteId}/records`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ target_id: 'option-a' })

      expect(res.status).toBe(201)
      expect(res.body.target_id).toBe('option-a')
    })

    it('should reject missing target_id', async () => {
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Pick one again' })
      const voteId = voteRes.body.id

      const res = await request(app)
        .post(`/api/votes/${voteId}/records`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('should reject invalid target_id not in vote options', async () => {
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Options test',
          scope_data: { options: ['Apple', 'Banana', 'Cherry'] }
        })
      const voteId = voteRes.body.id

      const res = await request(app)
        .post(`/api/votes/${voteId}/records`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ target_id: 'Dragonfruit' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('无效的投票选项')
    })
  })

  describe('PUT /api/votes/:id/close', () => {
    it('should close a vote', async () => {
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Close me' })
      const voteId = voteRes.body.id

      const res = await request(app)
        .put(`/api/votes/${voteId}/close`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.is_closed).toBe(true)
    })
  })

  describe('GET /api/votes/:id/results', () => {
    it('should return vote results', async () => {
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Results test' })
      const voteId = voteRes.body.id

      await request(app)
        .post(`/api/votes/${voteId}/records`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ target_id: 'opt-a' })

      await request(app)
        .post(`/api/votes/${voteId}/records`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ target_id: 'opt-b' })

      const res = await request(app)
        .get(`/api/votes/${voteId}/results`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('VoteRecord model validation', () => {
    it('should reject creation without user_id or session_id', async () => {
      // 创建一个投票用于 VoteRecord
      const voteRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Model validation test' })

      // 直接通过模型创建，绕开 API 层的 user_id/session_id 设置
      const { VoteRecord } = require('../models')
      await expect(
        VoteRecord.create({ vote_id: voteRes.body.id, target_id: 'X' })
      ).rejects.toThrow()
    })
  })
})
