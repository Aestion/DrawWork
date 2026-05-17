# DrawWork 核心功能设计文档

## 设计范围

覆盖优先级前3：后端核心 API + 前端 Dashboard/编辑器骨架 + Yjs 文档持久化。

## 方案对比

### 方案A：后端先行，前后端串行开发
- **流程**：先完成后端所有 API → 再开发前端页面
- **优点**：API 稳定后前端对接顺畅，接口契约清晰
- **缺点**：前端等待时间长，无法端到端验证

### 方案B：前后端并行，按功能模块切片
- **流程**：画板模块（前后端一起）→ 画布模块 → 分享权限模块 → Yjs 持久化
- **优点**：每个切片可端到端测试，快速看到成果
- **缺点**：需要频繁切换上下文

### 方案C：端到端骨架先行，再填充血肉
- **流程**：先搭通前后端 + Yjs 的完整数据流（一个画板、一个画布能 CRUD 和协作）→ 再扩展其他功能
- **优点**：第一时间验证架构可行性，风险前置
- **缺点**：初期功能不完整的"半成品"体验

**选择：方案C（端到端骨架先行）**

理由：DrawWork 的核心价值在于"协作白板"，如果前后端 + Yjs 的数据流不通，后续功能都是空中楼阁。先打通一条端到端路径，可以及早暴露架构问题（如 Excalidraw 与 Yjs 的集成、画布切换时的状态管理、权限在 WebSocket 中的校验等）。

## 架构设计

### 后端 API 设计

画板路由 (`/api/boards`)：
- `GET /` — 获取用户画板列表（含最近访问排序、画布数量）
- `POST /` — 创建画板（自动创建默认画布）
- `PUT /:id` — 更新画板信息
- `DELETE /:id` — 软删除画板
- `GET /:id/canvases` — 获取画板的画布列表
- `POST /:id/canvases` — 在画板下创建画布
- `POST /:id/shares` — 邀请用户
- `DELETE /:id/shares/:userId` — 移除协作者
- `POST /:id/tokens` — 生成分享链接
- `DELETE /:id/tokens/:tokenId` — 撤销分享链接

画布路由 (`/api/canvases`)：
- `GET /:id` — 获取画布详情
- `PUT /:id` — 更新画布（名称、排序）
- `DELETE /:id` — 删除画布（至少保留一个）

分享路由 (`/api/shares`)：
- `GET /validate?token=xxx` — 验证分享链接

### 前端设计

状态管理（Zustand）：
- `useAuthStore` — 用户认证状态（token、用户信息）
- `useBoardStore` — 画板列表、当前画板
- `useCanvasStore` — 画布列表、当前画布

页面结构：
- `DashboardPage` — 画板列表卡片 + 新建弹窗
- `EditorPage` — 画布标签栏 + Excalidraw 容器 + 协作状态栏

Excalidraw 集成：
- 使用 `@excalidraw/excalidraw` React 组件
- 通过 `excalidrawAPI` ref 控制画布（切换、导出）
- Yjs 绑定通过 `y-excalidraw` 或直接操作 Yjs doc 的 elements

### Yjs 文档持久化

机制：
- Yjs 服务端每 30 秒将 `Y.encodeStateAsUpdate(doc)` 保存到 PostgreSQL `yjs_snapshots` 表
- 新用户连接时，先加载最新的 snapshot，再应用后续更新
- 保留最近 50 个快照（数据库触发器自动清理）

数据流：
```
客户端编辑 → Yjs Doc → Yjs Server → 定期保存 → PostgreSQL
新客户端连接 ← 加载最新 snapshot ← PostgreSQL
```

## 接口契约

画板列表响应：
```json
{
  "boards": [
    {
      "id": "uuid",
      "name": "产品原型",
      "description": "...",
      "cover_url": "...",
      "canvas_count": 3,
      "is_public": false,
      "permission": "owner",
      "last_visited": "2026-04-26T10:00:00Z",
      "created_at": "..."
    }
  ]
}
```

画布列表响应：
```json
{
  "canvases": [
    {
      "id": "uuid",
      "name": "画布 1",
      "type": "excalidraw",
      "sort_order": 0,
      "yjs_room_id": "board_uuid_canvas_uuid"
    }
  ]
}
```

## 权限模型

层级：`owner > editor > commenter > viewer`

| 操作 | owner | editor | commenter | viewer |
|------|-------|--------|-----------|--------|
| 查看画板/画布 | ✅ | ✅ | ✅ | ✅ |
| 编辑画布内容 | ✅ | ✅ | ❌ | ❌ |
| 添加/删除画布 | ✅ | ✅ | ❌ | ❌ |
| 分享画板 | ✅ | ❌ | ❌ | ❌ |
| 删除画板 | ✅ | ❌ | ❌ | ❌ |
| 评论 | ✅ | ✅ | ✅ | ❌ |

## 风险与应对

| 风险 | 应对 |
|------|------|
| Excalidraw + Yjs 集成复杂 | 先用简单数据类型测试 Yjs 同步，再绑定 Excalidraw elements |
| 画布切换时 Yjs 连接管理 | 切换画布时断开旧 room、连接新 room，避免内存泄漏 |
| 分享链接权限穿透 | API 层统一校验，Yjs 连接时也通过 API 验证 token |
