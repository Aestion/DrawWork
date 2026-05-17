# DrawWork 待修复问题清单

> 整理时间: 2026-05-13

---

## 功能问题 (按优先级排序)

### 🔴 P0 - 阻塞性问题

#### 1. 投票功能 400 错误
**症状**: 
- POST `/api/votes/{id}/records` 返回 400
- 投票数据未记录
- 再次投票报错

**原因**: `votes.js:56` 使用 `process.env.JWT_SECRET` 而不是 `getJwtSecret()`，当环境变量未设置时使用默认值

**修复位置**: `backend/src/routes/votes.js`

**修复代码**:
```javascript
// 第 1-6 行，添加导入
const { Vote, VoteRecord, Canvas } = require('../models')
const { getJwtSecret } = require('../utils/jwt')  // ← 添加

// 第 55-59 行，替换
const anonymousSessionId = vote.is_anonymous
  ? crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${getJwtSecret()}`).digest('hex')
  : null
```

---

### 🟠 P1 - 高优先级

#### 2. 泳道图连接线错位
**症状**: 元素间的箭头连接线位置错误，不跟随元素

**原因**: `renderArrow` 使用元素存储的 x/y 坐标，而非实际 DOM 位置

**修复位置**: `frontend/src/components/Editor/SwimlaneEditor.jsx`

**修复方案**:
```javascript
// 1. 添加 containerRef
const containerRef = useRef(null)

// 2. 修改 renderArrow 函数 (第 132-157 行)
const renderArrow = (source, target) => {
  const sourceEl = document.querySelector(`[data-element-id="${source.id}"]`)
  const targetEl = document.querySelector(`[data-element-id="${target.id}"]`)
  
  if (!sourceEl || !targetEl || !containerRef.current) return null
  
  const containerRect = containerRef.current.getBoundingClientRect()
  const sourceRect = sourceEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()
  
  const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left
  const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top
  const x2 = targetRect.left + targetRect.width / 2 - containerRect.left
  const y2 = targetRect.top + targetRect.height / 2 - containerRect.top

  return (
    <line
      key={`arrow-${source.id}`}
      x1={x1} y1={y1}
      x2={x2} y2={y2}
      stroke="#3b82f6" strokeWidth="2"
      markerEnd="url(#arrowhead)"
    />
  )
}

// 3. 在容器 div 添加 ref
<div ref={containerRef} className="relative">

// 4. 在元素 div 添加 data-element-id
<div data-element-id={el.id} ...>
```

---

#### 3. 泳道图单击/双击行为
**症状**: 单击进入编辑模式，很难选中元素
**需求**: 单击选中，双击编辑

**修复位置**: `frontend/src/components/Editor/SwimlaneEditor.jsx` (SwimlaneElement 组件)

**修复代码**:
```javascript
// 修改 SwimlaneElement 组件
const SwimlaneElement = memo(function SwimlaneElement({ el, onClick, ... }) {
  const [isEditing, setIsEditing] = useState(false)

  const handleClick = () => {
    if (!isEditing) onClick(el.id)
  }

  const handleDoubleClick = () => {
    if (canEdit) setIsEditing(true)
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      ...
    >
      {isEditing ? (
        <input
          autoFocus
          value={el.text}
          onChange={e => onUpdateText(el.id, e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={e => {
            if (e.key === 'Enter') setIsEditing(false)
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span>{el.text}</span>
      )}
    </div>
  )
})
```

---

### 🟡 P2 - 中优先级

#### 4. 思维导图连接线未隐藏
**症状**: 折叠节点时，子节点隐藏但连接线仍显示

**修复位置**: `frontend/src/components/Editor/MindMapEditor.jsx`

**修复方案**:
```javascript
// 在 edges 渲染处添加过滤
const visibleEdges = edges.filter(e => {
  const sourceNode = nodes.find(n => n.id === e.source)
  const targetNode = nodes.find(n => n.id === e.target)
  // 如果源节点或目标节点被折叠隐藏，则不显示连线
  return !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)
})
```

---

#### 5. 评论弹窗位置
**症状**: 弹窗固定在左上角，应该在鼠标点击位置弹出

**修复位置**: `frontend/src/components/Editor/CommentPanel.jsx`

**修复方案**:
```javascript
// 获取点击位置
const handleClick = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  setPopupPosition({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  })
}

// 弹窗样式
<div style={{
  position: 'absolute',
  left: popupPosition.x,
  top: popupPosition.y
}}>
```

---

#### 6. 评论气泡拖动
**症状**: 评论气泡无法移动位置
**需求**: 可拖动，且位置需要协作同步

**修复位置**: 
- `frontend/src/components/Editor/CommentPin.jsx`
- `backend/src/models/comment.js` (添加 x, y 字段)

**修复方案**:
```javascript
// 添加拖动逻辑
const [position, setPosition] = useState({ x: comment.x, y: comment.y })
const [isDragging, setIsDragging] = useState(false)

const handleMouseDown = (e) => {
  setIsDragging(true)
  const startX = e.clientX - position.x
  const startY = e.clientY - position.y

  const handleMouseMove = (e) => {
    setPosition({
      x: e.clientX - startX,
      y: e.clientY - startY
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    // 同步到后端
    updateCommentPosition(comment.id, position)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}
```

---

#### 7. 评论删除功能
**症状**: 评论无法删除

**修复位置**:
- 后端: `backend/src/routes/comments.js`
- 前端: `frontend/src/components/Editor/CommentPanel.jsx`

**修复方案**:
```javascript
// backend/src/routes/comments.js - 添加删除接口
router.delete('/:id', authMiddleware, resolveCommentPermission('editor'), async (req, res) => {
  await Comment.destroy({ where: { id: req.params.id } })
  res.json({ message: '评论已删除' })
})

// CommentPanel.jsx - 添加删除按钮
<button onClick={() => deleteComment(comment.id)}>删除</button>
```

---

#### 8. Excalidraw 工具图标闪烁
**症状**: 选中工具时图标一直闪烁

**可能原因**:
1. CSS 动画冲突
2. React 重复渲染
3. Excalidraw 主题样式问题

**修复位置**: `frontend/src/components/Editor/ExcalidrawWrapper.jsx`

**排查方案**:
```css
/* 尝试覆盖闪烁动画 */
.sidebar-trigger.active {
  animation: none !important;
}
```

或检查是否有状态循环更新导致重渲染。

---

## 汇总表

| # | 问题 | 优先级 | 文件 | 预计工作量 |
|---|------|--------|------|-----------|
| 1 | 投票 400 错误 | 🔴 P0 | votes.js | 5分钟 |
| 2 | 泳道图连线错位 | 🟠 P1 | SwimlaneEditor.jsx | 30分钟 |
| 3 | 泳道图单击双击 | 🟠 P1 | SwimlaneEditor.jsx | 20分钟 |
| 4 | 思维导图连线隐藏 | 🟡 P2 | MindMapEditor.jsx | 15分钟 |
| 5 | 评论弹窗位置 | 🟡 P2 | CommentPanel.jsx | 20分钟 |
| 6 | 评论气泡拖动 | 🟡 P2 | CommentPin.jsx | 40分钟 |
| 7 | 评论删除功能 | 🟡 P2 | comments.js, CommentPanel.jsx | 30分钟 |
| 8 | 工具图标闪烁 | 🟡 P2 | ExcalidrawWrapper.jsx | 30分钟 |

**总计**: 约 3.5 小时

---

## 已完成修复 ✅

详见 `security-fixes.md` 和 `code-review-report.md`

1. Yjs WebSocket 认证
2. 文件上传安全检查
3. Rate Limiting
4. 错误处理脱敏
5. CORS 白名单
6. bcrypt 迭代优化
7. JWT Secret 强制验证
8. SQL Like 转义
9. admin.js 重构

后端测试: 78/78 通过 ✅

---

*最后更新: 2026-05-13*
