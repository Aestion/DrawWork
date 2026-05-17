<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express" alt="Express 4.x" />
  <img src="https://img.shields.io/badge/Yjs-13.x-FF6600" alt="Yjs 13.x" />
  <img src="https://img.shields.io/badge/Sequelize-6.x-52B0E7" alt="Sequelize 6.x" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

<h1 align="center">🎨 DrawWork</h1>
<p align="center"><strong>Collaborative Online Whiteboard — Draw, Mind Map, Kanban, Swimlane, and More</strong></p>

<p align="center">
  A real-time collaborative whiteboard platform built with <strong>React + Excalidraw + Yjs</strong>.
  Supports freehand drawing, rich media, structured tools (mind maps, kanban, swimlane diagrams),
  and real-time multi-user collaboration.
</p>

---

## ✨ Features

### 🖌️ Drawing & Media
- **Excalidraw-powered** whiteboard with hand-drawn style elements
- Shapes: rectangle, diamond, ellipse, arrow, line, pencil, text
- **Rich media**: images, animated GIFs (auto-play), videos (auto-loop), audio (click-to-play)
- Drag-and-drop & clipboard paste for images
- Export to **PNG, SVG, JSON**

### 🧠 Structured Tools
| Tool | Powered By | Highlights |
|------|-----------|------------|
| **Mind Map** | React Flow | Multi-root nodes (up to 10), cross-tree connections, collapsible branches, Markdown import/export, auto-layout, search, undo/redo |
| **Kanban** | Custom React | Columns + cards with drag-and-drop, column reordering, 3-second undo on delete |
| **Swimlane** | Custom React | Horizontal/vertical lanes, element drag-and-drop, arrow connections |

### 👥 Real-Time Collaboration
- **Yjs CRDT** for conflict-free real-time sync
- Multi-cursor display with user names
- Online user list with connection status
- Per-canvas Yjs rooms (independent collaboration)

### 💬 Communication
- **Comments**: positionable anchors on canvas, threaded replies, @mentions
- **Voting**: create polls on canvas elements, real-time vote counting, anonymous mode
- **Snapshots**: manual version save and restore

### 🔒 Security & Access Control
- JWT authentication (access + refresh tokens)
- 4-tier permissions: **owner > editor > commenter > viewer**
- Share via user invite or shareable links (with expiry & usage limits)
- MIME type + magic byte validation on file uploads
- Rate limiting (production), CORS whitelist, helmet security headers

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Zustand |
| **Drawing** | @excalidraw/excalidraw 0.17.6 |
| **Diagrams** | @xyflow/react (React Flow) 12.x |
| **Backend** | Node.js 20, Express 4.x |
| **ORM** | Sequelize 6.x (SQLite / PostgreSQL) |
| **Collaboration** | Yjs 13.x, y-websocket 2.x |
| **Database** | SQLite (dev) / PostgreSQL 15 (prod) |
| **Cache** | Redis 7 (optional, multi-instance Yjs) |
| **File Storage** | Minio / local filesystem |
| **Reverse Proxy** | Nginx (Alpine) |
| **Container** | Docker + Docker Compose |

---

## 📁 Project Structure

```
drawwork/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── components/       # UI components (Dashboard, Editor, Notifications, UI)
│   │   │   ├── Dashboard/    # BoardCard, BoardModal
│   │   │   ├── Editor/       # ExcalidrawWrapper, MindMapEditor, KanbanEditor, SwimlaneEditor
│   │   │   │                # CommentsOverlay, SharePanel, VersionHistory, VotePanel
│   │   │   ├── Notifications/# NotificationBell, NotificationCenter
│   │   │   └── ui/          # Toast, SyncIndicator, Skeleton, LoadingButton
│   │   ├── hooks/           # useYjs, useComments, useVotes, useKanbanYjs, etc.
│   │   ├── lib/             # axios, constants, imageUtils, kanban, swimlane
│   │   ├── pages/           # AuthPage, DashboardPage, EditorPage, ShareRedirectPage
│   │   ├── stores/          # authStore, boardStore, canvasStore (Zustand)
│   │   ├── App.jsx          # Router config
│   │   └── main.jsx         # Entry point
│   └── package.json
├── backend/                   # Node.js + Express API
│   ├── src/
│   │   ├── config/          # database.js, minio.js, redis.js
│   │   ├── middleware/      # auth.js (JWT), permission.js (4-tier)
│   │   ├── models/          # 15 Sequelize models (User, Board, Canvas, etc.)
│   │   ├── routes/          # 43 API endpoints across 10 route files
│   │   ├── utils/           # jwt.js, db.js, notificationService.js
│   │   └── app.js           # Express entry point
│   ├── Dockerfile
│   └── package.json
├── yjs-server/                # Standalone Yjs WebSocket server
│   ├── src/server.js         # WebSocket server with JWT auth + DB persistence
│   ├── Dockerfile
│   └── package.json
├── config/                    # Infrastructure config
│   ├── docker-compose.yml   # 6 services: nginx, api, yjs, postgres, redis, minio
│   ├── nginx.conf           # Reverse proxy config
│   ├── init.sql             # Database schema (18 tables)
│   └── .env.example         # Environment variable template
├── scripts/                  # Operations scripts
│   ├── deploy.sh            # One-command deployment
│   ├── backup.sh            # Database + file backup
│   ├── update.sh            # Git pull + rebuild + restart
│   └── start-dev.ps1        # Local dev launcher (PowerShell)
└── docs/                     # Documentation
```

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20 LTS+
- npm 9+

### Install & Run

```bash
# 1. Clone
git clone https://github.com/Aestion/DrawWork.git
cd drawwork

# 2. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd yjs-server && npm install && cd ..

# 3. Start everything (or use the dev script)
# Option A: One-click launch (PowerShell)
./scripts/start-dev.ps1

# Option B: Manual start (3 terminals)
# Terminal 1 - Backend API
cd backend && npm run dev
# Terminal 2 - Yjs server
cd yjs-server && node src/server.js
# Terminal 3 - Frontend
cd frontend && npm run dev

# 4. Open in browser
# Frontend: http://localhost:5173
# API:      http://localhost:3000
```

### Default Account

After first startup (or database seed), use:
- **Username**: `admin`
- **Password**: `admin123`

> **Change the default password immediately in production!**

---

## 🐳 Docker Deployment

```bash
# Build and start all services
cd config
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Access
open http://localhost
```

### Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `nginx` | 80/443 | Reverse proxy + static file serving |
| `api` | 3000 | Express REST API |
| `yjs` | 3001 | Yjs WebSocket collaboration server |
| `postgres` | 5432 | PostgreSQL database |
| `redis` | 6379 | Cache & pub/sub |
| `minio` | 9000/9001 | File storage / Console |

---

## 📋 API Overview

The REST API exposes **43 endpoints** across the following modules:

| Module | Endpoints | Auth |
|--------|-----------|------|
| Auth | `POST /api/auth/register, login, refresh, logout` + `GET /api/auth/me` | Public / Token |
| Boards | `GET/POST/PUT/DELETE /api/boards[/:id]` + canvases | JWT + Permission |
| Canvas | `GET/PUT/DELETE /api/canvases/:id` | JWT + Permission |
| Comments | `GET/POST /api/canvases/:id/comments` + replies/resolve | JWT + Permission |
| Votes | `POST /api/canvases/:id/votes` + records/close/results | JWT + Permission |
| Snapshots | `GET/POST /api/canvases/:id/snapshot[s]` | JWT + Permission |
| Structured Tools | `GET/PUT /api/canvases/:id/{mindmap,kanban,swimlane}` | JWT + Permission |
| Sharing | `POST/DELETE /api/boards/:id/{shares,tokens}` + `GET /api/shares/validate` | JWT + Permission |
| Notifications | `GET/PUT /api/notifications` | JWT |
| Upload | `POST /api/upload` + `GET /api/upload/:id` | JWT + Permission |
| Admin | `GET/PUT /api/admin/users` + `POST /api/admin/backup` | Admin |
| Health | `GET /health` | Public |

See [03_技术架构.md](docs/../../DrawWork_开发文档包/03_技术架构.md) for the full API table.

---

## 🧪 Testing

### Backend
```bash
cd backend
npm test
```
> Uses Jest + Supertest + SQLite in-memory. Tests cover auth, boards, canvas, comments, shares, snapshots, votes, notifications, uploads, websocket, structured tools, and admin.

### Frontend
```bash
cd frontend
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests (requires dev servers running)
```

### Test Coverage
- **14 backend test files** covering all API modules
- **Frontend tests** for stores, hooks, utilities, and key components (ExcalidrawWrapper, MindMapEditor, ErrorBoundary)
- **Playwright E2E** configuration for browser-based testing

---

## 🔑 Environment Variables

Key configuration (see `config/.env.example` for full list):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:./dev.db` | Database connection (sqlite: prefix = SQLite) |
| `JWT_SECRET` | (required) | JWT signing key (min 32 chars) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `MINIO_ENDPOINT` | `localhost` | MinIO server endpoint |
| `UPLOAD_MAX_SIZE` | `104857600` | Max upload size (100MB) |

---

## 📊 Architecture Highlights

### Real-Time Collaboration
```
User A ←→ Yjs Doc ←→ y-websocket ←→ Yjs Server ←→ Database
                                 ↕                    ↕
User B ←→ Yjs Doc ←→ y-websocket ↕            Auto-save every 10s
                                 ↕
                         Redis pub/sub (for multi-instance)
```

### Permission Levels
```
owner (4) > editor (3) > commenter (2) > viewer (1)
```

Each API endpoint that operates on a board/canvas resource checks:
1. JWT authentication (middleware)
2. Board-level permission (via `board_shares` or `owner_id`)
3. Minimum required permission level for the operation

### File Upload Security
1. MIME type whitelist check
2. File header magic byte signature verification
3. Upload to MinIO (or local filesystem fallback)
4. URL stored in database as `/api/upload/:id` (no direct public access)

---

## 🗺️ Roadmap

| Priority | Feature | Status |
|----------|---------|--------|
| P1 | Timer widget for canvas | ⬜ Planned |
| P1 | Board cover image | ⬜ Planned |
| P2 | Board search & filter | ⬜ Planned |
| P2 | Trash / recycle bin | ⬜ Planned |
| P2 | Large canvas virtualization | ⬜ Planned |

---

## 📄 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
