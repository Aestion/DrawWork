# DrawWork

DrawWork 是一个在线协作白板工具，支持手绘白板、思维导图、看板、泳道图、评论、投票、分享权限和实时协同。

## 快速入口

| 你要做什么 | 从这里开始 |
|------------|------------|
| 正式部署 | [生产部署检查清单](./docs/deployment/production-checklist.md) |
| Docker 部署细节 | [Docker 部署指南](./docs/deployment/docker-deploy.md) |
| 日常运维 | [运维手册](./docs/deployment/operations-runbook.md) |
| 本地开发 | [本地开发指南](./docs/development/local-dev.md) |
| 跑测试 | [测试指南](./docs/development/testing.md) |
| 看架构 | [系统概览](./docs/architecture/overview.md) |
| 查全部文档 | [文档入口](./docs/README.md) |

## 代码结构

```text
DrawWork/
├── frontend/       # React + Vite 前端应用
├── backend/        # Express REST API
├── yjs-server/     # Yjs WebSocket 实时协同服务
├── deploy/         # 正式部署入口
├── scripts/        # 本地开发和辅助脚本
├── docs/           # 按角色整理后的文档
├── test/           # Playwright、PyAutoGUI、集成测试
├── data/           # 运行期数据，不提交 Git
├── logs/           # 运行期日志，不提交 Git
└── backups/        # 备份文件，不提交 Git
```

`config/` 已不再作为正式部署配置目录。部署相关内容统一放在 `deploy/`。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18, Vite 5, Tailwind CSS, Zustand |
| 手绘白板 | Excalidraw |
| 结构化工具 | Tencent Mind Map Engine, React Flow, MindElixir, 自定义看板和泳道图 |
| 后端 | Node.js 20, Express 4, Sequelize |
| 数据库 | SQLite（开发）/ PostgreSQL 15（生产） |
| 实时协同 | Yjs, WebSocket |
| 文件存储 | MinIO / 本地文件系统 |
| 部署 | Docker Compose, Nginx |
| 测试 | Jest, Vitest, Playwright, PyAutoGUI |

## 本地开发

```bash
cd backend && npm install && cd ..
cd yjs-server && npm install && cd ..
cd frontend && npm install && cd ..
```

Windows PowerShell：

```powershell
.\scripts\start-dev.ps1
```

手动启动：

```bash
cd backend && npm run dev
cd yjs-server && npm run dev
cd frontend && npm run dev
```

访问：

- 前端：`http://localhost:5173`
- API：`http://localhost:3000`
- Yjs：`ws://localhost:3001`

## 正式部署

```bash
cp deploy/env/.env.example deploy/.env
vim deploy/.env
make build
make up
make check
```

访问：

- 应用入口：`http://localhost`
- MinIO API：`http://localhost:9000`
- MinIO 控制台：`http://localhost:9001`
- Adminer：`make admin` 后访问 `http://localhost:8080`

## 常用命令

| 命令 | 说明 |
|------|------|
| `make up` | 启动生产部署服务 |
| `make down` | 停止生产部署服务 |
| `make status` | 查看容器状态 |
| `make logs` | 查看日志 |
| `make backup` | 备份数据库、文件和部署配置 |
| `make check` | 健康检查 |

## 默认账号

首次初始化后默认管理员账号：

- 用户名：`admin`
- 密码：`admin123`

生产环境首次登录后必须立即修改默认密码。

