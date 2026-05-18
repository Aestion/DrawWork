#!/bin/bash
# DrawWork 开发环境启动脚本 - 临时版本

DRAWWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DRAWWORK_ROOT"

echo "=== DrawWork 开发环境 ==="
mkdir -p logs

# 启动后端
echo "[1/3] Starting Backend..."
cd backend
PORT=3000 node src/app.js > "$DRAWWORK_ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!
cd ..
echo "Backend PID: $BACKEND_PID"
echo $BACKEND_PID > logs/backend.pid

# 等待后端启动
sleep 3

# 启动 Yjs 服务
echo "[2/3] Starting Yjs Server..."
cd yjs-server
PORT=3001 node src/server.js > "$DRAWWORK_ROOT/logs/yjs.log" 2>&1 &
YJS_PID=$!
cd ..
echo "Yjs PID: $YJS_PID"
echo $YJS_PID > logs/yjs.pid

# 等待 Yjs 服务启动
sleep 2

# 启动前端
echo "[3/3] Starting Frontend..."
cd frontend
npm run dev > "$DRAWWORK_ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
cd ..
echo "Frontend PID: $FRONTEND_PID"
echo $FRONTEND_PID > logs/frontend.pid

echo ""
echo "=== 服务启动完成 ==="
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3000"
echo "  Yjs:  http://localhost:3001"
echo ""
echo "  日志文件位于: logs/"
echo ""
echo "  默认账号: admin / admin123"
echo ""
echo "停止所有服务: 运行 ./stop-dev.sh"
echo ""
