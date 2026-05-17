#!/bin/bash
# ============================================
# DrawWork 部署脚本
# ============================================

set -e

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

echo "=== DrawWork 部署脚本 ==="
echo "项目目录: $PROJECT_DIR"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "错误: 未安装 Docker Compose"
    exit 1
fi

# 检查配置文件
if [ ! -f "$PROJECT_DIR/config/.env" ]; then
    echo "警告: 未找到 config/.env 文件"
    echo "正在从模板创建..."
    cp "$PROJECT_DIR/config/.env.example" "$PROJECT_DIR/config/.env"
    echo "请编辑 config/.env 文件，修改密码等配置后重新运行"
    exit 1
fi

# 构建并启动服务
echo "构建并启动服务..."
cd "$PROJECT_DIR"
docker-compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 健康检查
echo "执行健康检查..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "服务启动成功！"
    echo ""
    echo "访问地址: http://localhost"
    echo "Minio 控制台: http://localhost:9001"
    echo ""
    echo "默认管理员账号:"
    echo "  用户名: admin"
    echo "  密码: admin123"
    echo ""
    echo "请首次登录后立即修改密码！"
else
    echo "警告: 服务可能未正常启动"
    echo "请查看日志: docker-compose logs"
fi

echo ""
echo "=== 部署完成 ==="
