process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, Canvas } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('board')

let authToken
let testUser
let testBoard

describe('Boards API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    testUser = await User.create({
      username: 'testuser',
      email: USER_EMAIL,
      password_hash: await hashPassword('test123')
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER_EMAIL, password: 'test123' })

    authToken = res.body.token
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('POST /api/boards', () => {
    it('should create a board with a default canvas', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Board', description: 'A test board' })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
      expect(res.body.name).toBe('Test Board')
      expect(res.body.description).toBe('A test board')
      expect(res.body).toHaveProperty('canvases')
      expect(res.body.canvases.length).toBe(1)
      expect(res.body.canvases[0].name).toBe('画布 1')
      expect(res.body.canvases[0].type).toBe('excalidraw')

      testBoard = res.body
    })

    it('should reject without name', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/名称/)
    })
  })

  describe('GET /api/boards', () => {
    it('should return user boards with canvas count', async () => {
      const res = await request(app)
        .get('/api/boards')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
      expect(res.body[0]).toHaveProperty('canvas_count')
      expect(res.body[0]).toHaveProperty('permission')
    })
  })

  describe('PUT /api/boards/:id', () => {
    it('should update board info', async () => {
      const res = await request(app)
        .put(`/api/boards/${testBoard.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Board', description: 'Updated desc' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Updated Board')
      expect(res.body.description).toBe('Updated desc')
    })
  })

  describe('DELETE /api/boards/:id', () => {
    it('should soft delete a board', async () => {
      const res = await request(app)
        .delete(`/api/boards/${testBoard.id}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/已删除/)

      const board = await Board.findByPk(testBoard.id)
      expect(board.is_deleted).toBe(true)
    })
  })

  describe('POST /api/boards/:id/canvases', () => {
    beforeAll(async () => {
      // 重新创建一个画板用于画布测试
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Canvas Test Board' })
      testBoard = res.body
    })

    it('should create a new canvas', async () => {
      const res = await request(app)
        .post(`/api/boards/${testBoard.id}/canvases`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Mind Map', type: 'mindmap' })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Mind Map')
      expect(res.body.type).toBe('mindmap')
    })

    it('should reject invalid canvas type', async () => {
      const res = await request(app)
        .post(`/api/boards/${testBoard.id}/canvases`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Bad', type: 'invalid' })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/canvases/:canvasId', () => {
    it('should delete a canvas', async () => {
      // Create a canvas first
      const createRes = await request(app)
        .post(`/api/boards/${testBoard.id}/canvases`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'To Delete', type: 'excalidraw' })
      expect(createRes.status).toBe(201)
      const canvasId = createRes.body.id

      // Delete it
      const delRes = await request(app)
        .delete(`/api/canvases/${canvasId}`)
        .set('Authorization', `Bearer ${authToken}`)
      expect(delRes.status).toBe(200)

      // Verify it's gone from board's canvas list
      const listRes = await request(app)
        .get(`/api/boards/${testBoard.id}/canvases`)
        .set('Authorization', `Bearer ${authToken}`)
      expect(listRes.body.find(c => c.id === canvasId)).toBeUndefined()
    })
  })
})
