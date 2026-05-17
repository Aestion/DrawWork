# Excalidraw 画布闪烁与数据丢失问题修复记录

## 问题现象

进入画布后持续出现以下异常：

1. **连接状态标签疯狂闪烁**：`Disconnected` → `Syncing` → `Disconnected` 循环
2. **控制台刷屏**：大量 `[handleChange] processing...` 日志重复输出
3. **数据丢失**：绘制的图形在切换画布、刷新网页后全部消失
4. **WebSocket 连接不稳定**：Network 面板显示大量 `TIME_WAIT` 连接

## 根本原因分析

本次问题由 **三个独立但相互叠加的 bug** 导致，涉及前端渲染循环、Yjs 状态同步、服务端数据库配置三个层面。

### 1. 前端渲染死循环（ExcalidrawWrapper.jsx）

**现象**：每次渲染都会触发 `onChange`，`onChange` 又触发重渲染，形成死循环。

**根因**：
- `Excalidraw` 组件的 `initialData` 和 `UIOptions` props 在 JSX 中以内联对象形式定义
- 每次组件重渲染时，这两个 prop 的引用都会变化
- Excalidraw 内部检测到 `initialData` / `UIOptions` 引用变化 → 触发内部状态更新 → 触发 `onChange`
- `onChange` → `setOverlayState` → 组件重渲染 → `initialData` / `UIOptions` 再次变化

**循环路径**：
```
onChange → setOverlayState → 重渲染 → initialData/UIOptions 新引用
  → Excalidraw 重新初始化 → onChange → ...
```

### 2. 切换画布时 Observer 收不到初始数据（useYjs.js）

**现象**：切换画布或刷新页面后，已保存的数据无法恢复到画布上。

**根因**：
- `useYjs` 使用模块级 connection registry（`connections Map`）复用 WebSocket 连接
- 切换画布时，旧组件卸载调用 `releaseConnection`，但设置了 3 秒延迟销毁（`DESTROY_DELAY`）
- 新组件挂载时，复用了同一连接（refCount 从 0 → 1）
- `useEffect` 中的 cleanup 函数把 `syncedRef.current` 重置为 `false`
- 但 `y-websocket` 不会为已 synced 的连接再次触发 `sync` 事件
- `observe` 回调注册时检查 `syncedRef.current` 为 `false`，因此**永远不会 emit 初始数据**

**时序问题**：
```
旧组件卸载 → releaseConnection (refCount--, 但 3s 后才 destroy)
新组件挂载 → getConnection (复用同一连接, refCount++)
useEffect 初始化 → syncedRef.current = false
observe 注册 → if (syncedRef.current) 不成立，跳过初始 emit
provider.synced = true（连接本来就是 synced，不会再触发 sync 事件）
→ 画布永远为空
```

### 3. WebSocket 服务端查询了错误的数据库（yjs-server）

**现象**：连接反复建立后断开，`TIME_WAIT` 堆积。

**根因**：
- 后端 API（Express）使用 `data/dev.db` 存储数据
- yjs-server 配置的是 `../backend/dev.db`（`server.js` 中 `databasePath()` 的默认值）
- 两个数据库文件内容不同，用户的 board 和 canvas 数据都在 `data/dev.db`
- yjs-server 在 `loadRoomMeta()` 中查询 `backend/dev.db`，永远找不到 room
- 服务端认证通过（JWT 有效），但权限检查失败（查不到 room 权限）→ 关闭 WebSocket
- 客户端不断重连 → 看到连接状态疯狂闪烁

## 修复方案

### 修复 1：稳定 Excalidraw Props 引用

**文件**：`frontend/src/components/Editor/ExcalidrawWrapper.jsx`

**措施**：
- `UIOptions` 使用 `useMemo(() => ({...}), [])` 缓存，确保引用稳定
- `initialData` 不再依赖 `sceneData`，只在组件挂载时计算一次空场景
- 所有后续数据更新都通过 `applyScene(apiInstance, data)` API 进行，不再走 `initialData`

```jsx
const uiOptions = useMemo(() => ({
  canvasActions: { ... }
}), [])

const initialData = useMemo(() => {
  // 只返回空场景，不依赖 sceneData
  const { elements, files } = filterOversizedEmbeddedFiles(EMPTY_SCENE, MAX_BYTES)
  return { elements, appState: { viewBackgroundColor: '#ffffff', collaborators: new Map() }, files }
}, [])
```

### 修复 2：Observer 注册时检查 Provider 实际状态

**文件**：`frontend/src/hooks/useYjs.js`

**措施**：注册 observer 时，不再依赖被重置的 `syncedRef`，而是直接检查 `conn.provider.synced`：

```js
conn.observers.add(emit)
conn.yMap.observe(handler)

// 如果 provider 已经 synced，立即 emit 当前数据
if (conn.provider.synced) {
  const json = conn.yMap.toJSON()
  emit({ elements: json.elements || [], appState: json.appState || {}, files: json.files || {} }, { source: 'initial' })
}
```

**补充措施**：
- 去掉了 `setData` 的 100ms debounce，改为同步写入，避免切换画布时 pending data 丢失
- `releaseConnection` 中增加 `pendingData` flush 逻辑，连接销毁前先把队列中的数据写入 yMap
- 延长 `DESTROY_DELAY` 从 3s 到 8s，确保 Yjs updates 有足够时间发送到服务端

### 修复 3：修正服务端数据库路径

**文件**：`yjs-server/src/server.js`

**问题**：Backend API 默认使用 `backend/dev.db`，而 yjs-server 默认使用 `../data/dev.db`，两个数据库文件不一致导致 WebSocket 查询不到 room 权限。

**措施**：启动 yjs-server 时通过环境变量指定正确的数据库路径：

```bash
# 方式 1：使用 SQLITE_PATH 环境变量
SQLITE_PATH="../backend/dev.db" node src/server.js

# 方式 2：使用 DATABASE_URL 环境变量
DATABASE_URL="sqlite:../backend/dev.db" node src/server.js
```

**代码中的默认路径**：
```js
function databasePath() {
  if (process.env.DATABASE_URL?.startsWith('sqlite:')) {
    return process.env.DATABASE_URL.replace('sqlite:', '')
  }
  return process.env.SQLITE_PATH || '../data/dev.db'
}
```

**注意**：确保 Backend API 和 yjs-server 使用同一个 SQLite 文件。开发环境下 Backend 通常使用 `backend/dev.db`，因此 yjs-server 也需要指向同一文件。

## 关键代码变更摘要

| 文件 | 变更类型 | 变更内容 |
|------|----------|----------|
| `frontend/src/components/Editor/ExcalidrawWrapper.jsx` | 重构 | `initialData` 和 `UIOptions` 使用 `useMemo` 缓存；移除 `setData` debounce；清理切换画布时的 flush 逻辑 |
| `frontend/src/hooks/useYjs.js` | 修复 | `observe` 注册时检查 `conn.provider.synced`；移除 `setData` 的连接状态检查（改为始终写入）；`releaseConnection` 增加 `pendingData` flush |
| `yjs-server/src/server.js` | 配置 | 默认数据库路径从 `../backend/dev.db` 改为 `../data/dev.db`；清理冗余的 `console.log` |

## 测试验证

1. 刷新页面后进入画布，连接状态稳定变为 `Synced`（绿色）
2. 绘制图形，控制台不再刷屏
3. 切换画布后再切回，数据正确恢复
4. 刷新页面后，数据正确恢复
5. 服务端 `yjs_snapshots` 表中正确保存了带 elements 的文档状态
