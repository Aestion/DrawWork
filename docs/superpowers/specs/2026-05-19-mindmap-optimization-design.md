# MindMapEditor 连线和拖拽优化设计

> **参考腾讯思维画布（TencentMind）的节点连线规则和节点拖动规则，优化当前的 MindMapEditor。**

**目标：** 提升 MindMapEditor（React Flow 版）的用户体验，使其连线更流畅、拖拽更智能。

---

## Phase 1: 连线规则优化

### 现状

`MindMapEdge` 组件（`MindMapEditor.jsx:152-193`）根据节点深度使用两种路径：

| 层级 | 路径类型 | 说明 |
|------|----------|------|
| 根 ↔ 一级 | 贝塞尔曲线（Cubic Bezier） | 控制点偏移 `max(dx×0.5, 50)` ✅ |
| 更深层级 | 肘形折线（Rectilinear） | `getRectilinearPath()` 返回 H/V 折线，直角转弯 ❌ |

`getRectilinearPath`（`mindmap-utils.js:18-32`）生成三段式折线如 `M sx sy H bendX V ty H tx`，视觉上机械感强。

### 方案：统一贝塞尔曲线

**核心改动：** 去除 MindMapEdge 中的 `isRootToLevel1` 深度判断，所有 `type='mindmap'` 边统一用 cubic bezier。

```
// 旧代码（折线）
M sx sy H bendX V targetY H targetX

// 新代码（贝塞尔） 
M sx sy C (sx + offset) sy, (tx - offset) ty, tx ty
```

**控制点计算：**
```js
const dx = targetX - sourceX
const dy = targetY - sourceY
const isHorizontal = Math.abs(dx) > Math.abs(dy)

if (isHorizontal) {
  const offset = Math.max(Math.abs(dx) * 0.45, 40)
  const dir = dx > 0 ? 1 : -1
  return `M ${sourceX} ${sourceY} C ${sourceX + dir * offset} ${sourceY}, ${targetX - dir * offset} ${targetY}, ${targetX} ${targetY}`
} else {
  // 垂直布局：使用垂直贝塞尔
  const offset = Math.max(Math.abs(dy) * 0.45, 40)
  const dir = dy > 0 ? 1 : -1
  return `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + dir * offset}, ${targetX} ${targetY - dir * offset}, ${targetX} ${targetY}`
}
```

**保留项：**
- 现有样式：`stroke: #94a3b8`（未选中）/ `#3b82f6`（选中）、`strokeWidth: 1.5/2.5`
- CSS 过渡动画：`stroke 0.15s, stroke-width 0.15s`
- `getRectilinearPath` 函数保留（`CrossConnectionEdge` 或其他自定义边可能引用）

### 改动范围

| 文件 | 改动 |
|------|------|
| `MindMapEditor.jsx:152-178` | 重写 MindMapEdge 组件的路径生成逻辑，去除深度判断 |
| `mindmap-utils.js:18-32` | 保留 `getRectilinearPath`（向后兼容），函数本身不改 |

---

## Phase 2: 拖动规则优化

### 2.1 动态节点尺寸

**现状：** `onNodeDrag` 和 `onNodeDragStop` 中硬编码 `NODE_WIDTH=150, NODE_HEIGHT=50`（多处出现），与节点实际 CSS 尺寸不匹配。当节点含长文本或媒体时碰撞检测严重不准。

**方案：** 用实际 DOM 尺寸替换硬编码值。

**实现方式：**
1. 在 `MindNode` 组件中通过 `useRef` 获取根元素
2. 通过 React Flow 的 `nodeRef` 机制（或 `data` 中携带宽高）将实际尺寸传递给 drag handler
3. 作为降级，保留 `estimateNodeDimensions()` 的估算逻辑

```js
// 可行性方案 A：通过 node.data 传递实际尺寸
// 在 MindNode 中用 ResizeObserver 检测尺寸变化
useEffect(() => {
  if (ref.current) {
    const { width, height } = ref.current.getBoundingClientRect()
    setNodeSize({ width, height })
  }
}, [label, mediaItems])

// 在 onNodeDrag/onNodeDragStop 中使用实际尺寸
const nodeWidth = node.data?.actualWidth || estimateNodeDimensions(node.data?.label).width
const nodeHeight = node.data?.actualHeight || estimateNodeDimensions(node.data?.label).height
```

**推荐方案：** 方案 A — 通过 `node.data` 传递实际尺寸，ResizeObserver 自动更新。不需要修改 React Flow 配置。

### 2.2 磁吸边缘区

**现状：** 跨侧拖拽一级节点时，用户需把节点拖过根节点中心线 >50px 才能触发侧翻。此行为不够直观，且缺乏放置区提示。

**方案：** 参考 TencentMind 的 `60px` 磁吸边缘检测（`TencentMindEditor.jsx:83-144` 中的 monkey-patches）：

1. **边缘区检测：** 当拖拽节点在目标侧第一个兄弟节点上方 60px 范围内时，自动视为 "insert before first sibling"；在最后一个兄弟节点下方 60px 范围内时，视为 "insert after last sibling"
2. **视觉反馈：** 在磁吸区显示蓝色高亮条，提示即将插入的位置
3. **跨侧检测增强：** 结合现有的 `shouldSwitchSide` 逻辑，在边缘区触发侧翻+放置

```js
// 新增：磁吸边缘检测函数
function getMagneticDropZone(dragNode, targetSideNodes, scale) {
  if (targetSideNodes.length === 0) return null
  const MAGNETIC_ZONE = 60 * scale // 60px 基础区，乘以缩放系数
  
  const firstNode = targetSideNodes[0]
  const lastNode = targetSideNodes[targetSideNodes.length - 1]
  
  // 检查上方磁吸区
  if (dragNode.position.y < firstNode.position.y &&
      firstNode.position.y - dragNode.position.y < MAGNETIC_ZONE) {
    return { position: 'before', targetNode: firstNode }
  }
  
  // 检查下方磁吸区
  if (dragNode.position.y > lastNode.position.y &&
      dragNode.position.y - lastNode.position.y < MAGNETIC_ZONE) {
    return { position: 'after', targetNode: lastNode }
  }
  
  return null
}
```

### 2.3 拖拽滚动

**现状：** 拖拽节点到视口边缘时视图不会自动平移，用户必须松开鼠标、滚动、再继续拖拽。

**方案：** 在 `onNodeDrag` 中添加边缘滚动检测：

```js
const EDGE_THRESHOLD = 40 // 距离视口边缘 40px 时触发滚动
const SCROLL_SPEED = 5    // 每帧滚动 5px

if (viewportBounds && canEdit) {
  const { x, y } = node.position
  const viewport = viewportRef.current
  
  if (x < viewport.x + EDGE_THRESHOLD) {
    // 向左滚
  } else if (x > viewport.x + viewport.width - EDGE_THRESHOLD) {
    // 向右滚
  }
  // 类似地处理 Y 方向
  
  // 通过 React Flow 的 setViewport API 更新视口
}
```

---

## 改动文件汇总

| 文件 | Phase | 改动量 | 说明 |
|------|-------|--------|------|
| `frontend/src/components/Editor/MindMapEditor.jsx` | 1 | ~30 行 | MindMapEdge 路径生成逻辑 |
| `frontend/src/components/Editor/MindMapEditor.jsx` | 2 | ~200 行 | onNodeDrag/onNodeDragStop + 新辅助函数 |
| `frontend/src/components/Editor/mindmap-utils.js` | 1 | 0 行 | 保留 `getRectilinearPath`（只移除引用） |
| `frontend/src/components/Editor/MindMapEditor.test.jsx` | 1+2 | 按需 | 更新测试断言 |
| `frontend/src/components/Editor/mindmap-utils.test.js` | 1 | 按需 | 无改动预期 |

---

## 验证方法

1. **连线：** 创建多级思维导图，观察所有层级的连线是否变为平滑曲线，无直角转弯
2. **拖拽碰撞：** 创建含长文本的节点（如 20+ 字符），拖拽时验证碰撞检测使用实际尺寸而非 150×50
3. **磁吸边缘：** 在左侧拖拽节点到右侧边缘，观察 60px 磁吸效果
4. **拖拽滚动：** 在大画布上将节点拖到视口边缘，观察自动平移
5. **回归：** 已有 mindmap 测试套件（`mindmap-utils.test.js`、Playwright E2E）全部通过
