# 配置目录已迁移

正式部署配置已迁移到 `deploy/`：

- Docker Compose：`deploy/docker-compose.yml`
- Nginx：`deploy/nginx/nginx.conf`
- 数据库初始化：`deploy/database/init.sql`
- 环境变量模板：`deploy/env/.env.example`

保留这个目录只是为了给旧路径一个明确提示，请不要在这里新增正式部署配置。

