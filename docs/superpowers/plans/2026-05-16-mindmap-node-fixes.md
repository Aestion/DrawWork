# 思维导图节点创建问题修复 — 实现计划

> **For agentic workers:** 按任务编号顺序执行，每个任务完成后再进入下一个。

**Goal:** 修复思维导图节点创建的三个问题：选中态同步、编辑状态、布局精度

**Architecture:**
- Fix 1 & 2 集中在 `MindMapEditor.jsx`：修改 `onSelectionChange`、`addChildNode`/`addSiblingNode`/`navigateArrow`、MindNode 组件
- Fix 3 集中在 `mindmap-utils.js`：新增 `estimateNodeDimensions`、修改 `layoutHorizontalSubtree`/`layoutVerticalSubtree`
- Fix 1 新增 `programmaticSelectionRef` 状态管理
- Fix 2 新增 `editingNodeId` 状态 + `_forceEdit` data 标志
- Fix 3 替换硬编码 EST_WIDTH/EST_HEIGHT 为基于文本内容的动态估算

**Tech Stack:** React 18, @xyflow/react v12, JavaScript (JSX)

---

## Task 1: Fix 选中态同步 — programmaticSelectionRef

**Files:**
- Modify: `frontend/src/components/Editor/MindMapEditor.jsx`

- [ ] **Step 1: 新增 programmaticSelectionRef**

在 MindMapEditor 函数组件内，`selectedNodeRef` 定义之后添加：

```js
const programmaticSelectionRef = useRef(null)
```

- [ ] **Step 2: 修改 onSelectionChange**

找到 `onSelectionChange` 回调（约第 1546 行），替换为检测 programmatic 覆盖的逻辑：

```js
const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
  if (programmaticSelectionRef.current) {
    const overrideId = programmaticSelectionRef.current
    programmaticSelectionRef.current = null
    selectedNodeRef.current = overrideId
    queueMicrotask(() => { setSelectedNode(overrideId) })
    return
  }
  const next = selectedNodes[0]?.id || null
  selectedNodeRef.current = next
  queueMicrotask(() => {
    setSelectedNode(prev => prev === next ? prev : next)
  })
}, [])
```

- [ ] **Step 3: 修改 addChildNode**

在 `addChildNode`（约第 1161 行）中，在 `setNodes`/`setEdges`/`setSelectedNode` 之前设置 `programmaticSelectionRef`，并清除 React Flow 选中：

```js
const addChildNode = useCallback(() => {
  if (!selectedNode || !canEdit) return
  captureUndo()
  // ... 创建 newNode, newEdge ...
  const result = applyLayoutWithOffsets(nodes, edges, [...nodes, newNode], [...edges, newEdge], selectedNode)
  
  programmaticSelectionRef.current = newId
  setNodes(result.nodes.map(n => ({ ...n, selected: false })))
  setEdges(result.edges)
  setSelectedNode(newId)
  setPanToNodeId(newId)
  setEditingNodeId(newId)
}, [selectedNode, nodes, edges, canEdit, ...])
```

- [ ] **Step 4: 修改 addSiblingNode**

同理，在 `addSiblingNode`（约第 1216 行）中添加 `programmaticSelectionRef` 和 `selected: false`：

```js
programmaticSelectionRef.current = newId
setNodes(result.nodes.map(n => ({ ...n, selected: false })))
setEdges(result.edges)
setSelectedNode(newId)
setPanToNodeId(newId)
setEditingNodeId(newId)
```

- [ ] **Step 5: 修改 navigateArrow**

在 `navigateArrow`（约第 1348 行）的方向键选中切换处添加 `programmaticSelectionRef`：

```js
if (nextId && nextId !== selectedNode) {
  programmaticSelectionRef.current = nextId
  setSelectedNode(nextId)
}
```

- [ ] **Step 6: 修改 addRootNode**

在 `addRootNode`（约第 1254 行）中添加 `programmaticSelectionRef`：

```js
programmaticSelectionRef.current = newId
```

---

## Task 2: Fix 编辑状态 — editingNodeId

**Files:**
- Modify: `frontend/src/components/Editor/MindMapEditor.jsx`

- [ ] **Step 1: 新增 editingNodeId 状态**

在 `panToNodeId` 定义之后添加：

```js
const [editingNodeId, setEditingNodeId] = useState(null)
```

- [ ] **Step 2: 修改 searchEnhancedNodes**

在 `searchEnhancedNodes` memo（约第 979 行）中，在 `_programmaticSelected` 旁边添加 `_forceEdit`：

```js
data: {
  ...n.data,
  _searchActive: false,
  _searchMatch: true,
  _searchCurrent: false,
  _programmaticSelected: n.id === selectedNode,
  _forceEdit: n.id === editingNodeId,       // ← 新增
  hasChildren: hasChildrenSet.has(n.id)
}
```

在 active 搜索分支（约第 1017 行）同样添加：
```js
_forceEdit: n.id === editingNodeId,         // ← 新增
```

- [ ] **Step 3: 修改 addChildNode 和 addSiblingNode**

在两个函数中 `setSelectedNode(newId)` 之后添加：
```js
setEditingNodeId(newId)
```

（已在 Task 1 的代码中一并添加）

- [ ] **Step 4: 增强 MindNode 编辑触发逻辑**

找到 MindNode 组件的 `useEffect`（约第 240 行），将依赖从 `[data._autoEdit]` 扩展为 `[data._autoEdit, data._forceEdit]`：

```js
const autoEditRef = useRef(false)
useEffect(() => {
  if ((data._autoEdit || data._forceEdit) && !autoEditRef.current) {
    autoEditRef.current = true
    setIsEditing(true)
  }
}, [data._autoEdit, data._forceEdit])
```

- [ ] **Step 5: 编辑完成清除 editingNodeId**

在 `handleSubmit`（约第 254 行）中，在 `setIsEditing(false)` 之后添加：

```js
const handleSubmit = () => {
  const trimmed = editText.trim()
  if (trimmed && trimmed !== data.label) {
    if (callbacks?.onChange) {
      callbacks.onChange(id, trimmed)
    } else if (data.onChange) {
      data.onChange(trimmed)
    }
  } else {
    setEditText(data.label)
  }
  setIsEditing(false)
  // 通过 context 清除 editingNodeId
  callbacks?.onEditingDone?.(id)
}
```

在 `handleKeyDown` 的 Escape 分支中，`setIsEditing(false)` 之前或之后添加：
```js
callbacks?.onEditingDone?.(id)
```

在 `nodeCallbacks`（约第 1539 行）中新增 `onEditingDone`：
```js
onEditingDone: (nodeId) => {
  if (editingNodeId === nodeId) {
    setEditingNodeId(null)
  }
}
```

同时将 `editingNodeId` 和 `setEditingNodeId` 加入 `nodeCallbacks` 依赖数组。

---

## Task 3: Fix 布局精度 — estimateNodeDimensions

**Files:**
- Modify: `frontend/src/components/Editor/mindmap-utils.js`
- Verify: `frontend/src/components/Editor/mindmap-utils.test.js`

- [ ] **Step 1: 新增 estimateNodeDimensions 函数**

在 `mindmap-utils.js` 文件顶部、`updateEdgeHandles` 之前添加：

```js
export function estimateNodeDimensions(label = '', depth = 0) {
  const charWidth = 15
  const padding = 32
  const minWidth = 100
  const estimatedWidth = Math.max(minWidth, label.length * charWidth + padding)
  const estimatedHeight = 40
  return { width: estimatedWidth, height: estimatedHeight }
}
```

- [ ] **Step 2: 修改 layoutHorizontalSubtree**

将 `EST_WIDTH` 和 `EST_HEIGHT` 常量保留为默认/fallback值。

在 `calcSubtreeHeight` 中，将 `EST_HEIGHT` 替换为对节点的估算：
```js
function calcSubtreeHeight(nodeId) {
  if (heightCache.has(nodeId)) return heightCache.get(nodeId)
  const children = childrenMap.get(nodeId) || []
  if (children.length === 0) {
    const node = nodeMap.get(nodeId)
    const { height } = estimateNodeDimensions(node?.data?.label)
    heightCache.set(nodeId, height)
    return height
  }
  // ...
}
```

在 `layoutNode` 中计算子节点 x 位置时，使用动态宽度：
```js
for (const { child } of leftAssignments) {
  const subtreeH = calcSubtreeHeight(child.id)
  const node = nodeMap.get(child.id)
  const { width: childWidth } = estimateNodeDimensions(node?.data?.label)
  const { width: parentWidth } = estimateNodeDimensions(nodeMap.get(nodeId)?.data?.label)
  const childCx = cx - parentWidth / 2 - EDGE_MARGIN_X - childWidth / 2
  const childCy = currentY + subtreeH / 2
  layoutNode(child.id, childCx, childCy, 'left', depth + 1)
  currentY += subtreeH + SIBLING_MARGIN_Y
}
```

同理修改右侧布局的 `childCx` 计算。

- [ ] **Step 3: 修改 layoutVerticalSubtree**

在 `calcSubtreeWidth` 中：
```js
function calcSubtreeWidth(nodeId) {
  if (widthCache.has(nodeId)) return widthCache.get(nodeId)
  const children = childrenMap.get(nodeId) || []
  if (children.length === 0) {
    const node = nodeMap.get(nodeId)
    const { width } = estimateNodeDimensions(node?.data?.label)
    widthCache.set(nodeId, width)
    return width
  }
  // ...
}
```

- [ ] **Step 4: 运行现有测试验证**

```bash
cd frontend && npx vitest run src/components/Editor/mindmap-utils.test.js
```

确认所有测试通过。

---

## Verification Checklist

- [ ] Task 1 完成：创建子节点后，只有新节点显示选中态，旧节点取消选中
- [ ] Task 1 完成：点击选中旧节点，再创建新节点，选中态正确切换
- [ ] Task 1 完成：方向键导航后节点正确高亮
- [ ] Task 2 完成：创建子节点后 input 自动获得焦点，可立即输入
- [ ] Task 2 完成：Enter 提交编辑，Escape 取消编辑
- [ ] Task 2 完成：编辑完成后选中态保持正常
- [ ] Task 3 完成：长文本节点和短文本节点混合时不重叠
- [ ] Task 3 完成：现有单元测试全部通过
- [ ] Task 3 完成：水平布局和垂直布局都正常工作
