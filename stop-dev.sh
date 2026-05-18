#!/bin/bash
# DrawWork 开发环境停止脚本

DRAWWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DRAWWORK_ROOT"

echo "=== 停止 DrawWork 服务 ==="

for service in backend yjs frontend; do
  pidfile="logs/$service.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      echo "Stopped $service (PID: $pid)"
    fi
    rm -f "$pidfile"
  else
    echo "No PID file for $service"
  fi
done

# 清理残留的 node 进程
pkill -f "node.*src/app.js" 2>/dev/null || true
pkill -f "node.*src/server.js" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

echo "=== 所有服务已停止 ==="
