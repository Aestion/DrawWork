# DrawWork

DrawWork is a collaborative online whiteboard for freehand drawing, mind maps, kanban boards, swimlanes, comments, voting, sharing permissions, and real-time collaboration.

## Start Here

| Goal | Read |
|------|------|
| Production deployment | [Production checklist](./docs/deployment/production-checklist.md) |
| Docker details | [Docker deployment guide](./docs/deployment/docker-deploy.md) |
| Operations | [Operations runbook](./docs/deployment/operations-runbook.md) |
| Local development | [Local development guide](./docs/development/local-dev.md) |
| Testing | [Testing guide](./docs/development/testing.md) |
| Architecture | [System overview](./docs/architecture/overview.md) |
| All documentation | [Docs index](./docs/README.md) |

Chinese README: [README.zh-CN.md](./README.zh-CN.md)

## Project Structure

```text
DrawWork/
├── frontend/       # React + Vite frontend
├── backend/        # Express REST API
├── yjs-server/     # Yjs WebSocket collaboration service
├── deploy/         # Production deployment entrypoint
├── scripts/        # Local development and helper scripts
├── docs/           # Role-based documentation
├── test/           # Playwright, PyAutoGUI, and integration tests
├── data/           # Runtime data, ignored by Git
├── logs/           # Runtime logs, ignored by Git
└── backups/        # Backup files, ignored by Git
```

`config/` is no longer the deployment configuration directory. Production deployment files live in `deploy/`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS, Zustand |
| Drawing | Excalidraw |
| Backend | Node.js 20, Express 4, Sequelize |
| Database | SQLite for development, PostgreSQL 15 for production |
| Collaboration | Yjs, WebSocket |
| File storage | MinIO or local filesystem |
| Deployment | Docker Compose, Nginx |
| Testing | Jest, Vitest, Playwright, PyAutoGUI |

## Local Development

```bash
cd backend && npm install && cd ..
cd yjs-server && npm install && cd ..
cd frontend && npm install && cd ..
```

Windows PowerShell:

```powershell
.\scripts\start-dev.ps1
```

Manual start:

```bash
cd backend && npm run dev
cd yjs-server && npm run dev
cd frontend && npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- Yjs: `ws://localhost:3001`

## Production Deployment

```bash
cp deploy/env/.env.example deploy/.env
vim deploy/.env
make build
make up
make check
```

Default URLs:

- App: `http://localhost`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- Adminer: run `make admin`, then open `http://localhost:8080`

## Default Account

After first initialization:

- Username: `admin`
- Password: `admin123`

Change the default password immediately in production.

