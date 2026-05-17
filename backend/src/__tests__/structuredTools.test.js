process.env.NODE_ENV = 'test'

const request = require('supertest')
const app = require('../app')
const { sequelize, User, Board, Canvas, MindMap, KanbanBoard, Swimlane } = require('../models')
const { hashPassword, generateUniqueEmail } = require('./helpers')

const USER_EMAIL = generateUniqueEmail('struct')

let authToken, testBoard, testCanvas

describe('Structured Tools API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })

    const user = await User.create({
      username: 'struct',
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
      .send({ name: 'Struct Test' })
    testBoard = boardRes.body
    testCanvas = testBoard.canvases[0]
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('MindMap', () => {
    it('should save mindmap data', async () => {
      const res = await request(app)
        .put(`/api/canvases/${testCanvas.id}/mindmap`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          root_node: { id: '1', text: 'Root', children: [] },
          layout: 'right'
        })

      expect(res.status).toBe(200)
      expect(res.body.root_node.text).toBe('Root')
      expect(res.body.layout).toBe('right')
    })

    it('should reject stale updated_at with 409', async () => {
      const canvas = await Canvas.create({
        board_id: testBoard.id,
        name: 'Conflict Canvas',
        type: 'mindmap',
        yjs_room_id: `board_${testBoard.id}_canvas_conflict`
      })

      const first = await request(app)
        .put(`/api/canvases/${canvas.id}/mindmap`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ root_node: { id: '1', text: 'A', children: [] }, layout: 'right' })

      const record = await MindMap.findOne({ where: { canvas_id: canvas.id } })
      await sequelize.query(
        `UPDATE mind_maps SET updated_at = datetime('now', '+1 second') WHERE id = ?`,
        { replacements: [record.id] }
      )

      const second = await request(app)
        .put(`/api/canvases/${canvas.id}/mindmap`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          root_node: { id: '1', text: 'B', children: [] },
          layout: 'left',
          updatedAt: first.body.updatedAt
        })

      expect(second.status).toBe(409)
      expect(second.body.error).toMatch(/已过期/)
    })

    it('should get mindmap data', async () => {
      const mindmapCanvas = await Canvas.create({
        board_id: testBoard.id,
        name: 'MindMap Canvas',
        type: 'mindmap',
        yjs_room_id: `board_${testBoard.id}_canvas_mindmap`
      })

      await MindMap.create({
        canvas_id: mindmapCanvas.id,
        root_node: { id: '1', text: 'Root', children: [] },
        layout: 'left'
      })

      const res = await request(app)
        .get(`/api/canvases/${mindmapCanvas.id}/mindmap`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.root_node.text).toBe('Root')
    })
  })

  describe('Kanban', () => {
    it('should save kanban data', async () => {
      const res = await request(app)
        .put(`/api/canvases/${testCanvas.id}/kanban`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columns: [{ id: 'c1', title: 'TODO', order: 0 }],
          cards: [{ id: 'card1', columnId: 'c1', title: 'Task', order: 0 }]
        })

      expect(res.status).toBe(200)
      expect(res.body.columns[0].title).toBe('TODO')
    })

    it('should get kanban data', async () => {
      const kanbanCanvas = await Canvas.create({
        board_id: testBoard.id,
        name: 'Kanban Canvas',
        type: 'kanban',
        yjs_room_id: `board_${testBoard.id}_canvas_kanban`
      })

      await KanbanBoard.create({
        canvas_id: kanbanCanvas.id,
        columns: [{ id: 'c1', title: 'Done', order: 0 }],
        cards: []
      })

      const res = await request(app)
        .get(`/api/canvases/${kanbanCanvas.id}/kanban`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.columns[0].title).toBe('Done')
    })
  })

  describe('Swimlane', () => {
    it('should save swimlane data', async () => {
      const res = await request(app)
        .put(`/api/canvases/${testCanvas.id}/swimlane`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          direction: 'horizontal',
          lanes: [{ id: 'l1', title: 'User', order: 0 }],
          elements: [{ id: 'e1', laneId: 'l1', text: 'Click', x: 10, y: 10 }]
        })

      expect(res.status).toBe(200)
      expect(res.body.lanes[0].title).toBe('User')
    })

    it('should get swimlane data', async () => {
      const swimlaneCanvas = await Canvas.create({
        board_id: testBoard.id,
        name: 'Swimlane Canvas',
        type: 'swimlane',
        yjs_room_id: `board_${testBoard.id}_canvas_swimlane`
      })

      await Swimlane.create({
        canvas_id: swimlaneCanvas.id,
        direction: 'vertical',
        lanes: [{ id: 'l1', title: 'Dev', order: 0 }],
        elements: []
      })

      const res = await request(app)
        .get(`/api/canvases/${swimlaneCanvas.id}/swimlane`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.direction).toBe('vertical')
    })
  })
})
