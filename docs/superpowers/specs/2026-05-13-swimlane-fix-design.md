# SwimlaneEditor 修复设计文档

> **日期**: 2026-05-13  
> **目标**: 修复泳道图编辑器的连接线错位和单击编辑问题

---

## 问题 1: 连接线错位

### 症状
箭头连接线显示位置与实际元素位置不匹配。

### 根本原因
`renderArrow` 函数使用存储在元素数据中的 `source.x`、`source.y` 坐标，加上固定偏移量（+50, +20）来计算箭头端点。但这些坐标是相对于泳道容器的局部坐标，而 SVG 箭头覆盖层是绝对定位在整个编辑器区域上，导致坐标系不一致。

### 解决方案
使用 `getBoundingClientRect` 动态计算元素在视口中的实际位置，然后相对于 SVG 容器计算偏移。

### 具体修改

1. **添加 containerRef**: 在 SVG 容器元素上添加 ref，用于获取容器位置
2. **添加 data-element-id**: 在每个泳道元素 div 上添加 data 属性，用于 DOM 查询
3. **重写 renderArrow**:
   - 通过 `document.querySelector` 获取源元素和目标元素的 DOM 节点
   - 使用 `getBoundingClientRect` 获取元素实际位置
   - 计算相对于 SVG 容器的中心点坐标
   - 返回正确的 line 元素

---

## 问题 2: 单击 vs 双击行为

### 症状
当前点击元素直接进入编辑模式（input 输入框），很难选中元素或创建连接。

### 需求
- **单击**: 选中元素 / 进入连接模式
- **双击**: 进入编辑模式

### 解决方案
在 `SwimlaneElement` 组件中添加编辑状态管理。

### 具体修改

1. **添加状态**:
   - `isEditing`: 控制是否处于编辑模式
   - `editText`: 编辑中的文本内容

2. **事件处理器**:
   - `handleClick`: 调用 `onClick(el.id)` 进行选中/连接
   - `handleDoubleClick`: 进入编辑模式
   - `handleSave`: 保存编辑内容
   - `handleCancel`: 取消编辑
   - `handleKeyDown`: 支持 Enter 保存、Escape 取消

3. **条件渲染**:
   - `isEditing === true`: 显示 input 输入框
   - `isEditing === false`: 显示文本 span

4. **停止冒泡**: 在 input 上阻止点击事件冒泡，避免触发选中

---

## 成功标准

- [ ] 连接线正确显示在元素之间，跟随元素移动
- [ ] 单击元素可以选中（进入连接模式）
- [ ] 双击元素进入编辑模式（显示 input）
- [ ] 编辑模式下按 Enter 保存，按 Escape 取消
- [ ] 原有功能（拖拽、删除、连接）正常工作

---

## 架构边界

本次修复仅修改 `SwimlaneEditor.jsx` 文件中的:
- `renderArrow` 函数
- `SwimlaneElement` 组件
- 添加必要的 refs

不涉及:
- Yjs 同步逻辑（`useSwimlaneYjs` hook）
- 数据模型（swimlane.js）
- 其他编辑器组件
