# 思维导图节点创建问题修复设计

## 问题概述

用户报告思维导图节点创建时有三个问题：
1. 创建新节点后新旧节点都显示选中态，无法区分当前选中节点
2. 创建节点后应自动进入编辑状态，但仅底框变长未真正进入编辑
3. 一级子节点的左右顺序和位置布局不严谨，节点间有重叠

---

## Fix 1：节点选中态同步

### 根因

`addChildNode` 调用 `setSelectedNode(newId)` 更新自定义 `selectedNode` 状态，但未清除 React Flow 的内部 selection。导致：

- **旧节点：** React Flow `selected={true}`，`_programmaticSelected=false` → 显示选中
- **新节点：** React Flow `selected={false}`，`_programmaticSelected=true` → 也显示选中

`onSelectionChange` 的 `queueMicrotask` 还会进一步覆盖 `setSelectedNode`，造成 `selectedNode` 最终被重置。

### 修复方案

引入 `programmaticSelectionRef` 跟踪程序化选中操作：

```js
const programmaticSelectionRef = useRef(null)
```

**`addChildNode` / `addSiblingNode` 中：**
```js
programmaticSelectionRef.current = newId
// 清除 React Flow 内部选中状态
setNodes(result.nodes.map(n => ({ ...n, selected: false })))
setEdges(result.edges)
setSelectedNode(newId)
```

**`onSelectionChange` 中：**
```js
const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
  // 检测程序化选中覆盖
  if (programmaticSelectionRef.current) {
    const overrideId = programmaticSelectionRef.current
    programmaticSelectionRef.current = null
    selectedNodeRef.current = overrideId
    queueMicrotask(() => { setSelectedNode(overrideId) })
    return
  }
  // 正常用户点击选中
  const next = selectedNodes[0]?.id || null
  selectedNodeRef.current = next
  queueMicrotask(() => {
    setSelectedNode(prev => prev === next ? prev : next)
  })
}, [])
```

**`navigateArrow` 中：** 同样使用 `programmaticSelectionRef` 包裹方向键导航的选中切换。

**涉及文件：** `MindMapEditor.jsx`（`addChildNode`、`addSiblingNode`、`addRootNode`、`navigateArrow`、`onSelectionChange`）

---

## Fix 2：新节点编辑状态

### 根因

`_autoEdit` 标志通过 data 传递能存活，但 `onSelectionChange` 的竞态条件会触发 `searchEnhancedNodes` 重算，可能在 `setIsEditing(true)` 之后重置组件状态，导致编辑状态被中断。

### 修复方案

增加独立 `editingNodeId` 状态，与 `selectedNode` 解耦：

**MindMapEditor 新增：**
```js
const [editingNodeId, setEditingNodeId] = useState(null)
```

**`addChildNode` / `addSiblingNode` 中：**
```js
setEditingNodeId(newId)  // 独立于 selectedNode
```

**`searchEnhancedNodes` 中注入 `_forceEdit`：**
```js
data: {
  ...n.data,
  _forceEdit: n.id === editingNodeId,
  ...
}
```

**`MindNode` 中增强编辑触发逻辑：**
```js
const [isEditing, setIsEditing] = useState(false)

useEffect(() => {
  if ((data._autoEdit || data._forceEdit) && !autoEditRef.current) {
    autoEditRef.current = true
    setIsEditing(true)
  }
}, [data._autoEdit, data._forceEdit])
```

**编辑完成自动清除：**
```js
// handleSubmit / Escape 时清除 editingNodeId
const handleSubmit = () => {
  // ... 现有逻辑
  setIsEditing(false)
  setEditingNodeId?.(null)  // 通过 context 或直接调用
}
```

**涉及文件：** `MindMapEditor.jsx`（state 定义、`searchEnhancedNodes`、`addChildNode`/`addSiblingNode`、MindNode 组件）

---

## Fix 3：子节点布局精度

### 根因

水平布局 `layoutHorizontalSubtree` 使用硬编码 `EST_WIDTH=120`、`EST_HEIGHT=40` 估算所有节点位置。中文字符每个约 15-16px 宽，加上 `px-4 py-2`（32px padding）：

- 短文本（"新节点"3字）：实际 ~80px，小于 EST_WIDTH，无问题
- 长文本（"这是一个很长的节点名称"10字）：实际 ~190px，超过 EST_WIDTH，导致节点与父节点边缘距离不足、重叠

### 修复方案

#### 3.1 新增 `estimateNodeDimensions` 函数

```js
// mindmap-utils.js
export function estimateNodeDimensions(label = '', depth = 0) {
  const charWidth = 15
  const padding = 32      // px-4 = 16px * 2
  const minWidth = 100
  const estimatedWidth = Math.max(minWidth, label.length * charWidth + padding)
  const estimatedHeight = 40  // py-2 = 8px*2 + line-height ~24px
  return { width: estimatedWidth, height: estimatedHeight }
}
```

#### 3.2 修改 `layoutHorizontalSubtree`

- 将 `EST_WIDTH` 替换为对每个节点调用 `estimateNodeDimensions(node.data.label).width`
- 同样 `calcSubtreeHeight` 的 `EST_HEIGHT` 替换为 `estimateNodeDimensions(...).height`
- `EDGE_MARGIN_X = 80`（水平边距常量保留）

```js
// 计算父节点实际宽度
const parentLabel = nodeMap.get(nodeId).data.label || ''
const { width: parentWidth } = estimateNodeDimensions(parentLabel)

// 布局子节点时使用实际宽度
children.forEach((child, i) => {
  const childLabel = child.data.label || ''
  const { width: childWidth } = estimateNodeDimensions(childLabel)
  const childCx = cx - childWidth / 2 - EDGE_MARGIN_X - parentWidth / 2
  // ...
})
```

#### 3.3 修改 `layoutVerticalSubtree`

- `calcSubtreeWidth` 中 `EST_WIDTH` → `estimateNodeDimensions(node.data.label).width`
- `layoutNode` 中 `EST_HEIGHT/2` → `estimateNodeDimensions(node.data.label).height / 2`

#### 3.4 修改 `applyLayoutWithOffsets`

- `getLayoutForRoot` 回退默认值不变
- 传递的节点数据中的 label 信息用于估算

#### 3.5 `balanceChildren` 注释优化

- 对 2-3 子节点的交替模式添加说明注释
- 右侧第一子节点是设计选择（右侧为主要扩展方向），保持不变

**涉及文件：** `mindmap-utils.js`（新增 `estimateNodeDimensions`，修改 `layoutHorizontalSubtree`、`layoutVerticalSubtree`、`applyLayoutWithOffsets`）

---

## 影响范围

| 问题 | 改动文件 | 改动量 | 风险 |
|------|---------|--------|------|
| Fix 1：选中态 | MindMapEditor.jsx | ~30 行新增/修改 | 低 — selection 逻辑局部变更 |
| Fix 2：编辑态 | MindMapEditor.jsx | ~15 行新增/修改 | 低 — 独立状态，不影响现有逻辑 |
| Fix 3：布局 | mindmap-utils.js | ~40 行新增/修改 | 中 — 布局参数变更影响全部渲染 |

合计影响 ~85 行，不涉及测试文件变更（现有测试仍应通过，估算函数兼容默认 120x40 尺寸）。

## 测试验证

1. 创建 1-5 个一级子节点，观察选中态是否正确（仅最后一个创建的节点高亮）
2. 创建子节点后立即输入文字，验证编辑模式正常
3. 创建长文本节点和短文本节点混合，观察是否重叠
4. 方向键导航后创建节点，验证选中态和编辑态
5. 现有 `mindmap-utils.test.js` 全部通过
