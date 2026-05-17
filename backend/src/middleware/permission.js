const { Board, BoardShare, Canvas } = require('../models')

// 权限等级：owner > editor > commenter > viewer
const permissionLevels = {
  owner: 4,
  editor: 3,
  commenter: 2,
  viewer: 1
}

function hasPermission(currentPermission, requiredPermission) {
  const current = permissionLevels[currentPermission] || 0
  const needed = permissionLevels[requiredPermission] || 0
  return current >= needed
}

async function getBoardPermission(boardId, userId) {
  const board = await Board.findByPk(boardId)
  if (!board || board.is_deleted) {
    return { board: null, permission: null }
  }

  const ownerId = String(board.owner_id)
  const currentUserId = String(userId)
  if (ownerId === currentUserId) {
    return { board, permission: 'owner' }
  }

  const share = await BoardShare.findOne({
    where: { board_id: boardId, user_id: userId }
  })

  if (share) {
    return { board, permission: share.permission }
  }

  if (board.is_public) {
    return { board, permission: 'viewer' }
  }

  return { board, permission: null }
}

async function getCanvasPermission(canvasId, userId) {
  const canvas = await Canvas.findByPk(canvasId)
  if (!canvas || canvas.is_deleted) {
    return { canvas: null, board: null, permission: null }
  }

  const { board, permission } = await getBoardPermission(canvas.board_id, userId)
  return { canvas, board, permission }
}

function checkBoardPermission(requiredPermission) {
  return async (req, res, next) => {
    try {
      const boardId = req.params.boardId || req.params.id
      const userId = req.user.id

      const { board, permission } = await getBoardPermission(boardId, userId)
      if (!board) {
        return res.status(404).json({ error: '画板不存在' })
      }

      if (!permission) {
        return res.status(403).json({ error: '无权限访问此画板' })
      }

      req.board = board
      req.permission = permission

      if (requiredPermission && !hasPermission(permission, requiredPermission)) {
        return res.status(403).json({ error: `需要${requiredPermission}权限` })
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

function checkCanvasPermission(requiredPermission, paramName = 'id') {
  return async (req, res, next) => {
    try {
      const canvasId = req.params[paramName]
      const { canvas, board, permission } = await getCanvasPermission(canvasId, req.user.id)

      if (!canvas) {
        return res.status(404).json({ error: '画布不存在' })
      }

      if (!permission) {
        return res.status(403).json({ error: '无权限访问此画布' })
      }

      req.canvas = canvas
      req.board = board
      req.permission = permission

      if (requiredPermission && !hasPermission(permission, requiredPermission)) {
        return res.status(403).json({ error: `需要${requiredPermission}权限` })
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

function requirePermission(required) {
  return (req, res, next) => {
    if (!hasPermission(req.permission, required)) {
      return res.status(403).json({ error: `需要${required}权限` })
    }
    next()
  }
}

module.exports = {
  checkBoardPermission,
  checkCanvasPermission,
  getBoardPermission,
  getCanvasPermission,
  hasPermission,
  requirePermission
}
