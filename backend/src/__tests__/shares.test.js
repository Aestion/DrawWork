process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, BoardShare, ShareToken } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const OWNER_EMAIL = generateUniqueEmail('share-owner')
const MEMBER_EMAIL = generateUniqueEmail('share-member')

let ownerToken, memberToken, adminToken
let testBoard, owner, member

describe('Shares API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    owner = await User.create({
      username: 'owner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    member = await User.create({
      username: 'member',
      email: MEMBER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const o = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = o.body.token

    const m = await request(app).post('/api/auth/login').send({ email: MEMBER_EMAIL, password: 'pass' })
    memberToken = m.body.token

    const b = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Shared Board' })
    testBoard = b.body
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('POST /api/boards/:id/shares', () => {
    it('should invite a user as editor', async () => {
      const res = await request(app)
        .post(`/api/boards/${testBoard.id}/shares`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ user_id: member.id, permission: 'editor' })

      expect(res.status).toBe(201)
      expect(res.body.permission).toBe('editor')
      expect(res.body.user_id).toBe(member.id)
    })

    it('should reject non-owner inviting', async () => {
      const res = await request(app)
        .post(`/api/boards/${testBoard.id}/shares`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ user_id: owner.id, permission: 'viewer' })

      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/boards/:id/tokens', () => {
    it('should generate a share token', async () => {
      const res = await request(app)
        .post(`/api/boards/${testBoard.id}/tokens`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ permission: 'viewer' })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('token')
      expect(res.body.permission).toBe('viewer')
    })
  })

  describe('DELETE /api/boards/:id/shares/:userId', () => {
    it('should remove a collaborator', async () => {
      const res = await request(app)
        .delete(`/api/boards/${testBoard.id}/shares/${member.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/已移除/)

      const share = await BoardShare.findOne({ where: { board_id: testBoard.id, user_id: member.id } })
      expect(share).toBeNull()
    })
  })
})
