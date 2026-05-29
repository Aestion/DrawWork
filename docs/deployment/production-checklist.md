# DrawWork 生产部署检查清单

正式部署前按这个清单走。每一项都应该能被运维人员独立确认。

## 一、部署前

- [ ] 服务器已安装 Docker 和 Docker Compose v2。
- [ ] 项目代码放在目标目录，例如 `/opt/drawwork`。
- [ ] 已从 `deploy/env/.env.example` 复制出 `deploy/.env`。
- [ ] `deploy/.env` 中所有 `CHANGE_ME` 已替换。
- [ ] `JWT_SECRET` 使用随机强密钥，不使用示例值。
- [ ] `DB_PASSWORD` 和 `MINIO_SECRET_KEY` 已修改。
- [ ] 对外域名或内网访问地址已写入 `FRONTEND_URL` 和 `ALLOWED_ORIGINS`。
- [ ] 服务器防火墙只开放需要的端口：80、443，以及按需开放 9000/9001/8080。

## 二、首次部署

```bash
cp deploy/env/.env.example deploy/.env
vim deploy/.env
make build
make up
make check
```

访问地址：

- 应用入口：`http://localhost`
- MinIO API：`http://localhost:9000`
- MinIO 控制台：`http://localhost:9001`
- Adminer：执行 `make admin` 后访问 `http://localhost:8080`

## 三、部署后验收

- [ ] `make status` 中 `nginx`、`api`、`yjs`、`postgres`、`redis`、`minio` 均为运行状态。
- [ ] `curl http://localhost/health` 返回 `healthy`。
- [ ] `curl http://localhost/api/health` 返回后端健康状态。
- [ ] 可以登录默认管理员账号，并立即修改默认密码。
- [ ] 可以创建画板和画布。
- [ ] 两个浏览器窗口打开同一画布，实时协作正常。
- [ ] 可以上传图片或媒体文件。
- [ ] 执行 `make backup` 后，`backups/` 下生成数据库、文件、部署配置备份。

## 四、上线安全项

- [ ] 默认管理员密码已修改。
- [ ] `deploy/.env` 不提交 Git。
- [ ] 生产环境不直接暴露 `api` 和 `yjs` 容器端口。
- [ ] PostgreSQL 5432、MinIO 9000/9001、Adminer 8080 只按实际需要开放。
- [ ] 已配置定时备份。
- [ ] 已准备恢复流程并完成至少一次恢复演练。

