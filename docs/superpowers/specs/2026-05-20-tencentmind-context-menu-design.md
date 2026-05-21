# TencentMind 右键菜单 + 标记系统重构

> **目标:** 精简顶部工具栏，将节点操作迁移到右键上下文菜单，并扩展标记系统到 10 种符号。

---

## 1. 顶部工具栏精简

保留项（全局设置，与具体节点无关）：

| 元素 | 说明 |
|------|------|
| `腾讯思维` 标题标签 | 编辑器标识 |
| 布局下拉 (select) | 切换布局类型 |
| 主题下拉 (select) | 切换主题 |
| 只读 checkbox | 切换只读模式 |
| 保存按钮 | 手动触发保存 |

移除项（全部移入右键菜单）：添加子节点、添加同级、添加媒体、关联线、删除关联线、添加概要、删除概要、添加外框、删除外框、标记。

---

## 2. 右键上下文菜单

### 2.1 触发与关闭

- **触发:** 在任意思维导图节点上右键 (`contextmenu` 事件)，`preventDefault` 阻止浏览器默认菜单。
- **定位:** 菜单以鼠标点击位置为左上锚点，带视口边界检测（超出右/下边界时自动翻转）。
- **关闭:** 点击菜单项后关闭；点击菜单外部关闭；按 Escape 关闭。

### 2.2 菜单结构

```
┌──────────────────────┐
│ 添加子节点            │
│ 添加同级              │  ← 根节点禁用
├──────────────────────┤
│ 添加图片/视频         │
├──────────────────────┤
│ 添加概要              │  ← 根节点禁用
│ 删除概要              │
│ 添加外框              │
│ 删除外框              │
├──────────────────────┤
│ 创建关联线            │
│ 删除关联线            │
├──────────────────────┤
│ 标记 ▸               │  ← hover/click 展开子菜单
└──────────────────────┘
```

### 2.3 根节点与子节点差异

| 操作 | 根节点 | 子节点 |
|------|--------|--------|
| 添加子节点 | ✅ | ✅ |
| 添加同级 | ❌ 禁用 | ✅ |
| 添加媒体 | ✅ | ✅ |
| 添加概要 | ❌ 禁用 | ✅ |
| 删除概要 | ❌ 禁用 | ✅ |
| 添加外框 | ✅ | ✅ |
| 删除外框 | ✅ | ✅ |
| 创建关联线 | ✅ | ✅ |
| 删除关联线 | ✅ | ✅ |
| 标记 | ✅ | ✅ |

### 2.4 功能对照表

每个菜单项对应的执行逻辑沿用现有 `useCallback` handler：

| 菜单项 | Handler | 备注 |
|--------|---------|------|
| 添加子节点 | `addChildNode` | 调用 `INSERT_CHILD_NODE` |
| 添加同级 | `addSiblingNode` | 调用 `INSERT_NODE`；根节点禁用 |
| 添加图片/视频 | `handleAddMedia` | 打开文件选择器 |
| 添加概要 | `mm.execCommand('ADD_GENERALIZATION')` | 根节点禁用 |
| 删除概要 | `handleRemoveGeneralization` | 含树搜索回退 |
| 添加外框 | `mm.execCommand('ADD_OUTER_FRAME', ...)` | |
| 删除外框 | `mm.outerFrame?.removeActiveOuterFrame()` | |
| 创建关联线 | 进入 linkMode | 两次点击分别选源和目标 |
| 删除关联线 | `mm.associativeLine?.removeLine()` | |
| 标记 | 展开标记选择子菜单 | |

---

## 3. 标记系统扩展

### 3.1 新增 SVG 图标

在 `marker-icons.js` 中新增 7 个 SVG 定义，使总数达到 10 种：

| # | 图标 key | 形状 | 颜色 | SVG 描述 |
|---|----------|------|------|----------|
| 1 | `tencent_question` | ? | `#f88825` 橙色圆 | 已有 |
| 2 | `tencent_priority` | ! | `#e74c3c` 红色矩形 | 已有 |
| 3 | `tencent_progress` | ▶ | `#3498db` 蓝色圆 | 已有 |
| 4 | `tencent_star` | ★ | `#f1c40f` 金色星 | 新增 |
| 5 | `tencent_check` | ✓ | `#2ecc71` 绿色圆 | 新增 |
| 6 | `tencent_cross` | ✗ | `#e74c3c` 红色圆 | 新增 |
| 7 | `tencent_idea` | 💡 | `#f39c12` 黄色圆 | 新增 |
| 8 | `tencent_warning` | ⚠ | `#e67e22` 琥珀三角 | 新增 |
| 9 | `tencent_target` | ◎ | `#9b59b6` 紫色圆 | 新增 |
| 10 | `tencent_clock` | ⏱ | `#1abc9c` 青色圆 | 新增 |

### 3.2 映射函数更新

`markerIdToIconKey` / `iconKeyToMarkerId` 函数增加新标记的映射。

### 3.3 标记选择器 UI

在右键菜单中选择"标记 ▸"时，展开一个 5×2 或 2×5 的图标网格面板，直接点击图标切换标记状态（点击选中的标记取消，点击其他标记切换）：

- 当前节点已有的标记高亮显示
- 鼠标悬停时显示标记名称

### 3.4 数据持久化

标记数据保存在 `nodeData.data.icon` 数组中（simple-mind-map 原生格式），通过 `tencent-mind-utils.js` 的 `convertBack` 和 `tencentToSimpleMindMap` 完成 Tencent 格式 ↔ simple-mind-map 格式的双向转换。

---

## 4. React 实现方案

### 4.1 新增 State

```js
const [contextMenu, setContextMenu] = useState(null)
// contextMenu = { x: number, y: number, node: object } | null
```

### 4.2 事件绑定

在 `init()` 函数中，为 mind map 实例添加 `contextmenu` 监听：

```js
containerRef.current.addEventListener('contextmenu', (e) => {
  // 阻止浏览器默认菜单
  e.preventDefault()
  // 获取被右键的节点
  const node = mindMap.renderer.getNodeByEvent(e) // 假设有此方法
  if (!node) return
  setContextMenu({ x: e.clientX, y: e.clientY, node })
})
```

如果 simple-mind-map 不提供 `getNodeByEvent`，改为在 `node_click` 事件中记录鼠标坐标，在 contextmenu 时使用最近记录的节点。

### 4.3 菜单组件

内联在 TencentMindEditor 的 JSX 中（`loading` 判断之后），条件渲染：

```jsx
{contextMenu && (
  <div
    className="fixed inset-0 z-50"
    onContextMenu={e => e.preventDefault()}
    onClick={() => setContextMenu(null)}
  >
    <div
      className="absolute bg-white rounded-lg shadow-lg border py-1 min-w-[160px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={e => e.stopPropagation()}
    >
      {/* 菜单项 */}
    </div>
  </div>
)}
```

### 4.4 获取被右键节点

simple-mind-map 的 SVG 节点元素上有 `data-node-uid` 属性。在容器的 contextmenu 事件中，从 `event.target` 向上遍历 DOM 找到最近的节点元素，读取 uid，然后通过 `mindMap.renderer.findNodeByUid(uid)` 获取节点对象：

```js
containerRef.current.addEventListener('contextmenu', (e) => {
  let target = e.target
  while (target && !target.dataset?.nodeUid) {
    target = target.parentElement
  }
  if (!target) return

  const node = mindMap.renderer.findNodeByUid(target.dataset.nodeUid)
  if (!node) return

  e.preventDefault()
  setContextMenu({ x: e.clientX, y: e.clientY, node })
})
```

如 `dataset.nodeUid` 不可用，可在 `node_tree_render_end` 时建立 uid → DOM 元素映射表。

---

## 5. 关键边界情况

- **根节点右键:** 禁用"添加同级"和"概要"相关菜单项
- **只读模式下:** 不弹出右键菜单（或菜单项全部禁用）
- **多个节点选中:** 右键菜单针对首次点击的节点
- **HMR 热更新:** 菜单和标记选择器不会受热更新影响
- **触屏设备:** `contextmenu` 事件在长按时可触发，备选方案

---

## 6. 未涵盖范围

- 不改变 simple-mind-map 库本身的右键菜单（如果有的话）
- 不涉及后端 API 变更
- 不涉及 Yjs / 协同逻辑变更
