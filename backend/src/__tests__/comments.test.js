process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, Canvas, Comment, CommentReply } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('comment')

let authToken, testUser, testBoard, testCanvas

describe('Comments API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    testUser = await User.create({
      username: 'commenter',
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
      .send({ name: 'Comment Test' })
    testBoard = boardRes.body
    testCanvas = testBoard.canvases[0]
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('POST /api/canvases/:id/comments', () => {
    it('should add a comment with coordinates', async () => {
      const res = await request(app)
        .post(`/api/canvases/${testCanvas.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '需要调整这个流程', x: 100, y: 200 })

      expect(res.status).toBe(201)
      expect(res.body.content).toBe('需要调整这个流程')
      expect(res.body.x).toBe(100)
      expect(res.body.y).toBe(200)
      expect(res.body.is_resolved).toBe(false)
    })

    it('should reject missing content', async () => {
      const res = await request(app)
        .post(`/api/canvases/${testCanvas.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ x: 100, y: 200 })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/canvases/:id/comments', () => {
    it('should return comments with user info', async () => {
      const res = await request(app)
        .get(`/api/canvases/${testCanvas.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
      expect(res.body[0]).toHaveProperty('user')
    })
  })

  describe('POST /api/comments/:id/replies', () => {
    it('should reply to a comment', async () => {
      const commentRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '父评论', x: 0, y: 0 })
      const commentId = commentRes.body.id

      const res = await request(app)
        .post(`/api/comments/${commentId}/replies`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '收到，我来修改' })

      expect(res.status).toBe(201)
      expect(res.body.content).toBe('收到，我来修改')
    })
  })

  describe('PUT /api/comments/:id/resolve', () => {
    it('should mark comment as resolved', async () => {
      const commentRes = await request(app)
        .post(`/api/canvases/${testCanvas.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '待解决问题', x: 0, y: 0 })
      const commentId = commentRes.body.id

      const res = await request(app)
        .put(`/api/comments/${commentId}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ is_resolved: true })

      expect(res.status).toBe(200)
      expect(res.body.is_resolved).toBe(true)
    })
  })
})
