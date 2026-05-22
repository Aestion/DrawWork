const router = require('express').Router()
const crypto = require('crypto')
const { Op } = require('sequelize')
const { ShareToken, Board, BoardShare, User, sequelize } = require('../models')
const { verifyToken } = require('../utils/jwt')
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationService')

const MAX_USES_ERROR = '分享链接使用次数已达上限'

function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function extractUserIdFromHeader(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    const decoded = verifyToken(authHeader.split(' ')[1])
    if (decoded.type === 'refresh') return null
    return decoded.userId
  } catch {
    return null
  }
}

// GET /api/shares/validate?token=xxx - 验证分享链接，并为登录用户授予访问权
router.get('/validate', async (req, res, next) => {
  try {
    const { token } = req.query
    if (!token) {
      return res.status(400).json({ error: '缺少token参数' })
    }

    const tokenHash = hashShareToken(token)
    const shareToken = await ShareToken.findOne({
      where: { token: { [Op.in]: [tokenHash, token] } },
      include: [{
        model: Board,
        attributes: ['id', 'name', 'description', 'cover_url'],
        where: { is_deleted: false }
      }]
    })

    if (!shareToken) {
      return res.status(404).json({ error: '分享链接不存在' })
    }

    if (shareToken.is_revoked) {
      return res.status(400).json({ error: '分享链接已撤销' })
    }

    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return res.status(400).json({ error: '分享链接已过期' })
    }

    const userId = extractUserIdFromHeader(req)

    let alreadyHasAccess = false
    if (userId) {
      const existing = await BoardShare.findOne({
        where: { board_id: shareToken.board_id, user_id: userId }
      })
      alreadyHasAccess = Boolean(existing)
    }

    // A link use is consumed only when it grants a logged-in user access.
    // Anonymous previews and refreshes by existing collaborators do not burn max_uses.
    if (userId && !alreadyHasAccess) {
      const userExists = await User.findByPk(userId)
      if (!userExists) {
        return res.status(401).json({ error: '用户不存在或会话已过期，请重新登录' })
      }

      try {
        await sequelize.transaction(async (t) => {
          const fresh = await ShareToken.findByPk(shareToken.id, {
            transaction: t,
            lock: t.LOCK.UPDATE
          })

          if (fresh.max_uses && fresh.used_count >= fresh.max_uses) {
            throw new Error(MAX_USES_ERROR)
          }

          await BoardShare.create({
            board_id: shareToken.board_id,
            user_id: userId,
            permission: shareToken.permission,
            invited_by: shareToken.created_by,
            source: 'token',
            share_token_id: shareToken.id
          }, { transaction: t })

          await fresh.increment('used_count', { transaction: t })
        })
        await shareToken.reload()
      } catch (err) {
        if (err.message === MAX_USES_ERROR) {
          return res.status(400).json({ error: MAX_USES_ERROR })
        }
        throw err
      }

      const board = await Board.findByPk(shareToken.board_id, { attributes: ['id', 'name', 'owner_id'] })
      if (board && board.owner_id !== userId) {
        const joinUser = await User.findByPk(userId, { attributes: ['username'] })
        await createNotification({
          userId: board.owner_id,
          type: NOTIFICATION_TYPES.SHARE_LINK_JOIN,
          title: `${joinUser?.username || '某用户'} 通过分享链接加入了画板「${board.name}」`,
          content: `权限：${shareToken.permission}`,
          entityType: 'board',
          entityId: shareToken.board_id
        })
      }
    }

    res.json({
      board_id: shareToken.board_id,
      permission: shareToken.permission,
      expires_at: shareToken.expires_at,
      max_uses: shareToken.max_uses,
      used_count: shareToken.used_count,
      board: shareToken.Board
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
