process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { User, sequelize } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const ADMIN_EMAIL = generateUniqueEmail('admin')
const NORMAL_EMAIL = generateUniqueEmail('normal')
const ALPHA_EMAIL = generateUniqueEmail('alpha')
const TARGET_EMAIL = generateUniqueEmail('target')

describe('Admin Routes', () => {
  let adminToken, userToken, targetUser

  beforeAll(async () => {
    await sequelize.sync({ force: true })

    // 创建管理员用户
    await User.create({
      id: 'admin-id',
      username: 'admin',
      email: ADMIN_EMAIL,
      password_hash: await hashPassword('admin123'),
      is_admin: true
    })

    // 创建普通用户
    await User.create({
      id: 'normal-id',
      username: 'normal',
      email: NORMAL_EMAIL,
      password_hash: await hashPassword('normal123'),
      is_admin: false
    })

    // 创建其他用户（用于搜索测试）
    await User.create({
      id: 'alpha-id',
      username: 'alpha',
      email: ALPHA_EMAIL,
      password_hash: await hashPassword('alpha123'),
      is_admin: false
    })

    // 登录获取 token
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'admin123' })
    adminToken = adminLogin.body.token

    const userLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: NORMAL_EMAIL, password: 'normal123' })
    userToken = userLogin.body.token

    targetUser = await User.create({
      id: 'target-id',
      username: 'targetuser',
      email: TARGET_EMAIL,
      password_hash: await hashPassword('target123'),
      is_admin: false
    })
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ============ GET /api/admin/users ============

  describe('GET /api/admin/users', () => {
    it('should reject non-admin users with 403', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })

    it('should return paginated user list', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.users)).toBe(true)
      expect(typeof res.body.total).toBe('number')
      expect(res.body.page).toBe(1)
      expect(res.body.limit).toBe(20)
    })

    it('should exclude password_hash from results', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      if (res.body.users.length > 0) {
        expect(res.body.users[0]).not.toHaveProperty('password_hash')
      }
    })

    it('should support search by username', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=alpha')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.users.length).toBeGreaterThanOrEqual(1)
      expect(res.body.users.every(u => u.username.includes('alpha') || u.email.includes('alpha'))).toBe(true)
    })

    it('should support search by email', async () => {
      const res = await request(app)
        .get(`/api/admin/users?search=${TARGET_EMAIL}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.users.length).toBeGreaterThanOrEqual(1)
      expect(res.body.users[0].email).toBe(TARGET_EMAIL)
    })

    it('should support pagination with page and limit', async () => {
      const res = await request(app)
        .get('/api/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.users.length).toBeLessThanOrEqual(2)
      expect(res.body.page).toBe(1)
      expect(res.body.limit).toBe(2)
    })

    it('should clamp limit between 1 and 100', async () => {
      const res = await request(app)
        .get('/api/admin/users?limit=999')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.limit).toBe(50)
    })
  })

  // ============ PUT /api/admin/users/:id ============

  describe('PUT /api/admin/users/:id', () => {
    it('should reject non-admin users with 403', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })

    it('should toggle user is_active to false', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.user.is_active).toBe(false)
      expect(res.body.message).toMatch(/禁用/)
    })

    it('should toggle user is_active back to true', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.user.is_active).toBe(true)
      expect(res.body.message).toMatch(/启用/)
    })

    it('should return 400 when admin tries to disable themselves', async () => {
      const res = await request(app)
        .put('/api/admin/users/admin-id')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
    })

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .put('/api/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
    })
  })

  // ============ POST /api/admin/backup ============

  describe('POST /api/admin/backup', () => {
    it('should reject non-admin users with 403', async () => {
      const res = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })

    it('should export all table data as JSON', async () => {
      const res = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('exported_at')
      expect(Array.isArray(res.body.users)).toBe(true)
      expect(Array.isArray(res.body.boards)).toBe(true)
      expect(Array.isArray(res.body.canvases)).toBe(true)
      expect(Array.isArray(res.body.comments)).toBe(true)
      expect(Array.isArray(res.body.votes)).toBe(true)
    })

    it('should exclude password_hash from exported users', async () => {
      const res = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      if (res.body.users.length > 0) {
        expect(res.body.users[0]).not.toHaveProperty('password_hash')
      }
    })

    it('should not include yjsSnapshots or auditLogs', async () => {
      const res = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('yjsSnapshots')
      expect(res.body).not.toHaveProperty('auditLogs')
    })
  })
})
