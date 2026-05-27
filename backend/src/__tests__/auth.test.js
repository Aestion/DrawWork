process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('auth')

describe('Auth API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    await User.create({
      username: 'authuser',
      email: USER_EMAIL,
      password_hash: await hashPassword('pass')
    })
  })

  it('POST /auth/logout should return 200 for authenticated users', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: USER_EMAIL, password: 'pass' })
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/退出/)
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('should refresh an access token with a refresh token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: USER_EMAIL, password: 'pass' })

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('refreshToken')
  })

  it('should reject refresh tokens on normal API routes', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: USER_EMAIL, password: 'pass' })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.refreshToken}`)

    expect(res.status).toBe(401)
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser', email: 'new@example.com', password: 'password123' })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('token')
      expect(res.body).toHaveProperty('refreshToken')
      expect(res.body.user.email).toBe('new@example.com')
    })

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'another', email: 'new@example.com', password: 'password123' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBeDefined()
    })
  })

  describe('POST /api/auth/login (negative)', () => {
    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: USER_EMAIL, password: 'wrongpass' })

      expect(res.status).toBe(401)
    })

    it('should reject nonexistent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'anything' })

      expect(res.status).toBe(401)
    })
  })

  describe('GET/PUT /api/auth/preferences', () => {
    it('should persist dashboard preferences per user', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: USER_EMAIL, password: 'pass' })

      const defaults = await request(app)
        .get('/api/auth/preferences')
        .set('Authorization', `Bearer ${login.body.token}`)

      expect(defaults.status).toBe(200)
      expect(defaults.body).toEqual({})

      const preferences = {
        dashboard: {
          viewMode: 'list',
          sortMode: 'name',
          groupNames: {
            owned: '项目画板',
            shared: '协作项目',
            public: '内网共享'
          }
        }
      }

      const saved = await request(app)
        .put('/api/auth/preferences')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ preferences })

      expect(saved.status).toBe(200)
      expect(saved.body).toEqual(preferences)

      const loaded = await request(app)
        .get('/api/auth/preferences')
        .set('Authorization', `Bearer ${login.body.token}`)

      expect(loaded.status).toBe(200)
      expect(loaded.body).toEqual(preferences)
    })

    it('should not share preferences between users', async () => {
      const secondEmail = generateUniqueEmail('prefs')
      const secondRegister = await request(app)
        .post('/api/auth/register')
        .send({ username: 'prefsuser', email: secondEmail, password: 'password123' })

      const res = await request(app)
        .get('/api/auth/preferences')
        .set('Authorization', `Bearer ${secondRegister.body.token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })
  })
})
