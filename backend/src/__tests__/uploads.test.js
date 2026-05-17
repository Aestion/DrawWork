process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('upload')

jest.mock('../config/minio', () => ({
  minioClient: {
    putObject: jest.fn(() => Promise.resolve()),
    getObject: jest.fn(() => Promise.resolve(require('stream').Readable.from(['fake image data']))),
    presignedGetObject: jest.fn(() => Promise.resolve('http://localhost:9000/drawings/test-file.png'))
  },
  bucketName: 'drawings',
  ensureBucket: jest.fn(() => Promise.resolve())
}))

let authToken, testUser, testBoard

describe('Uploads API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    testUser = await User.create({
      username: 'uploader',
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
      .send({ name: 'Upload Board' })
    testBoard = boardRes.body
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('POST /api/upload', () => {
    it('should upload a file and return metadata', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('board_id', testBoard.id)
        .attach('file', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]), 'test.png')

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
      expect(res.body.url).toBe(`/api/upload/${res.body.id}`)
      expect(res.body.original_name).toBe('test.png')
      expect(res.body.mime_type).toBe('image/png')
    })

    it('should reject uploads without a board', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]), 'test.png')

      expect(res.status).toBe(400)
    })

    it('should reject missing file', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(400)
    })

    it('should reject unsupported MIME type (PDF)', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('board_id', testBoard.id)
        .attach('file', Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]), { filename: 'test.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/不支持的文件类型/)
    })

    it('should reject mismatched magic number (claims PNG, sends GIF)', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('board_id', testBoard.id)
        .attach('file', Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]), { filename: 'fake.png', contentType: 'image/png' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/文件格式/)
    })

    it('should accept JPEG file with correct magic bytes', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('board_id', testBoard.id)
        .attach('file', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), { filename: 'test.jpg', contentType: 'image/jpeg' })

      expect(res.status).toBe(201)
      expect(res.body.mime_type).toBe('image/jpeg')
    })

    it('should accept GIF file with correct magic bytes', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('board_id', testBoard.id)
        .attach('file', Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]), { filename: 'test.gif', contentType: 'image/gif' })

      expect(res.status).toBe(201)
      expect(res.body.mime_type).toBe('image/gif')
    })
  })
})
