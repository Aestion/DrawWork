@echo off
chcp 65001 >nul
echo ========================================
echo  DrawWork 自动化环境启动器
echo ========================================
echo.

REM 启动后端
echo [1/4] 启动后端服务 (localhost:3000)...
start "DrawWork Backend" cmd /c "cd /d e:\DrawWork\backend && set DATABASE_URL=sqlite:./dev.db && set NODE_ENV=development && set PORT=3000 && set REDIS_URL=redis://localhost:6379 && node src/app.js"
timeout /t 3 >nul

REM 启动 Yjs 服务器
echo [2/4] 启动 Yjs 协作服务器 (localhost:3001)...
start "DrawWork Yjs" cmd /c "cd /d e:\DrawWork\yjs-server && set SQLITE_PATH=../backend/dev.db && set API_URL=http://localhost:3000 && node src/server.js"
timeout /t 2 >nul

REM 启动前端
echo [3/4] 启动前端开发服务器 (localhost:5173)...
start "DrawWork Frontend" cmd /c "cd /d e:\\DrawWork\\frontend && npx vite --port 5173"
timeout /t 5 >nul

REM 启动截图 HTTP API 服务器
echo [4/4] 启动截图控制服务器 (localhost:8765)...
start "Screenshot API" cmd /c "cd /d e:\DrawWork && python screenshot-http-server.py"
timeout /t 2 >nul

echo.
echo ========================================
echo  所有服务已启动！
echo ========================================
echo.
echo 服务状态:
echo   - 后端:     http://localhost:3000
echo   - Yjs:      http://localhost:3001
echo   - 前端:     http://localhost:5173
echo   - 截图API:  http://localhost:8765
echo.
echo 按任意键打开 Chrome 浏览器...
pause >nul

REM 打开 Chrome
start chrome --new-window --window-size=1400,900 http://localhost:5173

echo.
echo 浏览器已打开，可以开始自动化测试了！
echo.
pause
