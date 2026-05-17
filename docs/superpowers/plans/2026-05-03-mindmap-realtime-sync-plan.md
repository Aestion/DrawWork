# 思维导图实时同步实现计划

> **Goal:** 为 MindMapEditor 添加 Yjs WebSocket 实时协作能力
> **Architecture:** useMindMapYjs hook + useYjs extension
> **Tech Stack:** React, Yjs, y-websocket, React Flow

---

## Task 1: 扩展 useYjs 支持 type 参数

**Files:**
- Modify: `frontend/src/hooks/useYjs.js`

**Steps:**

- [ ] **Step 1: 修改 getConnection 函数签名**

```javascript
function getConnection(roomId, token, type = 'excalidraw') {
  // ...
  const yMap = doc.getMap(type)  // 'excalidraw' | 'mindmap'
  // ...
}
```

- [ ] **Step 2: 修改 useYjs hook 接收 options 参数**

```javascript
export function useYjs(roomId, token, options = {}) {
  const { type = 'excalidraw' } = options
  // ...
  connRef.current = getConnection(roomId, token, type)
  // ...
}
```

- [ ] **Step 3: 验证现有 ExcalidrawWrapper 不受影员**

```javascript
// ExcalidrawWrapper 调用方式不变
const { connected, synced, ... } = useYjs(effectiveRoomId, token)
// 默认 type='excalidraw'，行为不变
```

---

## Task 2: 创建 useMindMapYjs hook

**Files:**
- Create: `frontend/src/hooks/useMindMapYjs.js`

**Steps:**

- [ ] **Step 1: 创建 hook 基础结构**

```javascript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useYjs } from './useYjs'

export function useMindMapYjs({ canvasId, roomId, token, onNodesChange, onEdgesChange }) {
  const [localNodes, setLocalNodes] = useState([])
  const [localEdges, setLocalEdges] = useState([])
  
  const { connected, synced, onlineCount, yMap, awareness } = useYjs(roomId, token, { type: 'mindmap' })
  
  // ... implementation
  
  return {
    connected,
    synced,
    onlineCount,
    setNodes: wrappedSetNodes,
    setEdges: wrappedSetEdges
  }
}
```

- [ ] **Step 2: 实现 nodes/edges 到 Yjs 格式转换**

```javascript
// React Flow nodes -> Yjs format
function nodesToYjs(nodes) {
  return nodes.map(node => ({
    id: node.id,
    text: node.data.label,
    media: node.data.media || [],
    position: node.position,
    collapsed: node.data.collapsed || false
  }))
}
```

- [ ] **Step 3: 实现 Yjs 到 nodes/edges 格式转换**

```javascript
// Yjs format -> React Flow nodes
function yjsToNodes(yjsNodes, canEdit) {
  return (yjsNodes || []).map(n => ({
    id: n.id,
    type: 'mindNode',
    position: n.position,
    data: {
      label: n.text,
      media: n.media || [],
      collapsed: n.collapsed,
      canEdit,
      // callbacks will be added later
    }
  }))
}
```

- [ ] **Step 4: 实现 setNodes/setEdges 包装函数（带 debounce 同步）**

```javascript
const debounceRef = useRef(null)

const wrappedSetNodes = useCallback((nodes) => {
  setLocalNodes(nodes)
  onNodesChange?.(nodes)
  
  // Debounce sync to Yjs
  clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    if (yMap) {
      yMap.set('nodes', nodesToYjs(nodes))
    }
  }, 500)
}, [yMap, onNodesChange])
```

- [ ] **Step 5: 实现 Yjs observe 监听远程变化**

```javascript
useEffect(() => {
  if (!yMap) return
  
  const observer = () => {
    const yjsNodes = yMap.get('nodes')
    const yjsEdges = yMap.get('edges')
    
    // Convert and update local state
    const newNodes = yjsToNodes(yjsNodes, canEdit)
    const newEdges = yjsToEdges(yjsEdges)
    
    setLocalNodes(newNodes)
    setLocalEdges(newEdges)
    onNodesChange?.(newNodes)
    onEdgesChange?.(newEdges)
  }
  
  yMap.observe(observer)
  return () => yMap.unobserve(observer)
}, [yMap, canEdit, onNodesChange, onEdgesChange])
```

- [ ] **Step 6: 实现初始数据加载（优先 Yjs，fallback HTTP）**

```javascript
useEffect(() => {
  if (!yMap || synced === undefined) return
  
  // Wait for sync
  if (synced) {
    const yjsNodes = yMap.get('nodes')
    if (yjsNodes?.length > 0) {
      // Use Yjs data
      setLocalNodes(yjsToNodes(yjsNodes, canEdit))
    } else {
      // Load from HTTP API
      api.get(`/canvases/${canvasId}/mindmap`).then(res => {
        // ... convert and set
      }).catch(() => {
        // Create default root node
      })
    }
  }
}, [yMap, synced, canvasId, canEdit])
```

---

## Task 3: 修改 MindMapEditor 集成 useMindMapYjs

**Files:**
- Modify: `frontend/src/components/Editor/MindMapEditor.jsx`

**Steps:**

- [ ] **Step 1: 导入 useMindMapYjs 和相关 hooks**

```javascript
import { useMindMapYjs } from '../../hooks/useMindMapYjs'
import { useAuthStore } from '../../stores/authStore'
```

- [ ] **Step 2: 添加 roomId 和 token 获取逻辑**

```javascript
export default function MindMapEditor({ canvasId, canEdit, boardId }) {
  const { user } = useAuthStore()
  const token = localStorage.getItem('token')
  
  // Get roomId from canvas (need to check how it's passed)
  // For now, use boardId + canvasId as roomId
  const roomId = `board_${boardId}_canvas_${canvasId}`
  
  // ...
}
```

- [ ] **Step 3: 替换原有 setNodes/setEdges 为 Yjs 包装版本**

```javascript
const [nodes, setNodes, onNodesChange] = useNodesState([])
const [edges, setEdges, onEdgesChange] = useEdgesState([])

const {
  connected,
  synced,
  onlineCount,
  setNodes: yjsSetNodes,
  setEdges: yjsSetEdges
} = useMindMapYjs({
  canvasId,
  roomId,
  token,
  onNodesChange,
  onEdgesChange
})

// Wrap React Flow's setNodes to also call yjsSetNodes
const wrappedSetNodes = useCallback((updater) => {
  setNodes(updater)
  const newNodes = typeof updater === 'function' 
    ? updater(nodes) 
    : updater
  yjsSetNodes(newNodes)
}, [setNodes, yjsSetNodes, nodes])
```

- [ ] **Step 4: 添加连接状态指示器**

```javascript
// In toolbar
<div className="flex items-center space-x-2">
  <span className="text-sm text-gray-500 flex items-center space-x-1">
    <span className={`inline-block h-2 w-2 rounded-full ${
      synced ? 'bg-green-500' : connected ? 'bg-yellow-500' : 'bg-red-500'
    }`} />
    <span>{onlineCount} 人在线</span>
  </span>
</div>
```

- [ ] **Step 5: 移除原有的 HTTP API 加载逻辑（由 useMindMapYjs 处理）**

```javascript
// Remove this useEffect:
// useEffect(() => {
//   api.get(`/canvases/${canvasId}/mindmap`)...
// }, [canvasId])
```

- [ ] **Step 6: 更新保存逻辑（HTTP 备份 + Yjs 实时）**

```javascript
// Keep HTTP save for persistence, but it's now backup
const save = async () => {
  const { roots, crossConnections } = flowDataToTrees(nodes, edges)
  if (roots.length === 0) return

  setSaving(true)
  try {
    // HTTP backup save
    await api.put(`/canvases/${canvasId}/mindmap`, {
      roots,
      crossConnections,
      layout: 'vertical'
    })
  } finally {
    setSaving(false)
  }
}
```

---

## Task 4: 更新 yjs-server 权限验证

**Files:**
- Modify: `yjs-server/src/server.js`

**Steps:**

- [ ] **Step 1: 修改权限检查支持 mindmap 类型**

```javascript
// In setupWSConnection
const roomParts = roomId.split('_')
const boardId = roomParts[1]
const canvasId = roomParts[3]

// Check canvas type from database
const canvas = await db.get('SELECT type FROM canvases WHERE id = ?', [canvasId])
const isSupported = canvas?.type === 'excalidraw' || canvas?.type === 'mindmap'

if (!isSupported) {
  ws.close(1008, 'Canvas type not supported for real-time sync')
  return
}
```

---

## Task 5: 添加其他用户光标/选择状态 Awareness

**Files:**
- Modify: `frontend/src/hooks/useMindMapYjs.js`
- Modify: `frontend/src/components/Editor/MindMapEditor.jsx`

**Steps:**

- [ ] **Step 1: 在 useMindMapYjs 中暴露 awareness 状态**

```javascript
const [awarenessStates, setAwarenessStates] = useState(new Map())

useEffect(() => {
  if (!awareness) return
  
  const updateAwareness = () => {
    setAwarenessStates(new Map(awareness.getStates()))
  }
  
  awareness.on('change', updateAwareness)
  updateAwareness()
  
  return () => awareness.off('change', updateAwareness)
}, [awareness])

return {
  // ...
  awarenessStates,
  updateAwareness: (data) => awareness?.setLocalStateField('mindmap', data)
}
```

- [ ] **Step 2: 在 MindNode 组件中显示其他用户选择状态**

```javascript
// In MindNode component
function MindNode({ id, data, ... }) {
  // Get awareness from context or props
  const { awarenessStates } = useMindMapYjsContext()
  
  const selectedBy = Array.from(awarenessStates.entries())
    .filter(([_, state]) => state.mindmap?.selectedNode === id)
    .map(([clientId, state]) => state.user)
  
  return (
    <div className={...} style={{
      boxShadow: selectedBy.length > 0 
        ? `0 0 0 2px ${getUserColor(selectedBy[0])}` 
        : undefined
    }}>
      {/* ... */}
      {selectedBy.length > 0 && (
        <div className="absolute -top-2 -right-2 flex -space-x-1">
          {selectedBy.map(user => (
            <Avatar key={user.id} user={user} size="xs" />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 在 MindMapEditor 中更新本地选择状态到 awareness**

```javascript
const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
  const selectedId = selectedNodes[0]?.id || null
  setSelectedNode(selectedId)
  
  // Update awareness
  updateAwareness({ selectedNode: selectedId })
}, [updateAwareness])
```

---

## Task 6: 测试验证

**Test Plan:**

- [ ] **Test 1: 单用户基础功能**
  - 创建节点、编辑文本、删除节点
  - 验证数据保存到 Yjs
  - 刷新页面，验证数据恢复

- [ ] **Test 2: 双用户实时同步**
  - 用户 A 创建节点，用户 B 实时看到
  - 用户 A 编辑文本，用户 B 看到变化
  - 双方同时编辑不同节点，无冲突

- [ ] **Test 3: 离线恢复**
  - 断开网络，本地编辑
  - 恢复网络，数据自动同步

- [ ] **Test 4: 权限控制**
  - Viewer 只能查看，不能编辑
  - Editor 可以实时编辑

---

## 依赖关系

```
Task 1 (useYjs extension)
    ↓
Task 2 (useMindMapYjs hook)
    ↓
Task 3 (MindMapEditor integration)
    ↓
Task 4 (yjs-server update)
    ↓
Task 5 (Awareness features)
    ↓
Task 6 (Testing)
```

**可以并行：** Task 4 可以与 Task 2-3 并行开发

---

## 估计时间

| Task | 估计时间 |
|------|----------|
| Task 1 | 30 min |
| Task 2 | 2-3 hours |
| Task 3 | 1-2 hours |
| Task 4 | 30 min |
| Task 5 | 1-2 hours |
| Task 6 | 1 hour |
| **总计** | **6-8 hours** |
