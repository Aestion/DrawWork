# DrawWork 部署配置说明

部署配置统一放在 `deploy/`。旧 `config/` 目录只保留迁移提示。

## 文件清单

| 文件 | 用途 |
|------|------|
| `deploy/docker-compose.yml` | Docker Compose 服务编排 |
| `deploy/nginx/Dockerfile` | 前端构建和 Nginx 镜像 |
| `deploy/nginx/nginx.conf` | Nginx 反向代理配置 |
| `deploy/database/init.sql` | PostgreSQL 初始化 SQL |
| `deploy/env/.env.example` | 环境变量模板 |
| `deploy/.env` | 实际部署配置，不提交 Git |
| `deploy/scripts/deploy.sh` | 首次部署脚本 |
| `deploy/scripts/update.sh` | 更新脚本 |
| `deploy/scripts/backup.sh` | 备份脚本 |

## 环境变量

部署前复制模板：

```bash
cp deploy/env/.env.example deploy/.env
```

必须修改：

- `DB_PASSWORD`
- `JWT_SECRET`
- `MINIO_SECRET_KEY`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`

Docker 内部服务地址：

- 数据库：`postgres:5432`
- Redis：`redis:6379`
- MinIO：`minio:9000`
- API：`api:3000`
- Yjs：`yjs:3001`

## Compose 路径规则

`deploy/docker-compose.yml` 位于 `deploy/` 下，所以相对路径按这个目录解析：

- `../data/*` 指向项目根目录的运行数据。
- `../logs/*` 指向项目根目录的日志。
- `./database/init.sql` 指向 `deploy/database/init.sql`。
- `env_file: .env` 指向 `deploy/.env`。

