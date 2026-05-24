const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { getCanvasPermission, hasPermission } = require('../middleware/permission')
const { Vote, VoteRecord, Canvas } = require('../models')
const { Sequelize } = require('sequelize')
const crypto = require('crypto')
const { getJwtSecret } = require('../utils/jwt')

// 中间件：根据投票ID解析所属画布、画板并校验权限
function resolveVotePermission(minLevel) {
  return async (req, res, next) => {
    try {
      const vote = await Vote.findByPk(req.params.id)
      if (!vote) {
        return res.status(404).json({ error: '投票不存在' })
      }
      req.vote = vote

      const canvas = await Canvas.findByPk(vote.canvas_id)
      if (!canvas || canvas.is_deleted) {
        return res.status(404).json({ error: '画布不存在' })
      }

      const { board, permission } = await getCanvasPermission(canvas.id, req.user.id)
      if (!board || !permission) {
        return res.status(403).json({ error: '无权限访问此投票' })
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

// POST /api/votes/:id/records — 提交投票
router.post('/:id/records', authMiddleware, resolveVotePermission('viewer'), async (req, res, next) => {
  try {
    const vote = req.vote
    if (vote.is_closed) {
      return res.status(400).json({ error: '投票已关闭' })
    }
    if (vote.expires_at && new Date(vote.expires_at) < new Date()) {
      return res.status(400).json({ error: '投票已过期' })
    }

    const { target_id } = req.body
    if (!target_id) {
      return res.status(400).json({ error: '缺少投票目标' })
    }

    // 校验 target_id 是否是有效选项
    const validOptions = vote.scope_data?.options || []
    if (validOptions.length > 0 && !validOptions.includes(target_id)) {
      return res.status(400).json({ error: '无效的投票选项' })
    }

    const anonymousSessionId = vote.is_anonymous
      ? crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${getJwtSecret()}`).digest('hex')
      : null

    // 检查每人投票数限制
    const existingCount = await VoteRecord.count({
      where: vote.is_anonymous
        ? { vote_id: vote.id, session_id: anonymousSessionId }
        : { vote_id: vote.id, user_id: req.user.id }
    })
    if (existingCount >= vote.votes_per_user) {
      return res.status(400).json({ error: '已达到投票上限' })
    }

    const record = await VoteRecord.create({
      vote_id: vote.id,
      user_id: vote.is_anonymous ? null : req.user.id,
      session_id: anonymousSessionId,
      target_id
    })

    res.status(201).json(record)
  } catch (err) {
    next(err)
  }
})

// PUT /api/votes/:id/close — 关闭投票
router.put('/:id/close', authMiddleware, resolveVotePermission('editor'), async (req, res, next) => {
  try {
    const vote = req.vote
    if (vote.created_by.toString() !== req.user.id.toString() && req.permission !== 'owner') {
      return res.status(403).json({ error: '只有发起者或画板所有者可以关闭投票' })
    }
    vote.is_closed = true
    await vote.save()
    res.json(vote)
  } catch (err) {
    next(err)
  }
})

// GET /api/votes/:id/results — 获取投票结果
router.get('/:id/results', authMiddleware, resolveVotePermission('viewer'), async (req, res, next) => {
  try {
    const voteId = req.params.id
    const results = await VoteRecord.findAll({
      attributes: [
        'target_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: { vote_id: voteId },
      group: ['target_id'],
      raw: true
    })

    res.json(results)
  } catch (err) {
    next(err)
  }
})

module.exports = router
