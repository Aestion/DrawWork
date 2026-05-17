# 思维导图实时同步设计

> 为 MindMapEditor 添加 Yjs WebSocket 实时协作能力

## 目标

实现思维导图的实时同步，支持多用户同时编辑同一画布。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     MindMapEditor                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ useMindMapYjs            │  │ useNodes/   │  │ yDoc <-> React Flow     │ │
│  │ (WebSocket) │──│ useEdges    │──│ 双向转换层              │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                 │                 │                  │
│    WebSocket         Local State      Y.Doc (CRDT)            │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Yjs WebSocket Server                        │
│                                                                 │
│  复用现有架构：ws://localhost:3001                              │
│  扩展 yMap 类型：支持 'mindmap' 数据类型                        │
└─────────────────────────────────────────────────────────────────┘
```

## 数据结构设计

### Yjs 存储格式

```javascript
{
  type: 'mindmap',  // 区分 excalidraw 和 mindmap
  nodes: [
    {
      id: 'node-1',
      text: '中心主题',
      media: [],           // 媒体文件引用（只存ID）
      position: {x, y},    // 实时同步位置
      collapsed: false     // 是否折叠
    }
  ],
  edges: [
    {
      id: 'edge-1-2',
      source: 'node-1',
      target: 'node-2',
      type: 'smoothstep'   // 或 'crossConnection'
    }
  ],
  crossConnections: [
    {
      id: 'cross-1',
      source: 'node-1',
      target: 'node-3',
      label: '关联'
    }
  ],
  awareness: {
    'user-1': { cursor: {x, y}, selectedNode: 'node-1' },
    'user-2': { cursor: {x, y}, selectedNode: null }
  }
}
```

### 同步策略

**乐观锁 + 最终一致性**

1. **本地先改**：用户操作立即更新 React Flow state
2. **异步同步**：2秒后 debounce 写入 Yjs Doc
3. **远程监听**：Yjs observe 触发，更新本地 state
4. **冲突解决**：Yjs CRDT 自动合并

```
用户操作 → setNodes/setEdges → 2s debounce → yDoc.set('nodes', ...)
                                    ↓
用户操作 ← setNodes/setEdges ← yDoc.observe ← 远程用户操作
```

## 组件设计

### useMindMapYjs Hook

```typescript
interface UseMindMapYjsOptions {
  canvasId: string
  roomId: string
  token: string
  onNodesChange: (nodes: Node[]) => void
  onEdgesChange: (edges: Edge[]) => void
}

interface UseMindMapYjsReturn {
  connected: boolean
  synced: boolean
  onlineCount: number
  setNodes: (nodes: Node[]) => void  // 包装后的 setNodes，自动同步
  setEdges: (edges: Edge[]) => void  // 包装后的 setEdges，自动同步
}
```

### 与现有 useYjs 的集成

扩展 useYjs 支持 `type` 参数：

```javascript
// useYjs(roomId, token, { type: 'mindmap' })
// 默认 type: 'excalidraw'

function getConnection(roomId, token, type = 'excalidraw') {
  const yMap = doc.getMap(type)  // 'excalidraw' | 'mindmap'
  // ...
}
```

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `hooks/useYjs.js` | 修改 | 添加 `type` 参数支持 |
| `hooks/useMindMapYjs.js` | 新建 | 封装 mindmap 同步逻辑 |
| `components/Editor/MindMapEditor.jsx` | 修改 | 集成 useMindMapYjs |
| `yjs-server/src/server.js` | 修改 | 验证权限时支持 mindmap 类型 |

## 异常处理

| 场景 | 处理方案 |
|------|----------|
| 离线检测 | 断开时显示离线状态，本地编辑，重连后自动同步 |
| 权限变更 | 被降级为 viewer 时，禁用编辑但保持查看 |
| 版本冲突 | 乐观锁，自动合并，必要时刷新页面 |
| 并发节点ID | 使用 `yjs-roomId-timestamp-random` 确保唯一 |

## 非目标

- 媒体文件实时同步（仍走 HTTP）
- 细粒度权限控制（只区分 editor/viewer）
- 历史版本回滚（使用现有后端 API）
