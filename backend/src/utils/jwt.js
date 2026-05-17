const jwt = require('jsonwebtoken')

function getJwtSecret() {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('JWT_SECRET 环境变量必须设置')
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET 长度必须至少 32 字符')
  }

  return secret
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.is_admin, type: 'access' },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  )
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: 'refresh' },
    getJwtSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  )
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret())
}

module.exports = { generateToken, generateRefreshToken, verifyToken, getJwtSecret }
