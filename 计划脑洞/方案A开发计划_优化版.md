# DrawWork 开发计划（方案A）

> 创建日期：2026-04-25  
> 目标：保留 DrawWork 的 Excalidraw 前端（手绘风 + 富媒体），引入 agema 的后端基础设施（用户认证 + SQLite + Minio）

---

## 一、架构目标

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (DrawWork)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Excalidraw 引擎 + 手绘风 + GIF/视频/思维导图/表格    │   │
│  │  React 18 + TypeScript（可选后期迁移）               │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  本地模式：localStorage(元数据) + IndexedDB(Yjs) + 本地文件   │
│  云端模式：JWT Token + REST API + WebSocket(Yjs) + Minio    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        后端 (Node.js)                        │
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

## 二、数据模型

### 2.1 数据库表结构

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 画板表
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 画布表（支持多画布）
CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);

-- 分享权限表
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('owner','editor','viewer','commenter')),
  created_at DATETIME DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- 画板内容表（Yjs 数据备份）
CREATE TABLE board_contents (
  id UUID PRIMARY KEY DEFAULT uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,  -- Base64 Yjs update
  created_at DATETIME DEFAULT NOW()
);

-- 画板访问记录（用于"最近访问"排序）
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

## 三、API 设计

### 3.1 认证

```
POST /api/auth/register
  Body: { username, email, password }
  Res: { success, token, refreshToken, user: { id, username, email } }

POST /api/auth/login
  Body: { username, password }
  Res: { success, token, refreshToken, user }

POST /api/auth/refresh
  Body: { refreshToken }
  Res: { success, token, refreshToken }

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
  // 记录访问，用于最近访问排序
```

### 3.3 画布

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
  Res: { content: "base64...", updated_at }

POST /api/boards/:id/content
  Body: { canvasId, content: "base64..." }
```

### 3.5 分享

```
POST /api/boards/:id/share
  Body: { user_id?, permission: 'editor'|'viewer'|'commenter' }
  // 不传 user_id 时生成公开分享链接

GET /api/boards/:id/shares

DELETE /api/boards/:id/shares/:shareId
```

### 3.6 文件上传

```
POST /upload
  Content-Type: multipart/form-data
  Fields: file, boardId, userId, type: 'image'|'video'|'gif'
  Res: { url: "/uploads/..." }
```

---

## 四、WebSocket 协作协议

### 4.1 roomId 设计

```
格式：board::{boardId}::{canvasId}

示例：board::550e8400-e29b-41d4-a716-446655440000::default
```

### 4.2 认证流程

```javascript
// WebSocket 连接时携带 token
const ws = new WebSocket(`ws://host:port/roomId?token=${jwtToken}`);

// 后端校验流程：
// 1. 从 URL 提取 token
// 2. 验证 JWT 有效性
// 3. 查询用户对画板的权限
// 4. 无权限则关闭连接 (code 1008)
// 5. 只读用户标记 ws.isReadonly = true
```

### 4.3 Yjs 持久化

- 监听 Yjs doc 的 `update` 事件
- 每 5 分钟自动保存完整 state 到 SQLite
- 服务器 graceful shutdown 时保存所有文档
- 新用户连接时从服务器加载初始 state

---

## 五、分阶段实施计划

### Phase 0：项目结构重组（2 天）

目标：建立清晰的前后端分离结构

```
drawwork/
├── frontend/                    # Excalidraw 前端
│   ├── src/
│   ├── package.json
│   └── ...
├── backend/                     # Node.js 后端
│   ├── src/
│   │   ├── server.js            # 主入口
│   │   ├── routes/              # API 路由
│   │   ├── models/              # Sequelize 模型
│   │   ├── middleware/          # 中间件
│   │   └── services/            # 业务服务
│   ├── package.json
│   └── database.sqlite
├── shared/                      # 共享类型定义（可选）
└── package.json                 # Workspace 配置
```

**任务清单：**
- [ ] 新建 `frontend/` 目录，迁移现有前端代码
- [ ] 新建 `backend/` 目录，搭建 Express 项目骨架
- [ ] 配置根目录 workspaces
- [ ] 统一前后端开发脚本

---

### Phase 1：后端基础设施（5 天）

#### Day 1：数据库模型 + 认证

- [ ] 定义所有 Sequelize 模型
- [ ] JWT 签发和校验工具（含 Refresh Token）
- [ ] Express JWT 中间件
- [ ] 注册/登录/刷新 Token API
- [ ] 认证接口限流保护

#### Day 2：画板 API

- [ ] 画板 CRUD API
- [ ] 画板权限校验中间件
- [ ] 创建画板时自动创建默认画布

#### Day 3：画布 API

- [ ] 画布 CRUD API
- [ ] 画布排序 API
- [ ] 画板级联删除处理

#### Day 4：分享 + 内容 API

- [ ] 分享 CRUD API
- [ ] 分享 Token 生成机制
- [ ] Yjs content 保存/读取 API

#### Day 5：文件上传 + Yjs WS

- [ ] Minio 客户端配置
- [ ] 文件上传 API（含本地 fallback）
- [ ] y-websocket 服务 + 认证注入
- [ ] Yjs 文档持久化

---

### Phase 2：前端认证集成（3 天）

#### Day 1：登录/注册页面

- [ ] 登录/注册表单组件
- [ ] 认证状态管理 Hook
- [ ] App 入口路由控制（未登录显示 Auth）

#### Day 2：JWT 集成

- [ ] 带 JWT 的 fetch 封装
- [ ] Token 过期自动刷新
- [ ] 刷新失败跳转登录

#### Day 3：未登录兼容

- [ ] 未登录用户使用本地模式
- [ ] Dashboard 双模式支持

---

### Phase 3：画板大厅云端化（5 天）

#### Day 1-2：Dashboard 改造

- [ ] 登录状态从 `/api/boards` 拉取
- [ ] 未登录状态从 localStorage 读取
- [ ] 画板封面、所有者信息、分享状态显示

#### Day 3-4：数据迁移向导

- [ ] 检测本地数据提示迁移
- [ ] 逐个迁移本地画板到云端
- [ ] 迁移进度条和错误处理

#### Day 5：分享功能改造

- [ ] 登录用户调用分享 API
- [ ] 分享链接格式统一

---

### Phase 4：Yjs 协作与权限整合（5 天）

#### Day 1-2：前端 Yjs Store 改造

- [ ] WebSocket URL 加 token 参数
- [ ] 连接状态 UI 提示
- [ ] 未登录用户使用无认证连接

#### Day 3-4：后端 WS 认证

- [ ] WebSocket 连接拦截
- [ ] URL token 读取与验证
- [ ] 画板权限校验
- [ ] 只读用户标记与前端锁定

#### Day 5：协作稳定性

- [ ] 断线重连测试
- [ ] 多画布切换时 provider 切换
- [ ] 权限动态变更处理

---

### Phase 5：富媒体存储迁移（3 天）

#### Day 1：上传接口改造

- [ ] 前端文件上传走新的 `/upload` API
- [ ] 上传时带 boardId 和 userId
- [ ] URL 格式保持兼容

#### Day 2：存量文件迁移

- [ ] 迁移脚本：本地文件上传到 Minio
- [ ] 更新数据库中的文件 URL

#### Day 3：富媒体适配

- [ ] GIF 动画测试
- [ ] 视频嵌入测试
- [ ] 思维导图和表格序列化测试

---

### Phase 6：优化与测试（5 天）

#### Day 1-2：离线模式测试

- [ ] 未登录用户创建/编辑/刷新测试
- [ ] 登录用户断网→联网自动同步测试
- [ ] 多画布切换存储独立性测试

#### Day 3：协作测试

- [ ] 多人同时编辑测试
- [ ] 分享链接协作测试
- [ ] 权限降级测试

#### Day 4：数据一致性测试

- [ ] 级联删除验证
- [ ] 服务器优先策略验证
- [ ] 大文件上传稳定性

#### Day 5：运维准备

- [ ] 数据库备份脚本
- [ ] 健康检查端点
- [ ] Graceful Shutdown
- [ ] 部署文档

---

## 六、风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| Yjs 房间隔离 | 多画布下权限校验复杂 | roomId 编码 boardId，WS 连接时提取校验 |
| Excalidraw 版本锁定 | 0.17.6 较旧，未来升级可能不兼容 | 锁定版本，后期评估升级 |
| IndexedDB → SQLite 迁移 | 数据格式不同 | 使用 `Y.encodeStateAsUpdate` 导出后 Base64 传输 |
| Minio 不可用 | 内网环境可能无 Minio | 降级到服务器本地磁盘 |
| JWT 泄露 | 分享链接带 token | Token 短期有效，支持手动撤销 |
| board_contents 膨胀 | 频繁保存导致数据量大 | 定期清理旧记录，每画布保留有限条数 |

---

## 七、里程碑与验收标准

| 阶段 | 周期 | 验收标准 |
|------|------|---------|
| Phase 0 | 2 天 | 项目结构清晰，`npm run dev` 能同时启动前后端 |
| Phase 1 | 5 天 | Postman 能跑通所有 API，数据库表创建正确 |
| Phase 2 | 3 天 | 能注册/登录/登出，未登录用户仍能本地使用 |
| Phase 3 | 5 天 | Dashboard 能从云端拉取画板，数据迁移成功 |
| Phase 4 | 5 天 | 协作连接带认证，权限校验生效，只读用户不能编辑 |
| Phase 5 | 3 天 | 文件上传到 Minio，GIF/视频正常播放 |
| Phase 6 | 5 天 | 所有测试场景通过，有回滚方案 |

**总周期：约 4 周（28 天）**

---

## 八、关键设计决策

### 8.1 内容保存策略

- 实时协作：Yjs 原生 CRDT 处理冲突
- 自动备份：每 canvas 保留最近 N 条快照
- 服务器优先：连接时以服务器数据为准，本地作为 fallback

### 8.2 公开分享机制

- 公开画板：无需认证即可访问
- 私密画板分享：生成短期有效的 shareToken
- 分享链接格式：`http://host/?room={roomId}&token={shareToken}`

### 8.3 本地/云端双模式

- 未登录：localStorage + IndexedDB，无协作
- 已登录：SQLite + WebSocket，支持协作
- 数据迁移：提供一键迁移向导

---

*文档版本: v2.0*  
*更新日期: 2026-04-25*
