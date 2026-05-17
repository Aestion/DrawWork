const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { getCanvasPermission, hasPermission } = require('../middleware/permission')
const { Comment, CommentReply, User, Canvas } = require('../models')
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationService')
const { getDb } = require('../utils/db')

// 中间件：根据评论ID解析所属画布、画板并校验权限
function resolveCommentPermission(minLevel) {
  return async (req, res, next) => {
    try {
      const comment = await Comment.findByPk(req.params.id)
      if (!comment) {
        return res.status(404).json({ error: '评论不存在' })
      }
      req.comment = comment

      const canvas = await Canvas.findByPk(comment.canvas_id)
      if (!canvas || canvas.is_deleted) {
        return res.status(404).json({ error: '画布不存在' })
      }

      const { board, permission } = await getCanvasPermission(canvas.id, req.user.id)
      if (!board || !permission) {
        return res.status(403).json({ error: '无权限访问此评论' })
      }
      if (!hasPermission(permission, minLevel)) {
        return res.status(403).json({ error: `需要${minLevel}权限` })
      }
      req.board = board
      req.permission = permission

      next()
    } catch (err) {
      next(err)
    }
  }
}

// GET /api/comments/:id/replies — 获取评论回复列表
router.get('/:id/replies', authMiddleware, resolveCommentPermission('viewer'), async (req, res, next) => {
  try {
    const replies = await CommentReply.findAll({
      where: { comment_id: req.params.id },
      include: [{ model: User, attributes: ['id', 'username'] }],
      order: [['created_at', 'ASC']]
    })

    const result = replies.map(r => ({
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      user: r.User,
      mentioned_user_id: r.mentioned_user_id
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/comments/:id/replies — 回复评论
router.post('/:id/replies', authMiddleware, resolveCommentPermission('commenter'), async (req, res, next) => {
  try {
    const { content, mentioned_user_id } = req.body
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '回复内容不能为空' })
    }

    const reply = await CommentReply.create({
      comment_id: req.params.id,
      user_id: req.user.id,
      content: content.trim(),
      mentioned_user_id: mentioned_user_id || null
    })

    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username'] })

    // Notify the original comment author when someone else replies
    if (req.comment.user_id !== req.user.id) {
      await createNotification({
        userId: req.comment.user_id,
        type: NOTIFICATION_TYPES.COMMENT_REPLY,
        title: `${user?.username || '某用户'} 回复了你的评论`,
        content: content.trim().substring(0, 200),
        entityType: 'comment',
        entityId: req.params.id
      })
    }

    // Notify the mentioned user if different from author and replier
    if (mentioned_user_id &&
        mentioned_user_id !== req.comment.user_id &&
        mentioned_user_id !== req.user.id) {
      await createNotification({
        userId: mentioned_user_id,
        type: NOTIFICATION_TYPES.MENTION,
        title: `${user?.username || '某用户'} 在回复中提到了你`,
        content: content.trim().substring(0, 200),
        entityType: 'comment',
        entityId: req.params.id
      })
    }

    res.status(201).json({
      id: reply.id,
      content: reply.content,
      created_at: reply.created_at,
      user,
      mentioned_user_id: reply.mentioned_user_id
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/comments/:id/resolve — 标记评论为已解决/未解决
router.put('/:id/resolve', authMiddleware, resolveCommentPermission('editor'), async (req, res, next) => {
  try {
    const { is_resolved } = req.body
    const comment = req.comment

    if (is_resolved !== undefined) {
      comment.is_resolved = is_resolved
      await comment.save()
    }

    res.json({
      id: comment.id,
      is_resolved: comment.is_resolved
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/comments/:id — 删除评论
router.delete('/:id', authMiddleware, resolveCommentPermission('editor'), async (req, res, next) => {
  try {
    const comment = req.comment
    const db = getDb()

    // Only comment author or board owner can delete
    if (comment.user_id !== req.user.id && req.permission !== 'owner') {
      return res.status(403).json({ error: '只有评论作者或画板所有者可以删除' })
    }

    // Delete all replies first
    await CommentReply.destroy({ where: { comment_id: comment.id } })

    // Delete the comment
    await comment.destroy()

    res.json({ message: '评论已删除' })
  } catch (err) {
    next(err)
  }
})

// PUT /api/comments/:id/position — 更新评论位置
router.put('/:id/position', authMiddleware, resolveCommentPermission('editor'), async (req, res, next) => {
  try {
    const comment = req.comment
    const { x, y } = req.body

    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ error: '无效的位置参数' })
    }

    comment.x = x
    comment.y = y
    await comment.save()

    res.json({ id: comment.id, x: comment.x, y: comment.y })
  } catch (err) {
    next(err)
  }
})

module.exports = router
