# DrawWork 核心功能实施计划

> **For agentic workers:** Use subagent-driven-development or executing-plans.

**Goal:** 打通端到端数据流：创建画板 → 创建画布 → 编辑器中 Excalidraw 编辑 → Yjs 实时同步 → PostgreSQL 自动快照保存
**Architecture:** Node.js Express REST API + React Vite SPA + Yjs WebSocket + PostgreSQL + Redis
**Tech Stack:** React 18, Zustand, Axios, Excalidraw 0.17.6, Yjs, y-websocket, Express, Sequelize, PostgreSQL, Redis

---

## Phase 1: 后端核心 API

### 1.1 画板路由 (`/api/boards`)
- `GET /api/boards` — 获取用户画板列表（含画布数量、最近访问）
- `POST /api/boards` — 创建画板，自动创建默认 excalidraw 画布
- `PUT /api/boards/:id` — 更新画板信息
- `DELETE /api/boards/:id` — 软删除画板
- `GET /api/boards/:id/canvases` — 获取画板下画布列表
- `POST /api/boards/:id/canvases` — 创建画布（指定 type）

### 1.2 画布路由 (`/api/canvases`)
- `GET /api/canvases/:id` — 获取画布详情
- `PUT /api/canvases/:id` — 更新画布（名称、排序）
- `DELETE /api/canvases/:id` — 删除画布（至少保留一个）

### 1.3 分享路由 (`/api/shares`)
- `POST /api/boards/:id/shares` — 邀请用户
- `DELETE /api/boards/:id/shares/:userId` — 移除协作者
- `POST /api/boards/:id/tokens` — 生成分享链接
- `DELETE /api/boards/:id/tokens/:tokenId` — 撤销分享链接
- `GET /api/shares/validate` — 验证分享 token

### 1.4 权限中间件修复
- `permission.js` 中 `board.owner_id` 是 UUID 对象，需用 `.toString()` 比较
- 所有需要权限校验的路由挂载正确的 middleware 链

### 1.5 服务层封装
- `services/notification.js` — Redis pub/sub 封装（评论/投票/通知事件）
- `services/storage.js` — Minio 存储服务封装（文件上传/获取 URL）

---

## Phase 2: 前端骨架

### 2.1 基础设施
- 安装 zustand
- `lib/axios.js` — Axios 实例，自动附加 Authorization header
- `lib/constants.js` — API 路径常量
- `hooks/useAuth.js` — 认证 hook

### 2.2 Zustand 状态管理
- `stores/authStore.js` — token、user、login、logout
- `stores/boardStore.js` — boards、fetch、create、delete
- `stores/canvasStore.js` — canvases、currentCanvas、fetch、create、delete

### 2.3 Dashboard 页面
- `pages/DashboardPage.jsx` — 画板卡片网格
- `components/Dashboard/BoardCard.jsx` — 单个画板卡片（封面、名称、画布数）
- `components/Dashboard/BoardModal.jsx` — 新建/编辑画板弹窗

### 2.4 Editor 页面
- `pages/EditorPage.jsx` — 编辑器布局（顶部栏 + 侧边画布列表 + 主编辑区）
- `components/Editor/CanvasSwitcher.jsx` — 画布标签切换
- `components/Editor/ExcalidrawWrapper.jsx` — Excalidraw 组件封装

---

## Phase 3: Yjs 文档持久化

### 3.1 后端 Yjs 服务增强
- 连接时从 PostgreSQL `yjs_snapshots` 加载最新 snapshot
- 定时保存 `Y.encodeStateAsUpdate(doc)` 到数据库
- 新客户端连接时先推送 snapshot 再接入实时更新

### 3.2 前端 Yjs 集成
- `hooks/useYjs.js` — Yjs WebSocket 连接管理
- EditorPage 中根据当前画布 `yjs_room_id` 建立连接
- 画布切换时断开旧 room、连接新 room

---

## 验证检查点

- [ ] `POST /api/auth/register` + `POST /api/auth/login` 正常工作
- [ ] `POST /api/boards` 创建画板，自动创建默认画布
- [ ] `GET /api/boards` 返回画板列表
- [ ] `GET /api/boards/:id/canvases` 返回画布列表
- [ ] Dashboard 页面显示画板卡片，可新建画板
- [ ] 点击画板进入 Editor，显示画布标签
- [ ] Excalidraw 正常加载，可绘制
- [ ] 两个浏览器窗口打开同一画布，操作实时同步
- [ ] Yjs snapshot 每 30 秒写入 PostgreSQL
- [ ] 刷新页面后内容从 snapshot 恢复
