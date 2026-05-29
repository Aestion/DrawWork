# DrawWork 项目概述

## 项目简介

DrawWork 是一款面向团队使用的在线协作白板工具，基于 Excalidraw 引擎开发，支持手绘风格、富媒体内容、结构化工具（思维导图/泳道图/看板）和实时多人协作。

## 核心功能

| 模块 | 功能描述 |
|------|----------|
| **画板** | 用户可创建多个画板，自定义命名，支持封面设置 |
| **画布** | 每个画板可包含多个画布，自定义命名，支持四种类型选择 |
| **分享** | 以画板为单位分享，权限分为编辑者/查看者/评论者 |
| **手绘** | Excalidraw 原生手绘功能，支持多种图形和样式 |
| **媒体** | 支持图片、GIF（自动循环）、视频（自动循环）、音频（点击播放） |
| **思维导图** | 基于 React Flow 构建，支持多根节点、跨树连接、Markdown 导入导出 |
| **泳道图** | 支持水平/垂直泳道，元素拖拽和箭头连接 |
| **看板** | 支持多列任务管理，拖拽移动卡片 |
| **评论** | 在画布任意位置添加评论，支持回复和 @ 提及 |
| **投票** | 支持对画布内容发起投票，实时计票 |
| **协作** | 多人实时协作，基于 Yjs CRDT 同步 |
| **通知** | 站内通知系统，分享邀请、评论回复等实时推送 |

## 部署方式

支持 Docker Compose 一键部署，默认 SQLite 开发模式，生产环境切换 PostgreSQL + Minio + Redis。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React + Vite + Tailwind CSS | 18 / 5 |
| 手绘引擎 | @excalidraw/excalidraw | 0.17.6 |
| 流程图引擎 | @xyflow/react (React Flow) | 12.x |
| 后端 | Node.js + Express | 20 LTS |
| ORM | Sequelize | 6.x |
| 实时协作 | Yjs + y-websocket | 13.x / 2.x |
| 数据库 | SQLite（开发）/ PostgreSQL 15（生产） | - |
| 缓存 | Redis 7（可选，用于多实例扩展） | 7 |
| 文件存储 | Minio / 本地文件系统 | 最新版 |
| 状态管理 | Zustand | 5.x |
| 反向代理 | Nginx (Alpine) | 最新版 |
| 容器化 | Docker + Docker Compose | - |

## 项目结构

```
DrawWork/
├── frontend/                     # 前端代码 (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard/       # 画板卡片、创建弹窗
│   │   │   ├── Editor/          # 编辑器组件（Excalidraw/思维导图/看板/泳道图）
│   │   │   ├── Notifications/   # 通知组件
│   │   │   └── ui/             # 通用 UI 组件
│   │   ├── hooks/              # 自定义 Hooks (useYjs, useComments, 等)
│   │   ├── lib/                # 工具库 (axios, constants, imageUtils)
│   │   ├── pages/              # 页面 (Auth, Dashboard, Editor, ShareRedirect)
│   │   ├── stores/             # Zustand 状态管理
│   │   ├── App.jsx             # 路由配置
│   │   └── main.jsx            # 入口
│   └── package.json
├── backend/                      # 后端 API 服务
│   ├── src/
│   │   ├── config/             # 数据库、Minio、Redis 配置
│   │   ├── routes/             # API 路由 (auth/boards/canvases/votes 等)
│   │   ├── models/             # Sequelize 数据模型 (20 个模型)
│   │   ├── middleware/         # 认证、权限中间件
│   │   ├── utils/              # 工具 (JWT, DB, NotificationService)
│   │   └── app.js              # Express 入口
│   ├── Dockerfile
│   └── package.json
├── yjs-server/                   # Yjs WebSocket 协作服务器
│   ├── src/server.js           # WebSocket 服务器入口
│   ├── Dockerfile
│   └── package.json
├── deploy/                       # 正式部署入口
│   ├── docker-compose.yml      # Docker 编排
│   ├── nginx/                  # Nginx 镜像和反向代理配置
│   ├── database/               # PostgreSQL 初始化脚本
│   ├── env/                    # 环境变量模板
│   └── scripts/                # 部署、更新、备份脚本
├── scripts/                      # 本地开发和辅助脚本
│   └── start-dev.ps1           # 本地开发启动脚本 (PowerShell)
├── docs/                         # 文档入口、部署、开发、架构和归档
├── test/                         # E2E 测试
├── DrawWork_开发文档包/          # 旧文档包迁移提示
└── CLAUDE.md                     # Claude Code 项目指引
```

## 快速开始（本地开发）

```bash
# 1. 克隆项目
git clone https://github.com/Aestion/DrawWork.git
cd DrawWork

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install
cd ../yjs-server && npm install
cd ..

# 3. 启动开发环境（或使用一键脚本）
./scripts/start-dev.ps1

# 单独启动：
# 后端: cd backend && npm run dev
# 前端: cd frontend && npm run dev
# Yjs:  cd yjs-server && node src/server.js

# 4. 访问
# 前端: http://localhost:5173
# API:  http://localhost:3000
```

## Docker 部署

```bash
# 部署
cp deploy/env/.env.example deploy/.env
make up

# 访问
# http://localhost
```

## 默认账号

系统初始化后自动创建管理员账号：
- 用户名：`admin`
- 密码：`admin123`

**请首次登录后立即修改密码！**

## 系统要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2核 | 4核+ |
| 内存 | 4GB | 8GB+ |
| 磁盘 | 50GB SSD | 100GB+ SSD |
| 网络 | 内网千兆 | 内网千兆 |
| Docker | 20.10+ | 24.0+ |

## 文档索引

1. [文档入口](../README.md)
2. [生产部署检查清单](../deployment/production-checklist.md)
3. [Docker 部署指南](../deployment/docker-deploy.md)
4. [运维手册](../deployment/operations-runbook.md)
5. [技术架构](./api-and-system.md)
6. [数据库设计](./database.md)

---

*文档版本: v2.0*  
*更新日期: 2026-05-18*
