---
name: WebSocket Connection Issue Resolution
description: Steps to fix Yjs WebSocket connection and data loss issues
type: reference
---

## 问题现象
- 进入画布后连接状态标签疯狂闪烁：`Disconnected` → `Syncing` → `Disconnected`
- 控制台显示 `WebSocket is closed before the connection is established`
- 切换画布或刷新网页后数据丢失

## 根本原因
yjs-server 没有正确读取 `.env` 文件配置的数据库路径，导致查询空数据库，权限检查失败，WebSocket 被服务端关闭。

## 解决步骤

### 1. 检查 yjs-server 状态
```bash
# 查看端口占用
netstat -ano | grep 3001

# 查看 yjs-server 进程
tasklist | grep node
```

### 2. 检查数据库配置
```bash
cd yjs-server
node -e "require('dotenv').config(); console.log('DB:', process.env.SQLITE_PATH)"
# 应该输出: DB: ../backend/dev.db
```

### 3. 查看当前使用的数据库
检查 yjs-server 启动日志：
```
[Yjs] Database path: ../backend/dev.db  ✅ 正确
[Yjs] Database path: ../data/dev.db     ❌ 错误（空数据库）
```

### 4. 重启 yjs-server
```bash
# 杀掉进程
taskkill /F /IM node.exe

# 重启
cd yjs-server && npm start
```

### 5. 验证
- 连接状态稳定显示为 `Synced`（绿色）
- 控制台不再显示 WebSocket 关闭错误
- 切换画布后数据正确恢复

## 相关文件
- `yjs-server/src/server.js` - 数据库路径配置函数 `databasePath()`
- `yjs-server/.env` - 环境变量 `SQLITE_PATH=../backend/dev.db`

## 预防措施
确保 yjs-server 和 backend API 使用同一个 SQLite 文件：
- Backend API: 默认 `backend/dev.db`
- yjs-server: 必须配置 `SQLITE_PATH=../backend/dev.db`
