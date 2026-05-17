# 方案B (Supabase) 账号系统详细设计

## 一句话结论

**完全可以，且比自建方案更强大**。Supabase Auth / Firebase Auth 是专业级的身份验证服务，功能远超一般自建方案。

---

## Supabase Auth 核心能力

### 1. 多种登录方式

| 方式 | 支持状态 | 说明 |
|------|---------|------|
| 邮箱 + 密码 | ✅ 原生支持 | 最基础的登录方式 |
| 邮箱 + 魔法链接 | ✅ 原生支持 | 无密码登录，点击邮件链接直接登录 |
| 手机号 + 验证码 | ✅ 原生支持 | SMS 登录，支持国内运营商（需配置） |
| OAuth (Google/GitHub/微信等) | ✅ 原生支持 | 20+ 社交平台一键登录 |
| SSO (企业微信/钉钉) | ✅ 支持 | 通过 SAML/OIDC 接入 |

### 2. 用户数据结构

Supabase 自动维护 `auth.users` 表，包含：

```sql
-- Supabase 自动创建的表（无需手动维护）
auth.users (
  id: uuid PRIMARY KEY,           -- 用户唯一ID
  email: varchar,                 -- 邮箱
  encrypted_password: varchar,    -- 加密密码
  email_confirmed_at: timestamptz,-- 邮箱验证时间
  phone: varchar,                 -- 手机号
  confirmation_sent_at: timestamptz,
  recovery_sent_at: timestamptz,
  email_change: varchar,
  email_change_sent_at: timestamptz,
  new_email: varchar,
  -- 还有更多元数据字段...
)
```

### 3. 与业务数据关联

在 DrawWork 中，你需要创建自己的 `profiles` 或 `users` 表来扩展用户信息：

```sql
-- 你自己的业务表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 画板表关联到 profiles
CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- ...
);
```

### 4. Row Level Security (RLS) - 关键特性

Supabase 的杀手级功能：**数据库级别的权限控制**

```sql
-- 设置画表只能被所有者访问
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能看到自己的画板
CREATE POLICY "Users can only see their own boards"
  ON boards FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- 创建策略：公开画板所有人可见
CREATE POLICY "Public boards are visible to everyone"
  ON boards FOR SELECT
  TO anon, authenticated
  USING (is_public = true);
```

**这意味着**：即使前端直接查询数据库，权限也会被强制执行。

---

## 与 DrawWork 需求对照

| 原方案A需求 | Supabase 实现 | 代码示例 |
|------------|--------------|---------|
| JWT 认证 | ✅ 内置 | `supabase.auth.getUser()` |
| Refresh Token | ✅ 自动处理 | Supabase JS 客户端自动刷新 |
| 用户注册/登录 | ✅ 内置 API | `supabase.auth.signUp/SignIn` |
| 权限矩阵 (owner/editor/viewer) | ✅ RLS + 业务表 | 见下方详细方案 |
| 分享链接带 Token | ✅ 可生成 JWT | 或使用数据库 share_tokens 表 |
| 限流防暴力破解 | ✅ 内置 | 自动限流，可配置 |

---

## DrawWork 账号系统设计（Supabase 版）

### 数据模型

```sql
-- 1. 用户扩展表（自动同步 auth.users）
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- 2. 画板表
CREATE TABLE boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) NOT NULL,
  name text NOT NULL,
  description text,
  is_public boolean DEFAULT false,
  cover_image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. 画布表
CREATE TABLE canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT '画布 1',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. 分享权限表（实现权限矩阵）
CREATE TABLE board_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission text NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- 5. 分享链接 Token 表（公开分享）
CREATE TABLE share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,  -- 随机生成的分享码
  permission text DEFAULT 'viewer',
  expires_at timestamptz,      -- 可设置过期时间
  max_uses integer,            -- 可设置最大使用次数
  used_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

### 权限策略 (RLS)

```sql
-- 画板表权限
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- 策略1：所有者拥有全部权限
CREATE POLICY "Board owners have full access"
  ON boards FOR ALL
  TO authenticated
  USING (owner_id = auth.uid());

-- 策略2：公开画板所有人可读
CREATE POLICY "Public boards are readable"
  ON boards FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- 策略3：被分享用户可读
CREATE POLICY "Shared users can read boards"
  ON boards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM board_shares 
      WHERE board_id = boards.id 
      AND user_id = auth.uid()
    )
  );

-- 画布表权限（继承画板权限）
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Canvas access follows board access"
  ON canvases FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE id = canvases.board_id 
      AND (owner_id = auth.uid() OR is_public = true)
    )
  );

-- 分享权限表
ALTER TABLE board_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see shares of their boards"
  ON board_shares FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE id = board_shares.board_id 
      AND owner_id = auth.uid()
    )
    OR user_id = auth.uid()  -- 被分享者也能看到
  );
```

---

## 前端集成代码

### 1. 初始化 Supabase 客户端

```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### 2. 认证 Hook（替代自建 JWT）

```javascript
// hooks/useAuth.js
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 获取当前会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 监听认证状态变化
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  // 注册
  const signUp = async (email, password, metadata) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: metadata.username }
      }
    })
    if (!error) {
      // 自动创建 profile 记录
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: metadata.username
      })
    }
    return { data, error }
  }

  // 登录
  const signIn = (email, password) => 
    supabase.auth.signInWithPassword({ email, password })

  // 登出
  const signOut = () => supabase.auth.signOut()

  return { user, loading, signUp, signIn, signOut }
}
```

### 3. API 调用（无需手动处理 Token）

```javascript
// 查询画板（自动携带 JWT）
const { data: boards, error } = await supabase
  .from('boards')
  .select('*, canvases(*)')
  .order('updated_at', { ascending: false })

// 创建画板
const { data, error } = await supabase
  .from('boards')
  .insert({ name: '新画板', owner_id: user.id })
  .select()
  .single()

// 无需手动添加 Authorization header，Supabase 客户端自动处理
```

### 4. 分享链接生成

```javascript
// 生成公开分享链接
const generateShareLink = async (boardId, permission = 'viewer') => {
  // 生成随机 token
  const token = crypto.randomUUID()
  
  const { data, error } = await supabase
    .from('share_tokens')
    .insert({
      board_id: boardId,
      token: token,
      permission: permission,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天过期
    })
    .select()
    .single()

  if (error) return null

  return `${window.location.origin}/?room=${boardId}&token=${token}`
}

// 使用分享 token 访问
const accessWithShareToken = async (token) => {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('*, boards(*)')
    .eq('token', token)
    .single()

  if (error || !data) return null

  // 检查是否过期
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { error: 'Token expired' }
  }

  // 增加使用次数
  await supabase
    .from('share_tokens')
    .update({ used_count: data.used_count + 1 })
    .eq('id', data.id)

  return { board: data.boards, permission: data.permission }
}
```

---

## 从方案A迁移到方案B的路径

### 数据迁移

```javascript
// 迁移脚本：将现有 SQLite 用户迁移到 Supabase
const migrateUsers = async () => {
  // 1. 读取现有 SQLite 用户
  const oldUsers = await sqlite.query('SELECT * FROM users')

  for (const oldUser of oldUsers) {
    // 2. 在 Supabase 创建用户
    const { data, error } = await supabase.auth.admin.createUser({
      email: oldUser.email,
      password: 'temporary-password-' + Math.random(), // 用户需要重置密码
      email_confirm: true,
      user_metadata: { username: oldUser.username }
    })

    if (!error) {
      // 3. 创建 profile
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: oldUser.username
      })

      // 4. 更新画板的 owner_id
      await supabase
        .from('boards')
        .update({ owner_id: data.user.id })
        .eq('old_user_id', oldUser.id)
    }
  }
}
```

---

## 成本对比

| 项目 | 方案A (自建) | 方案B (Supabase) |
|------|-------------|------------------|
| 服务器 | ￥50-200/月 | 免费档够用 |
| 数据库 | SQLite 免费 | PostgreSQL 免费档500MB |
| 认证 | 自建免费 | 免费档无限 MAU |
| 存储 | Minio 自建 | 免费档 1GB |
| 带宽 | 按量 | 免费档 2GB/月 |
| **总计** | **￥50-200/月** | **免费起步** |

> Supabase 免费档限制：
> - 数据库：500MB
> - 带宽：2GB/月
> - 存储：1GB
> - 对于个人/小团队项目，通常够用很久

---

## 结论

**方案B不仅能接账号系统，而且：**

1. ✅ **功能更全**：OAuth、魔法链接、手机号都原生支持
2. ✅ **更安全**：专业团队维护，自动处理安全更新
3. ✅ **更省事**：无需写认证中间件、无需处理 Token 刷新
4. ✅ **权限更细**：RLS 能在数据库层面强制权限
5. ✅ **成本更低**：起步免费，付费后按量计费

**唯一门槛**：需要学习 Supabase 的 API 和 RLS 概念，但学习成本远低于自建后端。

---

*文档日期: 2026-04-25*
