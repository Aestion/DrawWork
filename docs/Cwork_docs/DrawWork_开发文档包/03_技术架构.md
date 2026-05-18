# DrawWork 技术架构文档

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
│                   Chrome / Edge / Firefox                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    部署服务器 / 本地开发                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     Nginx (80) [生产]                       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │ │
│  │  │  静态文件    │  │  API 代理   │  │  WebSocket 代理  │    │ │
│  │  │  /dist      │  │  /api/*     │  │  /ws            │    │ │
│  │  └─────────────┘  └──────┬──────┘  └────────┬────────┘    │ │
│  └──────────────────────────┼───────────────────┼───────────┘ │
│                             │                   │              │
│         ┌───────────────────┼───────────────────┘              │
│         ▼                   ▼                                  │
│  ┌──────────────┐   ┌──────────────┐                          │
│  │  API 服务    │   │  Yjs 服务    │                          │
│  │  Express     │   │  WebSocket   │                          │
│  │  Port: 3000  │   │  Port: 3001  │                          │
│  └──────┬───────┘   └──────┬───────┘                          │
│         │                  │                                   │
│         ▼                  ▼                                   │
│  ┌──────────────┐   ┌──────────────┐                          │
│  │  数据库      │   │  文件存储    │                          │
│  │  SQLite 或   │   │  本地文件    │                          │
│  │  PostgreSQL  │   │  或 Minio   │                          │
│  └──────────────┘   └──────────────┘                          │
│         │                                                     │
│         ▼ (可选)                                              │
│  ┌──────────────┐                                             │
│  │    Redis     │  ← 多实例 Yjs 扩展 + 限流                   │
│  └──────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

## 二、组件说明

### 2.1 Nginx（反向代理，仅生产环境）

**职责**：
- 提供前端静态文件服务
- API 请求转发到 Node.js 后端
- WebSocket 连接转发到 Yjs 服务
- 负载均衡（多实例时）
- SSL/TLS 终端（如需 HTTPS）

**关键配置**：
```nginx
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
location /api/ { proxy_pass http://api:3000/; }
location /ws {
    proxy_pass http://yjs:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 2.2 API 服务（Node.js + Express）

**职责**：
- 用户认证（JWT，支持 access + refresh token）
- 画板/画布 CRUD（支持 4 种画布类型）
- 分享管理（用户邀请 + 分享链接）
- 文件上传（Minio 或本地文件系统）
- 评论系统（定位锚点 + 线程回复）
- 投票系统（创建/参与/计票）
- 思维导图/看板/泳道图数据接口
- 版本快照管理
- 通知系统
- 管理员接口

**技术栈**：
- Node.js 20 LTS
- Express 4.x
- Sequelize ORM（支持 SQLite + PostgreSQL）
- bcryptjs（密码加密）
- jsonwebtoken（JWT）
- multer（文件上传处理）
- minio（Minio SDK）
- ioredis（Redis 客户端）
- helmet + cors（安全）
- express-rate-limit（限流）

### 2.3 Yjs 服务（WebSocket）

**职责**：
- 实时协作同步（Excalidraw / 思维导图 / 看板 / 泳道图 CRDT）
- Yjs 文档管理与持久化（PostgreSQL 或 SQLite）
- 权限验证（连接时校验 JWT + 画板权限）
- 自动快照保存（每 10 秒 + 最后用户断开时）
- 快照轮转（保留最新 5 个自动快照）
- 多实例扩展（可选 Redis pub/sub）

**技术栈**：
- Node.js 20 LTS
- y-websocket
- yjs
- ws (WebSocket 库)
- pg / sqlite3（持久化）

### 2.4 数据库

**开发环境**：SQLite（文件存储，零配置）
- 数据库文件：`backend/dev.db`
- ORM 自动同步表结构

**生产环境**：PostgreSQL 15
- 通过 Docker 运行
- 18 张表 + 索引 + 触发器
- 通过 init.sql 初始化

**ORM**：Sequelize 6.x（双数据库兼容）

### 2.5 Redis（可选）

**职责**：
- Yjs 多实例同步（pub/sub）
- API 限流计数
- WebSocket 连接状态

**版本**：Redis 7

### 2.6 Minio / 本地文件存储

**职责**：
- 图片/视频/音频文件存储
- 画板封面存储

**说明**：
- Docker 部署时使用 Minio
- 本地开发时回退到本地文件系统

## 三、数据流

### 3.1 用户认证流程

```
用户登录 → POST /api/auth/login
  → API 验证密码（bcryptjs）
  → 生成 JWT Access Token (24h) + Refresh Token (7d)
  → 返回给前端

后续请求：Authorization: Bearer <token>
  → authMiddleware 解码 JWT → 设置 req.user
```

### 3.2 实时协作流程

```
用户 A 操作 ←→ Yjs 本地 Doc 更新
  → y-websocket 发送 update 到 Yjs 服务器
  → Yjs 服务器广播到同房间其他用户
  → 用户 B 的 Yjs Doc 合并更新
  → Excalidraw / React Flow 重新渲染

持久化：
  → 每 10 秒 Yjs 服务器保存快照到数据库
  → 最后用户断开时立即保存
```

### 3.3 文件上传流程

```
用户选择文件
  → 前端验证类型和大小
  → POST /api/upload (multipart/form-data)
  → multer 接收文件
  → MIME + 魔数验证
  → 上传到 Minio（或本地文件系统）
  → 创建 File 数据库记录
  → 返回文件 ID 和访问 URL
```

### 3.4 评论系统流程

```
用户 A 添加评论
  → POST /api/canvases/:id/comments { content, x, y }
  → API 写入数据库
  → 创建通知（如 @ 提及）
  → 返回评论数据
  → 前端通过 REST 获取最新评论列表
```

### 3.5 投票系统流程

```
主持人创建投票 → POST /api/canvases/:id/votes
  → 参与者提交投票 → POST /api/votes/:id/records
  → API 更新数据库 + 防重复投票
  → 实时计票通过 REST 轮询
  → 主持人关闭投票 → PUT /api/votes/:id/close
```

## 四、安全设计

### 4.1 认证安全

- **JWT Token**：HS256 签名
- **Access Token**：24 小时过期
- **Refresh Token**：7 天过期，不能用于 API 访问
- **密码加密**：bcryptjs
- **生产环境限流**：全局 100 次/15 分钟，认证 5 次/15 分钟

### 4.2 权限控制

| 层级 | 控制方式 |
|------|----------|
| API 层 | JWT 验证 + 权限检查中间件 |
| WebSocket | 连接时验证 Token + 画板权限 |
| 权限等级 | owner(4) > editor(3) > commenter(2) > viewer(1) |

### 4.3 数据安全

- **文件验证**：MIME 类型白名单 + 文件头魔数校验
- **分享 Token**：SHA256 哈希存储
- **CORS**：白名单机制
- **安全头**：helmet 中间件（CSP, XSS, Frame 等）

## 五、扩展性设计

### 5.1 水平扩展

```
                    ┌──────────────┐
                    │    Nginx     │
                    │  ip_hash     │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │ Yjs 1   │    │ Yjs 2   │    │ Yjs 3   │
      └────┬────┘    └────┬────┘    └────┬────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌──────────────┐
                    │    Redis     │
                    │  pub/sub     │
                    └──────────────┘
```

## 六、API 接口总览（41 个端点）

### 认证 (5)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| POST | /api/auth/refresh | 刷新 Token |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/me | 获取当前用户 |

### 画板 (11)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/boards | 获取用户画板列表（含协作者和公开画板） |
| POST | /api/boards | 创建画板（自动创建默认画布） |
| GET | /api/boards/:id | 获取画板详情（含协作者和分享链接） |
| PUT | /api/boards/:id | 更新画板信息 |
| DELETE | /api/boards/:id | 软删除画板 |
| GET | /api/boards/:id/canvases | 获取画板下画布列表 |
| POST | /api/boards/:id/canvases | 创建画布 |
| POST | /api/boards/:id/shares | 邀请用户 |
| DELETE | /api/boards/:id/shares/:userId | 移除协作者 |
| POST | /api/boards/:id/tokens | 生成分享链接 |
| DELETE | /api/boards/:id/tokens/:tokenId | 撤销分享链接 |

### 画布 (13)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/canvases/:id | 获取画布详情 |
| PUT | /api/canvases/:id | 更新画布 |
| DELETE | /api/canvases/:id | 删除画布（至少保留一个） |
| GET | /api/canvases/:id/comments | 获取画布评论列表 |
| POST | /api/canvases/:id/comments | 添加评论 |
| GET | /api/canvases/:id/votes | 获取画布投票列表 |
| POST | /api/canvases/:id/votes | 创建投票 |
| GET | /api/canvases/:id/mindmap | 获取思维导图 |
| PUT | /api/canvases/:id/mindmap | 保存思维导图 |
| GET | /api/canvases/:id/kanban | 获取看板 |
| PUT | /api/canvases/:id/kanban | 保存看板 |
| GET | /api/canvases/:id/swimlane | 获取泳道图 |
| PUT | /api/canvases/:id/swimlane | 保存泳道图 |

### 快照 (4)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/canvases/:id/snapshot | 获取画布最新快照 |
| POST | /api/canvases/:id/snapshot | 保存快照（供 Yjs 服务调用） |
| GET | /api/canvases/:id/snapshots | 列出画布所有快照（仅元数据） |
| GET | /api/canvases/:id/snapshots/:snapshotId | 获取指定快照全量数据 |

### 分享 (1)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/shares/validate | 验证分享链接 |

### 评论 (5)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/comments/:id/replies | 获取评论回复列表 |
| POST | /api/comments/:id/replies | 回复评论 |
| PUT | /api/comments/:id/resolve | 标记评论为已解决/未解决 |
| DELETE | /api/comments/:id | 删除评论 |
| PUT | /api/comments/:id/position | 更新评论位置 |

### 投票 (3)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/votes/:id/records | 提交投票 |
| PUT | /api/votes/:id/close | 关闭投票 |
| GET | /api/votes/:id/results | 获取投票结果 |

### 通知 (4)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/notifications | 获取当前用户通知列表 |
| PUT | /api/notifications/:id/read | 标记单条通知已读 |
| PUT | /api/notifications/read-all | 标记全部通知已读 |
| GET | /api/notifications/unread-count | 获取未读通知数量 |

### 文件上传 (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload | 上传文件 |
| GET | /api/upload/:id | 获取文件 |

### 管理 (3)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/users | 用户列表（分页 + 搜索） |
| PUT | /api/admin/users/:id | 启用/禁用用户 |
| POST | /api/admin/backup | 导出所有表（只读） |

### 健康检查 (1)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |

---

*文档版本: v2.0*  
*更新日期: 2026-05-18*
