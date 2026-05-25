const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { checkCanvasPermission } = require('../middleware/permission')
const { YjsSnapshot, User } = require('../models')

function serializeCreatedAt(snapshot) {
  return snapshot.createdAt || snapshot.created_at
}

// GET /api/canvases/:id/snapshot — 获取画布最新快照
router.get('/:id/snapshot', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const snapshot = await YjsSnapshot.findOne({
      where: { canvas_id: canvasId },
      order: [['created_at', 'DESC']]
    })

    if (!snapshot) {
      return res.json({ exists: false, data: null })
    }

    res.json({
      exists: true,
      data: Buffer.from(snapshot.content).toString('base64'),
      created_at: serializeCreatedAt(snapshot)
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/canvases/:id/snapshot — 保存快照（供 Yjs 服务调用）
router.post('/:id/snapshot', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const { data, name } = req.body

    if (!data) {
      return res.status(400).json({ error: '缺少数据' })
    }
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/=\n\r]+$/.test(data)) {
      return res.status(400).json({ error: '快照数据格式无效' })
    }

    const snapshot = await YjsSnapshot.create({
      canvas_id: canvasId,
      content: Buffer.from(data, 'base64'),
      created_by: req.user.id,
      name: typeof name === 'string' && name.trim().length > 0 ? name.trim().substring(0, 255) : null
    })

    res.status(201).json({ id: snapshot.id, name: snapshot.name || null, created_at: serializeCreatedAt(snapshot) })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/canvases/:id/snapshots/:snapshotId — 删除快照
router.delete('/:id/snapshots/:snapshotId', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const snapshot = await YjsSnapshot.findOne({
      where: { id: req.params.snapshotId, canvas_id: req.params.id }
    })
    if (!snapshot) {
      return res.status(404).json({ error: '快照不存在' })
    }
    await snapshot.destroy()
    res.json({ message: '快照已删除' })
  } catch (err) {
    next(err)
  }
})

// GET /api/canvases/:id/snapshots — 列出画布所有快照（仅元数据）
router.get('/:id/snapshots', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const canvasId = req.params.id
    const snapshots = await YjsSnapshot.findAll({
      where: { canvas_id: canvasId },
      attributes: ['id', 'createdAt', 'name', 'created_by'],
      include: [{ model: User, attributes: ['id', 'username'] }],
      order: [['created_at', 'DESC']]
    })

    const result = snapshots.map(s => ({
      id: s.id,
      name: s.name || null,
      created_at: serializeCreatedAt(s),
      created_by: s.User ? { id: s.User.id, username: s.User.username } : null
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/canvases/:id/snapshots/:snapshotId — 获取指定快照全量数据
router.get('/:id/snapshots/:snapshotId', authMiddleware, checkCanvasPermission('viewer'), async (req, res, next) => {
  try {
    const snapshot = await YjsSnapshot.findOne({
      where: { id: req.params.snapshotId, canvas_id: req.params.id },
      include: [{ model: User, attributes: ['id', 'username'] }]
    })

    if (!snapshot) {
      return res.status(404).json({ error: '快照不存在' })
    }

    res.json({
      id: snapshot.id,
      name: snapshot.name || null,
      data: Buffer.from(snapshot.content).toString('base64'),
      created_at: serializeCreatedAt(snapshot),
      created_by: snapshot.User ? { id: snapshot.User.id, username: snapshot.User.username } : snapshot.created_by
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
