const router = require('express').Router()
const { Op } = require('sequelize')
const { authMiddleware } = require('../middleware/auth')
const { checkBoardPermission, requirePermission } = require('../middleware/permission')
const { Board, Canvas, BoardShare, ShareToken, BoardVisit, User, sequelize } = require('../models')
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationService')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')

function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// GET /api/boards — 获取用户画板列表
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id

    // 获取用户有权限访问的画板ID列表
    const shares = await BoardShare.findAll({
      where: { user_id: userId },
      attributes: ['board_id', 'permission']
    })
    const sharedBoardIds = shares.map(s => s.board_id)

    const boards = await Board.findAll({
      where: {
        is_deleted: false,
        [Op.or]: [
          { owner_id: userId },
          { is_public: true },
          { id: { [Op.in]: sharedBoardIds } }
        ]
      },
      include: [
        { model: Canvas, where: { is_deleted: false }, required: false },
        { model: BoardVisit, where: { user_id: userId }, required: false }
      ],
      order: [['updated_at', 'DESC']]
    })

    const result = boards.map(board => {
      const isOwner = board.owner_id.toString() === userId.toString()
      const share = shares.find(s => s.board_id.toString() === board.id.toString())
      let permission = 'viewer'
      if (isOwner) permission = 'owner'
      else if (share) permission = share.permission

      return {
        id: board.id,
        name: board.name,
        description: board.description,
        cover_url: board.cover_url,
        is_public: board.is_public,
        canvas_count: board.Canvases?.length || 0,
        permission,
        last_visited: board.BoardVisits?.[0]?.visited_at || null,
        created_at: board.created_at,
        updated_at: board.updated_at
      }
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/boards — 创建画板（自动创建默认画布）
router.post('/', authMiddleware, async (req, res, next) => {
  const t = await sequelize.transaction()
  try {
    const { name, description, is_public } = req.body

    if (!name || name.trim().length === 0) {
      await t.rollback()
      return res.status(400).json({ error: '画板名称为必填项' })
    }

    const board = await Board.create({
      owner_id: req.user.id,
      name: name.trim(),
      description: description || null,
      is_public: is_public || false
    }, { transaction: t })

    // 自动创建默认画布
    const canvas = await Canvas.create({
      board_id: board.id,
      name: '画布 1',
      type: 'excalidraw',
      sort_order: 0,
      yjs_room_id: `board_${board.id}_canvas_${uuidv4()}`
    }, { transaction: t })

    // 记录访问
    await BoardVisit.create({
      board_id: board.id,
      user_id: req.user.id,
      visited_at: new Date()
    }, { transaction: t })

    await t.commit()

    res.status(201).json({
      id: board.id,
      name: board.name,
      description: board.description,
      is_public: board.is_public,
      cover_url: board.cover_url,
      owner_id: board.owner_id,  // Include owner_id for permission check
      permission: 'owner',  // Creator is always owner
      created_at: board.created_at,
      updated_at: board.updated_at,
      canvases: [{
        id: canvas.id,
        name: canvas.name,
        type: canvas.type,
        sort_order: canvas.sort_order,
        yjs_room_id: canvas.yjs_room_id
      }]
    })
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

// GET /api/boards/:id — 获取画板详情（含协作者和分享链接）
router.get('/:id', authMiddleware, checkBoardPermission('viewer'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.user.id
    const isOwner = req.board.owner_id.toString() === userId.toString()

    const shares = await BoardShare.findAll({
      where: { board_id: boardId },
      include: [{ model: User, attributes: ['id', 'username'] }]
    })

    const tokens = await ShareToken.findAll({
      where: { board_id: boardId, is_revoked: false },
      order: [['created_at', 'DESC']]
    })

    res.json({
      id: req.board.id,
      name: req.board.name,
      description: req.board.description,
      is_public: req.board.is_public,
      cover_url: req.board.cover_url,
      permission: req.permission,
      owner_id: req.board.owner_id,
      is_owner: isOwner,
      shares: shares.map(s => ({
        user_id: s.user_id,
        username: s.User?.username,
        permission: s.permission
      })),
      tokens: tokens.filter(t => t.raw_token).map(t => ({
        id: t.id,
        token: t.raw_token,
        permission: t.permission,
        expires_at: t.expires_at,
        max_uses: t.max_uses,
        used_count: t.used_count,
        created_at: t.created_at
      })),
      created_at: req.board.created_at,
      updated_at: req.board.updated_at
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/boards/:id — 更新画板
router.put('/:id', authMiddleware, checkBoardPermission('editor'), requirePermission('editor'), async (req, res, next) => {
  try {
    const { name, description, is_public, cover_url } = req.body
    const board = req.board

    if (name !== undefined) {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return res.status(400).json({ error: '画板名称不能为空' })
      }
      board.name = trimmedName
    }
    if (description !== undefined) board.description = description
    if (is_public !== undefined) {
      if (req.permission !== 'owner') {
        return res.status(403).json({ error: '只有所有者可以修改公开状态' })
      }
      board.is_public = is_public
    }
    if (cover_url !== undefined) board.cover_url = cover_url

    await board.save()
    res.json({
      id: board.id,
      name: board.name,
      description: board.description,
      is_public: board.is_public,
      cover_url: board.cover_url,
      updated_at: board.updated_at
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/boards/:id — 软删除画板
router.delete('/:id', authMiddleware, checkBoardPermission('editor'), requirePermission('owner'), async (req, res, next) => {
  try {
    const board = req.board
    board.is_deleted = true
    board.deleted_at = new Date()
    await board.save()
    res.json({ message: '画板已删除' })
  } catch (err) {
    next(err)
  }
})

// GET /api/boards/:id/canvases — 获取画板下画布列表
router.get('/:id/canvases', authMiddleware, checkBoardPermission('viewer'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.user.id

    const canvases = await Canvas.findAll({
      where: { board_id: boardId, is_deleted: false },
      order: [['sort_order', 'ASC'], ['created_at', 'ASC']]
    })

    // 更新访问记录
    await BoardVisit.upsert({
      board_id: boardId,
      user_id: userId,
      visited_at: new Date()
    })

    res.json(canvases)
  } catch (err) {
    next(err)
  }
})

// POST /api/boards/:id/canvases — 创建画布
router.post('/:id/canvases', authMiddleware, checkBoardPermission('editor'), requirePermission('editor'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const { name, type = 'excalidraw' } = req.body

    const validTypes = ['excalidraw', 'mindmap', 'kanban', 'swimlane']
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: '无效的画布类型' })
    }

    // 计算下一个 sort_order
    const lastCanvas = await Canvas.findOne({
      where: { board_id: boardId, is_deleted: false },
      order: [['sort_order', 'DESC']]
    })
    const nextOrder = lastCanvas ? lastCanvas.sort_order + 1 : 0

    const canvas = await Canvas.create({
      board_id: boardId,
      name: name ? name.trim() : `画布 ${nextOrder + 1}`,
      type,
      sort_order: nextOrder,
      yjs_room_id: `board_${boardId}_canvas_${uuidv4()}`
    })

    res.status(201).json(canvas)
  } catch (err) {
    next(err)
  }
})

// POST /api/boards/:id/shares — 邀请用户
router.post('/:id/shares', authMiddleware, checkBoardPermission('editor'), requirePermission('owner'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const { user_id, permission = 'viewer' } = req.body

    if (!['editor', 'viewer', 'commenter'].includes(permission)) {
      return res.status(400).json({ error: '无效的权限类型' })
    }
    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' })
    }

    // Try by numeric ID first, then by username
    let invitedUser = await User.findByPk(user_id)
    if ((!invitedUser || !invitedUser.is_active) && isNaN(user_id)) {
      invitedUser = await User.findOne({ where: { username: user_id, is_active: true } })
    }
    if (!invitedUser || !invitedUser.is_active) {
      return res.status(404).json({ error: '被邀请用户不存在或已禁用' })
    }
    const actualUserId = invitedUser.id

    if (actualUserId.toString() === req.user.id.toString()) {
      return res.status(400).json({ error: '不能邀请画板所有者本人' })
    }

    const [share, created] = await BoardShare.findOrCreate({
      where: { board_id: boardId, user_id: actualUserId },
      defaults: {
        board_id: boardId,
        user_id: actualUserId,
        permission,
        invited_by: req.user.id
      }
    })

    if (!created) {
      share.permission = permission
      await share.save()
    }

    // Notify the invited user
    const inviter = await User.findByPk(req.user.id, { attributes: ['username'] })
    await createNotification({
      userId: actualUserId,
      type: NOTIFICATION_TYPES.BOARD_SHARE,
      title: `${inviter?.username || '某用户'} 分享了画板「${req.board.name}」给你`,
      content: `权限：${permission}`,
      entityType: 'board',
      entityId: boardId
    })

    res.status(created ? 201 : 200).json(share)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/boards/:id/shares/:userId — 移除协作者
router.delete('/:id/shares/:userId', authMiddleware, checkBoardPermission('editor'), requirePermission('owner'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.params.userId

    await BoardShare.destroy({ where: { board_id: boardId, user_id: userId } })
    res.json({ message: '协作者已移除' })
  } catch (err) {
    next(err)
  }
})

// POST /api/boards/:id/tokens — 生成分享链接
router.post('/:id/tokens', authMiddleware, checkBoardPermission('editor'), requirePermission('owner'), async (req, res, next) => {
  try {
    const boardId = req.params.id
    const { permission = 'viewer', expires_at, max_uses } = req.body

    if (!['editor', 'viewer', 'commenter'].includes(permission)) {
      return res.status(400).json({ error: '无效的权限类型' })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')

    const shareToken = await ShareToken.create({
      board_id: boardId,
      token: hashShareToken(rawToken),
      raw_token: rawToken,
      permission,
      expires_at: expires_at || null,
      max_uses: max_uses || null,
      created_by: req.user.id
    })

    const data = shareToken.toJSON()
    delete data.token
    res.status(201).json({ ...data, token: rawToken })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/boards/:id/tokens/:tokenId — 撤销分享链接
router.delete('/:id/tokens/:tokenId', authMiddleware, checkBoardPermission('editor'), requirePermission('owner'), async (req, res, next) => {
  try {
    const tokenId = req.params.tokenId
    const token = await ShareToken.findOne({ where: { id: tokenId, board_id: req.params.id } })
    if (!token) return res.status(404).json({ error: '分享链接不存在' })

    token.is_revoked = true
    await token.save()

    await BoardShare.destroy({
      where: {
        board_id: req.params.id,
        source: 'token',
        share_token_id: tokenId
      }
    })

    res.json({ message: '分享链接已撤销，通过该链接获得的访问权限已收回' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
