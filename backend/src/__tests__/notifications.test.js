process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Notification, Board, Canvas, BoardShare, ShareToken } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const NOTIF_EMAIL = generateUniqueEmail('notif')
const OWNER_EMAIL = generateUniqueEmail('notif-owner')
const OTHER_EMAIL = generateUniqueEmail('notif-other')

let authToken, testUser
let ownerToken, ownerUser, board, canvas, otherUser

describe('Notifications API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    testUser = await User.create({
      username: 'notifuser',
      email: NOTIF_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: NOTIF_EMAIL, password: 'pass' })
    authToken = login.body.token

    // Set up board owner and other users for trigger-point tests
    ownerUser = await User.create({
      username: 'boardowner',
      email: OWNER_EMAIL,
      password_hash: await hashPassword('pass')
    })
    otherUser = await User.create({
      username: 'otheruser',
      email: OTHER_EMAIL,
      password_hash: await hashPassword('pass')
    })

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: 'pass' })
    ownerToken = ownerLogin.body.token

    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Notif Test Board' })
    board = boardRes.body
    canvas = board.canvases?.[0]
  })

  afterAll(async () => {
    await sequelize.close()
  })

  beforeEach(async () => {
    await Notification.destroy({ where: {}, force: true })
  })

  async function seedNotifications(count = 3) {
    const list = []
    for (let i = 0; i < count; i++) {
      list.push({
        user_id: testUser.id,
        type: 'comment_reply',
        title: `通知 ${i + 1}`,
        content: `内容 ${i + 1}`,
        is_read: i === 0
      })
    }
    await Notification.bulkCreate(list)
  }

  describe('GET /api/notifications', () => {
    it('should return notifications list', async () => {
      await seedNotifications()
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBe(3)
    })
  })

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread count', async () => {
      await seedNotifications()
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.count).toBe(2)
    })
  })

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      await seedNotifications()
      const notif = await Notification.findOne({ where: { user_id: testUser.id, is_read: false } })

      const res = await request(app)
        .put(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.is_read).toBe(true)
    })
  })

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      await seedNotifications()
      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)

      const unread = await Notification.count({ where: { user_id: testUser.id, is_read: false } })
      expect(unread).toBe(0)
    })
  })

  // ============================================================
  // Trigger-point integration tests
  // ============================================================

  describe('board share creates notification', () => {
    it('should create a notification when a board is shared', async () => {
      const res = await request(app)
        .post(`/api/boards/${board.id}/shares`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ user_id: otherUser.id, permission: 'viewer' })

      expect(res.status).toBe(201)

      const notifs = await Notification.findAll({ where: { user_id: otherUser.id } })
      expect(notifs.length).toBe(1)
      expect(notifs[0].type).toBe('board_share')
      expect(notifs[0].entity_type).toBe('board')
      expect(notifs[0].title).toContain('分享了画板')
    })
  })

  describe('comment reply creates notification', () => {
    beforeEach(async () => {
      await BoardShare.destroy({ where: {}, force: true })
    })

    it('should create a notification when someone replies to a comment', async () => {
      // Owner creates a comment on the canvas
      const commentRes = await request(app)
        .post(`/api/canvases/${canvas.id}/comments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Test comment', x: 100, y: 200 })
      expect(commentRes.status).toBe(201)

      // Share the board with otherUser so they can reply
      await BoardShare.create({
        board_id: board.id,
        user_id: otherUser.id,
        permission: 'commenter'
      })

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: OTHER_EMAIL, password: 'pass' })
      const otherToken = otherLogin.body.token

      // otherUser replies to the comment
      const replyRes = await request(app)
        .post(`/api/comments/${commentRes.body.id}/replies`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ content: 'Reply from other' })
      expect(replyRes.status).toBe(201)

      // Owner should get a notification
      const notifs = await Notification.findAll({ where: { user_id: ownerUser.id } })
      const replyNotif = notifs.find(n => n.type === 'comment_reply')
      expect(replyNotif).toBeTruthy()
      expect(replyNotif.title).toContain('回复了你的评论')
    })
  })
})
