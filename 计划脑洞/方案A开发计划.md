# 方案 A 详细开发计划：DrawWork 前端 + agema 后端

> 创建日期：2026-04-23
> 代码审查日期：2026-04-23
> 目标：保留 DrawWork 的 Excalidraw 前端（手绘风 + 富媒体），引入 agema 的后端基础设施（用户认证 + SQLite + Minio）
>
> **当前状态**：Phase 0 已完成（项目结构已重组），Phase 1~6 待实施。详见「十一、已识别问题与优化项」。

---

## 一、最终架构目标

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (DrawWork)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Excalidraw 引擎 + 手绘风 + GIF/视频/思维导图/表格    │   │
│  │  React 18 → 逐步迁移到 TypeScript（可选后期做）       │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  本地模式：localStorage(元数据) + IndexedDB(Yjs) + 本地文件   │
│  云端模式：JWT Token + REST API + WebSocket(Yjs) + Minio    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        后端 (合并后)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Express   │  │  SQLite     │  │      Minio          │ │
│  │   + JWT     │  │  (Sequelize)│  │   (S3 文件存储)      │ │
│  │   + WS      │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  API: /api/auth/* /api/boards/* /api/canvases/* /upload      │
│  WS: y-websocket (官方) + 自定义认证校验                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、数据模型设计（核心改动）

agema 原有模型需要扩展，兼容 DrawWork 的**多画布**结构。

### 2.1 数据库表结构

```sql
-- 用户表（直接复用 agema）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 画板表（对应 DrawWork 的 Board）
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid(),
  user_id UUID NOT NULL REFERENCES users(id),  -- 所有者
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 画布表（DrawWork 特有，新增！）
-- 一个 Board 下多个 Canvas，每个 Canvas 是一个独立 Yjs room
CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 分享权限表（复用 agema，扩展权限类型）
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('owner','editor','viewer','commenter')),
  created_at DATETIME DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- 画板内容备份表（复用 agema，加 canvas_id）
CREATE TABLE board_contents (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,  -- 新增！null=整板备份
  content TEXT NOT NULL,  -- Base64 Yjs update
  created_at DATETIME DEFAULT NOW()
);

-- ⚠️ 【已识别问题 P0】board_contents 表会无限膨胀
-- 当前实现：useExcalidrawYjs.js 每 30 秒调用 POST 创建一条新记录，没有清理旧记录的逻辑。
-- 影响：SQLite 持续增长，最终拖垮性能。
-- 修复方案：改为「增量更新 + 定期快照 + 清理策略」：
--   1. 实时增量：监听 Yjs update 事件，将增量 update 推送到服务器
--   2. 定期快照：每 5~10 分钟保存一次完整 state 作为恢复点
--   3. 清理策略：只保留最近 N 个快照 + 最近 24 小时的增量
--   4. 可在 board_contents 表增加 version 字段或 type 字段区分快照/增量

-- 画板访问记录（用于"最近访问"大厅排序）
CREATE TABLE board_visits (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_at DATETIME DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);
```

### 2.2 权限矩阵

| 角色 | 编辑内容 | 分享画板 | 删除画板 | 添加画布 | 协作连接 |
|------|---------|---------|---------|---------|---------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ❌ | ❌ | ✅ | ✅ |
| commenter | ❌(仅评论) | ❌ | ❌ | ❌ | ✅(只读) |
| viewer | ❌ | ❌ | ❌ | ❌ | ✅(只读) |

---

## 三、API 设计（前后端契约）

### 3.1 认证

```
POST /api/auth/register
  Body: { username, email, password }
  Res: { success, token, user: { id, username, email } }

POST /api/auth/login
  Body: { username, password }  // 或 email
  Res: { success, token, user }

GET /api/auth/me
  Header: Authorization: Bearer <token>
  Res: { user: { id, username, email } }
```

### 3.2 画板

```
GET /api/boards
  Header: Authorization: Bearer <token>
  Res: { boards: [{ id, name, description, is_public, isOwner, sharedBy, updated_at }] }

POST /api/boards
  Body: { name, description?, is_public? }
  Res: { board: { id, name, ... } }

GET /api/boards/:id
  Res: { board: { id, name, ... }, canvases: [{ id, name, sort_order }], shares: [...] }

PUT /api/boards/:id
  Body: { name?, description?, is_public? }

DELETE /api/boards/:id

POST /api/boards/:id/visit
  // 访问被分享的画板，添加到自己的大厅列表
```

### 3.3 画布（新增 API）

```
POST /api/boards/:id/canvases
  Body: { name }
  Res: { canvas: { id, name, sort_order } }

PUT /api/boards/:id/canvases/:canvasId
  Body: { name?, sort_order? }

DELETE /api/boards/:id/canvases/:canvasId

POST /api/boards/:id/canvases/reorder
  Body: { canvasIds: [id1, id2, ...] }
```

### 3.4 画板内容（Yjs 数据）

```
GET /api/boards/:id/content?canvasId=xxx
  // 返回该 canvas 的最新 Yjs update（Base64）
  Res: { content: "base64...", updated_at }

POST /api/boards/:id/content
  Body: { canvasId?, content: "base64..." }
  // 保存 Yjs update（用于云端备份、新用户首次加载）
```

> ⚠️ **【已识别问题 P0】contents 路由缺少认证中间件**
> 当前实现（`backend/src/routes/contents.js`）的 GET 和 POST 路由均手动解析 token，
> 未使用 `authenticate` 中间件，与其他路由模式不一致，容易遗漏权限校验。
> POST 路由（第 53 行）缺少 `authenticate` 中间件挂载。
> **修复**：统一使用 `authenticate` 中间件，或至少使用 `requireEditor` 校验写权限。

> ⚠️ **【已识别问题 P0】自动保存缺少 canvasId**
> 前端 `useExcalidrawYjs.js:120-127` 保存时只传 `content`，没有传 `canvasId`。
> 导致所有画布的 Yjs 数据都保存为 `canvas_id: null`，多画布场景下数据会互相覆盖。
> **修复**：保存时从 roomId 中提取 canvasId 并传入 API。

### 3.5 分享

```
POST /api/boards/:id/share
  Body: { user_id?, permission: 'editor'|'viewer'|'commenter' }
  // 如果不传 user_id，生成公开链接

GET /api/boards/:id/shares

DELETE /api/boards/:id/shares/:shareId
```

### 3.6 文件上传（复用 agema，适配 DrawWork）

```
POST /upload
  Content-Type: multipart/form-data
  Fields: file, boardId, userId
  Res: { url: "/uploads/..." }

// DrawWork 现有文件也需要支持，加一个 type 字段区分
POST /upload
  Fields: file, boardId, userId, type: 'image'|'video'|'gif'
```

> ⚠️ **【已识别问题 P0】uploads 路由缺少认证中间件**
> 当前 `backend/src/routes/uploads.js` 的 POST 路由没有 `authenticate` 中间件，
> 任何人都可以上传文件，存在安全漏洞。
> **修复**：添加 `authenticate` 中间件，或至少校验 token 有效性。

> ⚠️ **【已识别问题 P2】Minio 健康检查低效**
> `uploads.js:98` 每次上传都调用 `minioClient.listBuckets()` 做健康检查，这是重量级操作。
> **修复**：改为缓存健康状态 + 定时检测（如每 5 分钟检查一次）。

> ⚠️ **【已识别问题 P2】multer memoryStorage 无文件大小限制**
> `uploads.js:8` 使用 `multer.memoryStorage()` 但未设置 `limits.fileSize`，
> 大文件会直接吃光内存。
> **修复**：添加 `limits: { fileSize: 50 * 1024 * 1024 }` 与旧 server.js 保持一致。

---

## 四、WebSocket 协作协议升级

### 4.1 当前问题

DrawWork `server.js` 里手写了 120 行 Yjs 协议处理，存在风险：
- `removeAwarenessStates` 逻辑 hacky，可能删错用户
- 没有认证，任何人知道 roomId 就能连接

> ⚠️ **【已识别问题 P1】y-websocket 前后端版本冲突**
> - backend/package.json: `"y-websocket": "^1.5.0"`
> - frontend/package.json: `"y-websocket": "^3.0.0"`
> 版本差异可能导致 WebSocket 协议不兼容。`setupWSConnection` 来自 `y-websocket/bin/utils`，
> 而 v3 的目录结构可能与 v1.5 不同。
> **修复**：统一到同一版本（建议都用 ^2.0.0 或 ^3.0.0），并验证 `setupWSConnection` 路径。

> ⚠️ **【已识别问题 P1】后端无 Yjs 文档持久化**
> 当前 `yjs.js` 使用 `setupWSConnection`，但没有持久化 Yjs 文档。
> 服务器重启后所有房间数据丢失。虽然前端有 IndexedDB，但多人协作场景下，
> 如果所有用户都离线，服务器上没有恢复点。
> **修复**：监听 Yjs doc 的 `update` 事件，定期将 state 保存到 SQLite；
> 新用户连接时从服务器加载初始 state。

### 4.2 升级方案

统一使用 `y-websocket` 官方 `setupWSConnection`，但**注入认证校验**。

```javascript
// server.js 改造后核心逻辑
const { setupWSConnection } = require('y-websocket/bin/utils');

// 自定义认证：从 URL query 或 header 读取 token
function checkAuth(req, res, next) {
  const token = req.url.includes('?')
    ? new URLSearchParams(req.url.split('?')[1]).get('token')
    : null;

  if (!token) return res(false); // 拒绝无 token 连接

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res(false);
  }
}

wss.on('connection', (ws, req) => {
  // 1. 先校验 token
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const roomId = url.pathname.slice(1); // board-xxx-canvas-xxx

  // 2. 校验用户对该 room 的权限
  const boardId = extractBoardId(roomId);
  const permission = await checkBoardPermission(token, boardId);

  if (!permission) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  // 3. 只读用户标记
  ws.isReadonly = permission === 'viewer' || permission === 'commenter';

  // 4. 走官方 y-websocket
  setupWSConnection(ws, req, { docName: roomId });
});
```

### 4.3 roomId 设计

沿用 DrawWork 现有格式：
```
Yjs roomId = board-{boardId}-{canvasId}
```

例如：`board-550e8400-e29b-41d4-a716-446655440000-default`

> ⚠️ **【已识别问题 P2】roomId 中 boardId 提取依赖格式假设**
> `extractBoardId()` 假设 roomId 格式为 `board-{boardId}-{canvasId}`，
> 但 UUID 本身包含 `-`，靠 `split('-')` 切割有边界情况风险。
> 当前逻辑 `parts.slice(1, parts.length - 1).join('-')` 能正确处理，
> 但约定太脆弱，建议改用更明确的分隔符（如 `::` 或 `/`）。
> 例如：`board::{boardId}::{canvasId}`

---

## 五、分阶段实施计划

### Phase 0：项目结构重组（2 天）✅ 已完成

**目标**：把两个项目合并到一个仓库，建立清晰的前后端分离结构。

> **状态**：✅ 已完成。`frontend/`、`backend/` 目录结构已建立，根 `package.json` workspaces 已配置。

> ⚠️ **【已识别问题 P1】旧 server.js 残留**
> 根目录 `server.js`（367 行）包含旧的 Dashboard API、备份 API、上传 API 和手写的 Yjs WS 处理。
> 这些功能已在 `backend/` 中重新实现，但旧文件仍在。
> 两个服务器可能同时运行在 3000 端口导致冲突。
> **修复**：删除或归档根目录 `server.js`，统一使用 `backend/src/server.js`。

**具体操作**：

```
drawwork/
├── frontend/                    # ← 原 excalidraw-app 搬进来
│   ├── src/
│   ├── package.json
│   └── ...
├── backend/                     # ← 新建，合并两个后端
│   ├── src/
│   │   ├── server.js            # 主入口
│   │   ├── routes/
│   │   │   ├── auth.js          # 认证 API
│   │   │   ├── boards.js        # 画板 API
│   │   │   ├── canvases.js      # 画布 API（新增）
│   │   │   ├── shares.js        # 分享 API
│   │   │   └── uploads.js       # 文件上传
│   │   ├── models/
│   │   │   └── index.js         # Sequelize 模型定义
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT 校验中间件
│   │   │   └── permission.js    # 画板权限校验
│   │   ├── services/
│   │   │   ├── minio.js         # Minio 客户端
│   │   │   └── yjs.js           # Yjs WebSocket 服务
│   │   └── utils/
│   │       └── jwt.js
│   ├── package.json
│   └── database.sqlite          # SQLite 数据库文件
├── shared/                      # 前后端共享类型（可选）
└── package.json                 # 根目录 workspace 配置
```

**文件操作清单**：
- [ ] 新建 `frontend/` 目录，把 `excalidraw-app/*` 移进去
- [ ] 新建 `backend/` 目录
- [ ] 把 agema 的 `backend/server.js` 核心逻辑搬过来，拆分到 `routes/` 和 `models/`
- [ ] 把 DrawWork 现有的 `server.js` 里的 Yjs WS 逻辑替换为 y-websocket 官方
- [ ] 根目录加 `package.json` 配置 workspaces

---

### Phase 1：后端基础设施（5 天）

> ⚠️ **【已识别问题 P2】数据库路径 Bug**
> `backend/src/models/index.js:4` 使用相对路径 `'./database.sqlite'`，
> 实际解析取决于 `process.cwd()`（启动目录），在不同启动方式下可能指向错误位置。
> **修复**：改为绝对路径 `path.join(__dirname, '../../database.sqlite')`。

> ⚠️ **【已识别问题 P2】缺少健康检查端点**
> 后端没有 `/health` 或 `/ready` 端点，无法做运维监控。
> **修复**：在 `server.js` 中添加 `GET /health` 返回服务状态。

> ⚠️ **【已识别问题 P2】缺少 graceful shutdown**
> 服务器没有处理 `SIGTERM`/`SIGINT` 信号，不会关闭 WebSocket 连接、
> 保存 Yjs 文档、关闭数据库连接。
> **修复**：添加 `process.on('SIGTERM', ...)` 处理逻辑。

#### Day 1：数据库模型 + 认证

**任务清单**：
- [ ] `backend/src/models/index.js`：定义所有 Sequelize 模型（User, Board, Canvas, BoardShare, BoardContent, BoardVisit）
- [ ] `backend/src/utils/jwt.js`：JWT 签发和校验工具
- [ ] `backend/src/middleware/auth.js`：Express JWT 中间件
- [ ] `backend/src/routes/auth.js`：注册/登录/获取当前用户 API
- [ ] `backend/src/services/minio.js`：Minio 客户端配置

> ⚠️ **【已识别问题 P2】JWT 无 Refresh Token 机制**
> 当前 JWT 过期后直接跳转登录页，体验差。
> **修复**：短期 access token（15 分钟）+ 长期 refresh token（7 天），
> 过期时自动用 refresh token 换新 access token。

> ⚠️ **【已识别问题 P2】认证接口无限流**
> 注册/登录接口没有限流，容易被暴力破解。
> **修复**：添加 `express-rate-limit`，限制每 IP 每 15 分钟最多 10 次请求。

**关键代码**：

```javascript
// models/index.js 核心结构
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite', logging: false });

const User = sequelize.define('User', { ... });
const Board = sequelize.define('Board', { ... });
const Canvas = sequelize.define('Canvas', { ... });  // 新增
const BoardShare = sequelize.define('BoardShare', { ... });
const BoardContent = sequelize.define('BoardContent', { ... });
const BoardVisit = sequelize.define('BoardVisit', { ... });

// 关系
Board.belongsTo(User, { foreignKey: 'user_id' });
Board.hasMany(Canvas, { foreignKey: 'board_id', onDelete: 'CASCADE' });
Board.hasMany(BoardShare, { foreignKey: 'board_id' });
Canvas.belongsTo(Board, { foreignKey: 'board_id' });

module.exports = { sequelize, User, Board, Canvas, BoardShare, BoardContent, BoardVisit };
```

#### Day 2：画板 API

**任务清单**：
- [ ] `backend/src/routes/boards.js`：CRUD + visit API
- [ ] `backend/src/middleware/permission.js`：画板权限校验中间件
- [ ] 测试所有画板 API（用 Postman 或 curl）

**关键逻辑**：
- `GET /api/boards`：返回用户 own 的 boards + 被 share 的 boards（通过 BoardShare 查）
- `POST /api/boards`：创建 board 时，自动创建一个默认 canvas（兼容 DrawWork 单画布启动）
- `DELETE /api/boards`：级联删除 canvases, shares, contents

#### Day 3：画布 API（新增）

**任务清单**：
- [ ] `backend/src/routes/canvases.js`：画布 CRUD + reorder API
- [ ] 画板创建时自动创建默认 canvas
- [ ] 测试

#### Day 4：分享 + 内容 API

**任务清单**：
- [ ] `backend/src/routes/shares.js`：分享 CRUD
- [ ] `backend/src/routes/contents.js`：Yjs content 保存/读取
- [ ] 公开分享链接生成（无 user_id 的 share）

#### Day 5：文件上传 + Minio + Yjs WS

**任务清单**：
- [ ] `backend/src/routes/uploads.js`：上传 API（复用 agema，适配 boardId + userId）
- [ ] `backend/src/services/yjs.js`：y-websocket 服务 + 认证注入
- [ ] 整合测试：注册 → 创建画板 → 上传文件 → 协作连接

---

### Phase 2：前端认证集成（3 天）

> ⚠️ **【已识别问题 P2】前端 API_BASE 硬编码重复**
> `useExcalidrawYjs.js:7` 和 `ExcalidrawEditor.jsx:5` 各自独立构建 `API_BASE`，
> 逻辑重复且硬编码了端口判断。
> **修复**：统一为 `frontend/src/utils/config.js` 导出 `API_BASE` 和 `WS_URL`。

> ⚠️ **【已识别问题 P2】Vite 未代理 WebSocket**
> `vite.config.js` 只代理了 `/api`、`/upload`、`/uploads`，没有代理 WebSocket。
> 前端 `useExcalidrawYjs.js:6` 硬编码了 `ws://hostname:3000`。
> 生产环境（前端构建后由后端托管）端口一致所以没问题，但开发环境不够优雅。
> **修复**：在 `vite.config.js` 中添加 WS proxy，或统一使用 `window.location` 动态构建。

#### Day 1：登录/注册页面

**任务清单**：
- [ ] `frontend/src/components/Auth.jsx`：登录/注册表单（从 agema 的 `Auth.tsx` 改过来）
- [ ] `frontend/src/hooks/useAuth.js`：认证状态管理
- [ ] App.jsx 入口：未登录显示 Auth，登录后显示 Dashboard/Editor

#### Day 2：JWT 集成

**任务清单**：
- [ ] `frontend/src/utils/api.js`：带 JWT 的 fetch 封装
- [ ] 所有 API 调用替换为 `apiFetch`
- [ ] Token 过期自动跳转登录

#### Day 3：未登录兼容

**任务清单**：
- [ ] App.jsx：检测 URL 参数，无 `room` 且无 token → 显示 Dashboard（本地模式）
- [ ] Dashboard.jsx：未登录时从 localStorage 读取 boards，不调用 API
- [ ] 登录后提供"迁移本地数据到云端"按钮

---

### Phase 3：画板大厅云端化（5 天）

> ⚠️ **【已识别问题 P1】旧 server.js 中的备份 API 未迁移**
> 根目录 `server.js` 有 `/api/backup` 和 `/api/dashboard/save` 等端点，
> 在新的 `backend/` 中没有对应实现。如果删除旧 server.js，这些功能会丢失。
> **修复**：评估是否需要这些 API，如需要则在 `backend/routes/` 中重新实现。

#### Day 1-2：Dashboard 改造

**任务清单**：
- [ ] `frontend/src/Dashboard.jsx`：
  - 登录状态：从 `/api/boards` 拉取
  - 未登录状态：从 localStorage 读取（保持现有逻辑）
  - 新增：画板封面、所有者信息、分享状态显示
- [ ] 画板创建：登录后 POST `/api/boards`，未登录时仍写 localStorage

#### Day 3-4：数据迁移向导

**任务清单**：
- [ ] `frontend/src/components/DataMigration.jsx`：迁移提示组件
  - 检测 localStorage 有数据且用户刚登录
  - 显示"发现 X 个本地画板，是否迁移到云端？"
  - 逐个调用 POST `/api/boards` + POST `/api/boards/:id/content`
- [ ] 迁移进度条和错误处理

#### Day 5：分享功能改造

**任务清单**：
- [ ] `frontend/src/components/ShareDialog.jsx`：
  - 登录用户：调用 `/api/boards/:id/share`，生成带 token 的链接
  - 未登录用户：保持现有 URL `readonly=true` 逻辑（纯本地分享）
- [ ] 分享链接格式：`http://ip:port/?room={boardId}&token={shareToken}`

---

### Phase 4：Yjs 协作与权限整合（5 天）

> ⚠️ **【已识别问题 P2】公开分享链接设计不完整**
> `shares.js:20-22` 生成的公开链接带 `token=public`，但这个 token 在
> `verifyToken` 中会校验失败。虽然 `yjs.js` 对 `is_public` 的 board 有兜底逻辑，
> 但公开链接的设计没有闭环——无法给非公开 board 生成有效的匿名访问链接。
> **修复**：设计专门的分享 token 机制（短期有效、可撤销），或使用签名链接。

> ⚠️ **【已识别问题 P2】缺少离线→在线同步冲突解决策略**
> 计划提到"服务器优先"策略，但没有具体实现。
> Yjs 本身有 CRDT 合并能力，应利用 `Y.encodeStateVector` + `Y.encodeStateAsUpdate` 做增量同步。
> IndexedDB 作为主存储，服务器作为备份，连接时自动合并。

#### Day 1-2：前端 Yjs Store 改造

**任务清单**：
- [ ] `frontend/src/hooks/useYjsStore.js`：
  - WebSocket URL 加 token 参数：`ws://host:port/roomId?token=xxx`
  - 连接状态 UI 提示（从 agema 搬过来）
  - 未登录用户：仍用现有逻辑（直接连 WS，无认证）

#### Day 3-4：后端 WS 认证

**任务清单**：
- [ ] `backend/src/services/yjs.js`：
  - 拦截 WebSocket 连接，读取 URL token
  - 校验 JWT + 画板权限
  - 只读用户：通过 Yjs Awareness 标记为 readonly，前端锁定编辑
- [ ] 测试：owner 可编辑、viewer 只能看、未授权用户被拒绝

#### Day 5：协作稳定性

**任务清单**：
- [ ] 断线重连测试
- [ ] 多画布切换时 Yjs provider 切换
- [ ] 权限动态变更（如被踢出编辑权限）

---

### Phase 5：富媒体存储迁移（3 天）

> ⚠️ **【已识别问题 P2】Excalidraw API 兼容性**
> 前端 `ExcalidrawEditor.jsx:84` 调用 `excalidrawApiRef.current.addFiles()`，
> 但未验证此方法在 Excalidraw 0.17.6 中是否存在。
> **修复**：升级前先验证 API，或添加方法存在性检查。

#### Day 1：上传接口改造

**任务清单**：
- [ ] `frontend/src/App.jsx`：文件上传走新的 `/upload` API（Minio）
- [ ] 上传时带 `boardId` 和 `userId`
- [ ] 返回的 URL 格式保持兼容

#### Day 2：存量文件迁移

**任务清单**：
- [ ] 脚本：`scripts/migrate-files.js`：把服务器本地 `data/uploads/` 的文件上传到 Minio
- [ ] 更新数据库里已有画板中引用的文件 URL

#### Day 3：GIF/视频/思维导图/表格 适配

**任务清单**：
- [ ] 测试 GIF 动画在 Minio URL 下是否正常播放
- [ ] 测试视频嵌入
- [ ] 测试思维导图和表格的元素序列化（确保 Yjs 同步正常）

---

### Phase 6：优化与测试（5 天）

#### Day 1-2：离线模式测试

**测试场景**：
- [ ] 未登录用户创建画板 → 编辑 → 刷新 → 数据不丢失
- [ ] 登录用户断网 → 本地编辑 → 联网后自动同步
- [ ] 多画布切换 → 每个画布独立存储

#### Day 3：协作测试

**测试场景**：
- [ ] A 创建画板，分享链接给 B
- [ ] A 和 B 同时编辑同一画布
- [ ] B 刷新页面后自动恢复协作
- [ ] 权限降级（A 把 B 从 editor 改成 viewer）

#### Day 4：数据一致性测试

- [ ] 画板删除后，关联的 Canvas、Content、Shares 是否级联删除
- [ ] SQLite 和 IndexedDB 数据冲突时以谁为准（策略：服务器优先）
- [ ] 大文件（50MB+）上传稳定性

#### Day 5：回滚方案

- [ ] 数据库备份脚本
- [ ] 旧版 DrawWork 兼容性（未升级的用户仍能使用）
- [ ] 部署文档

---

## 六、关键代码片段预览

### 6.1 后端 WS 认证（核心改动）

```javascript
// backend/src/services/yjs.js
const { setupWSConnection } = require('y-websocket/bin/utils');
const jwt = require('jsonwebtoken');
const { Board, BoardShare } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function getPermission(token, boardId) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const board = await Board.findByPk(boardId);
    if (!board) return null;

    if (board.user_id === decoded.id) return 'owner';

    const share = await BoardShare.findOne({
      where: { board_id: boardId, user_id: decoded.id }
    });
    return share ? share.permission : null;
  } catch {
    return null;
  }
}

function initYjsServer(wss) {
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomId = url.pathname.slice(1); // e.g. "board-xxx-canvas-xxx"
    const token = url.searchParams.get('token');

    // 提取 boardId
    const boardId = roomId.split('-')[1];

    // 校验权限
    const permission = await getPermission(token, boardId);
    if (!permission) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // 标记只读
    ws.isReadonly = ['viewer', 'commenter'].includes(permission);

    // 走官方 y-websocket
    setupWSConnection(ws, req, { docName: roomId });
  });
}

module.exports = { initYjsServer };
```

### 6.2 前端 API 封装

```javascript
// frontend/src/utils/api.js
const API_BASE = `http://${window.location.hostname}:${window.location.port === '4173' ? '3000' : (window.location.port || '3000')}`;

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('drawwork_token');
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('drawwork_token');
    window.location.reload(); // 跳转登录
    return;
  }

  return res.json();
}
```

### 6.3 数据迁移组件

```javascript
// frontend/src/components/DataMigration.jsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export function DataMigration({ user, onMigrationComplete }) {
  const [localBoards, setLocalBoards] = useState([]);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 检测本地是否有数据
    const saved = localStorage.getItem('excalidraw-boards');
    if (saved) {
      const boards = JSON.parse(saved);
      if (boards.length > 0) {
        setLocalBoards(boards);
      }
    }
  }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    const total = localBoards.length;
    let migrated = 0;

    for (const board of localBoards) {
      try {
        // 1. 创建画板
        const res = await apiFetch('/api/boards', {
          method: 'POST',
          body: JSON.stringify({ name: board.name }),
        });

        // 2. 上传 Yjs 内容（如果有的话）
        // TODO: 从 IndexedDB 读取 Yjs data 并上传

        migrated++;
        setProgress(Math.round((migrated / total) * 100));
      } catch (err) {
        console.error(`Failed to migrate board: ${board.name}`, err);
      }
    }

    setMigrating(false);
    localStorage.removeItem('excalidraw-boards'); // 清理本地数据
    onMigrationComplete();
  };

  if (localBoards.length === 0) return null;

  return (
    <div className="migration-dialog">
      <h3>发现 {localBoards.length} 个本地画板</h3>
      <p>是否迁移到云端？</p>
      <button onClick={handleMigrate} disabled={migrating}>
        {migrating ? `迁移中... ${progress}%` : '开始迁移'}
      </button>
      <button onClick={onMigrationComplete} disabled={migrating}>
        跳过
      </button>
    </div>
  );
}
```

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| **Yjs 房间隔离** | 多画布下每个 Canvas 是独立 room，Board 级别权限需要跨 room 校验 | roomId 里编码 boardId，WS 连接时提取 boardId 查权限 |
| **Excalidraw 版本锁定** | 0.17.6 较旧，未来升级可能 API 不兼容 | 先锁定版本，Phase 6 后再评估升级 |
| **IndexedDB → SQLite 迁移** | 用户本地 Yjs 数据格式与云端存储格式不同 | 用 Yjs `Y.encodeStateAsUpdate` 导出 Uint8Array，Base64 后传服务器 |
| **Minio 不可用** | 内网环境可能没有 Minio | 降级到服务器本地磁盘（保留现有 multer 逻辑作为 fallback）|
| **JWT 泄露** | 分享链接带 token，可能被滥用 | Token 有效期设短（7 天），支持手动撤销 share |
| **board_contents 无限膨胀** | 每 30 秒写入一条记录，无清理机制 | 改为增量更新 + 定期快照 + 保留策略 |
| **y-websocket 版本冲突** | 前端 v3 与后端 v1.5 可能协议不兼容 | 统一版本，验证 setupWSConnection 路径 |
| **旧 server.js 残留** | 两个服务器可能端口冲突 | 删除或归档根目录 server.js |
| **contents/uploads 路由缺认证** | 任何人可读写内容、上传文件 | 添加 authenticate 中间件 |
| **自动保存缺 canvasId** | 多画布数据互相覆盖 | 保存时从 roomId 提取 canvasId 传入 |
| **服务器重启丢数据** | 后端无 Yjs 文档持久化 | 监听 update 事件定期保存到 SQLite |
| **数据库路径不确定** | 相对路径依赖 cwd() | 改为绝对路径 |
| **公开分享链接不完整** | 无法给非公开 board 生成匿名访问链接 | 设计专门的分享 token 机制 |
| **multer 无文件大小限制** | 大文件吃光内存 | 添加 limits.fileSize 配置 |

---

## 八、里程碑与验收标准

| 阶段 | 周期 | 验收标准 |
|------|------|---------|
| **Phase 0** | 2 天 | 项目结构清晰，`npm run dev` 能同时启动前后端 |
| **Phase 1** | 5 天 | Postman 能跑通所有 API，数据库表创建正确 |
| **Phase 2** | 3 天 | 能注册/登录/登出，未登录用户仍能本地使用 |
| **Phase 3** | 5 天 | Dashboard 能从云端拉取画板，数据迁移成功 |
| **Phase 4** | 5 天 | 协作连接带认证，权限校验生效，只读用户不能编辑 |
| **Phase 5** | 3 天 | 文件上传到 Minio，GIF/视频正常播放 |
| **Phase 6** | 5 天 | 所有测试场景通过，有回滚方案 |

**总周期：约 4 周（28 天）**

---

## 九、当前进度追踪

> 在此记录实际开发进度，每完成一项打勾

- [x] Phase 0：项目结构重组 ✅ 已完成
- [x] Phase 1：后端基础设施 ✅ 已完成（P0/P1/P2 问题已修复）
- [x] Phase 2：前端认证集成 ✅ 已完成（JWT + Refresh Token + 限流）
- [x] Phase 3：画板大厅云端化 ✅ 部分完成（公开画板可无登录访问，分享 token 机制已实现，数据迁移向导未做）
- [x] Phase 4：Yjs 协作与权限整合 ✅ 已完成（WS 认证 + 权限校验 + Yjs 持久化 + roomId 双格式兼容）
- [ ] Phase 5：富媒体存储迁移（未开始）
- [ ] Phase 6：优化与测试（未开始）

### 已完成的修复清单

| 原编号 | 问题 | 状态 | 说明 |
|--------|------|------|------|
| #1 | board_contents 无限膨胀 | ✅ 已修复 | 每 canvas 最多保留 10 条记录，超限删最旧的 |
| #2 | contents 路由缺认证 | ✅ 已修复 | POST 加 authenticate，GET 为 auth-optional（支持公开画板） |
| #3 | uploads 路由缺认证 | ✅ 已修复 | 添加 authenticate 中间件 |
| #4 | 自动保存缺 canvasId | ✅ 已修复 | 从 roomId 提取 canvasId 并传入 API |
| #5 | y-websocket 版本冲突 | ✅ 已修复 | 后端统一到 ^2.0.0 |
| #6 | 旧 server.js 残留 | ✅ 已修复 | 重命名为 server.old.js，启动脚本已更新 |
| #7 | Yjs 文档无持久化 | ✅ 已修复 | saveAllDocs + 5min 定时保存 + graceful shutdown 时保存 |
| #9 | 数据库路径 Bug | ✅ 已修复 | 改为绝对路径 `path.join(__dirname, '../../database.sqlite')` |
| #10 | Minio 健康检查低效 | ✅ 已修复 | 缓存健康状态 + 定时检测 |
| #11 | multer 无文件大小限制 | ✅ 已修复 | 添加 `limits: { fileSize: 50MB }` |
| #12 | JWT 无 Refresh Token | ✅ 已修复 | generateRefreshToken + verifyRefreshToken + 前端自动刷新 |
| #13 | 认证接口无限流 | ✅ 已修复 | 添加 express-rate-limit |
| #14 | 缺少 /health 端点 | ✅ 已修复 | 添加 `GET /health` |
| #15 | 缺少 graceful shutdown | ✅ 已修复 | SIGTERM/SIGINT 处理 + saveAllDocs + 关闭连接 |
| #16 | 前端 API_BASE 硬编码重复 | ✅ 已修复 | 统一为 `utils/config.js` 导出 API_BASE + WS_URL |
| #17 | Vite 未代理 WebSocket | ✅ 已修复 | vite.config.js 添加 WS proxy |
| #18 | roomId 解析脆弱 | ✅ 已修复 | 新格式 `board::{uuid}::{canvasId}`，旧格式向后兼容 |
| #19 | 公开分享链接不完整 | ✅ 已修复 | generateShareToken + verifyShareToken 机制 |

### 额外完成项

- ✅ 公开画板可无登录访问（boards.js GET /:id + contents.js GET 为 auth-optional）
- ✅ Excalidraw langCode="zh-CN"
- ✅ roomId 双格式兼容（`board-` 和 `board::` 均可解析）
- ✅ 前端重新构建（excalidraw-assets 已复制到 dist）
- ✅ vite.config.js 重复代码清理 + WS 代理

### 未完成项

| 原编号 | 问题 | 状态 | 说明 |
|--------|------|------|------|
| #8 | 旧备份 API 未迁移 | ❌ 待定 | 需评估是否需要 |
| #20 | 离线→在线同步策略 | ❌ 未做 | 利用 Yjs CRDT 增量同步 |
| #21 | Excalidraw API 兼容性 | ❌ 未验证 | addFiles 方法需验证 |
| #22 | 数据库无备份机制 | ❌ 未做 | 定时 sqlite3 backup + WAL 模式 |
| #23 | 请求体大小一致性 | ⚠️ 部分修复 | multer 50MB + json 50MB 已统一 |
| #24 | 缺少输入消毒 | ❌ 未做 | XSS / 注入风险 |
| O1 | 内容保存策略重构 | ⚠️ 部分完成 | 清理策略已做，但仍是全量保存非增量 |
| O3 | 统一错误处理 | ❌ 未做 | 401 仍为 reload |
| O6 | 数据库 WAL 模式 | ❌ 未做 | |
| O7 | Excalidraw 版本评估 | ❌ 未做 | |
| O8 | TypeScript 迁移 | ❌ 未做 | |
| O10 | 数据导出功能 | ❌ 未做 | |

---

## 十、参考资源

- agema 项目：`D:\Draw91\agema`
- DrawWork 当前代码：`e:\ClaudeCodeWork\DrawWork`
- agema 后端认证实现：`D:\Draw91\agema\backend\server.js`
- agema 前端 Auth 组件：`D:\Draw91\agema\frontend\src\components\Auth.tsx`
- y-websocket 官方文档：https://github.com/yjs/y-websocket

---

*文档版本: v1.1*
*创建日期: 2026-04-23*
*代码审查: 2026-04-23*

---

## 十一、已识别问题与优化项（代码审查 2026-04-23）

> 以下问题基于对当前代码库的全面审查，按优先级分类。
> 每个问题标注了涉及文件和建议修复方案。

### 11.1 P0 — 必须立即修复

| # | 问题 | 涉及文件 | 影响 | 修复方案 |
|---|------|----------|------|----------|
| 1 | **board_contents 表无限膨胀** | `useExcalidrawYjs.js:114` | 数据库持续增长，性能灾难 | 改为增量更新 + 定期快照 + 清理策略 |
| 2 | **contents 路由缺认证中间件** | `routes/contents.js:53` | 任何人可读写画板内容 | 添加 `authenticate` 中间件 |
| 3 | **uploads 路由缺认证中间件** | `routes/uploads.js:91` | 任何人可上传文件 | 添加 `authenticate` 中间件 |
| 4 | **自动保存缺 canvasId** | `useExcalidrawYjs.js:120-127` | 多画布数据互相覆盖 | 保存时从 roomId 提取 canvasId |

### 11.2 P1 — 高优先级

| # | 问题 | 涉及文件 | 影响 | 修复方案 |
|---|------|----------|------|----------|
| 5 | **y-websocket 前后端版本冲突** | `backend/package.json` vs `frontend/package.json` | WebSocket 协议不兼容 | 统一到同一版本 |
| 6 | **旧 server.js 残留** | 根目录 `server.js`（367 行） | 端口冲突、代码混淆 | 删除或归档，统一用 `backend/src/server.js` |
| 7 | **后端无 Yjs 文档持久化** | `services/yjs.js` | 服务器重启丢数据 | 监听 update 事件定期保存到 SQLite |
| 8 | **旧备份 API 未迁移** | 根目录 `server.js:92-140` | 删除旧 server.js 后功能丢失 | 在 backend 中重新实现或评估是否需要 |

### 11.3 P2 — 中优先级

| # | 问题 | 涉及文件 | 影响 | 修复方案 |
|---|------|----------|------|----------|
| 9 | **数据库路径 Bug** | `models/index.js:4` | 不同启动方式下路径错误 | 改为绝对路径 |
| 10 | **Minio 健康检查低效** | `routes/uploads.js:98` | 每次上传调用 listBuckets | 缓存健康状态 + 定时检测 |
| 11 | **multer 无文件大小限制** | `routes/uploads.js:8` | 大文件吃光内存 | 添加 `limits.fileSize` |
| 12 | **JWT 无 Refresh Token** | `utils/jwt.js` | token 过期跳登录页 | 添加 refresh token 机制 |
| 13 | **认证接口无限流** | `routes/auth.js` | 暴力破解风险 | 添加 `express-rate-limit` |
| 14 | **缺少健康检查端点** | `server.js` | 无法运维监控 | 添加 `GET /health` |
| 15 | **缺少 graceful shutdown** | `server.js` | 重启时连接/数据丢失 | 添加 SIGTERM 处理 |
| 16 | **前端 API_BASE 硬编码重复** | `useExcalidrawYjs.js:7`, `ExcalidrawEditor.jsx:5` | 维护困难 | 统一为 `utils/config.js` |
| 17 | **Vite 未代理 WebSocket** | `vite.config.js` | 开发环境 WS 连接不便 | 添加 WS proxy 或统一动态构建 |
| 18 | **roomId 解析脆弱** | `services/yjs.js:34-41` | UUID 中的 `-` 可能干扰解析 | 改用 `::` 或 `/` 分隔符 |
| 19 | **公开分享链接不完整** | `routes/shares.js:20-22` | 无法给非公开 board 生成匿名链接 | 设计专门的分享 token 机制 |
| 20 | **缺少离线→在线同步策略** | `useExcalidrawYjs.js` | 合并冲突无明确方案 | 利用 Yjs CRDT 增量同步 |
| 21 | **Excalidraw API 兼容性** | `ExcalidrawEditor.jsx:84` | addFiles 方法可能不存在 | 升级前验证 API |
| 22 | **数据库无备份机制** | 无 | SQLite 文件损坏风险 | 定时 sqlite3 backup + WAL 模式 |
| 23 | **缺少请求体大小一致性** | `server.js:23` vs `uploads.js:8` | JSON 50MB 但 multer 无限制 | 统一配置 |
| 24 | **缺少输入消毒** | 多个路由 | XSS / 注入风险 | 对用户输入做 sanitize |

### 11.4 建议优化项（非 Bug）

| # | 优化项 | 说明 |
|---|--------|------|
| O1 | **内容保存策略重构** | 从「每 30 秒全量保存」改为「增量更新 + 定期快照 + 清理策略」 |
| O2 | **JWT Refresh Token 机制** | 短期 access token（15min）+ 长期 refresh token（7d） |
| O3 | **统一错误处理** | 前端 `apiFetch` 的 401 处理可改为触发登录弹窗而非直接 reload |
| O4 | **添加 `/health` 端点** | 便于运维监控和负载均衡 |
| O5 | **Graceful Shutdown** | 处理 SIGTERM/SIGINT，保存 Yjs 状态，关闭连接 |
| O6 | **数据库 WAL 模式** | 启用 SQLite WAL 提高并发安全性 |
| O7 | **Excalidraw 版本评估** | 0.17.6 较旧，Phase 6 后评估升级到最新版 |
| O8 | **TypeScript 迁移** | 计划中提到可选后期做，建议至少给后端路由加类型检查 |
| O9 | **统一工具函数** | `extractBoardId` 在多个文件中重复定义，应提取为共享工具 |
| O10 | **数据导出功能** | 添加画板导出为 JSON/SVG/PNG 的能力 |

### 11.5 建议实施顺序

```
第一步（安全修复）：修复 #2 #3 #4 → 认证 + canvasId
第二步（数据安全）：修复 #1 #7 → 内容保存策略 + Yjs 持久化
第三步（基础设施）：修复 #5 #6 #9 → 版本统一 + 清理旧代码 + 路径修复
第四步（体验优化）：修复 #10~#24 + O1~O10
```

---

## 十二、2026-04-24 复核更新

> 本次复核目标：对齐当前工程真实状态、检查 Minio 修复、补齐发现的运行风险。

### 12.1 工程现状

- 根目录不是 Git 仓库，无法通过 `git status` 跟踪变更；当前变更以文件系统状态为准。
- 当前工程已经完成前后端 workspace 拆分：`frontend/`、`backend/`、根 `package.json` 均存在。
- `backend/data/minio-data/` 与 `backend/data/uploads/` 已存在，当前后端本地上传 fallback 使用 `backend/data/uploads/`。
- `npm run build` 已通过；仅有 Excalidraw chunk 体积警告，不阻塞运行。

### 12.2 今日已修复

| 编号 | 问题 | 状态 | 涉及文件 |
|---|---|---|---|
| R1 | Yjs 持久化挂到了自建 `Y.Doc`，没有绑定 `y-websocket` 真实协作文档，存在“看似保存但实际不保存协作内容”的风险 | ✅ 已修复 | `backend/src/services/yjs.js` |
| R2 | graceful shutdown 调用 `saveAllDocs()` 未等待完成，退出时仍可能丢最后一批协作数据 | ✅ 已修复 | `backend/src/server.js` |
| R3 | 分享链接可能只带 boardId，前端无法解析为 `board::{boardId}::{canvasId}` roomId | ✅ 已修复 | `backend/src/routes/shares.js`、`frontend/src/App.jsx` |
| R4 | 分享按钮复制链接时没有保留 `shareToken` | ✅ 已修复 | `frontend/src/components/ExcalidrawEditor.jsx` |
| R5 | 前端部分 JSX 文件存在乱码导致的语法风险 | ✅ 已修复 | `frontend/src/App.jsx`、`frontend/src/components/Auth.jsx`、`frontend/src/components/Dashboard.jsx`、`frontend/src/components/BoardSettings.jsx`、`frontend/src/components/ExcalidrawEditor.jsx` |
| R6 | Minio 启动时 bucket 初始化未等待，上传健康检查只 `listBuckets()`，无法保证目标 bucket 可用 | ✅ 已修复 | `backend/src/services/minio.js`、`backend/src/routes/uploads.js`、`backend/src/server.js` |
| R7 | Minio 返回 URL 使用 `encodeURIComponent(fileName)`，会把路径 `/` 编成 `%2F`，对象访问可能失败 | ✅ 已修复 | `backend/src/routes/uploads.js` |

### 12.3 Minio 当前策略

- 后端启动时会尝试初始化 bucket；如果 Minio 不可用，不阻塞后端启动，上传会 fallback 到本地磁盘。
- 上传前的 Minio 健康检查改为调用 `ensureBucket()`，确认目标 bucket 可用后再写入。
- Minio 对象 URL 按路径段编码，保留目录层级，例如 `user/board/images/2026-04/file.png`。
- 本地 fallback 继续使用 `backend/data/uploads` 并通过 `/upload/...` 静态访问。

### 12.4 验证记录

- ✅ `node --check backend/src/services/minio.js`
- ✅ `node --check backend/src/routes/uploads.js`
- ✅ `node --check backend/src/server.js`
- ✅ `node --check backend/src/services/yjs.js`
- ✅ `npm run build`

### 12.5 后续仍建议处理

- `board_contents` 目前仍是快照式保存，只是做了保留数量控制；后续建议升级为“增量 update + 周期快照”。
- 需要实际启动 Minio 和后端做一次端到端上传验证：登录后上传图片，确认 Minio URL 可直接访问。
- 前端还有若干页面文本历史乱码痕迹，核心入口已修复，建议后续统一过一遍 UI 文案。

### 12.6 刷新清空问题补充

复核浏览器刷新后画布内容被清空的问题，定位为前端协作 Hook 过早进入 ready 状态：IndexedDB / 服务端内容尚未同步完成时，Excalidraw 会先以空场景挂载，随后 `onChange` 又把空场景写回 Yjs，导致刷新后内容被覆盖。

已完成修复：

- `frontend/src/hooks/useExcalidrawYjs.js`：初始化房间时先清空本地 React 状态并等待 IndexedDB 同步；如果 Yjs 仍为空，再尝试从服务端加载历史内容；最后才进入 ready 状态。
- `frontend/src/components/ExcalidrawEditor.jsx`：在协作数据未 ready 或正在回填场景时，忽略 Excalidraw 的 `onChange`，避免初始化空场景覆盖真实内容。
- 已重新执行 `npm run build`，构建通过；当前仅保留 Excalidraw 依赖自身的大包体积提示。

关于浏览器提示 `Unload event listeners are deprecated`：当前来源为 `@excalidraw/excalidraw` 依赖内部的 `components/App.tsx`，不是业务代码新增的监听。它属于 Chrome 对 unload/beforeunload 类监听的弃用提示，短期不影响画布保存；后续可通过升级 Excalidraw 或等待上游移除相关监听来彻底消除。

### 12.7 刷新丢数据二次修复

用户复测后仍出现“刷新后画布数据丢失”。继续检查后，补充修复两个刷新场景风险：

- `frontend/src/components/ExcalidrawEditor.jsx`：增加 `hydratingSceneRef`，在 Excalidraw 初次挂载后的短暂 hydration 窗口内忽略 `onChange`，避免首帧空场景写回 Yjs。
- `frontend/src/hooks/useExcalidrawYjs.js`：只有 IndexedDB 明确触发 `synced` 后才允许 fallback 进入 ready，避免本地持久化数据未读完就展示空画布。
- `frontend/src/hooks/useExcalidrawYjs.js`：新增变更后 2 秒防抖保存，并在 `pagehide` / `visibilitychange:hidden` 时用 `fetch({ keepalive: true })` 尝试刷新前冲刷一次服务端快照，降低刚编辑就刷新导致服务端未保存的概率。
- 已再次执行 `npm run build`，构建通过；仍仅有 Excalidraw chunk 体积警告。
