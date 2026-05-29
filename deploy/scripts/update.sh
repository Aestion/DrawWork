#!/bin/bash
# ============================================
# DrawWork 更新脚本
# ============================================

set -e

PROJECT_DIR="${PROJECT_DIR:-/opt/drawwork}"
COMPOSE_FILE="$PROJECT_DIR/deploy/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/deploy/.env"

cd "$PROJECT_DIR"

echo "=== DrawWork 更新脚本 ==="

# 检查是否在项目目录
if [ ! -f "deploy/docker-compose.yml" ]; then
    echo "错误: 未找到 deploy/docker-compose.yml，请确保在项目根目录"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "错误: 未找到 deploy/.env，请先从 deploy/env/.env.example 创建并修改"
    exit 1
fi

# 1. 备份当前数据
echo "步骤 1/5: 备份当前数据..."
if [ -f "deploy/scripts/backup.sh" ]; then
    ./deploy/scripts/backup.sh
else
    echo "警告: 未找到备份脚本，跳过备份"
fi

# 2. 拉取最新代码
echo "步骤 2/5: 拉取最新代码..."
git pull origin main || echo "警告: 拉取代码失败，使用本地代码继续"

# 3. 停止服务
echo "步骤 3/5: 停止当前服务..."
docker compose --env-file deploy/.env -f "$COMPOSE_FILE" down

# 4. 启动服务
echo "步骤 4/5: 启动服务..."
docker compose --env-file deploy/.env -f "$COMPOSE_FILE" up -d --build

# 5. 健康检查
echo "步骤 5/5: 检查服务状态..."
sleep 10
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "服务运行正常"
else
    echo "警告: 服务可能未正常启动，请检查日志"
    echo "查看日志: docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs"
fi

echo ""
echo "=== 更新完成 ==="
