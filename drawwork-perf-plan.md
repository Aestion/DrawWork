# DrawWork — 性能优化方案

**诊断结果:** 构建后 JS 主包 2.9MB，CSS 44KB

---

## 一、Bundle 体积优化 (P0)

### 目标: 2.9MB → ~1.5MB

| 优化项 | 当前 | 方案 | 预估收益 |
|--------|------|------|----------|
| **Excalidraw 懒加载** | 打包在主 bundle | `React.lazy(() => import('@excalidraw/excalidraw'))` | **-1.5MB** |
| **CSS 提取** | 全部打包 | PurgeCSS 移除未用样式 | **-10KB** |
| **@excalidraw/excalidraw 配置** | 完整包 | `optimizeDeps.exclude` + `build.rollupOptions` 分 chunk | **-800KB** |

### 实施

```jsx
// 在 EditorPage.jsx 中
const ExcalidrawWrapper = React.lazy(() => import('../components/Editor/ExcalidrawWrapper'))

// 配合 Suspense
<Suspense fallback={<div className="animate-pulse h-full bg-gray-100 rounded" />}>
  {currentCanvas.type === 'excalidraw' && <ExcalidrawWrapper ... />}
</Suspense>
```

```js
// vite.config.js 增加
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        excalidraw: ['@excalidraw/excalidraw'],
        yjs: ['yjs', 'y-websocket', 'y-leveldb'],
      }
    }
  }
}
```

---

## 二、渲染性能优化 (P1)

### 2.1 React.memo 覆盖 (目标: 减少 40% 不必要的重渲染)

| 组件 | 当前 | 方案 |
|------|------|------|
| `KanbanEditor > KanbanCard` | 每次列/卡片变动全部重渲染 | `React.memo(KanbanCard)` + key 基于 card.id |
| `KanbanEditor > KanbanColumn` | 列头随卡片重渲染 | `React.memo(KanbanColumn)` |
| `SwimlaneEditor > SwimlaneElement` | 全量重渲染 | `React.memo(SwimlaneElement)` |
| `VotePanel > VoteOption` | 全量重渲染 | `React.memo(VoteOption)` |

### 2.2 useMemo 优化

**ExcalidrawWrapper handleChange:**
```jsx
// 当前: 每次 scene 变化都重建 signature
const signature = stableSceneSignature(nextScene.elements, nextScene.appState, nextScene.files)

// 优化: 只在关键数据变化时重建
const elementsFingerprint = useMemo(() => 
  JSON.stringify(nextScene.elements.map(e => e.id + e.x + e.y)), 
  [nextScene.elements]
)
```

### 2.3 画布切换 keep-alive

**当前:** 切换画布 → 卸载编辑器 → 重新挂载 → 重新建立 Yjs 连接

**方案:** 所有画布同时挂载，用 `display: none` / `visibility: hidden` 切换

```jsx
// EditorPage.jsx
<div style={{ display: currentCanvas.id === 'canvas-1' ? 'block' : 'none' }}>
  <ExcalidrawWrapper canvasId="canvas-1" ... />
</div>
<div style={{ display: currentCanvas.id === 'canvas-2' ? 'block' : 'none' }}>
  <KanbanEditor canvasId="canvas-2" ... />
</div>
```

**收益:** 切换画布时 Yjs 连接不断开，无需重建场景，数据零丢失

---

## 三、Yjs 同步优化 (P1)

### 3.1 Excalidraw 场景同步去抖

**当前:** Excalidraw 的 `onChange` 每次触发都同步到 Yjs（高频：拖动时会连续触发）

**方案:** 在 ExcalidrawWrapper 中添加 200ms debounce

```jsx
// 在 handleChange 中
const debounceRef = useRef(null)
clearTimeout(debounceRef.current)
debounceRef.current = setTimeout(() => {
  yDoc.transact(() => {
    yMap.set('elements', elements)
    yMap.set('appState', appState)
  }, 'local-scene-change')
}, 200)
```

### 3.2 差分同步替代全量同步

**当前:** 每次同步都写入完整的 `elements` 数组到 Y.Map

**方案:** 使用 Y.Array 替代 Y.Map 存储 elements，利用 CRDT 的差分特性

```js
// Y.Array 只同步变化的部分，而非全量替换
const yElements = yDoc.getArray('elements')
yElements.delete(0, yElements.length)
yElements.push(elements)  // 只同步新增/删除的 elements
```

---

## 四、网络请求优化 (P2)

| 接口 | 当前频率 | 方案 |
|------|----------|------|
| `/api/notifications` | 每 30s | 延长到 60s+；空响应时指数退避 |
| `/api/notifications/unread-count` | 每 30s | 合并到 notifications 响应中，去掉独立请求 |
| `/api/votes/:id/results` | 切换画布时 | 缓存结果 5s，避免重复请求 |

---

## 五、预期收益汇总

| 优化项 | 预估收益 | 工作量 |
|--------|----------|--------|
| Bundle 分 chunk | **JS 从 2.9MB → ~1.5MB** | 30min |
| React.memo + useMemo | **渲染减少 30-40%** | 1h |
| 画布 keep-alive | **切换延迟从 ~3s → ~50ms** | 1h |
| Yjs 去抖 | **WebSocket 流量减少 60%** | 30min |
| 网络请求优化 | **API 调用量减少 50%** | 30min |

**总计预估: 3.5 小时**
