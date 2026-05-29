# DrawWork 运维手册

所有命令默认在项目根目录执行。

## 日常检查

```bash
make status
make check
make logs
```

查看单个服务日志：

```bash
make logs-api
make logs-yjs
make logs-nginx
```

## 启停服务

```bash
make up
make down
make restart
```

只看底层命令时，使用：

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f
```

## 备份

```bash
make backup
```

建议加入定时任务：

```bash
0 2 * * * /opt/drawwork/deploy/scripts/backup.sh >> /opt/drawwork/logs/backup.log 2>&1
```

## 恢复

恢复前先停止服务，并确认目标备份文件。

```bash
make down
gunzip -c backups/db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i drawwork-postgres psql -U postgres -d drawwork
tar -xzf backups/files_YYYYMMDD_HHMMSS.tar.gz -C data
tar -xzf backups/deploy_YYYYMMDD_HHMMSS.tar.gz -C .
make up
make check
```

## 更新

```bash
./deploy/scripts/update.sh
```

更新前脚本会自动执行备份。正式环境建议先在预发布环境验证同一版本。

## 回滚

推荐回滚方式：

1. 停止服务：`make down`
2. 切换到已确认可用的 Git tag 或发布分支。
3. 恢复更新前的数据库、文件和部署配置备份。
4. 重新构建并启动：`make build && make up`
5. 执行 `make check` 并做业务验收。

不要在生产环境直接使用破坏性 Git 命令回滚未确认的工作区。

## 常见故障

### 服务无法启动

```bash
make status
make logs
```

重点检查端口 80、443、5432、9000、9001、8080 是否冲突。

### API 不通

```bash
curl http://localhost/api/health
make logs-api
docker exec drawwork-api env | grep DATABASE
```

### 协同不同步

```bash
make logs-yjs
docker exec drawwork-yjs curl -f http://localhost:3001/health
docker exec drawwork-nginx nginx -t
```

### 文件上传失败

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps minio
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs minio
df -h
```

## 安全要点

- `deploy/.env` 不提交 Git。
- 首次登录后立即修改默认管理员密码。
- API 和 Yjs 不直接映射到宿主机。
- Adminer 只在需要时通过 `make admin` 启动。
- 生产环境按需限制 PostgreSQL、MinIO、Adminer 端口访问来源。

