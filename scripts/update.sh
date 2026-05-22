#!/bin/bash
# ============================================
# DrawWork 更新脚本
# ============================================

set -e

PROJECT_DIR="${PROJECT_DIR:-/opt/drawwork}"
COMPOSE_FILE="$PROJECT_DIR/config/docker-compose.yml"

cd "$PROJECT_DIR"

echo "=== DrawWork 更新脚本 ==="

# 检查是否在项目目录
if [ ! -f "config/docker-compose.yml" ]; then
    echo "错误: 未找到 config/docker-compose.yml，请确保在项目根目录"
    exit 1
fi

# 1. 备份当前数据
echo "步骤 1/5: 备份当前数据..."
if [ -f "scripts/backup.sh" ]; then
    ./scripts/backup.sh
else
    echo "警告: 未找到备份脚本，跳过备份"
fi

# 2. 拉取最新代码
echo "步骤 2/5: 拉取最新代码..."
git pull origin main || echo "警告: 拉取代码失败，使用本地代码继续"

# 3. 停止服务
echo "步骤 3/5: 停止当前服务..."
docker compose -f config/docker-compose.yml down

# 4. 启动服务
echo "步骤 4/5: 启动服务..."
docker compose -f config/docker-compose.yml up -d --build

# 5. 健康检查
echo "步骤 5/5: 检查服务状态..."
sleep 10
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "服务运行正常"
else
    echo "警告: 服务可能未正常启动，请检查日志"
    echo "查看日志: docker compose -f config/docker-compose.yml logs"
fi

echo ""
echo "=== 更新完成 ==="
