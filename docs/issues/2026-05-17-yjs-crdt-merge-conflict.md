# Yjs CRDT 合并冲突导致协同数据丢失与刷新回滚

## 问题现象

### 问题 1：协同同步数据丢失
- A 绘制元件/新建思维导图节点后，B 看不到
- B 绘制后，A 能看到 B 的，但 A 自己的绘制消失
- 两人同时编辑时，一人的数据完全覆盖另一人的

### 问题 2：刷新网页数据回滚
- 拖动已有元件位置后刷新页面，位置回退到旧状态
- 新建思维导图节点后刷新页面，节点消失
- 数据不是"消失"，而是被**服务端旧数据覆盖**

**涉及范围**：Excalidraw 画布（白板绘制）和思维导图画布均有此问题。

---

## 根本原因分析

这两个问题有同一个根因：**Y.Map 的 `set(key, wholeArray)` 整体替换导致 CRDT 无法合并**。

### 核心问题：整体替换 vs 逐元素合并

Excalidraw 和思维导图都以"整体数组"方式写入 Yjs：

```js
// ❌ 有问题的写入方式
conn.doc.transact(() => {
  conn.yMap.set('elements', 整个Elements数组)   // Excalidraw
  conn.yMap.set('nodes',    整个Nodes数组)       // 思维导图
  conn.yMap.set('edges',    整个Edges数组)       // 思维导图
}, 'local-scene-change')
```

Yjs 的 `Y.Map.set(key, value)` 是 **Last-Write-Wins（LWW）** 语义。当两个用户同时调用 `set('elements', [...])` 时：

1. A 的 elements = `[elA1, elA2]`
2. B 的 elements = `[elB1]`
3. 两个 `set` 操作被 Yjs CRDT 判定为冲突
4. 基于向量时钟，**其中一个完全覆盖另一个**
5. 结果：要么 B 失去 elB1，要么 A 失去 elA1 和 elA2

这就解释了"B 绘制后 A 之前绘制的消失了"——B 的写入覆盖了 A 的。

### 问题 2 的附加原因：WebSocket 缓冲区未刷新

刷新回滚多了一个步骤：

1. 用户编辑元件位置 → `handleChange` → `setData` → 写入 Y.Map → WebSocket 发送更新
2. 用户刷新页面 → `beforeunload` 再次尝试 `setData` + WebSocket `send('')`
3. **WebSocket 的缓冲区可能未在页面关闭前刷新** → 服务端未收到最新状态
4. 服务端 `saveRoom(force=true)` → 用未包含最新数据的 Y.Doc 保存快照
5. 再次加载 → 服务端返回旧快照 → Yjs 同步把旧位置应用到画布

此前修复尝试（localStorage 备份 + `restoredFromBackupRef` 守卫）只能拦截"Yjs 数据为空"的情况，挡不住"Yjs 有数据但是旧数据"的情况。

---

## 修复方案

### 核心思路：逐元素独立存储

将"整个数组存为一个 key"改为**每个元素存为一个独立的 Y.Map key**，利用 Yjs CRDT 对不同 key 的自动合并能力。

```
// ❌ 旧方式：整体替换
yMap.set('elements', [{id: 'a', ...}, {id: 'b', ...}])
// → CRDT 冲突时 LWW 覆盖

// ✅ 新方式：逐元素独立 key
yMap.set('__el_a', {id: 'a', ...})
yMap.set('__el_b', {id: 'b', ...})
// → 不同 key 不会冲突，CRDT 自动合并
```

### Excalidraw 修复（useYjs.js）

**文件**：`frontend/src/hooks/useYjs.js`

**`setData`** 改为逐元素写入：

```js
conn.doc.transact(() => {
  const newIds = new Set()
  for (const el of (data.elements || [])) {
    newIds.add(el.id)
    conn.yMap.set('__el_' + el.id, el)  // 每个元件独立 key
  }
  // 删除不再存在的元件
  const keysToDelete = []
  conn.yMap.forEach((value, key) => {
    if (key.startsWith('__el_') && !newIds.has(key.slice(5))) {
      keysToDelete.push(key)
    }
  })
  for (const key of keysToDelete) conn.yMap.delete(key)
  conn.yMap.set('__appState', data.appState || {})
  conn.yMap.set('__files', data.files || {})
}, 'local-scene-change')
```

**`extractData` 辅助函数** — 从独立 key 重建数组，兼容旧格式：

```js
function extractData(yMap) {
  const json = yMap.toJSON()
  const elements = []
  for (const key of Object.keys(json)) {
    if (key.startsWith('__el_')) elements.push(json[key])
  }
  // 旧格式兜底：整体 elements 数组
  if (elements.length === 0 && Array.isArray(json.elements)) {
    elements.push(...json.elements)
  }
  return {
    elements,
    appState: json.__appState || json.appState || {},
    files: json.__files || json.files || {}
  }
}
```

**用到 `json.elements` 的地方全部替换为 `extractData(yMap)`**：
- `getData` 
- `observe` 回调中的 Y.Map 变化处理器
- `handleSync` 回调（初始数据通知 + pendingData 刷入）
- `releaseConnection` 中的 pendingData 刷入

### Excalidraw 刷新回滚守卫（ExcalidrawWrapper.jsx）

**文件**：`frontend/src/components/Editor/ExcalidrawWrapper.jsx`

增加 `restoredFromBackupRef` 标记和守卫逻辑：

1. 添加 `const restoredFromBackupRef = useRef(false)`
2. `restoreLocalBackup()` 成功时设置 `restoredFromBackupRef.current = true`
3. HTTP snapshot 成功恢复时也设置标记
4. Yjs observe 回调中，`source === 'initial'` 时检查标记：

```js
if (meta.source === 'initial') {
  const currentElements = sceneRef.current.elements || []
  if (restoredFromBackupRef.current && currentElements.length > 0) {
    restoredFromBackupRef.current = false
    hasInitialSyncRef.current = true  // 阻止 HTTP snapshot 覆盖
    setData(sceneRef.current)         // 把本地最新数据写回 Yjs
    return                            // 跳过应用 Yjs 的旧数据
  }
}
```

### 思维导图修复（useMindMapYjs.js）

**文件**：`frontend/src/hooks/useMindMapYjs.js`

**节点和连线改为独立 key**：`__mm_node_{id}` / `__mm_edge_{id}`

```js
// syncToYjs 中
yMap.doc.transact(() => {
  const currentNodes = nodesToYjs(nodesRef.current)
  const nodeIds = new Set()
  for (const node of currentNodes) {
    nodeIds.add(node.id)
    yMap.set('__mm_node_' + node.id, node)
  }
  // 删除已移除的节点
  // 同上处理 edges...
}, 'local-mindmap-change')
```

**`extractMindMapData` 辅助函数**：

```js
function extractMindMapData(yMap) {
  const json = yMap.toJSON()
  const nodes = []
  const edges = []
  for (const key of Object.keys(json)) {
    if (key.startsWith('__mm_node_')) nodes.push(json[key])
    if (key.startsWith('__mm_edge_')) edges.push(json[key])
  }
  if (nodes.length === 0 && Array.isArray(json.nodes)) nodes.push(...json.nodes)
  if (edges.length === 0 && Array.isArray(json.edges)) edges.push(...json.edges)
  return { nodes, edges }
}
```

**localStorage 备份 + 恢复**：

- `beforeunload` 时将 nodes/edges 写入 `localStorage`（key: `drawwork_mm_backup_{canvasId}`）
- 主加载流程中先检查 localStorage，优先恢复本地备份
- 恢复后同步写回 Yjs 修正服务端
- Observer 中增加守卫：初始同步时如果 localStorage 存在备份，跳过远程旧数据

### 服务端兼容（yjs-server/src/server.js）

**文件**：`yjs-server/src/server.js`

- `saveSnapshot` 中的 element count 计算同时支持新旧两种格式
- 旧 JSON 快照加载时迁移到新格式（逐 key 写入）
- 连接日志适配

---

## 为什么用 `__el_` 前缀而不是嵌套 Y.Map？

有两种方案可以达到逐元素合并：

| 方案 | 实现 | 优缺点 |
|------|------|--------|
| **前缀 key** | `yMap.set('__el_' + id, data)` | 简单，无需重构类型结构；key 前缀避免了与其它数据（appState/files）冲突 |
| **嵌套 Y.Map** | `doc.getMap('elements').set(id, data)` | 更符合 Yjs 设计哲学，但需要改变已有代码的 `yMap.get('excalidraw')` 结构 |

选择前缀方案是因为：
- 改动范围最小（只改 `useYjs.js` / `useMindMapYjs.js`）
- 向后兼容处理简单（`extractData` 同时支持新旧格式）
- 服务端存储无感知（`Y.encodeStateAsUpdate` 编码所有 key）

## 向后兼容

旧数据以 `yMap.set('elements', [...])` 格式存在。`extractData` / `extractMindMapData` 中先检查 `__el_` / `__mm_node_` 前缀 key，如果没找到则回退读取旧 `elements` / `nodes` key。

服务端加载旧 JSON 快照时（`bytes[0] === 0x7B`），也会自动迁移为逐元素格式写入 Y.Doc。

## 关键代码变更摘要

| 文件 | 变更类型 | 变更内容 |
|------|----------|----------|
| `frontend/src/hooks/useYjs.js` | 重构 | `setData` 逐元素写入；新增 `extractData` 辅助函数；所有读取路径替换为 `extractData` |
| `frontend/src/hooks/useMindMapYjs.js` | 重构 | `syncToYjs` 逐节点/逐连线写入；新增 `extractMindMapData`；localStorage 备份 + 恢复；Observer 初始同步守卫 |
| `frontend/src/components/Editor/ExcalidrawWrapper.jsx` | 修复 | 新增 `restoredFromBackupRef` 守卫；移除 localStorage 过早清除逻辑；HTTP snapshot 恢复也设置备份标记 |
| `yjs-server/src/server.js` | 兼容 | element count 同时支持新旧格式；旧 JSON 快照加载迁移为新格式 |

## 测试验证

1. **协同同步**：两个浏览器窗口打开同一画板，A 绘制元件 → B 即时看到；B 绘制 → A 看到；同时绘制不丢失数据
2. **刷新持久化**：绘制后刷新页面（F5），元件位置和内容正确保留
3. **思维导图同步**：A 新建节点 → B 看到；A 刷新 → 节点保留
4. **思维导图刷新**：编辑后刷新页面，节点不丢失
5. **混合编辑**：Excalidraw 画布和思维导图画布各自独立工作，互不干扰
6. **旧数据兼容**：现有旧格式数据加载后正常显示，编辑后自动迁移为新格式
