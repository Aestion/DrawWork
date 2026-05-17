const { verifyToken } = require('../utils/jwt')
const { User } = require('../models')

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = verifyToken(token)
    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: '刷新令牌不能用于访问接口' })
    }

    const user = await User.findByPk(decoded.userId)
    if (!user || !user.is_active) {
      return res.status(401).json({ error: '用户不存在或已被禁用' })
    }

    req.user = {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' })
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  next()
}

module.exports = { authMiddleware, adminMiddleware }
