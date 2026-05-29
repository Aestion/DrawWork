# DrawWork 正式部署目录

`deploy/` 是生产部署唯一入口。这里放 Docker 编排、Nginx、数据库初始化、环境模板和运维脚本。

## 目录说明

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

## 首次部署

```bash
cp deploy/env/.env.example deploy/.env
vim deploy/.env
make up
make check
```

更多步骤见 [生产部署检查清单](../docs/deployment/production-checklist.md)。

