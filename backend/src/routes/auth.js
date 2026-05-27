const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { User, Profile } = require('../models')
const { generateToken, generateRefreshToken, verifyToken } = require('../utils/jwt')
const { authMiddleware } = require('../middleware/auth')

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码为必填项' })
    }

    const existingEmail = await User.findOne({ where: { email } })
    if (existingEmail) {
      return res.status(409).json({ error: '邮箱已被注册' })
    }

    const existingUsername = await User.findOne({ where: { username } })
    if (existingUsername) {
      return res.status(409).json({ error: '用户名已被使用' })
    }

    const password_hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 13)
    const user = await User.create({ username, email, password_hash })
    await Profile.create({ id: user.id, display_name: username })

    const token = generateToken(user)
    const refreshToken = generateRefreshToken(user)

    res.status(201).json({
      user: { id: user.id, username: user.username, email: user.email },
      token,
      refreshToken
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ where: { email } })
    if (!user || !user.is_active) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    await user.update({ last_login_at: new Date() })

    const token = generateToken(user)
    const refreshToken = generateRefreshToken(user)

    res.json({
      user: { id: user.id, username: user.username, email: user.email },
      token,
      refreshToken
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(400).json({ error: '缺少刷新令牌' })
    }

    const decoded = verifyToken(refreshToken)
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: '刷新令牌无效' })
    }

    const user = await User.findByPk(decoded.userId)
    if (!user || !user.is_active) {
      return res.status(401).json({ error: '刷新令牌无效' })
    }

    res.json({
      token: generateToken(user),
      refreshToken: generateRefreshToken(user)
    })
  } catch (err) {
    return res.status(401).json({ error: '刷新令牌无效或已过期' })
  }
})

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  // JWT is stateless — client-side removes the token.
  // This endpoint exists so the frontend doesn't get a 404.
  res.json({ message: '已退出登录' })
})

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    // 确保用户 ID 格式一致（去除多余字符）
    const userId = String(req.user.id).trim()
    const user = await User.findByPk(userId, {
      include: [{ model: Profile }]
    })

    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin,
      profile: user.Profile || null
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/preferences
router.get('/preferences', authMiddleware, async (req, res, next) => {
  try {
    const [profile] = await Profile.findOrCreate({
      where: { id: req.user.id },
      defaults: {
        id: req.user.id,
        display_name: req.user.username,
        ui_preferences: {}
      }
    })

    res.json(profile.ui_preferences || {})
  } catch (err) {
    next(err)
  }
})

// PUT /api/auth/preferences
router.put('/preferences', authMiddleware, async (req, res, next) => {
  try {
    const preferences = req.body?.preferences
    if (!preferences || Array.isArray(preferences) || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'preferences must be an object' })
    }

    const [profile] = await Profile.findOrCreate({
      where: { id: req.user.id },
      defaults: {
        id: req.user.id,
        display_name: req.user.username,
        ui_preferences: {}
      }
    })

    profile.ui_preferences = preferences
    await profile.save()

    res.json(profile.ui_preferences || {})
  } catch (err) {
    next(err)
  }
})

module.exports = router
