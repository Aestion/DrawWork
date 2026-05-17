# 思维导图增强功能设计文档

## 背景

当前思维导图使用 react-flow 实现，仅支持单棵树结构。本设计实现多中心、富媒体支持、跨树连接功能。

---

## 一、数据模型（多中心）

### 1.1 方案 A 实现

```typescript
interface MindMapData {
  roots: MindNode[]  // 多个根节点
  crossConnections: CrossConnection[]  // 跨树虚线连接
  layout: 'vertical' | 'horizontal' | 'radial'
}

interface MindNode {
  id: string
  text: string
  position?: { x: number, y: number }  // 手动拖拽后的位置
  collapsed?: boolean  // 子树折叠状态
  children?: MindNode[]
  media?: MediaItem[]  // 节点关联的媒体
}

interface MediaItem {
  type: 'image' | 'gif' | 'video'
  uploadId: string  // 与现有系统一致
  fileName?: string
  // 导出 Markdown 时显示为 [图片:文件名]
}

interface CrossConnection {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string  // 连接说明文字
}
```

### 1.2 树结构规则

- 每棵树只能有一个根节点
- 根节点可以没有父节点，也可以从其他根节点断开成为独立根
- 删除根节点时，其子树可选择：
  - 级联删除（默认）
  - 提升某个子节点为新根

---

## 二、UI/UX 设计

### 2.1 多中心布局

- **自动布局**：每棵树独立计算位置，树与树之间保持间距
- **手动调整**：可拖拽整个树或单个节点
- **新增根节点**：快捷键 `Ctrl+Enter` 或工具栏按钮

### 2.2 节点编辑

- **文本编辑**：双击或 Space 键
- **添加子节点**：Tab 键
- **添加兄弟节点**：Enter 键
- **创建新根**：Ctrl+Enter
- **删除**：Delete 键（根节点需确认）

### 2.3 媒体插入

节点支持添加媒体：
- 点击节点工具栏的 "+" 按钮
- 支持图片、GIF、视频
- 媒体显示在节点下方，可折叠
- 导出 Markdown 时显示为 `[图片:文件名]` 或 `[视频:文件名]`

### 2.4 跨树连接（虚线）

- 操作：选中节点 A，按住 Shift 点击节点 B，创建连接
- 显示：虚线，带箭头
- 删除：选中虚线按 Delete
- Markdown 导出：`[连接到:目标节点文字]`

---

## 三、Markdown 导入/导出

### 3.1 导出格式

```markdown
# 思维导图

## 根节点1
1. **子节点1**
   - [图片:cat.gif]
   - [连接到:根节点2的子节点A]
   1. **孙节点1**
   2. **孙节点2**
2. **子节点2**

## 根节点2
1. **子节点A**
   - [图片:dog.jpg]
```

### 3.2 导入规则

- 一级标题 `##` 视为根节点
- 有序列表 `1.` 或无序列表 `-` 视为子节点
- 缩进决定层级
- `[图片:xxx]` 解析为媒体占位（需后续手动上传）
- `[连接到:xxx]` 解析为跨树连接（目标节点存在时建立）

---

## 四、实现阶段

### Phase 1: 多中心架构（已完成基础版）
- [ ] 重构数据结构：root → roots
- [ ] 新增根节点功能
- [ ] 独立树的布局算法
- [ ] 删除根节点时的处理逻辑

### Phase 2: 媒体支持
- [ ] 节点媒体数据结构
- [ ] 媒体上传/插入UI
- [ ] 节点内媒体渲染
- [ ] 媒体懒加载

### Phase 3: 跨树连接
- [ ] Shift+点击创建连接
- [ ] 虚线渲染
- [ ] 连接删除

### Phase 4: Markdown 导入/导出
- [ ] 导出函数实现
- [ ] 导入函数实现
- [ ] 文件上传UI

---

## 五、技术实现要点

### 5.1 布局算法

使用 react-flow 的自动布局，每棵树独立计算：

```typescript
function calculateMultiTreeLayout(roots: MindNode[]): Node[] {
  const allNodes: Node[] = []
  let currentX = 0
  
  roots.forEach((root, index) => {
    const treeNodes = calculateSingleTreeLayout(root)
    // 偏移整棵树的位置
    const offsetX = currentX
    treeNodes.forEach(node => {
      node.position.x += offsetX
      allNodes.push(node)
    })
    // 计算下一棵树的起始位置
    const treeWidth = getTreeWidth(treeNodes)
    currentX += treeWidth + TREE_SPACING
  })
  
  return allNodes
}
```

### 5.2 媒体存储

复用现有画板的媒体存储机制：
- 上传接口：`POST /upload`
- uploadId 存储在节点 media 数组中
- 渲染时通过 `/upload/{uploadId}` 获取

### 5.3 跨树连接渲染

react-flow 的 edges 支持：
```typescript
{
  id: 'cross-1',
  source: 'node-a',
  target: 'node-b',
  type: 'smoothstep',
  style: { strokeDasharray: '5,5', stroke: '#999' },
  animated: false
}
```

---

## 六、待确认事项

1. 根节点数量上限？（建议 10 个以内）
2. 单个节点媒体数量上限？（建议 5 个）
3. 跨树连接数量上限？（建议无限制，但需性能测试）
4. Markdown 导入时，图片占位符是否需要显示警告？

---

## 七、与现有系统的兼容性

- 现有单根节点数据可自动迁移到 `roots[0]`
- API 保持向后兼容：`/canvases/{id}/mindmap`
- 数据库字段：JSON 存储，无需 schema 变更

---

## 八、节点编辑与交互

### 8.1 自动进入编辑（Auto-Edit）

创建新节点（Tab/Enter）后自动进入文本编辑模式。

**实现机制：** 三层防护确保可靠性：
1. **`pendingAutoEditRef`** — useRef(Set)，在 addChildNode/addSiblingNode 中同步写入新节点 ID，MindNode 挂载时检查。不经过数据管线，不受 Yjs 同步影响。
2. **`editingNodeId`** — MindMapEditor 的 useState，通过 Context 提供给 MindNode。`searchEnhancedNodes` 据此注入 `_forceEdit` 到节点 data。
3. **`_autoEdit`** — 新节点 data 上的临时标记，随节点数据流传输。

MindNode 使用单 effect（无 deps）+ `autoEditConsumedRef` 守卫，确保任意时机下只要任一条件满足就触发一次编辑状态。

**编辑状态清除时机：** Enter 提交文字、Escape 取消、Blur 失焦、Tab 提交并创建子节点。

### 8.2 布局算法：左右子节点分配

`balanceChildren`（mindmap-utils.js）使用固定的交替模式分配一级子节点的左右侧：

```
索引 0 → right（右侧）
索引 1 → left（左侧）
索引 2 → right
索引 3 → left
...
```

**设计原则：** 子节点按创建顺序追加到末尾，已有节点的索引不变，因此 `side` 也不会变。添加新节点不会导致已有节点翻转。

**历史：** 之前存在 ≤3 用交替模式、≥4 用高度贪心算法的双分支，导致第 4 个节点创建时所有已有节点翻转。2026-05-16 修复为单一交替模式。

### 8.3 拖拽重排父节点

**功能：** 所有节点可拖拽。拖放时检测附近的目标节点，若距离 <150px，则将被拖拽节点转移为目标节点的子节点。

**实现：**
1. `searchEnhancedNodes` 中所有节点的 `draggable` 设为 `canEdit`（不限根节点）
2. 重写 `onNodeDragStop`：
   - 非根节点拖放 → 检测 `findDropTarget`（排除自身、后代、当前父节点）
   - 命中目标 → 修改入边的 source，重新 layout，保留所有已有节点位置
   - 未命中目标 → 偏移后代（原行为）
   - 根节点 → 始终偏移后代（不改变树结构）

**边界：** 根节点不被纳入候选目标；不允许将节点拖为自己的后代（形成循环）。
