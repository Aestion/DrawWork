COMPOSE := docker compose -f config/docker-compose.yml
SERVICE_NAMES := api yjs nginx postgres redis minio

.PHONY: help up down build rebuild restart logs status clean admin backup check-env

help: ## 显示帮助信息
	@echo "DrawWork Docker 部署命令:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

check-env: ## 检查 config/.env 是否存在
	@if [ ! -f config/.env ]; then \
		echo "config/.env 不存在，从模板创建..."; \
		cp config/.env.docker config/.env; \
		echo "请编辑 config/.env 修改密码和密钥后重新运行"; \
		exit 1; \
	fi

build: check-env ## 构建所有镜像
	$(COMPOSE) build

rebuild: check-env ## 无缓存重建所有镜像
	$(COMPOSE) build --no-cache

up: check-env ## 启动所有服务
	$(COMPOSE) up -d
	@echo ""
	@echo "服务启动中，等待健康检查..."
	@sleep 5
	$(COMPOSE) ps

down: ## 停止所有服务
	$(COMPOSE) down

restart: ## 重启所有服务
	$(COMPOSE) restart

logs: ## 查看所有服务日志
	$(COMPOSE) logs -f

logs-api: ## 查看 API 日志
	$(COMPOSE) logs -f api

logs-yjs: ## 查看 Yjs 日志
	$(COMPOSE) logs -f yjs

logs-nginx: ## 查看 Nginx 日志
	$(COMPOSE) logs -f nginx

status: ## 查看容器状态
	$(COMPOSE) ps

clean: ## 停止并删除容器和卷（会删除数据！）
	@echo "警告: 这将删除所有容器和数据卷!"
	@read -p "确认删除? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		$(COMPOSE) down -v; \
	else \
		echo "已取消"; \
	fi

admin: check-env ## 启动管理工具 (Adminer)
	$(COMPOSE) --profile admin up -d adminer
	@echo "Adminer 访问地址: http://localhost:8080"

backup: ## 执行数据库备份
	@if [ -f scripts/backup.sh ]; then \
		./scripts/backup.sh; \
	else \
		echo "备份脚本不存在"; \
	fi

check: ## 系统健康检查
	@echo "=== DrawWork 系统状态检查 ==="
	@echo ""
	@echo "容器状态:"
	@$(COMPOSE) ps
	@echo ""
	@echo "Nginx 健康检查:"
	@curl -sf http://localhost/health && echo " OK" || echo " 失败"
	@echo ""
	@echo "API 健康检查:"
	@curl -sf http://localhost/api/health && echo " OK" || echo " 失败"
