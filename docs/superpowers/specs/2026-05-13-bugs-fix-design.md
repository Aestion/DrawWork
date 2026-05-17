# Bugs 修复设计文档

> **日期**: 2026-05-13  
> **目标**: 修复 bugs-todo.md 中剩余的 6 个问题

---

## 问题汇总

| # | 问题 | 优先级 | 文件 | 状态 |
|---|------|--------|------|------|
| 1 | 投票功能 400 错误 | 🔴 P0 | votes.js | 待修复 |
| 2 | 思维导图连接线未隐藏 | 🟡 P2 | MindMapEditor.jsx | 待修复 |
| 3 | 评论弹窗位置 | 🟡 P2 | CommentPanel.jsx | 待修复 |
| 4 | 评论气泡拖动 | 🟡 P2 | CommentPin.jsx, comment.js | 待修复 |
| 5 | 评论删除功能 | 🟡 P2 | comments.js, CommentPanel.jsx | 待修复 |
| 6 | Excalidraw 工具图标闪烁 | 🟡 P2 | ExcalidrawWrapper.jsx | 待修复 |

---

## 问题 1: 投票功能 400 错误

### 症状
POST `/api/votes/{id}/records` 返回 400

### 根本原因
`votes.js:56-58` 使用 `process.env.JWT_SECRET` 而不是 `getJwtSecret()`

### 修复方案
```javascript
// 第 1-6 行，添加导入
const { getJwtSecret } = require('../utils/jwt')

// 第 56-58 行，替换
const anonymousSessionId = vote.is_anonymous
  ? crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${getJwtSecret()}`).digest('hex')
  : null
```

---

## 问题 2: 思维导图连接线未隐藏

### 症状
折叠节点时，子节点隐藏但连接线仍显示

### 根本原因
Edges 渲染没有过滤与 hiddenNodeIds 相关的连线

### 修复方案
在 edges 传入 ReactFlow 前添加过滤：
```javascript
const visibleEdges = edges.filter(e => 
  !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)
)
```

---

## 问题 3: 评论弹窗位置

### 症状
弹窗固定在左上角

### 修复方案
- `CommentPanel` 接收 `position` 属性 `{x, y}`
- 使用绝对定位根据点击位置显示
- 样式改为 `style={{ left: position.x, top: position.y }}`

---

## 问题 4: 评论气泡拖动

### 症状
评论气泡无法移动

### 修复方案
- 添加 `mousedown`/`mousemove`/`mouseup` 事件处理
- 计算拖动偏移量更新位置
- 可选：同步到后端

---

## 问题 5: 评论删除功能

### 症状
评论无法删除

### 修复方案
- 后端: 添加 `DELETE /api/comments/:id` 接口
- 前端: 在 `CommentPanel` 添加删除按钮
- 权限: 仅评论作者或画板所有者可删除

---

## 问题 6: Excalidraw 工具图标闪烁

### 症状
选中工具时图标一直闪烁

### 修复方案
添加 CSS 覆盖禁用动画：
```css
.sidebar-trigger.active {
  animation: none !important;
}
```

---

## 实施顺序

1. 投票 400 错误 (P0) - 5分钟
2. 思维导图连接线 (P2) - 15分钟
3. 评论弹窗位置 (P2) - 20分钟
4. 评论删除功能 (P2) - 30分钟
5. 评论气泡拖动 (P2) - 40分钟
6. Excalidraw 闪烁 (P2) - 10分钟

**总计**: 约 2 小时
