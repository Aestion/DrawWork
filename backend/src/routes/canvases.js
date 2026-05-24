const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { checkCanvasPermission } = require('../middleware/permission')
const { Canvas, MindMap, KanbanBoard, Swimlane, TencentMind, Comment, CommentReply, User, Vote, VoteRecord } = require('../models')
const crypto = require('crypto')
const { getJwtSecret } = require('../utils/jwt')

function checkOptimisticLock(record, clientUpdatedAt) {
  if (!clientUpdatedAt) return
  const clientDate = new Date(clientUpdatedAt)
  if (isNaN(clientDate.getTime())) return
  if (clientDate.getTime() !== new Date(record.updated_at).getTime()) {
    const err = new Error('数据已过期，请刷新后重试')
    err.status = 409
    throw err
  }
}

// GET /api/canvases/:id — 获取画布详情
router.get('/:id', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    res.json(req.canvas)
  } catch (err) {
    next(err)
  }
})

// PUT /api/canvases/:id — 更新画布
router.put('/:id', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const canvas = req.canvas
    const { name, sort_order, type } = req.body
    if (name !== undefined) canvas.name = name.trim() || canvas.name
    if (sort_order !== undefined) canvas.sort_order = sort_order
    if (type !== undefined) {
      const validTypes = ['excalidraw', 'mindmap', 'jsmind', 'markmap', 'simplemindmap', 'kanban', 'swimlane', 'tencentmind']
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: '无效的画布类型' })
      }
      canvas.type = type
    }
    await canvas.save()
    res.json(canvas)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/canvases/:id — 删除画布（至少保留一个）
router.delete('/:id', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const canvas = req.canvas

    const count = await Canvas.count({
      where: { board_id: canvas.board_id, is_deleted: false }
    })
    if (count <= 1) {
      return res.status(400).json({ error: '画板至少保留一个画布' })
    }

    canvas.is_deleted = true
    await canvas.save()
    res.json({ message: '画布已删除' })
  } catch (err) {
    next(err)
  }
})

// === 画布评论子路由 ===

// GET /api/canvases/:id/comments — 获取画布评论列表
router.get('/:id/comments', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const comments = await Comment.findAll({
      where: { canvas_id: canvasId },
      include: [
        { model: User, attributes: ['id', 'username'] },
        { model: CommentReply, include: [{ model: User, attributes: ['id', 'username'] }] }
      ],
      order: [['created_at', 'ASC']]
    })

    const result = comments.map(c => ({
      id: c.id,
      content: c.content,
      x: c.x,
      y: c.y,
      is_resolved: c.is_resolved,
      created_at: c.created_at,
      user: c.User,
      reply_count: c.CommentReplies?.length || 0
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/canvases/:id/comments — 添加评论
router.post('/:id/comments', authMiddleware, checkCanvasPermission('commenter'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const { content, x, y } = req.body

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '评论内容不能为空' })
    }
    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: '缺少坐标信息' })
    }

    const comment = await Comment.create({
      canvas_id: canvasId,
      user_id: req.user.id,
      content: content.trim(),
      x,
      y
    })

    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username'] })

    res.status(201).json({
      id: comment.id,
      content: comment.content,
      x: comment.x,
      y: comment.y,
      is_resolved: comment.is_resolved,
      created_at: comment.created_at,
      user
    })
  } catch (err) {
    next(err)
  }
})

// === 画布投票子路由 ===

// GET /api/canvases/:id/votes — 获取画布投票列表（含当前用户投票数）
router.get('/:id/votes', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const votes = await Vote.findAll({
      where: { canvas_id: canvasId },
      order: [['created_at', 'DESC']]
    })

    // 为每个投票计算当前用户的已投票数
    const enriched = await Promise.all(votes.map(async (vote) => {
      let myVoteCount
      if (vote.is_anonymous) {
        const sessionId = crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${getJwtSecret()}`).digest('hex')
        myVoteCount = await VoteRecord.count({ where: { vote_id: vote.id, session_id: sessionId } })
      } else {
        myVoteCount = await VoteRecord.count({ where: { vote_id: vote.id, user_id: req.user.id } })
      }
      return { ...vote.toJSON(), my_vote_count: myVoteCount }
    }))

    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// POST /api/canvases/:id/votes — 创建投票
router.post('/:id/votes', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const { title, votes_per_user, is_anonymous, scope, scope_data, expires_at } = req.body

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: '投票主题不能为空' })
    }

    const maxVotes = Math.min(Math.max(votes_per_user ?? 1, 1), 100)

    const vote = await Vote.create({
      canvas_id: canvasId,
      created_by: req.user.id,
      title: title.trim(),
      votes_per_user: maxVotes,
      is_anonymous: is_anonymous ?? false,
      scope: scope || 'canvas',
      scope_data: scope_data || null,
      expires_at: expires_at || null
    })

    res.status(201).json(vote)
  } catch (err) {
    next(err)
  }
})

// === 结构化工具子路由 ===

// GET /api/canvases/:id/mindmap — 获取思维导图
router.get('/:id/mindmap', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const data = await MindMap.findOne({ where: { canvas_id: req.params.id } })
    if (!data) return res.json({ roots: null, crossConnections: [] })

    // Return in format compatible with frontend
    const result = {
      id: data.id,
      canvas_id: data.canvas_id,
      layout: data.layout,
      created_at: data.created_at,
      updated_at: data.updated_at
    }

    // Prefer new format (roots), fallback to legacy format (root_node)
    if (data.roots) {
      result.roots = data.roots
      result.crossConnections = data.cross_connections || []
    } else if (data.root_node) {
      result.root_node = data.root_node
      // Also provide roots array for convenience
      result.roots = [data.root_node]
      result.crossConnections = data.cross_connections || []
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/canvases/:id/mindmap — 保存思维导图
router.put('/:id/mindmap', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const { root_node, roots, crossConnections, layout, updated_at } = req.body
    const [record, created] = await MindMap.findOrCreate({
      where: { canvas_id: req.params.id },
      defaults: {
        canvas_id: req.params.id,
        root_node: root_node || null,
        roots: roots || null,
        cross_connections: crossConnections || [],
        layout: layout || 'right'
      }
    })
    if (!created) {
      checkOptimisticLock(record, updated_at || req.body.updatedAt)
      // Support both old format (root_node) and new format (roots)
      if (root_node !== undefined) record.root_node = root_node
      if (roots !== undefined) record.roots = roots
      if (crossConnections !== undefined) record.cross_connections = crossConnections
      if (layout !== undefined) record.layout = layout
      await record.save()
    }
    res.json(record)
  } catch (err) {
    next(err)
  }
})

// GET /api/canvases/:id/kanban — 获取看板
router.get('/:id/kanban', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const data = await KanbanBoard.findOne({ where: { canvas_id: req.params.id } })
    if (!data) return res.json({ columns: null, cards: null })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/canvases/:id/kanban — 保存看板
router.put('/:id/kanban', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const { columns, cards, updated_at } = req.body
    const [record, created] = await KanbanBoard.findOrCreate({
      where: { canvas_id: req.params.id },
      defaults: { canvas_id: req.params.id, columns: columns || [], cards: cards || [] }
    })
    if (!created) {
      checkOptimisticLock(record, updated_at || req.body.updatedAt)
      if (columns !== undefined) record.columns = columns
      if (cards !== undefined) record.cards = cards
      await record.save()
    }
    res.json(record)
  } catch (err) {
    next(err)
  }
})

// GET /api/canvases/:id/swimlane — 获取泳道图
router.get('/:id/swimlane', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const data = await Swimlane.findOne({ where: { canvas_id: req.params.id } })
    if (!data) return res.json({ direction: null, lanes: null, elements: null })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/canvases/:id/swimlane — 保存泳道图
router.put('/:id/swimlane', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const { direction, lanes, elements, updated_at } = req.body
    const [record, created] = await Swimlane.findOrCreate({
      where: { canvas_id: req.params.id },
      defaults: { canvas_id: req.params.id, direction: direction || 'horizontal', lanes: lanes || [], elements: elements || [] }
    })
    if (!created) {
      checkOptimisticLock(record, updated_at || req.body.updatedAt)
      if (direction !== undefined) record.direction = direction
      if (lanes !== undefined) record.lanes = lanes
      if (elements !== undefined) record.elements = elements
      await record.save()
    }
    res.json(record)
  } catch (err) {
    next(err)
  }
})

// GET /api/canvases/:id/tencentmind — 获取腾讯思维导图
router.get('/:id/tencentmind', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const data = await TencentMind.findOne({ where: { canvas_id: req.params.id } })
    if (!data) return res.json({ data: null })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/canvases/:id/tencentmind — 保存腾讯思维导图
router.put('/:id/tencentmind', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const { data, updated_at } = req.body
    const [record, created] = await TencentMind.findOrCreate({
      where: { canvas_id: req.params.id },
      defaults: { canvas_id: req.params.id, data: data || {} }
    })
    if (!created) {
      checkOptimisticLock(record, updated_at || req.body.updatedAt)
      if (data !== undefined) record.data = data
      await record.save()
    }
    res.json(record)
  } catch (err) {
    next(err)
  }
})

module.exports = router
