# DrawWork 完整实施计划

## 技术栈（确定版）

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端 | React 18 + Vite + Excalidraw | UI 与画板引擎 |
| 认证 | Supabase Auth | 登录/注册/权限 |
| 数据库 | Supabase PostgreSQL | 用户、画板、画布、分享数据 |
| 文件存储 | Supabase Storage | 图片、视频、GIF |
| 实时协作 | **PartyKit** (推荐) | Yjs WebSocket 服务器 |
| 部署 | Vercel (前端) + PartyKit (协作) | 全球 CDN |

**备选**：Render (免费) 替代 PartyKit

---

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    React + Excalidraw                     │  │
│  │                     DrawWork 前端                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                    │                    │            │
│         ▼                    ▼                    ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Vercel     │    │   PartyKit   │    │  Supabase    │     │
│  │   (CDN)      │    │  (WebSocket) │    │  (REST API)  │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                                              │                 │
│                                              ▼                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                Supabase Cloud 基础设施                    │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │  │
│  │  │    Auth     │ │ PostgreSQL  │ │     Storage      │   │  │
│  │  │  (JWT)      │ │   (数据)     │ │   (S3兼容)       │   │  │
│  │  └─────────────┘ └─────────────┘ └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实施阶段

### Phase 0：环境准备（第1天）

#### 0.1 注册账号
```bash
# 1. 注册 Supabase
访问 https://supabase.com
创建项目，记录：
- Project URL: https://xxxxx.supabase.co
- anon public key: eyJhbGci...

# 2. 注册 PartyKit (推荐) 或准备 Render
访问 https://partykit.io
或使用 Render: https://render.com

# 3. 准备 Vercel 账号
访问 https://vercel.com
```

#### 0.2 本地开发环境
```bash
# 创建项目目录
mkdir drawwork && cd drawwork

# 初始化前端
npm create vite@latest frontend -- --template react

# 安装依赖
cd frontend
npm install @supabase/supabase-js yjs y-partykit partykit lucide-react
npm install -D tailwindcss postcss autoprefixer

# 初始化 Tailwind
npx tailwindcss init -p

# 创建目录结构
mkdir -p src/{components,hooks,lib,stores,utils}
mkdir -p supabase/migrations
```

#### 0.3 环境变量
```bash
# frontend/.env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PARTYKIT_HOST=localhost:1999  # 开发用，生产改为部署地址
```

---

### Phase 1：数据库设计（第1-2天）

#### 1.1 创建迁移文件
```sql
-- supabase/migrations/001_initial.sql

-- 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== profiles 表 ====================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_profile_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();

-- ==================== boards 表 ====================
CREATE TABLE boards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid REFERENCES profiles(id) NOT NULL,
  name text NOT NULL DEFAULT '未命名画板',
  description text,
  is_public boolean DEFAULT false,
  cover_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== canvases 表 ====================
CREATE TABLE canvases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT '画布 1',
  sort_order integer DEFAULT 0,
  yjs_room_id text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER update_canvases_updated_at
  BEFORE UPDATE ON canvases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== board_shares 表 ====================
CREATE TABLE board_shares (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission text NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- ==================== share_tokens 表（公开分享）====================
CREATE TABLE share_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  permission text DEFAULT 'viewer' CHECK (permission IN ('editor', 'viewer', 'commenter')),
  expires_at timestamptz,
  max_uses integer,
  used_count integer DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ==================== yjs_snapshots 表 ====================
CREATE TABLE yjs_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  canvas_id uuid REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  content bytea NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 每画布只保留最近20个快照
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM yjs_snapshots
  WHERE canvas_id = NEW.canvas_id
    AND id NOT IN (
      SELECT id FROM yjs_snapshots
      WHERE canvas_id = NEW.canvas_id
      ORDER BY created_at DESC
      LIMIT 20
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cleanup_snapshots_after_insert
  AFTER INSERT ON yjs_snapshots
  FOR EACH ROW EXECUTE FUNCTION cleanup_old_snapshots();

-- ==================== board_visits 表 ====================
CREATE TABLE board_visits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  visited_at timestamptz DEFAULT now(),
  UNIQUE(board_id, user_id)
);
```

#### 1.2 RLS 权限策略
```sql
-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE yjs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_visits ENABLE ROW LEVEL SECURITY;

-- profiles: 所有人可读，仅自己可改
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- boards: 所有者全权限，公开/分享用户可读
CREATE POLICY "Board owners have full access"
  ON boards FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Public boards are viewable"
  ON boards FOR SELECT
  USING (is_public = true);

CREATE POLICY "Shared users can view"
  ON boards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_shares
      WHERE board_id = boards.id AND user_id = auth.uid()
    )
  );

-- canvases: 继承画板权限
CREATE POLICY "Canvas access follows board"
  ON canvases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE id = canvases.board_id 
      AND (owner_id = auth.uid() OR is_public = true)
    )
    OR EXISTS (
      SELECT 1 FROM board_shares
      WHERE board_id = canvases.board_id AND user_id = auth.uid()
    )
  );

-- board_shares: 只有画板所有者能管理
CREATE POLICY "Only board owner can manage shares"
  ON board_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE id = board_shares.board_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can see their shares"
  ON board_shares FOR SELECT
  USING (user_id = auth.uid());

-- yjs_snapshots: 有画布权限即可读写
CREATE POLICY "Snapshot access follows canvas"
  ON yjs_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM canvases c
      JOIN boards b ON c.board_id = b.id
      WHERE c.id = yjs_snapshots.canvas_id
      AND (b.owner_id = auth.uid() OR b.is_public = true)
    )
  );
```

#### 1.3 部署到 Supabase
```bash
# 方式1：通过 Supabase Studio Web 界面执行
# 方式2：使用 Supabase CLI
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

---

### Phase 2：PartyKit 实时协作服务器（第2-3天）

#### 2.1 创建 PartyKit 项目
```bash
# 在项目根目录
cd drawwork
npm create partykit@latest yjs-server
# 选择 TypeScript 模板

cd yjs-server
npm install yjs y-partykit
```

#### 2.2 编写 PartyKit 服务器
```typescript
// yjs-server/src/server.ts
import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";
import * as Y from "yjs";

// Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

interface TokenPayload {
  sub: string; // user id
  board_id: string;
  permission: "owner" | "editor" | "viewer" | "commenter";
}

export default class YjsServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  // 验证用户权限
  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      // 调用 Supabase 验证 JWT
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": SUPABASE_ANON_KEY,
        },
      });

      if (!response.ok) return null;
      const user = await response.json();

      // 从 room.id 解析 board_id (格式: board_{uuid}_{canvas_id})
      const parts = this.room.id.split("_");
      const boardId = parts.slice(1, parts.length - 1).join("_");

      // 查询用户对画板的权限
      const permResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/board_shares?select=permission&board_id=eq.${boardId}&user_id=eq.${user.id}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_ANON_KEY,
          },
        }
      );

      const shares = await permResponse.json();
      const permission = shares.length > 0 ? shares[0].permission : "owner";

      return {
        sub: user.id,
        board_id: boardId,
        permission,
      };
    } catch (e) {
      console.error("Token verification failed:", e);
      return null;
    }
  }

  // 加载文档初始内容
  async loadYDoc(): Promise<Uint8Array | null> {
    // 从 Supabase 加载最新的快照
    const canvasId = this.room.id.split("_").pop();
    
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/yjs_snapshots?select=content&canvas_id=eq.${canvasId}&order=created_at.desc&limit=1`,
        {
          headers: {
            "apikey": SUPABASE_ANON_KEY,
          },
        }
      );

      const snapshots = await response.json();
      if (snapshots.length > 0) {
        // Base64 解码
        const binaryString = atob(snapshots[0].content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }
    } catch (e) {
      console.error("Failed to load ydoc:", e);
    }
    return null;
  }

  // 保存文档
  async saveYDoc(doc: Y.Doc, userId: string): Promise<void> {
    const canvasId = this.room.id.split("_").pop();
    const content = Y.encodeStateAsUpdate(doc);
    
    // Base64 编码
    const base64 = btoa(String.fromCharCode(...content));

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/yjs_snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          canvas_id: canvasId,
          content: base64,
          created_by: userId || null,
        }),
      });
    } catch (e) {
      console.error("Failed to save ydoc:", e);
    }
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // 从 URL 获取 token
    const token = new URL(ctx.request.url).searchParams.get("token");
    
    let userId: string | null = null;
    let isReadOnly = false;

    if (token) {
      const payload = await this.verifyToken(token);
      if (!payload) {
        conn.close(1008, "Unauthorized");
        return;
      }
      userId = payload.sub;
      isReadOnly = payload.permission === "viewer" || payload.permission === "commenter";
    } else {
      // 检查是否是公开画板
      const isPublic = await this.checkIsPublic();
      if (!isPublic) {
        conn.close(1008, "Unauthorized");
        return;
      }
      isReadOnly = true;
    }

    // 连接 Yjs
    return onConnect(conn, this.room, {
      load: async () => {
        const data = await this.loadYDoc();
        return data ? new Y.Doc({ guid: this.room.id }) : new Y.Doc();
      },
      callback: {
        handler: async (doc) => {
          await this.saveYDoc(doc, userId);
        },
        // 每 30 秒保存一次
        debounceWait: 30000,
        maxDebounceWait: 60000,
      },
    });
  }

  async checkIsPublic(): Promise<boolean> {
    const boardId = this.room.id.split("_").slice(1, -1).join("_");
    
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/boards?select=is_public&id=eq.${boardId}`,
        {
          headers: { "apikey": SUPABASE_ANON_KEY },
        }
      );
      const boards = await response.json();
      return boards.length > 0 && boards[0].is_public;
    } catch {
      return false;
    }
  }
}
```

#### 2.3 PartyKit 配置
```typescript
// yjs-server/partykit.ts
import type { PartyKitServer } from "partykit/server";

const config: PartyKitServer = {
  main: "src/server.ts",
  name: "drawwork-yjs",
  // 环境变量需要在 PartyKit dashboard 中配置
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY!,
  },
};

export default config;
```

#### 2.4 部署 PartyKit
```bash
cd yjs-server
npx partykit deploy

# 记录输出地址：
# https://drawwork-yjs.username.partykit.dev
```

---

### Phase 3：前端开发（第4-8天）

#### 3.1 Supabase 客户端
```javascript
// frontend/src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
```

#### 3.2 认证 Hook
```javascript
// frontend/src/hooks/useAuth.js
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 获取当前会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 监听状态变化
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  const signUp = async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    })
    return { data, error }
  }

  const signIn = (email, password) => 
    supabase.auth.signInWithPassword({ email, password })

  const signInWithOAuth = (provider) =>
    supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    })

  const signOut = () => supabase.auth.signOut()

  return { user, profile, loading, signUp, signIn, signInWithOAuth, signOut }
}
```

#### 3.3 Yjs + PartyKit Hook
```javascript
// frontend/src/hooks/useCollaboration.js
import { useEffect, useState, useRef } from 'react'
import * as Y from 'yjs'
import YPartyKitProvider from 'y-partykit/provider'
import { supabase } from '../lib/supabase'

const PARTY_HOST = import.meta.env.VITE_PARTYKIT_HOST

export function useCollaboration(canvasId, boardId, token) {
  const [doc, setDoc] = useState(null)
  const [provider, setProvider] = useState(null)
  const [synced, setSynced] = useState(false)
  const [awareness, setAwareness] = useState([])

  useEffect(() => {
    if (!canvasId || !boardId) return

    // 创建 Yjs Doc
    const yDoc = new Y.Doc()

    // 先从 IndexedDB 加载本地缓存
    loadFromIndexedDB(canvasId).then(localData => {
      if (localData) {
        Y.applyUpdate(yDoc, localData)
      }
    })

    // 连接 PartyKit
    const roomId = `board_${boardId}_${canvasId}`
    const yProvider = new YPartyKitProvider(
      PARTY_HOST,
      roomId,
      yDoc,
      {
        params: token ? { token } : {},
        connect: true,
      }
    )

    yProvider.on('sync', (isSynced) => {
      setSynced(isSynced)
    })

    // 监听 Awareness（光标位置、用户状态）
    yProvider.awareness.on('change', () => {
      const states = Array.from(yProvider.awareness.getStates().values())
      setAwareness(states)
    })

    // 本地变更时保存到 IndexedDB
    yDoc.on('update', (update) => {
      saveToIndexedDB(canvasId, Y.encodeStateAsUpdate(yDoc))
    })

    setDoc(yDoc)
    setProvider(yProvider)

    return () => {
      yProvider.destroy()
      yDoc.destroy()
    }
  }, [canvasId, boardId, token])

  return { doc, provider, synced, awareness }
}

// IndexedDB 辅助函数
async function loadFromIndexedDB(canvasId) {
  return new Promise((resolve) => {
    const request = indexedDB.open('drawwork', 1)
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('ydocs')
    }
    request.onsuccess = (e) => {
      const db = e.target.result
      const tx = db.transaction('ydocs', 'readonly')
      const store = tx.objectStore('ydocs')
      const getReq = store.get(canvasId)
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => resolve(null)
    }
    request.onerror = () => resolve(null)
  })
}

async function saveToIndexedDB(canvasId, data) {
  const request = indexedDB.open('drawwork', 1)
  request.onsuccess = (e) => {
    const db = e.target.result
    const tx = db.transaction('ydocs', 'readwrite')
    const store = tx.objectStore('ydocs')
    store.put(data, canvasId)
  }
}
```

#### 3.4 画板管理 Hook
```javascript
// frontend/src/hooks/useBoards.js
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useBoards() {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(false)

  // 获取画板列表
  const fetchBoards = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('boards')
      .select(`
        *,
        canvases(*),
        board_shares(*)
      `)
      .order('updated_at', { ascending: false })
    
    if (!error) setBoards(data || [])
    setLoading(false)
    return { data, error }
  }, [])

  // 创建画板
  const createBoard = async (name, description = '') => {
    // 1. 创建画板
    const { data: board, error } = await supabase
      .from('boards')
      .insert({ name, description })
      .select()
      .single()

    if (error) return { error }

    // 2. 创建默认画布
    const { data: canvas, error: canvasError } = await supabase
      .from('canvases')
      .insert({
        board_id: board.id,
        name: '画布 1',
        yjs_room_id: `board_${board.id}_default`
      })
      .select()
      .single()

    if (canvasError) return { error: canvasError }

    return { data: { ...board, canvases: [canvas] } }
  }

  // 删除画板
  const deleteBoard = async (boardId) => {
    return supabase.from('boards').delete().eq('id', boardId)
  }

  // 更新画板
  const updateBoard = async (boardId, updates) => {
    return supabase
      .from('boards')
      .update(updates)
      .eq('id', boardId)
  }

  // 添加画布
  const addCanvas = async (boardId, name) => {
    const canvasId = crypto.randomUUID()
    return supabase
      .from('canvases')
      .insert({
        board_id: boardId,
        name,
        yjs_room_id: `board_${boardId}_${canvasId}`,
        sort_order: 999 // 默认排最后
      })
      .select()
      .single()
  }

  // 分享画板给用户
  const shareBoard = async (boardId, targetUsername, permission = 'viewer') => {
    // 查找用户
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', targetUsername)
      .single()

    if (!targetUser) return { error: '用户不存在' }

    return supabase.from('board_shares').insert({
      board_id: boardId,
      user_id: targetUser.id,
      permission
    })
  }

  // 生成公开分享链接
  const generateShareLink = async (boardId, permission = 'viewer', expiresInDays = 7) => {
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const { data, error } = await supabase
      .from('share_tokens')
      .insert({
        board_id: boardId,
        token,
        permission,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (error) return { error }

    return { 
      url: `${window.location.origin}/join?token=${token}`,
      token
    }
  }

  // 使用分享链接加入
  const joinWithToken = async (token) => {
    const { data, error } = await supabase
      .from('share_tokens')
      .select('*, boards(*)')
      .eq('token', token)
      .single()

    if (error || !data) return { error: '链接无效' }

    // 检查是否过期
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { error: '链接已过期' }
    }

    return { data }
  }

  return {
    boards,
    loading,
    fetchBoards,
    createBoard,
    deleteBoard,
    updateBoard,
    addCanvas,
    shareBoard,
    generateShareLink,
    joinWithToken
  }
}
```

#### 3.5 文件上传
```javascript
// frontend/src/hooks/useStorage.js
import { supabase } from '../lib/supabase'

export function useStorage() {
  const uploadFile = async (file, boardId) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${boardId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('drawings')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) return { error }

    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('drawings')
      .getPublicUrl(fileName)

    return { url: publicUrl }
  }

  return { uploadFile }
}
```

---

### Phase 4：页面组件（第9-12天）

#### 4.1 路由结构
```jsx
// App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Auth from './pages/Auth'
import Join from './pages/Join'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/join" element={<Join />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/board/:boardId/:canvasId?" element={<Editor />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

#### 4.2 登录页
```jsx
// pages/Auth.jsx
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  
  const { signIn, signUp, signInWithOAuth } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isLogin) {
      const { error } = await signIn(email, password)
      if (error) setError(error.message)
      else navigate('/')
    } else {
      const { error } = await signUp(email, password, username)
      if (error) setError(error.message)
      else {
        alert('请检查邮箱验证链接')
        setIsLogin(true)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {isLogin ? '登录' : '注册'}
        </h1>
        
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-3 border rounded"
              required
            />
          )}
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full p-3 border rounded"
            required
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full p-3 border rounded"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-3 rounded hover:bg-blue-600"
          >
            {isLogin ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-500 hover:underline"
          >
            {isLogin ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => signInWithOAuth('github')}
            className="flex-1 bg-gray-800 text-white p-2 rounded"
          >
            GitHub 登录
          </button>
          <button
            onClick={() => signInWithOAuth('google')}
            className="flex-1 bg-red-500 text-white p-2 rounded"
          >
            Google 登录
          </button>
        </div>
      </div>
    </div>
  )
}
```

#### 4.3 Dashboard 画板大厅
```jsx
// pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoards } from '../hooks/useBoards'
import { useAuth } from '../hooks/useAuth'
import { Plus, Trash2, Share2, Settings } from 'lucide-react'
import CreateBoardModal from '../components/CreateBoardModal'
import ShareModal from '../components/ShareModal'

export default function Dashboard() {
  const { user } = useAuth()
  const { boards, loading, fetchBoards, createBoard, deleteBoard } = useBoards()
  const [showCreate, setShowCreate] = useState(false)
  const [shareBoard, setShareBoard] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoards()
  }, [])

  const handleCreate = async (name, description) => {
    const { data, error } = await createBoard(name, description)
    if (!error) {
      setShowCreate(false)
      navigate(`/board/${data.id}`)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的画板</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          <Plus size={20} />
          新建画板
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {boards.map(board => (
            <div
              key={board.id}
              onClick={() => navigate(`/board/${board.id}`)}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden group"
            >
              <div className="h-32 bg-gray-100 relative">
                {board.cover_url ? (
                  <img
                    src={board.cover_url}
                    alt={board.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    无封面
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setShareBoard(board)
                    }}
                    className="p-2 bg-white rounded-full shadow mr-2 hover:bg-gray-50"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm('确定删除此画板？')) {
                        deleteBoard(board.id).then(fetchBoards)
                      }
                    }}
                    className="p-2 bg-white rounded-full shadow hover:bg-red-50"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold truncate">{board.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {board.canvases?.length || 1} 个画布
                </p>
                {board.is_public && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded mt-2 inline-block">
                    公开
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBoardModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {shareBoard && (
        <ShareModal
          board={shareBoard}
          onClose={() => setShareBoard(null)}
        />
      )}
    </div>
  )
}
```

#### 4.4 分享弹窗组件
```jsx
// components/ShareModal.jsx
import { useState } from 'react'
import { useBoards } from '../hooks/useBoards'
import { Copy, Check } from 'lucide-react'

export default function ShareModal({ board, onClose }) {
  const { shareBoard, generateShareLink } = useBoards()
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState('viewer')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('invite') // invite | link

  const handleInvite = async (e) => {
    e.preventDefault()
    await shareBoard(board.id, username, permission)
    setUsername('')
    alert('已发送邀请')
  }

  const handleGenerateLink = async () => {
    const { url, error } = await generateShareLink(board.id, permission)
    if (!error) {
      setShareUrl(url)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">分享画板</h2>

        <div className="flex gap-4 mb-4 border-b">
          <button
            onClick={() => setActiveTab('invite')}
            className={`pb-2 ${activeTab === 'invite' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
          >
            邀请用户
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`pb-2 ${activeTab === 'link' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
          >
            分享链接
          </button>
        </div>

        {activeTab === 'invite' ? (
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">用户名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="输入对方用户名"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">权限</label>
              <select
                value={permission}
                onChange={e => setPermission(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="viewer">查看者</option>
                <option value="editor">编辑者</option>
                <option value="commenter">评论者</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            >
              发送邀请
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">链接权限</label>
              <select
                value={permission}
                onChange={e => setPermission(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="viewer">查看者</option>
                <option value="editor">编辑者</option>
              </select>
            </div>

            {!shareUrl ? (
              <button
                onClick={handleGenerateLink}
                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                生成链接
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 p-2 border rounded bg-gray-50"
                />
                <button
                  onClick={copyLink}
                  className="px-4 bg-gray-100 rounded hover:bg-gray-200"
                >
                  {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 p-2 border rounded hover:bg-gray-50"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
```

#### 4.5 编辑器页面（Excalidraw 集成）
```jsx
// pages/Editor.jsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import { useCollaboration } from '../hooks/useCollaboration'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import * as Y from 'yjs'

export default function Editor() {
  const { boardId, canvasId: routeCanvasId } = useParams()
  const [searchParams] = useSearchParams()
  const shareToken = searchParams.get('token')
  
  const { user } = useAuth()
  const [canvas, setCanvas] = useState(null)
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const excalidrawRef = useRef(null)

  // 获取或创建默认画布
  useEffect(() => {
    async function initCanvas() {
      if (routeCanvasId) {
        // 使用指定画布
        const { data } = await supabase
          .from('canvases')
          .select('*')
          .eq('id', routeCanvasId)
          .single()
        setCanvas(data)
      } else {
        // 获取画板的第一个画布
        const { data } = await supabase
          .from('canvases')
          .select('*')
          .eq('board_id', boardId)
          .order('sort_order')
          .limit(1)
          .single()
        setCanvas(data)
      }

      // 获取画板信息
      const { data: boardData } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId)
        .single()
      setBoard(boardData)
    }

    initCanvas()
  }, [boardId, routeCanvasId])

  // 连接 Yjs 协作
  const { doc, synced, awareness } = useCollaboration(
    canvas?.id,
    boardId,
    shareToken || (user ? undefined : null) // shareToken 或匿名访问
  )

  // 绑定 Yjs 到 Excalidraw
  useEffect(() => {
    if (!doc || !excalidrawRef.current) return

    const yElements = doc.getArray('elements')
    const yAppState = doc.getMap('appState')

    // 监听 Yjs 变更，更新 Excalidraw
    yElements.observe(() => {
      const newElements = yElements.toArray()
      setElements(newElements)
      
      if (excalidrawRef.current) {
        excalidrawRef.current.updateScene({ elements: newElements })
      }
    })

    // 初始同步
    if (yElements.length > 0) {
      setElements(yElements.toArray())
    }
  }, [doc])

  const handleChange = (elements, appState) => {
    if (!doc) return
    
    // 将变更写入 Yjs
    const yElements = doc.getArray('elements')
    doc.transact(() => {
      yElements.delete(0, yElements.length)
      yElements.push(elements)
    })
  }

  if (!canvas) return <div>加载中...</div>

  return (
    <div className="h-screen flex flex-col">
      {/* 顶部栏 */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold">{board?.name}</h1>
          <span className="text-gray-500">/ {canvas.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {!synced && <span className="text-sm text-yellow-600">同步中...</span>}
          <span className="text-sm text-gray-500">
            {awareness.length} 人在线
          </span>
        </div>
      </div>

      {/* Excalidraw */}
      <div className="flex-1">
        <Excalidraw
          ref={excalidrawRef}
          initialData={{ elements }}
          onChange={handleChange}
          theme="light"
          langCode="zh-CN"
        />
      </div>
    </div>
  )
}
```

---

### Phase 5：部署上线（第13-14天）

#### 5.1 部署 PartyKit
```bash
cd yjs-server
npx partykit deploy

# 记录域名：https://drawwork-yjs.username.partykit.dev
```

#### 5.2 更新前端环境变量
```bash
# frontend/.env.production
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PARTYKIT_HOST=https://drawwork-yjs.username.partykit.dev
```

#### 5.3 部署到 Vercel
```bash
cd frontend
npm run build

# 或使用 Vercel CLI
npx vercel --prod
```

#### 5.4 配置 Supabase Storage CORS
```javascript
// 在 Supabase Dashboard > Storage > Policies 中添加
{
  "origins": ["https://your-domain.vercel.app"],
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "headers": ["Authorization", "apikey"]
}
```

---

## 成本预估

| 服务 | 免费档 | 付费档 | 备注 |
|------|--------|--------|------|
| Supabase | $0 | $25/月 | 免费档 500MB 数据库够用 |
| PartyKit | $0 | ~$5/月 | 按请求数计费，低用量免费 |
| Vercel | $0 | $20/月 | 免费档无限制 |
| **总计** | **$0** | **$50/月** | |

---

## 备份与数据安全

1. **数据库自动备份**：Supabase 每天自动备份
2. **Yjs 数据**：每 30 秒保存快照到 PostgreSQL，保留最近 20 个版本
3. **本地缓存**：IndexedDB 保存本地副本，断网可用
4. **手动导出**：可添加导出 JSON/SVG 功能

---

## 实施检查清单

### Phase 0
- [ ] 注册 Supabase
- [ ] 注册 PartyKit
- [ ] 注册 Vercel
- [ ] 本地开发环境就绪

### Phase 1
- [ ] 所有数据表创建
- [ ] RLS 策略配置
- [ ] 数据库迁移完成

### Phase 2
- [ ] PartyKit 服务器部署
- [ ] 权限验证通过
- [ ] 自动保存工作

### Phase 3-4
- [ ] 登录/注册可用
- [ ] 画板 CRUD 可用
- [ ] 分享功能可用
- [ ] 多人协作可用
- [ ] 文件上传可用

### Phase 5
- [ ] 生产环境部署
- [ ] 自定义域名（可选）
- [ ] 监控配置

---

*计划版本: v1.0*  
*预计总工期: 14天*  
*更新日期: 2026-04-25*
