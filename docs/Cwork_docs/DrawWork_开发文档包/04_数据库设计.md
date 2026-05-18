# DrawWork 数据库设计文档

## 一、数据库选型

- **开发环境**: SQLite（通过 `DATABASE_URL=sqlite:./dev.db` 配置）
- **生产环境**: PostgreSQL 15（通过 Docker + init.sql 初始化）
- **ORM**: Sequelize 6.x（双数据库兼容）
- **字符集**: UTF-8
- **数据库检测**: 自动识别 `DATABASE_URL` 前缀，sqlite: 开头使用 SQLite，否则使用 PostgreSQL

## 二、表结构总览

| 表名 | 用途 | ORM 模型 |
|------|------|----------|
| users | 用户信息 | User |
| profiles | 用户扩展资料 | Profile |
| boards | 画板 | Board |
| canvases | 画布（支持 excalidraw/mindmap/kanban/swimlane 四种类型） | Canvas |
| board_shares | 画板分享记录 | BoardShare |
| share_tokens | 公开分享链接 | ShareToken |
| yjs_snapshots | Yjs 文档快照 | YjsSnapshot |
| board_visits | 访问记录 | BoardVisit |
| files | 文件元数据 | File |
| audit_logs | 审计日志 | AuditLog |
| comments | 评论 | Comment |
| comment_replies | 评论回复 | CommentReply |
| votes | 投票 | Vote |
| vote_records | 投票记录 | VoteRecord |
| notifications | 通知 | Notification |
| mind_maps | 思维导图数据 | MindMap |
| kanban_boards | 看板数据 | KanbanBoard |
| swimlanes | 泳道图数据 | Swimlane |

## 三、详细表结构

### 3.1 users（用户表）

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**: 
- Sequelize 自动生成 timestamps（created_at/updated_at）
- `underscored: true` 配置使字段使用下划线命名
- SQLite 模式下 UUID 使用 `uuid` 包生成

### 3.2 profiles（用户资料表）

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  department VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**: 与用户表一对一关系，存储扩展资料。

### 3.3 boards（画板表）

```sql
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  cover_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**: 支持软删除（is_deleted + deleted_at）。

### 3.4 canvases（画布表）

```sql
CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT '画布 1',
  type VARCHAR(20) DEFAULT 'excalidraw' CHECK (type IN ('excalidraw', 'mindmap', 'kanban', 'swimlane')),
  sort_order INTEGER DEFAULT 0,
  yjs_room_id VARCHAR(100) UNIQUE NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 board_shares（画板分享表）

```sql
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by UUID REFERENCES users(id),
  source VARCHAR(20) DEFAULT 'invite' CHECK (source IN ('invite', 'token')),
  share_token_id UUID REFERENCES share_tokens(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);
```

**说明**: 
- `source` 字段区分分享方式：'invite'（邀请）或 'token'（链接）
- `share_token_id` 关联分享链接记录（用于 token 方式）

### 3.6 share_tokens（分享链接表）

```sql
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token VARCHAR(100) UNIQUE NOT NULL,
  raw_token VARCHAR(100) UNIQUE,
  permission VARCHAR(20) DEFAULT 'viewer' CHECK (permission IN ('editor', 'viewer', 'commenter')),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**: 
- `token` 存储 SHA256 哈希值
- `raw_token` 存储原始 token（用于首次创建时返回给用户）

### 3.7 yjs_snapshots（Yjs 文档快照表）

```sql
CREATE TABLE yjs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  content BYTEA NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.8 board_visits（访问记录表）

```sql
CREATE TABLE board_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);
```

### 3.9 files（文件元数据表）

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  url TEXT NOT NULL,
  bucket VARCHAR(50) DEFAULT 'drawings',
  board_id UUID REFERENCES boards(id),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.10 audit_logs（审计日志表）

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.11 comments（评论表）

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.12 comment_replies（评论回复表）

```sql
CREATE TABLE comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  mentioned_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.13 votes（投票表）

```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES users(id) NOT NULL,
  title VARCHAR(200) NOT NULL,
  votes_per_user INTEGER DEFAULT 1,
  is_anonymous BOOLEAN DEFAULT FALSE,
  scope VARCHAR(20) DEFAULT 'canvas',
  scope_data JSONB,
  expires_at TIMESTAMPTZ,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.14 vote_records（投票记录表）

```sql
CREATE TABLE vote_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100),
  target_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);
```

### 3.15 notifications（通知表）

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.16 mind_maps（思维导图表）

```sql
CREATE TABLE mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  root_node JSONB,
  roots JSONB,
  cross_connections JSONB DEFAULT '[]',
  layout VARCHAR(20) DEFAULT 'right',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**:
- `root_node` 存储单根节点格式（兼容旧数据）
- `roots` 存储多根节点数组（新格式，支持最多 10 个根节点）
- `cross_connections` 存储跨树连接数据，格式：
```json
[
  { "source": "node-1", "target": "node-5", "label": "关联" }
]
```
- `layout` 可选值：'right', 'left', 'top', 'bottom', 'vertical'

### 3.17 kanban_boards（看板表）

```sql
CREATE TABLE kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  columns JSONB NOT NULL,
  cards JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.18 swimlanes（泳道图表）

```sql
CREATE TABLE swimlanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  direction VARCHAR(20) DEFAULT 'horizontal',
  lanes JSONB NOT NULL,
  elements JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 四、模型关系图

```
users ||--o| profiles : has
users ||--o{ boards : owns
users ||--o{ board_shares : shares
users ||--o{ board_visits : visits
users ||--o{ files : uploads
users ||--o{ audit_logs : generates
users ||--o{ comments : writes
users ||--o{ comment_replies : replies
users ||--o{ votes : creates
users ||--o{ vote_records : votes
users ||--o{ notifications : receives

boards ||--o{ canvases : contains
boards ||--o{ board_shares : shared_via
boards ||--o{ share_tokens : has_tokens
boards ||--o{ board_visits : visited_by
boards ||--o{ files : has_files

canvases ||--o{ yjs_snapshots : has_versions
canvases ||--o{ comments : has_comments
canvases ||--o{ votes : has_votes
canvases ||--o| mind_maps : has_mindmap
canvases ||--o| kanban_boards : has_kanban
canvases ||--o| swimlanes : has_swimlane

comments ||--o{ comment_replies : has_replies
votes ||--o{ vote_records : has_records
```

## 五、初始化数据

```sql
INSERT INTO users (id, username, email, password_hash, is_admin, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'admin@company.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I2K',
  TRUE, TRUE
);
```

## 六、关键查询

### 获取用户权限
```sql
SELECT CASE
  WHEN b.owner_id = :userId THEN 'owner'
  WHEN s.permission IS NOT NULL THEN s.permission
  WHEN b.is_public THEN 'viewer'
  ELSE NULL
END as permission
FROM boards b
LEFT JOIN board_shares s ON s.board_id = b.id AND s.user_id = :userId
WHERE b.id = :boardId;
```

---

*文档版本: v2.0*
*更新日期: 2026-05-18*
