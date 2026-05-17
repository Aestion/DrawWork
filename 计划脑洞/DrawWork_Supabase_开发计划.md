# DrawWork Supabase 开发计划

> 技术栈：Excalidraw + Supabase (PostgreSQL + Auth + Storage + Realtime)  
> 目标：零后端维护，聚焦前端体验

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vite + React)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Excalidraw 引擎（手绘风 + GIF/视频/思维导图）       │   │
│  │  Supabase JS Client                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  本地模式：IndexedDB(Yjs) + localStorage(元数据)             │
│  云端模式：Supabase Auth + PostgreSQL + Realtime          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Supabase 托管服务                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │    Auth     │  │ PostgreSQL  │  │    Realtime         │ │
│  │  (JWT)      │  │    + RLS    │  │  (WebSocket)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │   Storage   │  │ Edge Functions│                         │ │
│  │  (S3兼容)    │  │  (可选)      │                         │ │
│  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、数据模型设计

### 2.1 数据库 Schema

```sql
-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== 用户表 ====================
-- auth.users 由 Supabase 自动创建管理，无需手动维护
-- 我们创建 profiles 表扩展用户信息

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用户注册时自动创建 profile 的触发器
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_profile_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();

-- ==================== 画板表 ====================
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL DEFAULT '未命名画板',
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== 画布表 ====================
CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT '画布 1',
  sort_order INTEGER DEFAULT 0,
  yjs_room_id TEXT UNIQUE NOT NULL, -- 格式: board_{board_id}_{canvas_id}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== 分享权限表 ====================
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- ==================== 公开分享 Token 表 ====================
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  permission TEXT DEFAULT 'viewer' CHECK (permission IN ('editor', 'viewer', 'commenter')),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== Yjs 文档快照表 ====================
CREATE TABLE yjs_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE NOT NULL,
  content BYTEA NOT NULL, -- Yjs 二进制数据
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每画布只保留最近10个快照
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM yjs_snapshots
  WHERE canvas_id = NEW.canvas_id
    AND id NOT IN (
      SELECT id FROM yjs_snapshots
      WHERE canvas_id = NEW.canvas_id
      ORDER BY created_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cleanup_snapshots_after_insert
  AFTER INSERT ON yjs_snapshots
  FOR EACH ROW EXECUTE FUNCTION cleanup_old_snapshots();

-- ==================== 访问记录表 ====================
CREATE TABLE board_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- 更新访问时间
CREATE OR REPLACE FUNCTION update_visit_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.visited_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_board_visits_time
  BEFORE UPDATE ON board_visits
  FOR EACH ROW EXECUTE FUNCTION update_visit_time();
```

### 2.2 Row Level Security (RLS) 策略

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
  ON boards FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "Public boards are viewable"
  ON boards FOR SELECT USING (is_public = true);

CREATE POLICY "Shared users can view boards"
  ON boards FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM board_shares
      WHERE board_id = boards.id AND user_id = auth.uid()
    )
  );

-- canvases: 继承画板权限
CREATE POLICY "Canvas access follows board"
  ON canvases FOR ALL USING (
    EXISTS (
      SELECT 1 FROM boards WHERE id = canvases.board_id
      AND (owner_id = auth.uid() OR is_public = true)
    )
    OR EXISTS (
      SELECT 1 FROM board_shares
      WHERE board_id = canvases.board_id AND user_id = auth.uid()
    )
  );

-- board_shares: 只有画板所有者能管理
CREATE POLICY "Only board owner can manage shares"
  ON board_shares FOR ALL USING (
    EXISTS (
      SELECT 1 FROM boards WHERE id = board_shares.board_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can see their shares"
  ON board_shares FOR SELECT USING (user_id = auth.uid());

-- share_tokens: 所有者管理，token 持有者读取
CREATE POLICY "Board owners can manage share tokens"
  ON share_tokens FOR ALL USING (
    EXISTS (
      SELECT 1 FROM boards WHERE id = share_tokens.board_id AND owner_id = auth.uid()
    )
  );

-- yjs_snapshots: 有画布权限即可读写
CREATE POLICY "Snapshot access follows canvas"
  ON yjs_snapshots FOR ALL USING (
    EXISTS (
      SELECT 1 FROM canvases c
      JOIN boards b ON c.board_id = b.id
      WHERE c.id = yjs_snapshots.canvas_id
      AND (b.owner_id = auth.uid() OR b.is_public = true)
    )
  );
```

---

## 三、前端架构

### 3.1 项目结构

```
frontend/
├── src/
│   ├── components/          # UI 组件
│   │   ├── Auth/           # 登录/注册
│   │   ├── Dashboard/      # 画板大厅
│   │   ├── Editor/         # 编辑器主组件
│   │   ├── ShareDialog/    # 分享弹窗
│   │   └── ...
│   ├── hooks/              # 自定义 Hooks
│   │   ├── useAuth.js      # 认证管理
│   │   ├── useBoards.js    # 画板数据
│   │   ├── useYjs.js       # Yjs 协作
│   │   └── useSupabase.js  # Supabase 客户端
│   ├── lib/                # 库配置
│   │   ├── supabase.js     # Supabase 初始化
│   │   ├── yjs-provider.js # Yjs Provider 封装
│   │   └── constants.js    # 常量
│   ├── stores/             # 状态管理 (Zustand)
│   │   ├── authStore.js
│   │   ├── boardStore.js
│   │   └── editorStore.js
│   └── utils/              # 工具函数
├── supabase/               # Supabase 配置
│   ├── migrations/         # 数据库迁移
│   └── functions/          # Edge Functions (可选)
└── package.json
```

### 3.2 核心 Hooks

```javascript
// hooks/useSupabase.js
import { createClient } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

const SupabaseContext = createContext(supabase)

export const useSupabase = () => useContext(SupabaseContext)

// hooks/useAuth.js
export function useAuth() {
  const supabase = useSupabase()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 获取当前会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
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
      options: {
        data: { username }
      }
    })
    return { data, error }
  }

  const signIn = async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signInWithOAuth = async (provider) => {
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  const signOut = () => supabase.auth.signOut()

  return {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithOAuth,
    signOut
  }
}

// hooks/useBoards.js
export function useBoards() {
  const supabase = useSupabase()
  const [boards, setBoards] = useState([])

  // 获取画板列表（自动处理 RLS）
  const fetchBoards = async () => {
    const { data, error } = await supabase
      .from('boards')
      .select(`
        *,
        canvases(*),
        board_shares(*)
      `)
      .order('updated_at', { ascending: false })
    
    if (!error) setBoards(data)
    return { data, error }
  }

  // 创建画板（自动创建默认画布）
  const createBoard = async (name) => {
    const { data: board, error } = await supabase
      .from('boards')
      .insert({ name })
      .select()
      .single()

    if (error) return { error }

    // 创建默认画布
    const { data: canvas, error: canvasError } = await supabase
      .from('canvases')
      .insert({
        board_id: board.id,
        name: '画布 1',
        yjs_room_id: `board_${board.id}_default`
      })
      .select()
      .single()

    return { data: { ...board, canvases: [canvas] }, error: canvasError }
  }

  // 删除画板
  const deleteBoard = async (boardId) => {
    return supabase.from('boards').delete().eq('id', boardId)
  }

  // 分享画板
  const shareBoard = async (boardId, userEmail, permission) => {
    // 先通过邮箱查用户
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (!targetUser) return { error: '用户不存在' }

    return supabase.from('board_shares').insert({
      board_id: boardId,
      user_id: targetUser.id,
      permission
    })
  }

  // 生成公开分享链接
  const generateShareLink = async (boardId, permission = 'viewer') => {
    const token = crypto.randomUUID()
    const { data, error } = await supabase
      .from('share_tokens')
      .insert({
        board_id: boardId,
        token,
        permission,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (error) return { error }
    return { url: `${window.location.origin}/?share=${token}` }
  }

  return {
    boards,
    fetchBoards,
    createBoard,
    deleteBoard,
    shareBoard,
    generateShareLink
  }
}
```

### 3.3 Yjs 与 Supabase 集成

```javascript
// lib/yjs-provider.js
import * as Y from 'yjs'
import { SupabaseProvider } from './supabase-yjs-provider'

export class YjsManager {
  constructor(supabase) {
    this.supabase = supabase
    this.docs = new Map()
  }

  async getOrCreateDoc(canvasId) {
    if (this.docs.has(canvasId)) {
      return this.docs.get(canvasId)
    }

    // 获取画布信息
    const { data: canvas } = await this.supabase
      .from('canvases')
      .select('*')
      .eq('id', canvasId)
      .single()

    if (!canvas) return null

    // 创建 Yjs Doc
    const doc = new Y.Doc()
    
    // 加载服务端快照
    const { data: snapshot } = await this.supabase
      .from('yjs_snapshots')
      .select('content')
      .eq('canvas_id', canvasId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (snapshot?.content) {
      Y.applyUpdate(doc, new Uint8Array(snapshot.content))
    }

    // 设置自动保存
    doc.on('update', debounce(async (update) => {
      // 保存增量到 Supabase
      await this.saveSnapshot(canvasId, Y.encodeStateAsUpdate(doc))
    }, 5000))

    this.docs.set(canvasId, doc)
    return doc
  }

  async saveSnapshot(canvasId, content) {
    return this.supabase
      .from('yjs_snapshots')
      .insert({
        canvas_id: canvasId,
        content: Buffer.from(content)
      })
  }

  destroyDoc(canvasId) {
    const doc = this.docs.get(canvasId)
    if (doc) {
      doc.destroy()
      this.docs.delete(canvasId)
    }
  }
}

// hooks/useYjs.js
export function useYjs(canvasId) {
  const supabase = useSupabase()
  const [doc, setDoc] = useState(null)
  const [provider, setProvider] = useState(null)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (!canvasId) return

    const manager = new YjsManager(supabase)
    
    manager.getOrCreateDoc(canvasId).then(yDoc => {
      setDoc(yDoc)
      
      // 使用 y-webrtc 或自建 WebSocket 进行实时协作
      // 或者使用 Supabase Realtime 广播
      const provider = createProvider(yDoc, canvasId)
      
      provider.on('synced', () => setSynced(true))
      setProvider(provider)
    })

    return () => {
      provider?.destroy()
      manager.destroyDoc(canvasId)
    }
  }, [canvasId])

  return { doc, provider, synced }
}
```

---

## 四、分阶段实施计划

### Phase 0：环境准备（1 天）

- [ ] 注册 Supabase 账号，创建项目
- [ ] 配置环境变量（VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY）
- [ ] 本地安装 Supabase CLI（用于开发和迁移）
- [ ] 初始化前端项目 (Vite + React)

### Phase 1：认证系统（2 天）

- [ ] 配置 Supabase Auth（邮箱、OAuth）
- [ ] 创建 profiles 表和触发器
- [ ] 开发 Auth 组件（登录/注册）
- [ ] 实现 useAuth Hook
- [ ] 配置 Auth 中间件/路由守卫

### Phase 2：画板管理（3 天）

- [ ] 创建 boards/canvases 表
- [ ] 配置 RLS 策略
- [ ] 开发 Dashboard 页面
- [ ] 实现画板 CRUD
- [ ] 实现画布增删改
- [ ] 测试权限控制

### Phase 3：Excalidraw 集成（3 天）

- [ ] 集成 Excalidraw 组件
- [ ] 实现本地 IndexedDB 存储（离线模式）
- [ ] 集成 Yjs
- [ ] 实现服务端快照保存
- [ ] 处理画布加载/保存

### Phase 4：协作功能（3 天）

- [ ] 集成 y-websocket 或 y-webrtc
- [ ] 实现实时同步
- [ ] 开发分享功能（用户邀请）
- [ ] 开发公开分享链接
- [ ] 测试多人协作

### Phase 5：文件存储（2 天）

- [ ] 配置 Supabase Storage
- [ ] 实现文件上传
- [ ] 集成图片/视频到 Excalidraw
- [ ] 测试大文件上传

### Phase 6：优化上线（2 天）

- [ ] 性能优化
- [ ] 错误处理
- [ ] 部署到 Vercel/Netlify
- [ ] 配置生产环境

**总周期：约 2 周（16 天）**

---

## 五、开发命令

```bash
# 启动本地开发（使用远程 Supabase）
npm run dev

# 或启动本地 Supabase 栈（需 Docker）
supabase start

# 推送数据库变更
supabase db push

# 生成类型定义
supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```

---

## 六、成本预估

| 项目 | 免费档 | Pro 档 ($25/月) |
|------|--------|----------------|
| 数据库 | 500MB | 8GB |
| 带宽 | 2GB/月 | 100GB/月 |
| 存储 | 1GB | 100GB |
| MAU | 无限 | 无限 |
| Edge Functions | 500K 调用 | 2M 调用 |

**结论**：个人/小团队用免费档足够，需要更多存储和带宽时升级到 Pro。

---

*计划版本: v1.0*  
*更新日期: 2026-04-25*
