# DrawWork 安全问题修复清单

> 代码 Review 发现的安全问题及修复方案
> 生成时间: 2026-05-12

---

## 🔴 Critical (必须立即修复)

### 1. Yjs WebSocket 服务器缺少认证

**问题描述**: Yjs WebSocket 服务器 (`ws://localhost:3001`) 缺少 token 验证，任何知道 roomId 的用户都可以连接并修改白板数据，绕过权限控制。

**风险**: 未授权用户可读写任意画布数据

**修复位置**: 需创建 `yjs-server/index.js` 或检查现有实现

**修复方案**:
```javascript
// yjs-server/index.js - 示例实现
const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');
const { verifyToken } = require('../backend/src/utils/jwt');
const { getCanvasPermission } = require('../backend/src/middleware/permission');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const roomId = url.pathname.slice(1); // 移除开头的 /

  // 1. 验证 token
  let decoded;
  try {
    decoded = verifyToken(token);
    if (decoded.type === 'refresh') {
      ws.close(4001, '刷新令牌不能用于 WebSocket');
      return;
    }
  } catch (err) {
    ws.close(4001, '无效的令牌');
    return;
  }

  // 2. 从 roomId 提取 canvas_id
  // roomId 格式: board_${boardId}_canvas_${uuid}
  const canvasId = extractCanvasIdFromRoomId(roomId);

  // 3. 检查用户对该画布的权限
  const { canvas, permission } = await getCanvasPermission(canvasId, decoded.userId);
  if (!canvas) {
    ws.close(4004, '画布不存在');
    return;
  }
  if (!permission) {
    ws.close(4003, '无权限访问此画布');
    return;
  }

  // 4. 只读用户只允许接收，不允许发送
  if (permission === 'viewer') {
    ws.on('message', (data) => {
      // 只读用户尝试修改，忽略或断开连接
      console.warn(`[Yjs] 只读用户 ${decoded.userId} 尝试修改画布 ${canvasId}`);
    });
  }

  // 5. 建立 Yjs 连接
  setupWSConnection(ws, req, { docName: roomId });
});

server.listen(3001);
```

**检查点**:
- [ ] 创建 Yjs WebSocket 服务器入口文件
- [ ] 实现 token 验证中间件
- [ ] 实现权限检查逻辑
- [ ] 只读权限用户禁止发送更新
- [ ] 添加连接日志记录

---

### 2. 文件上传 MIME 类型检查不够严格

**问题描述**: `uploads.js` 第 13-16 行使用前缀匹配，可能被绕过
```javascript
const allowedMimePrefixes = (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,video/*')
  .split(',')
  .map((type) => type.trim().replace('*', ''))
  .filter(Boolean)
// 结果: ['image/', 'video/']
```

**风险**: 恶意用户可上传 `image/svg+xml` 包含 XSS payload，或其他以 `image/` 开头的危险 MIME 类型

**修复位置**: `backend/src/routes/uploads.js:13-28`

**修复方案**:
```javascript
// 使用白名单而非前缀匹配
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/ogg'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    // 使用精确匹配而非前缀匹配
    const allowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
    if (!allowed) {
      console.warn(`[Upload] 拒绝上传: MIME类型 ${file.mimetype} 不在白名单中`);
    }
    callback(allowed ? null : new Error('不支持的文件类型'), allowed);
  }
});

// 增加文件头魔数检查（防止扩展名伪造）
function verifyFileMagicNumber(buffer, mimeType) {
  const signatures = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
    'image/webp': [0x52, 0x49, 0x46, 0x46],
    'video/mp4': [0x00, 0x00, 0x00, 0x18] // ftyp box
  };

  const sig = signatures[mimeType];
  if (!sig) return false;
  return buffer.slice(0, sig.length).every((byte, i) => byte === sig[i]);
}
```

**检查点**:
- [ ] 替换前缀匹配为白名单精确匹配
- [ ] 添加文件头魔数验证
- [ ] 添加拒绝日志记录

---

## 🟠 High (建议尽快修复)

### 3. 缺少全局 Rate Limiting

**问题描述**: 登录、注册、上传等接口无速率限制，容易遭受暴力破解和 DDoS 攻击

**风险**: 暴力破解密码、API 滥用、资源耗尽

**修复位置**: `backend/src/app.js` (全局) + 特定路由

**修复方案**:
```javascript
// backend/src/app.js
const rateLimit = require('express-rate-limit');

// 全局限制: 每个 IP 100 请求/15分钟
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100,
  message: { error: '请求过于频繁，请稍后重试' },
  standardHeaders: true,
  legacyHeaders: false,
  // 使用 Redis 存储（多实例部署时必需）
  store: process.env.REDIS_URL ? new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }) : undefined
});

// 认证接口更严格限制: 5 请求/15分钟
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // 成功的请求不计数
  message: { error: '登录尝试次数过多，请15分钟后重试' }
});

// 上传接口限制: 10 请求/小时
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: '上传次数已达上限，请稍后再试' }
});

app.use(globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/upload', uploadLimiter);
```

**检查点**:
- [ ] 安装 `express-rate-limit` 依赖
- [ ] 配置全局 rate limiter
- [ ] 为认证接口配置严格限制
- [ ] 为上传接口配置限制
- [ ] 配置 Redis store（生产环境）

---

### 4. 错误处理可能泄露敏感信息

**问题描述**: `app.js` 第 30-35 行直接返回错误消息
```javascript
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  })
})
```

**风险**: 生产环境可能泄露内部错误详情（如数据库结构、文件路径等）

**修复位置**: `backend/src/app.js:30-35`

**修复方案**:
```javascript
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  const status = err.status || 500;

  // 记录详细错误（包含堆栈）
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // 生产环境不返回敏感信息
  const message = isDev
    ? err.message
    : status >= 500
      ? '服务器内部错误'
      : (err.message || '请求错误');

  res.status(status).json({ error: message });
});
```

**检查点**:
- [ ] 区分开发和生产环境错误信息
- [ ] 5xx 错误隐藏具体信息
- [ ] 4xx 错误保留可读信息

---

## 🟡 Medium (建议修复)

### 5. CORS 配置过于宽松

**问题描述**: `app.js` 第 11 行 `app.use(cors())` 允许任意来源访问 API

**风险**: CSRF 攻击、API 被第三方网站滥用

**修复位置**: `backend/src/app.js:11`

**修复方案**:
```javascript
const cors = require('cors');

// 允许的域名列表
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如移动应用、Postman）
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] 拒绝来源: ${origin}`);
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true, // 允许携带 cookie
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

**环境变量配置**:
```bash
# .env
ALLOWED_ORIGINS=https://drawwork.app,https://app.drawwork.com
```

**检查点**:
- [ ] 配置 CORS 白名单
- [ ] 添加环境变量支持
- [ ] 添加拒绝日志

---

### 6. bcrypt 迭代次数可优化

**问题描述**: `auth.js` 第 26 行使用 `bcrypt.hash(password, 12)`，当前是 4096 轮 (2^12)

**建议**: 提升到 13-14 轮（8192-16384 轮），在安全和性能间取得平衡

**修复位置**: `backend/src/routes/auth.js:26`

**修复方案**:
```javascript
// bcrypt 成本因子配置（环境变量）
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 13;

const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```

**检查点**:
- [ ] 更新 bcrypt 迭代次数
- [ ] 添加环境变量配置

---

### 7. JWT Secret 生产环境检查不够严格

**问题描述**: `jwt.js` 虽有检查，但 `DEFAULT_JWT_SECRET` 硬编码在代码中

**风险**: 如果环境变量未正确设置，会使用默认密钥

**修复位置**: `backend/src/utils/jwt.js`

**修复方案**:
```javascript
// 移除默认密钥，强制从环境变量获取
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET 环境变量必须设置');
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET 长度必须至少 32 字符');
  }

  return secret;
}
```

**检查点**:
- [ ] 移除硬编码默认密钥
- [ ] 添加强制检查
- [ ] 添加最小长度验证

---

### 8. admin.js 搜索功能 SQL Like 注入风险

**问题描述**: `admin.js` 第 20-24 行直接使用用户输入拼接 SQL LIKE

**风险**: 虽使用 Sequelize 参数化查询，但通配符 `%` 和 `_` 仍可能导致的性能问题或意外行为

**修复位置**: `backend/src/routes/admin.js:20-24`

**修复方案**:
```javascript
const { Op } = require('sequelize');

function sanitizeSearchTerm(term) {
  // 转义 SQL LIKE 特殊字符
  return term
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .substring(0, 50); // 限制长度
}

// 使用转义后的搜索词
if (search) {
  const sanitized = sanitizeSearchTerm(search);
  where[Op.or] = [
    { username: { [Op.like]: `%${sanitized}%` } },
    { email: { [Op.like]: `%${sanitized}%` } }
  ];
}

// 添加索引提示
const { count, rows } = await User.findAndCountAll({
  where,
  attributes: { exclude: ['password_hash'] },
  offset,
  limit: Math.min(50, Math.max(1, parseInt(req.query.limit) || 20)), // 降低最大限制
  order: [['created_at', 'DESC']]
});
```

**检查点**:
- [ ] 转义 SQL LIKE 特殊字符
- [ ] 限制搜索词长度
- [ ] 降低最大分页限制

---

## 🟢 Low (可选修复)

### 9. 缺少安全响应头

**建议**: 添加 Helmet 中间件设置安全响应头

**修复方案**:
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // 根据需要调整
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false // 允许嵌入资源
}));
```

---

### 10. 会话和 Token 管理可优化

**建议**:
1. 实现 refresh token 轮换（每次刷新时颁发新 refresh token）
2. 添加 token 黑名单机制（用户登出、修改密码后使旧 token 失效）
3. 记录 token 使用日志

---

## 修复优先级总结

| 优先级 | 问题 | 文件 | 预计工作量 |
|--------|------|------|-----------|
| 🔴 Critical | Yjs WebSocket 认证 | yjs-server/index.js | 4h |
| 🔴 Critical | 文件上传 MIME 白名单 | uploads.js | 1h |
| 🟠 High | Rate Limiting | app.js | 2h |
| 🟠 High | 错误处理 | app.js | 1h |
| 🟡 Medium | CORS 白名单 | app.js | 1h |
| 🟡 Medium | bcrypt 迭代次数 | auth.js | 0.5h |
| 🟡 Medium | JWT Secret 强制 | jwt.js | 0.5h |
| 🟡 Medium | SQL Like 转义 | admin.js | 1h |

**总计预计**: 约 11 小时

---

## 依赖安装清单

```bash
# 生产依赖
npm install express-rate-limit helmet

# 开发依赖（用于测试）
npm install --save-dev @types/express-rate-limit
```
