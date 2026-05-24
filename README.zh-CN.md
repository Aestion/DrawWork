<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express" alt="Express 4.x" />
  <img src="https://img.shields.io/badge/Yjs-13.x-FF6600" alt="Yjs 13.x" />
  <img src="https://img.shields.io/badge/Sequelize-6.x-52B0E7" alt="Sequelize 6.x" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite" alt="Vite 5" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

<h1 align="center">🎨 DrawWork</h1>
<p align="center"><strong>协同在线白板 — 画图、思维导图、看板、泳道图等</strong></p>

<p align="center">
  基于 <strong>React + Excalidraw + Yjs</strong> 构建的实时协同白板平台。
  支持手绘、富媒体、多种思维导图引擎、结构化图表工具以及实时多人协作。
</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

---

## ✨ 功能特性

### 🖌️ 画图与媒体
- **Excalidraw 驱动**的白板，手绘风格元素
- 图形：矩形、菱形、椭圆、箭头、线、铅笔、文本
- **富媒体**：图片、动图 GIF（自动播放）、视频（自动循环）、音频（点击播放）
- 拖拽上传 & 剪贴板粘贴图片
- 导出为 **PNG、SVG、JSON**

### 🧠 结构化工具
| 工具 | 引擎 | 亮点 |
|------|------|------|
| **Excalidraw** | @excalidraw/excalidraw | 自由手绘、图形、富媒体、手绘风格 |
| **思维导图** | React Flow / MindElixir / SimpleMindMap / JsMind / Markmap / Tencent | 多根节点、跨树连线、分支折叠、Markdown 导入导出、自动布局、搜索、撤销/重做 |
| **腾讯思维导图** | Tencent Mind Map Engine | 右键菜单、标记系统（10 种）、协同光标、Yjs 同步 |
| **看板** | 自定义 React | 列 + 卡片拖拽、列排序、删除 3 秒撤回 |
| **泳道图** | 自定义 React | 水平/垂直泳道、元素拖拽、箭头连线 |

### 👥 实时协作
- **Yjs CRDT** 无冲突实时同步，覆盖所有工具类型
- 多光标显示 + 用户名、在线用户列表
- 按画布隔离 Yjs 房间（独立的协作空间）
- WebSocket 断线时的 HTTP 回退同步

### 💬 沟通
- **评论**：画布上可定位锚点、 threaded 回复、@提及
- **投票**：在画布元素上创建投票、实时计票、匿名模式
- **快照**：手动版本保存和恢复

### 🔒 安全与权限控制
- JWT 认证（access + refresh 令牌）
- 4 级权限：**所有者 > 编辑者 > 评论者 > 查看者**
- 通过用户邀请或分享链接共享（支持过期时间和使用次数限制）
- 文件上传 MIME 类型 + 文件头魔数双重校验
- 生产环境限流、CORS 白名单、helmet 安全头

---

## 🏗️ 技术栈

| 层 | 技术 |
|-------|-----------|
| **前端** | React 18, Vite 5, Tailwind CSS, Zustand |
| **画图** | @excalidraw/excalidraw 0.17.x |
| **思维导图** | @xyflow/react 12.x, MindElixir 5.x, SimpleMindMap, 腾讯思维导图引擎 |
| **后端** | Node.js 20, Express 4.x |
| **ORM** | Sequelize 6.x（SQLite / PostgreSQL） |
| **协作** | Yjs 13.x, y-websocket 2.x |
| **数据库** | SQLite（开发）/ PostgreSQL 15（生产） |
| **缓存** | Redis 7（可选，多实例 Yjs） |
| **文件存储** | MinIO / 本地文件系统 |
| **反向代理** | Nginx（Alpine） |
| **容器化** | Docker + Docker Compose |
| **测试** | Vitest, Jest, Playwright, PyAutoGUI |

---

## 📁 项目结构

```
drawwork/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard/    # BoardCard, BoardModal
│   │   │   ├── Editor/       # ExcalidrawWrapper, TencentMindEditor, MindMapEditor,
│   │   │   │                # KanbanEditor, SwimlaneEditor, MindElixirEditor,
│   │   │   │                # SimpleMindMapEditor, CommentsOverlay, SharePanel,
│   │   │   │                # VersionHistory, VotePanel, CanvasSidebar
│   │   │   ├── Notifications/# NotificationBell, NotificationCenter
│   │   │   └── ui/          # Toast, SyncIndicator, Skeleton, LoadingButton
│   │   ├── hooks/           # useYjs, useTencentMindYjs, useMindMapYjs,
│   │   │                   # useKanbanYjs, useSwimlaneYjs, useComments, useVotes
│   │   ├── lib/             # axios, constants, imageUtils, tencent-mind-utils,
│   │   │                   # marker-icons, kanban, swimlane, unbalanced-layout-plugin
│   │   ├── pages/           # AuthPage, DashboardPage, EditorPage, ShareRedirectPage
│   │   ├── stores/          # authStore, boardStore, canvasStore（Zustand）
│   │   ├── App.jsx          # 路由配置
│   │   └── main.jsx         # 入口
│   └── package.json
├── backend/                   # Node.js + Express REST API
│   ├── src/
│   │   ├── config/          # database.js, minio.js, redis.js
│   │   ├── middleware/      # auth.js（JWT）, permission.js（4 级权限）
│   │   ├── models/          # 19 个 Sequelize 模型（User, Board, Canvas, TencentMind 等）
│   │   ├── routes/          # 10 个路由模块（auth, boards, canvases, comments, votes 等）
│   │   ├── utils/           # jwt.js, db.js, notificationService.js
│   │   ├── __tests__/       # 14 个测试文件（Jest + Supertest）
│   │   └── app.js           # Express 入口
│   ├── Dockerfile
│   └── package.json
├── yjs-server/                # 独立的 Yjs WebSocket 服务器
│   ├── src/server.js         # 带 JWT 认证 + DB 持久化的 WebSocket 服务器
│   ├── Dockerfile
│   └── package.json
├── config/                    # 基础设施配置
│   ├── docker-compose.yml   # 6 个服务：nginx, api, yjs, postgres, redis, minio
│   ├── nginx.conf           # 反向代理配置
│   ├── init.sql             # 数据库模式（18+ 张表）
│   ├── Dockerfile           # Nginx 构建
│   └── .env.example         # 环境变量模板
├── scripts/                  # 运维脚本
│   ├── deploy.sh            # 一键部署
│   ├── backup.sh            # 数据库 + 文件备份
│   ├── update.sh            # Git 拉取 + 重建 + 重启
│   ├── init-user.js         # 用户初始化
│   └── start-dev.ps1        # 本地开发启动（PowerShell）
├── test/                     # 多层级测试
│   ├── level1-playwright/   # Playwright E2E 测试
│   ├── level2-pyautogui/    # PyAutoGUI GUI 自动化测试
│   ├── mixed/               # 混合集成测试
│   └── TEST-CATALOG.md      # 测试目录索引
├── docs/                     # 文档
│   ├── Cwork_docs/          # 中文开发文档包（需求、架构、数据库设计等）
│   └── superpowers/         # 设计规格和实现计划
├── Makefile                  # Docker 部署命令
├── start-dev.sh              # 开发环境启动脚本（Bash）
└── stop-dev.sh               # 开发环境停止脚本
```

---

## 🚀 快速开始（开发模式）

### 前提条件
- Node.js 20 LTS+
- npm 9+

### 安装与运行

```bash
# 1. 克隆
git clone https://github.com/Aestion/DrawWork.git
cd drawwork

# 2. 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd yjs-server && npm install && cd ..

# 3. 启动所有服务
# 方式 A：一键启动
./start-dev.sh            # Linux/macOS/Git Bash
.\scripts\start-dev.ps1   # Windows PowerShell

# 方式 B：手动启动（3 个终端）
# 终端 1 - 后端 API
cd backend && npm run dev
# 终端 2 - Yjs 服务器
cd yjs-server && node src/server.js
# 终端 3 - 前端
cd frontend && npm run dev

# 4. 浏览器访问
# 前端：    http://localhost:5173
# API：     http://localhost:3000
```

### 默认账号

首次启动（或数据库初始化）后，使用：
- **用户名**：`admin`
- **密码**：`admin123`

> **生产环境请务必修改默认密码！**

---

## 🐳 Docker 部署

```bash
# 构建并启动所有服务
make up

# 或直接使用 docker-compose
cd config
docker compose up -d --build

# 查看状态
make status

# 查看日志
make logs

# 访问
open http://localhost
```

### Docker 服务

| 服务 | 端口 | 描述 |
|---------|------|-------------|
| `nginx` | 80/443 | 反向代理 + 静态文件服务 |
| `api` | 3000 | Express REST API |
| `yjs` | 3001 | Yjs WebSocket 协作服务 |
| `postgres` | 5432 | PostgreSQL 数据库 |
| `redis` | 6379 | 缓存 & 发布/订阅 |
| `minio` | 9000/9001 | 文件存储 / 控制台 |
| `adminer` | 8080 | 数据库管理工具（profile: admin） |

### Makefile 命令

| 命令 | 描述 |
|---------|-------------|
| `make up` | 启动所有服务 |
| `make down` | 停止所有服务 |
| `make build` | 构建所有 Docker 镜像 |
| `make rebuild` | 无缓存重建 |
| `make logs` | 查看所有服务日志 |
| `make status` | 容器状态 |
| `make admin` | 启动 Adminer（数据库管理工具） |
| `make backup` | 执行数据库备份 |
| `make check` | 系统健康检查 |

---

## 📋 API 概览

REST API 涵盖以下模块：

| 模块 | 端点 | 认证 |
|--------|-----------|------|
| 认证 | `POST /api/auth/register, login, refresh, logout` + `GET /api/auth/me` | 公开 / Token |
| 面板 | `GET/POST/PUT/DELETE /api/boards[/:id]` + canvases | JWT + 权限 |
| 画布 | `GET/PUT/DELETE /api/canvases/:id` | JWT + 权限 |
| 评论 | `GET/POST /api/canvases/:id/comments` + replies/resolve | JWT + 权限 |
| 投票 | `POST /api/canvases/:id/votes` + records/close/results | JWT + 权限 |
| 快照 | `GET/POST /api/canvases/:id/snapshot[s]` | JWT + 权限 |
| 结构化工具 | `GET/PUT /api/canvases/:id/{mindmap,kanban,swimlane,tencentMind}` | JWT + 权限 |
| 分享 | `POST/DELETE /api/boards/:id/{shares,tokens}` + `GET /api/shares/validate` | JWT + 权限 |
| 通知 | `GET/PUT /api/notifications` | JWT |
| 上传 | `POST /api/upload` + `GET /api/upload/:id` | JWT + 权限 |
| 管理 | `GET/PUT /api/admin/users` + `POST /api/admin/backup` | Admin |
| 健康检查 | `GET /health` | 公开 |

详见 [03_技术架构.md](DrawWork_开发文档包/03_技术架构.md) 完整 API 表。

---

## 🧪 测试

### 后端测试（Jest + Supertest）
```bash
cd backend
npm test
```
14 个测试文件覆盖：认证、面板、画布、评论、分享、分享校验、快照、投票、通知、上传、WebSocket、结构化工具和管理员。

### 前端单元测试（Vitest）
```bash
cd frontend
npm run test:unit    # Vitest 单元测试
```
覆盖：状态管理（authStore、boardStore、canvasStore）、Hook（useYjs、useTencentMindYjs、useKanbanYjs、useSwimlaneYjs、useMindMapYjs）、工具函数（tencent-mind-utils、kanban、swimlane）和组件（ExcalidrawWrapper、TencentMindEditor、MindMapEditor）。

### Playwright E2E（浏览器自动化）
```bash
cd frontend
npm run test:e2e     # 需要先启动开发服务器
```
测试用例位于 `test/level1-playwright/specs/`：
- **思维导图**：协作、切换、功能、基本操作
- **腾讯思维导图**：协作、基本操作
- **画布**：轮询、结构化画布协作
- **核心**：认证、仪表盘、编辑器、协作、实时同步
- **媒体**：媒体上传、拖拽、媒体类型
- **其他**：安全、分享、分享链接、快捷键、激光笔、鼠标交互、持久化、工具同步、工作流、yjs 诊断

### PyAutoGUI（GUI 自动化）
```
test/level2-pyautogui/excalidraw/
```
测试：拖拽、绘图、操作、快捷键、文本、工具、撤销/重做。

### 混合集成测试
```
test/mixed/
```
测试：协作、离线重连、分享权限。

---

## 🔑 环境变量

主要配置项（完整列表见 `config/.env.example`）：

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:./dev.db` | 数据库连接（sqlite: 前缀 = SQLite） |
| `JWT_SECRET` | （必填） | JWT 签名密钥（至少 32 字符） |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接地址 |
| `MINIO_ENDPOINT` | `localhost` | MinIO 服务器地址 |
| `UPLOAD_MAX_SIZE` | `104857600` | 最大上传大小（100MB） |

---

## 📊 架构要点

### 实时协作
```
用户 A ←→ Yjs Doc ←→ y-websocket ←→ Yjs Server ←→ Database
                                  ↕                    ↕
用户 B ←→ Yjs Doc ←→ y-websocket ↕            每 10 秒自动保存
                                  ↕
                          Redis pub/sub（多实例支持）
```

每种结构化工具（Excalidraw、思维导图、腾讯思维导图、看板、泳道图）都有独立的 Yjs 文档类型，支持独立实时同步。

### 权限等级
```
所有者 (4) > 编辑者 (3) > 评论者 (2) > 查看者 (1)
```

每个操作面板/画布资源的 API 端点都会检查：
1. JWT 认证（中间件）
2. 面板级权限（通过 `board_shares` 或 `owner_id`）
3. 操作所需的最低权限等级

### 文件上传安全
1. MIME 类型白名单检查
2. 文件头魔数签名验证
3. 上传至 MinIO（或本地文件系统回退）
4. 数据库中存储为 `/api/upload/:id` 路径（无直接公开访问）

---

## 🗺️ 开发路线

| 优先级 | 功能 | 状态 |
|----------|---------|--------|
| P1 | 画布计时器组件 | ⬜ 计划中 |
| P1 | 面板封面图片 | ⬜ 计划中 |
| P2 | 面板搜索与筛选 | ⬜ 计划中 |
| P2 | 回收站 | ⬜ 计划中 |
| P2 | 大型画布虚拟化 | ⬜ 计划中 |

---

## 📄 许可证

本项目基于 MIT License 开源。

---

## 🤝 贡献

欢迎提交 Pull Request！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m 'Add amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request
