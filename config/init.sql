-- ============================================
-- DrawWork 数据库初始化脚本
-- 包含 18 张表 + 索引 + 触发器
-- ============================================

-- 启用 UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. users（用户表）
-- ============================================
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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- ============================================
-- 2. profiles（用户资料表）
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  department VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. boards（画板表）
-- ============================================
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

CREATE INDEX idx_boards_owner ON boards(owner_id);
CREATE INDEX idx_boards_public ON boards(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_boards_updated ON boards(updated_at DESC);

-- ============================================
-- 4. canvases（画布表）
-- ============================================
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

CREATE INDEX idx_canvases_board ON canvases(board_id);
CREATE INDEX idx_canvases_sort ON canvases(board_id, sort_order);
CREATE INDEX idx_canvases_room ON canvases(yjs_room_id);
CREATE INDEX idx_canvases_type ON canvases(board_id, type);

-- ============================================
-- 5. board_shares（画板分享表）
-- ============================================
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX idx_shares_board ON board_shares(board_id);
CREATE INDEX idx_shares_user ON board_shares(user_id);

-- ============================================
-- 6. share_tokens（分享链接表）
-- ============================================
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token VARCHAR(100) UNIQUE NOT NULL,
  permission VARCHAR(20) DEFAULT 'viewer' CHECK (permission IN ('editor', 'viewer', 'commenter')),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tokens_board ON share_tokens(board_id);
CREATE INDEX idx_tokens_token ON share_tokens(token);
CREATE INDEX idx_tokens_expires ON share_tokens(expires_at);

-- ============================================
-- 7. yjs_snapshots（Yjs 文档快照表）
-- ============================================
CREATE TABLE yjs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  content BYTEA NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_canvas ON yjs_snapshots(canvas_id, created_at DESC);

-- 自动清理触发器：每画布保留最近 50 个快照
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM yjs_snapshots
  WHERE canvas_id = NEW.canvas_id
    AND id NOT IN (
      SELECT id FROM yjs_snapshots
      WHERE canvas_id = NEW.canvas_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cleanup_snapshots_after_insert
  AFTER INSERT ON yjs_snapshots
  FOR EACH ROW EXECUTE FUNCTION cleanup_old_snapshots();

-- ============================================
-- 8. board_visits（访问记录表）
-- ============================================
CREATE TABLE board_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX idx_visits_user ON board_visits(user_id, visited_at DESC);

-- ============================================
-- 9. files（文件元数据表）
-- ============================================
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

CREATE INDEX idx_files_board ON files(board_id);
CREATE INDEX idx_files_user ON files(uploaded_by);

-- ============================================
-- 10. audit_logs（审计日志表）
-- ============================================
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

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- ============================================
-- 11. comments（评论表）
-- ============================================
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

CREATE INDEX idx_comments_canvas ON comments(canvas_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_resolved ON comments(canvas_id, is_resolved);

-- ============================================
-- 12. comment_replies（评论回复表）
-- ============================================
CREATE TABLE comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  mentioned_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_replies_comment ON comment_replies(comment_id);

-- ============================================
-- 13. votes（投票表）
-- ============================================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES users(id) NOT NULL,
  title VARCHAR(200) NOT NULL,
  votes_per_user INTEGER DEFAULT 1,
  is_anonymous BOOLEAN DEFAULT FALSE,
  scope VARCHAR(20) DEFAULT 'canvas' CHECK (scope IN ('selection', 'canvas', 'region')),
  scope_data JSONB,
  expires_at TIMESTAMPTZ,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_votes_canvas ON votes(canvas_id);
CREATE INDEX idx_votes_creator ON votes(created_by);

-- ============================================
-- 14. vote_records（投票记录表）
-- ============================================
CREATE TABLE vote_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100),
  target_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- 部分唯一索引：实名投票用 user_id 去重，匿名投票用 session_id 去重
CREATE UNIQUE INDEX idx_records_vote_user ON vote_records(vote_id, user_id, target_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_records_vote_session ON vote_records(vote_id, session_id, target_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_records_vote ON vote_records(vote_id);

-- ============================================
-- 15. notifications（通知表）
-- ============================================
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

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;

-- ============================================
-- 16. mind_maps（思维导图表）
-- ============================================
CREATE TABLE mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  root_node JSONB NOT NULL,
  layout VARCHAR(20) DEFAULT 'right' CHECK (layout IN ('right', 'left', 'top', 'bottom')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mindmaps_canvas ON mind_maps(canvas_id);

-- ============================================
-- 17. kanban_boards（看板表）
-- ============================================
CREATE TABLE kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  columns JSONB NOT NULL,
  cards JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_kanban_canvas ON kanban_boards(canvas_id);

-- ============================================
-- 18. swimlanes（泳道图表）
-- ============================================
CREATE TABLE swimlanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  direction VARCHAR(20) DEFAULT 'horizontal' CHECK (direction IN ('horizontal', 'vertical')),
  lanes JSONB NOT NULL,
  elements JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_swimlanes_canvas ON swimlanes(canvas_id);

-- ============================================
-- 初始化管理员账号
-- 密码: admin123（首次登录后请立即修改）
-- ============================================
INSERT INTO users (id, username, email, password_hash, is_admin, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'admin@company.local',
  '$2a$12$dVab2Lqnq3sdPrn41ZvOfeBo3hkUwPdDEywyKhy2Fs3P/YVNsNOZy',
  TRUE,
  TRUE
);

INSERT INTO profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', '系统管理员');
