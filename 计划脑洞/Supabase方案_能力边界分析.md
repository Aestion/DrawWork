# Supabase 方案能力边界分析

## 一句话总结

| 功能 | 可行性 | 方案 |
|------|--------|------|
| **登录/注册** | ✅ 完全支持 | Supabase Auth 原生支持 |
| **数据云存储** | ✅ 完全支持 | PostgreSQL + Storage |
| **画板分享** | ✅ 完全支持 | RLS + share_tokens 表 |
| **多人实时协作** | ⚠️ 需要补充方案 | 需额外托管 Yjs WebSocket |

**核心问题**：Supabase 解决了 80% 的后端需求，但**实时协作同步**需要额外方案。

---

## 详细分析

### 1. 登录/注册 ✅ 完全支持

Supabase Auth 原生提供：
- 邮箱+密码
- OAuth (Google/GitHub/微信)
- 手机号+验证码
- 魔法链接（无密码）

**无需任何额外代码**。

---

### 2. 数据云存储 ✅ 完全支持

Supabase 提供：
- PostgreSQL（自动备份、时间点恢复）
- Storage（文件存储）
- 全球 CDN

**数据不会丢失**，比自建 SQLite 更可靠。

---

### 3. 画板分享 ✅ 完全支持

通过 RLS + share_tokens 表实现：
- 用户间邀请（editor/viewer/commenter）
- 公开分享链接（带过期时间）
- 权限矩阵控制

代码示例：
```javascript
// 生成分享链接
const { data } = await supabase
  .from('share_tokens')
  .insert({
    board_id: boardId,
    token: crypto.randomUUID(),
    permission: 'viewer',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  })
```

---

### 4. 多人实时协作 ⚠️ 需要补充方案

**问题核心**：
- Yjs 需要 WebSocket 连接来同步操作变换
- Supabase Realtime 是基于 Postgres 的变更通知，**不是 WebSocket 消息通道**
- 两者技术机制不同，不能直接用 Supabase Realtime 替代 y-websocket

**为什么不能直接用 Supabase Realtime？**

```
Yjs 实时协作需要：
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   用户 A     │ ←→  │ Yjs Server   │ ←→  │   用户 B     │
│  (y-websocket)│ WebSocket │ (y-websocket)│ WebSocket │  (y-websocket)│
└──────────────┘     └──────────────┘     └──────────────┘

Supabase Realtime 是：
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   用户 A     │ ←→  │  Supabase    │ ←→  │   用户 B     │
│  (监听数据变更)│ WebSocket │  (Postgres CDC)│ WebSocket │  (监听数据变更)│
└──────────────┘     └──────────────┘     └──────────────┘

区别：
- Yjs: 同步操作变换（细粒度、高频、合并冲突）
- Supabase: 同步数据变更（整行、低频、最后写入者胜）
```

---

## 解决方案对比

### 方案 A：托管 y-websocket（推荐 ⭐⭐⭐⭐）

**架构**：
```
前端 (Supabase Auth + 数据)
  ↓
y-websocket 服务器 (独立托管)
  ↓
Yjs 文档 ← 定期保存 → Supabase PostgreSQL
```

**实施**：
```javascript
// 1. 部署 y-websocket 到 Render/Railway/Fly.io
// y-websocket 服务端代码（标准 npm 包）

// 2. 前端连接
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const doc = new Y.Doc()
const provider = new WebsocketProvider(
  'wss://yjs-your-app.onrender.com', 
  'room-name',
  doc
)

// 3. 定期保存到 Supabase
provider.on('synced', () => {
  setInterval(async () => {
    const content = Y.encodeStateAsUpdate(doc)
    await supabase
      .from('yjs_snapshots')
      .insert({ canvas_id: canvasId, content })
  }, 30000) // 30秒保存一次
})
```

**成本**：
- Render: 免费档够用（每月 100GB 带宽）
- Railway: $5/月起
- Fly.io: 按量，低用量免费

**优点**：
- ✅ 实时协作稳定
- ✅ 与 Supabase 完美配合（Supabase 管数据，y-websocket 管实时）
- ✅ 成本可控

---

### 方案 B：使用 Liveblocks（推荐 ⭐⭐⭐⭐⭐）

**架构**：
```
前端
  ↓
Liveblocks (托管 Yjs 协作)
  ↓
Supabase PostgreSQL (数据持久化)
```

**实施**：
```javascript
import { RoomProvider } from '@liveblocks/react'
import { LiveblocksProvider } from '@liveblocks/yjs'

// Liveblocks 原生支持 Yjs
const provider = new LiveblocksProvider(room, doc)
```

**成本**：
- 免费档: 1000 MAU, 10k 并发连接
- Pro: $99/月

**优点**：
- ✅ 专业托管，无需运维
- ✅ 原生 Yjs 支持
- ✅ 内置 Presence（光标、用户列表）

**缺点**：
- ❌ 比自建 y-websocket 贵
- ❌ 国内访问可能延迟高

---

### 方案 C：使用 PartyKit（推荐 ⭐⭐⭐⭐）

**架构**：
```
前端
  ↓
PartyKit (Cloudflare 边缘托管)
  ↓
Supabase PostgreSQL
```

**实施**：
```javascript
// partykit 服务器代码
import type * as Party from "partykit/server"
import { onConnect } from "y-partykit"

export default class YjsServer implements Party.Server {
  onConnect(conn, room) {
    return onConnect(conn, room, {
      load: async () => {
        // 从 Supabase 加载
      },
      callback: {
        handler: async (doc) => {
          // 保存到 Supabase
        }
      }
    })
  }
}
```

**成本**：
- 按请求数计费，低用量免费
- 约 $5/月可支持中小型应用

**优点**：
- ✅ Cloudflare 边缘网络，全球低延迟
- ✅ 原生 Yjs 支持
- ✅ 便宜

---

### 方案 D：P2P (y-webrtc) - 不推荐 ❌

```javascript
import { WebrtcProvider } from 'y-webrtc'

const provider = new WebrtcProvider('room-name', doc)
```

**问题**：
- ❌ 需要至少2人在线才能连通
- ❌ 网络穿透失败率高（特别是国内）
- ❌ 无中央服务器，数据无法持久化

**只适合**：
- 局域网内使用
- 原型验证

---

## 最终推荐架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端                                  │
│  Excalidraw + React + Supabase JS Client                    │
└─────────────────────────────────────────────────────────────┘
       ↓                      ↓                      ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Supabase    │    │  Liveblocks  │    │  Render/     │
│  Auth        │    │  /PartyKit   │    │  Railway     │
│  (登录)      │    │  (实时协作)   │    │  (y-websocket)│
└──────────────┘    └──────────────┘    └──────────────┘
       ↓                      ↓
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                               │
│  PostgreSQL (数据) + Storage (文件)                        │
└─────────────────────────────────────────────────────────────┘
```

**选择建议**：

| 场景 | 推荐方案 | 月成本 |
|------|---------|--------|
| 个人/小团队，预算优先 | 自建 y-websocket + Render | ~$0-7 |
| 追求稳定，愿意付费 | Liveblocks | ~$99 |
| 全球用户，低延迟 | PartyKit | ~$5-20 |
| 不想管任何服务器 | Liveblocks | ~$99 |

---

## 修改后的实施计划

### Phase 0：环境准备（1 天）
- [ ] 注册 Supabase 账号
- [ ] 注册 Render/Liveblocks/PartyKit 账号（选择一种）
- [ ] 初始化前端项目

### Phase 1：认证 + 数据（3 天）
- [ ] Supabase Auth 集成
- [ ] 画板 CRUD + RLS
- [ ] 画布管理

### Phase 2：实时协作（2 天）
- [ ] 部署 y-websocket / 配置 Liveblocks
- [ ] Yjs 集成
- [ ] 多人编辑测试

### Phase 3：Excalidraw 集成（3 天）
- [ ] 嵌入 Excalidraw
- [ ] 本地 IndexedDB 备份
- [ ] 服务端持久化

### Phase 4：分享 + 文件（3 天）
- [ ] 分享功能
- [ ] 文件上传 Storage
- [ ] 权限测试

### Phase 5：上线（2 天）
- [ ] 部署到 Vercel
- [ ] 域名配置
- [ ] 监控

**总周期：约 2 周**（比原方案更短，因为省去了后端开发）

---

## 结论

**可以实现所有功能**，但需要组合使用：

| 功能 | 技术选择 |
|------|---------|
| 登录/注册 | Supabase Auth ✅ |
| 数据存储 | Supabase PostgreSQL ✅ |
| 文件存储 | Supabase Storage ✅ |
| 画板分享 | Supabase RLS ✅ |
| 实时协作 | Liveblocks / PartyKit / y-websocket ⚠️ 需额外服务 |

**推荐组合**：
- **经济版**：Supabase (免费) + Render (免费) = **$0/月**
- **稳定版**：Supabase (Pro $25) + Liveblocks (Pro $99) = **$124/月**
- **平衡版**：Supabase (免费) + PartyKit ($5) = **$5/月**

---

*分析日期: 2026-04-25*
