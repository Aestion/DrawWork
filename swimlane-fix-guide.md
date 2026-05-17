# 泳道图修复指南

## 问题 1: 连接线错位 ⚠️

**症状**: 箭头连接线显示位置错误

**原因**: `renderArrow` 函数使用的坐标是相对于元素的局部坐标，但 SVG 是绝对定位

**修复方案**:

### 方法 A: 使用 getBoundingClientRect 计算实际位置

在 `SwimlaneEditor.jsx` 中修改 `renderArrow` 函数:

```javascript
const renderArrow = (source, target) => {
  // 获取 DOM 元素的实际位置
  const sourceEl = document.querySelector(`[data-element-id="${source.id}"]`)
  const targetEl = document.querySelector(`[data-element-id="${target.id}"]`)
  
  if (!sourceEl || !targetEl) return null
  
  const containerRect = containerRef.current?.getBoundingClientRect()
  const sourceRect = sourceEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()
  
  if (!containerRect) return null
  
  // 计算相对于 SVG 容器的坐标
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
      className="pointer-events-none"
    />
  )
}
```

并在元素 div 上添加 `data-element-id`:
```javascript
<div data-element-id={el.id} ...>
```

---

## 问题 2: 单击 vs 双击行为 🔧

**症状**: 单击进入编辑模式，很难选中元素
**需求**: 单击选中，双击编辑

**修复方案**:

### 1. 修改 SwimlaneElement 组件

```javascript
const SwimlaneElement = memo(function SwimlaneElement({ 
  el, onClick, onUpdateText, onRemoveElement, onRemoveConnection, 
  connectMode, dragId, canEdit 
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(el.text)
  const inputRef = useRef(null)

  // 处理单击 - 选中/连接
  const handleClick = () => {
    if (isEditing) return
    onClick(el.id)
  }

  // 处理双击 - 进入编辑
  const handleDoubleClick = () => {
    if (!canEdit) return
    setIsEditing(true)
    setEditText(el.text)
  }

  // 保存编辑
  const handleSave = () => {
    onUpdateText(el.id, editText)
    setIsEditing(false)
  }

  // 取消编辑
  const handleCancel = () => {
    setEditText(el.text)
    setIsEditing(false)
  }

  // 键盘处理
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  return (
    <div
      data-element-id={el.id}
      draggable={canEdit}
      onDragStart={...}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`bg-blue-50 border rounded px-3 py-2 text-sm min-w-[100px] transition-all ${
        connectMode === el.id
          ? 'border-green-500 ring-2 ring-green-300 cursor-pointer'
          : el.targetId
            ? 'border-blue-400 border-dashed'
            : 'border-blue-200'
      } ${dragId === el.id ? 'opacity-50' : ''} ${canEdit ? 'cursor-pointer' : ''}`}
    >
      <div className="flex justify-between items-center">
        {isEditing ? (
          <input
            ref={inputRef}
            autoFocus
            className="bg-transparent border-b border-blue-500 outline-none w-full mr-2"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="select-none">{el.text}</span>
        )}
        
        {/* 操作按钮 */}
        <div className="flex items-center gap-1 ml-2">
          {el.targetId && (
            <button
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); onRemoveConnection(el.id) }}
              title="删除连接"
            >⊘</button>
          )}
          {canEdit && !isEditing && (
            <button 
              className="text-xs text-red-400 hover:text-red-600" 
              onClick={e => { e.stopPropagation(); onRemoveElement(el.id) }}
            >✕</button>
          )}
        </div>
      </div>
    </div>
  )
})
```

### 2. 添加缺失的 import

```javascript
import { useRef } from 'react'
```

---

## 完整修复步骤

1. 备份 `SwimlaneEditor.jsx`
2. 添加 `containerRef` 和 `data-element-id`
3. 修改 `renderArrow` 使用实际 DOM 位置
4. 将 `SwimlaneElement` 的单击编辑改为双击编辑
5. 测试连接线是否正确跟随元素
6. 测试单击选中、双击编辑

---

## 额外建议 💡

### 添加选中状态提示
```javascript
const [selectedId, setSelectedId] = useState(null)

// 在元素样式中添加选中效果
className={`... ${selectedId === el.id ? 'ring-2 ring-blue-400' : ''} ...`}
```

### 连接线性能优化
使用 `useMemo` 避免重复计算:
```javascript
const arrows = useMemo(() => {
  return elements
    .filter(el => el.targetId)
    .map(el => {
      const target = elements.find(e => e.id === el.targetId)
      return target ? renderArrow(el, target) : null
    })
}, [elements, lanes])
```

---

*修复时间: 2026-05-13*
