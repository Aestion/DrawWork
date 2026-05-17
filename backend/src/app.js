require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const { sequelize, testConnection } = require('./config/database')
const { testRedisConnection } = require('./config/redis')
const { ensureBucket } = require('./config/minio')

const app = express()
app.set('trust proxy', 1)  // Trust nginx reverse proxy
const PORT = process.env.PORT || 3000

// 安全响应头
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}))

// CORS 配置
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000']

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`[CORS] 拒绝来源: ${origin}`)
      callback(new Error('不允许的来源'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}

app.use(cors(corsOptions))

// Rate Limiting 配置 - 开发/测试环境禁用
const isDev = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

// 全局限制：仅生产环境启用
const globalLimiter = isDev || isTest
  ? null
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: '请求过于频繁，请稍后重试' },
      standardHeaders: true,
      legacyHeaders: false
    })

// 认证接口限制：仅生产环境启用
const authLimiter = isDev || isTest
  ? null
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      skipSuccessfulRequests: true,
      message: { error: '登录尝试次数过多，请15分钟后重试' }
    })

// 上传接口限制：仅生产环境启用
const uploadLimiter = isDev || isTest
  ? null
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 10,
      message: { error: '上传次数已达上限，请稍后再试' }
    })

if (globalLimiter) app.use(globalLimiter)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

if (authLimiter) {
  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth/register', authLimiter)
}
if (uploadLimiter) {
  app.use('/api/upload', uploadLimiter)
}
app.use('/api/auth', require('./routes/auth'))
app.use('/api/boards', require('./routes/boards'))
app.use('/api/canvases', require('./routes/canvases'))
app.use('/api/canvases', require('./routes/snapshots'))
app.use('/api/comments', require('./routes/comments'))
app.use('/api/votes', require('./routes/votes'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/shares', require('./routes/shares'))
app.use('/api/upload', require('./routes/uploads'))
app.use('/api/admin', require('./routes/admin'))

app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development'
  const status = err.status || 500

  // 记录详细错误（包含堆栈）
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  })

  // 生产环境不返回敏感信息
  const message = isDev
    ? err.message
    : status >= 500
      ? '服务器内部错误'
      : (err.message || '请求错误')

  res.status(status).json({ error: message })
})

async function validateDatabase() {
  console.log('[DB] Validating database...')

  // Check connection
  await testConnection()

  // Check critical models exist and are accessible
  try {
    const { User, Board, Canvas } = require('./models')

    // Verify tables are accessible with a simple query
    await User.count()
    await Board.count()
    await Canvas.count()

    console.log('[DB] All required tables present and accessible')
  } catch (err) {
    console.error('[DB] FATAL: Cannot verify tables:', err.message)
    // Don't exit during sync - tables might not exist yet
    if (process.env.NODE_ENV === 'production') {
      process.exit(1)
    }
    console.warn('[DB] Continuing - tables may be created during sync')
  }
}

async function start() {
  try {
    // Validate before starting
    await validateDatabase()

    // await testRedisConnection()

    if (process.env.NODE_ENV !== 'production') {
      if (sequelize.getDialect() === 'sqlite') {
        await sequelize.sync()
      } else {
        await sequelize.sync({ alter: true })
      }
      console.log(`[DB] Models synchronized (${sequelize.getDialect()})`)
    }

    try {
      await ensureBucket()
      console.log('[Minio] Bucket ready')
    } catch (err) {
      console.warn('[Minio] Bucket not available:', err.message)
    }

    app.listen(PORT, () => {
      console.log(`[API] Server running on port ${PORT}`)
    })
  } catch (err) {
    console.error('[FATAL]', err.message)
    process.exit(1)
  }
}

if (require.main === module) {
  start()
}

module.exports = app
