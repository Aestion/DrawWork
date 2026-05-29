# DrawWork Docker 部署指南

本指南描述当前有效的 Docker 部署结构。正式部署入口统一为 `deploy/`。

## 服务组成

| 服务 | 容器名 | 对外端口 | 说明 |
|------|--------|----------|------|
| nginx | drawwork-nginx | 80, 443 | 前端静态文件与反向代理 |
| api | drawwork-api | 不直接暴露 | Express REST API |
| yjs | drawwork-yjs | 不直接暴露 | Yjs WebSocket 协同服务 |
| postgres | drawwork-postgres | 5432 | PostgreSQL 数据库 |
| redis | drawwork-redis | 不直接暴露 | 缓存与发布订阅 |
| minio | drawwork-minio | 9000, 9001 | 文件对象存储与控制台 |
| adminer | drawwork-adminer | 8080 | 可选数据库管理工具 |

## 目录结构

```text
deploy/
├── docker-compose.yml
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
├── database/
│   └── init.sql
├── env/
│   └── .env.example
└── scripts/
    ├── deploy.sh
    ├── update.sh
    └── backup.sh
```

运行期数据放在项目根目录：

```text
data/
├── postgres/
├── redis/
├── minio/
└── uploads/

logs/
├── api/
├── yjs/
└── nginx/

backups/
```

## 首次部署

```bash
cp deploy/env/.env.example deploy/.env
vim deploy/.env
make build
make up
make check
```

也可以直接运行部署脚本：

```bash
./deploy/scripts/deploy.sh
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `make up` | 启动所有服务 |
| `make down` | 停止所有服务 |
| `make build` | 构建镜像 |
| `make rebuild` | 无缓存重建 |
| `make restart` | 重启服务 |
| `make status` | 查看容器状态 |
| `make logs` | 查看所有日志 |
| `make logs-api` | 查看 API 日志 |
| `make logs-yjs` | 查看 Yjs 日志 |
| `make logs-nginx` | 查看 Nginx 日志 |
| `make backup` | 备份数据库、文件和部署配置 |
| `make admin` | 启动 Adminer |
| `make check` | 健康检查 |

底层命令等价于：

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

## 健康检查

```bash
curl http://localhost/health
curl http://localhost/api/health
docker exec drawwork-yjs curl -f http://localhost:3001/health
```

## 访问地址

- 应用入口：`http://localhost`
- MinIO API：`http://localhost:9000`
- MinIO 控制台：`http://localhost:9001`
- Adminer：`make admin` 后访问 `http://localhost:8080`

## 更新

```bash
./deploy/scripts/update.sh
```

更新脚本会先执行备份，再拉取代码并重建服务。

## 备份

```bash
make backup
```

备份会生成：

- `db_*.sql.gz`：PostgreSQL 数据库。
- `files_*.tar.gz`：MinIO 对象存储和上传缓存。
- `deploy_*.tar.gz`：部署配置。
- `info_*.txt`：备份说明。

