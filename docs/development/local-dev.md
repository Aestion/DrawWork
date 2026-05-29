# DrawWork 本地开发指南

本地开发只关注三个业务服务：`backend/`、`yjs-server/`、`frontend/`。正式部署配置在 `deploy/`，不要把它当成本地开发入口。

## 前置条件

- Node.js 20+
- npm 9+

## 安装依赖

```bash
cd backend && npm install && cd ..
cd yjs-server && npm install && cd ..
cd frontend && npm install && cd ..
```

## 启动方式

Windows 启动脚本会读取 `deploy/.env`。如果文件不存在，先执行：

```powershell
Copy-Item deploy\env\.env.example deploy\.env
```

Windows PowerShell：

```powershell
.\scripts\start-dev.ps1
```

手动启动：

```bash
cd backend && npm run dev
cd yjs-server && npm run dev
cd frontend && npm run dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- Yjs WebSocket：`ws://localhost:3001`

## 代码目录

- `frontend/`：React + Vite 前端应用。
- `backend/`：Express REST API。
- `yjs-server/`：实时协同 WebSocket 服务。
- `deploy/`：生产部署入口。
- `scripts/`：本地开发和辅助工具脚本。
