const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { Notification } = require('../models')

// GET /api/notifications — 获取当前用户通知列表
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 100
    })
    res.json(notifications)
  } catch (err) {
    next(err)
  }
})

// PUT /api/notifications/:id/read — 标记单条通知已读
router.put('/:id/read', authMiddleware, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    })
    if (!notification) {
      return res.status(404).json({ error: '通知不存在' })
    }

    notification.is_read = true
    await notification.save()
    res.json(notification)
  } catch (err) {
    next(err)
  }
})

// PUT /api/notifications/read-all — 标记全部通知已读
router.put('/read-all', authMiddleware, async (req, res, next) => {
  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } }
    )
    res.json({ message: '全部标记已读' })
  } catch (err) {
    next(err)
  }
})

// GET /api/notifications/unread-count — 获取未读通知数量
router.get('/unread-count', authMiddleware, async (req, res, next) => {
  try {
    const count = await Notification.count({
      where: { user_id: req.user.id, is_read: false }
    })
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

module.exports = router
