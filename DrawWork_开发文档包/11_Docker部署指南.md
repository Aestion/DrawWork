# DrawWork Docker 部署指南

## 一、架构概览

### 服务组成

| 服务 | 容器名 | 镜像 | 端口 | 说明 |
|------|--------|------|------|------|
| nginx | drawwork-nginx | config-nginx | 80, 443 | 反向代理 + 前端静态文件 |
| api | drawwork-api | config-api | 3000 (内部) | Express 后端 API |
| yjs | drawwork-yjs | config-yjs | 3001 (内部) | Yjs WebSocket 协同服务 |
| postgres | drawwork-postgres | postgres:15-alpine | 5432 | PostgreSQL 数据库 |
| redis | drawwork-redis | redis:7 | 6379 (内部) | 缓存 + pub/sub |
| minio | drawwork-minio | minio/minio:latest | 9000 | 文件对象存储 |
| adminer | drawwork-adminer | adminer | 8080 (可选) | 数据库管理工具 |

### 网络拓扑

```
用户浏览器
    │
    ▼ :80
┌─────────┐
│  nginx  │──── 静态文件 (前端 SPA)
└────┬────┘
     │ /api/*  → api:3000
     │ /ws/*   → yjs:3001
     ▼
┌─────────┐     ┌─────────┐
│   api   │────▶│ postgres │
└────┬────┘     └─────────┘
     │
     ├────▶ redis (缓存)
     └────▶ minio (文件存储)
```

### 启动顺序

```
postgres + redis + minio
        │
        ▼ (healthy)
      api
        │
        ▼ (healthy)
      yjs
        │
        ▼ (healthy)
     nginx
```

---

## 二、目录结构

```
DrawWork/
├── config/
│   ├── docker-compose.yml    # 服务编排
│   ├── Dockerfile            # 前端 + nginx 多阶段构建
│   ├── nginx.conf            # Nginx 配置
│   ├── init.sql              # 数据库初始化 SQL
│   └── .env.docker           # 环境变量模板
├── backend/
│   ├── Dockerfile            # 后端多阶段构建
│   └── .dockerignore
├── yjs-server/
│   ├── Dockerfile            # Yjs 服务多阶段构建
│   └── .dockerignore
├── frontend/
│   └── .dockerignore
├── .dockerignore             # 项目根目录构建上下文排除
├── Makefile                  # Docker 便捷命令
└── scripts/
    ├── deploy.sh             # 部署脚本
    └── update.sh             # 更新脚本
```

---

## 三、命名规则

### 容器命名

格式：`drawwork-{角色}`

| 容器 | 命名 |
|------|------|
| Nginx | drawwork-nginx |
| API | drawwork-api |
| Yjs | drawwork-yjs |
| PostgreSQL | drawwork-postgres |
| Redis | drawwork-redis |
| Minio | drawwork-minio |
| Adminer | drawwork-adminer |

### 镜像命名

自建镜像使用 `config-{角色}` 格式（由 docker-compose 自动命名）：

| 镜像 | 来源 |
|------|------|
| config-nginx | `config/Dockerfile` 多阶段构建 |
| config-api | `backend/Dockerfile` |
| config-yjs | `yjs-server/Dockerfile` |
| postgres:15-alpine | Docker Hub |
| redis:7 | Docker Hub |
| minio/minio:latest | Docker Hub |

### 卷命名

数据目录统一放在项目根目录的 `data/` 下：

```
data/
├── postgres/     # 数据库持久化
├── redis/        # Redis 持久化
├── minio/        # Minio 对象存储
└── uploads/      # 用户上传文件
```

日志目录放在 `logs/` 下：

```
logs/
├── api/          # 后端日志
├── yjs/          # 协同服务日志
└── nginx/        # Nginx 访问/错误日志
```

### 网络命名

格式：`config_drawwork-network`（compose 自动加项目前缀）

---

## 四、Dockerfile 规范

### 多阶段构建模式

所有自建服务采用统一的多阶段构建模式：

```dockerfile
# Stage 1: 构建依赖
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# Stage 2: 运行时
FROM node:20-alpine
RUN apk add --no-cache curl tini    # tini 作为 PID 1
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
RUN mkdir -p logs && chown -R appuser:appgroup /app
USER appuser
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/app.js"]
```

### 关键规范

| 规范 | 说明 |
|------|------|
| 基础镜像 | `node:20-alpine`（轻量、安全） |
| PID 1 | 使用 `tini` 处理信号转发，确保优雅关闭 |
| 非 root 用户 | `appuser:1001`，避免容器内以 root 运行 |
| 依赖安装 | `npm install --omit=dev`（不用 `npm ci`，避免 Windows lock file 平台问题） |
| 健康检查 | Dockerfile 内置 `HEALTHCHECK` 指令 |
| 暴露端口 | 仅声明实际使用的端口 |

### .dockerignore 规范

每个服务的 `.dockerignore` 必须排除：

```
node_modules
npm-debug.log
.env
.env.*
.git
Dockerfile
.dockerignore
README.md
```

---

## 五、环境变量配置

### 配置文件

| 文件 | 用途 | 是否提交 Git |
|------|------|-------------|
| `config/.env.docker` | 环境变量模板 | 是 |
| `config/.env` | 实际部署配置 | 否（.gitignore） |

### 关键变量

```bash
# === 数据库 ===
DB_USER=postgres
DB_PASSWORD=CHANGE_ME_strong_password
DB_NAME=drawwork

# === JWT（必须修改！） ===
JWT_SECRET=CHANGE_ME_to_random_64_char_string

# === Minio ===
MINIO_ENDPOINT=minio          # Docker 内用服务名，不要用 localhost
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=CHANGE_ME

# === 环境 ===
NODE_ENV=production
```

### 注意事项

1. `MINIO_ENDPOINT` 在 Docker 中必须设为 `minio`（服务名），不是 `localhost`
2. `DATABASE_URL` 由 compose 文件从 `DB_*` 变量自动拼接，无需手动设置
3. `REDIS_URL` 单实例部署可留空，多实例部署设为 `redis://redis:6379`
4. 所有 `CHANGE_ME` 占位符在首次部署前必须替换

---

## 六、部署流程

### 首次部署

```bash
# 1. 准备环境变量
cp config/.env.docker config/.env
vim config/.env    # 修改密码和密钥

# 2. 构建并启动
make build
make up

# 3. 验证
make check
```

### 日常操作

```bash
make status       # 查看容器状态
make logs         # 查看所有日志
make logs-api     # 查看 API 日志
make restart      # 重启所有服务
make down         # 停止所有服务
```

### 代码更新

```bash
# 方式一：使用脚本
./scripts/update.sh

# 方式二：手动操作
git pull
make build
make down && make up
```

### 可选：启动 Adminer

```bash
make admin
# 访问 http://localhost:8080
```

---

## 七、健康检查

所有服务均配置了健康检查：

| 服务 | 检查方式 | 间隔 | 超时 | 启动宽限 |
|------|---------|------|------|---------|
| nginx | `curl -f http://localhost/health` | 30s | 5s | 10s |
| api | `curl -f http://localhost:3000/health` | 30s | 10s | 15s |
| yjs | `curl -f http://localhost:3001/health` | 30s | 10s | 15s |
| postgres | `pg_isready -U postgres -d drawwork` | 10s | 5s | 30s |
| redis | `redis-cli ping` | 10s | 5s | 10s |
| minio | `curl -f http://localhost:9000/minio/health/live` | 30s | 10s | 20s |

依赖关系使用 `condition: service_healthy` 确保上游服务就绪后才启动下游。

---

## 八、数据持久化

### 卷挂载

| 容器内路径 | 宿主机路径 | 说明 |
|-----------|-----------|------|
| /var/lib/postgresql/data | data/postgres | 数据库文件 |
| /data | data/redis | Redis AOF 持久化 |
| /data | data/minio | Minio 对象存储 |
| /app/uploads | data/uploads | 用户上传文件 |
| /var/www/uploads | data/uploads | Nginx 静态文件访问 |
| /app/logs | logs/api | API 日志 |
| /app/logs | logs/yjs | Yjs 日志 |
| /var/log/nginx | logs/nginx | Nginx 日志 |
| /backups | backups | 数据库备份 |

### 备份

```bash
# 手动备份
./scripts/backup.sh

# 自动备份（添加 crontab）
0 2 * * * /opt/drawwork/scripts/backup.sh >> /opt/drawwork/logs/backup.log 2>&1
```

---

## 九、端口映射

| 服务 | 宿主机端口 | 容器端口 | 是否暴露 |
|------|-----------|---------|---------|
| nginx | 80 | 80 | 是 |
| nginx | 443 | 443 | 是（HTTPS 预留） |
| postgres | 5432 | 5432 | 是（调试用） |
| minio | 9000 | 9000 | 是（API 访问） |
| api | - | 3000 | 否（通过 nginx 代理） |
| yjs | - | 3001 | 否（通过 nginx 代理） |
| redis | - | 6379 | 否（仅内部访问） |

**安全说明：** api 和 yjs 端口不映射到宿主机，只能通过 nginx 反向代理访问。

---

## 十、Makefile 命令速查

| 命令 | 说明 |
|------|------|
| `make help` | 显示所有可用命令 |
| `make build` | 构建所有镜像 |
| `make rebuild` | 无缓存重建 |
| `make up` | 启动所有服务 |
| `make down` | 停止所有服务 |
| `make restart` | 重启所有服务 |
| `make status` | 查看容器状态 |
| `make logs` | 查看所有日志 |
| `make logs-api` | 查看 API 日志 |
| `make logs-yjs` | 查看 Yjs 日志 |
| `make logs-nginx` | 查看 Nginx 日志 |
| `make check` | 系统健康检查 |
| `make backup` | 执行数据库备份 |
| `make admin` | 启动 Adminer 管理工具 |
| `make clean` | 停止并删除容器和卷（危险！） |

---

## 十一、故障排查

### 服务启动失败

```bash
# 查看容器状态
make status

# 查看具体服务日志
make logs-api

# 查看最近错误
docker compose -f config/docker-compose.yml logs --tail=50 | grep -i error
```

### 端口冲突

```bash
# 检查端口占用
netstat -tlnp | grep -E ':(80|443|5432|9000)'

# 修改 docker-compose.yml 中的端口映射
```

### 数据库连接失败

```bash
# 检查数据库是否就绪
docker exec drawwork-postgres pg_isready -U postgres

# 检查 API 环境变量
docker exec drawwork-api env | grep DATABASE
```

### WebSocket 连接失败

```bash
# 检查 Yjs 服务
docker exec drawwork-yjs curl -f http://localhost:3001/health

# 检查 nginx WebSocket 配置
docker exec drawwork-nginx nginx -t
```

### 镜像拉取失败

```bash
# 清理缓存重试
docker system prune -f
docker compose -f config/docker-compose.yml build --no-cache
```

---

## 十二、与本地开发的区别

| 维度 | 本地开发 (`./start-dev.sh`) | Docker 部署 (`make up`) |
|------|---------------------------|------------------------|
| 数据库 | SQLite (`backend/dev.db`) | PostgreSQL |
| 文件存储 | 本地文件系统 | Minio |
| 缓存 | 不使用 | Redis |
| 前端 | Vite 开发服务器 (热更新) | Nginx 静态文件 |
| 端口 | 3000, 3001, 5173 | 80, 443 |
| 环境 | development | production |
| 启动方式 | `./start-dev.sh` | `make up` |

**开发时用本地，部署时用 Docker，两者互不影响。**

---

*文档版本: v1.0*
*更新日期: 2026-05-22*
