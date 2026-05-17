# DrawWork 功能需求与技术实现 V2

## 功能需求总览

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 画板 | 创建多个、自定义命名、封面 | P0 |
| 画布 | 每个画板多个、自定义命名、排序 | P0 |
| 分享 | 以画板为单位、权限控制 | P0 |
| 画布内容 | 手绘、图片、GIF、视频、音频 | P0 |

---

## 一、画板（Board）

### 1.1 功能需求

- 用户可以创建多个画板
- 每个画板可自定义命名
- 支持设置画板封面（从画布内容中截取或上传）
- 支持设置画板为公开/私密
- 显示创建时间、最后修改时间

### 1.2 数据库设计

```sql
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,                    -- 自定义名称
  description TEXT,                      -- 描述
  is_public BOOLEAN DEFAULT false,       -- 是否公开
  cover_url TEXT,                        -- 封面图片URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.3 前端实现

```jsx
// 画板卡片组件
function BoardCard({ board }) {
  return (
    <div className="board-card">
      {/* 封面预览 */}
      <div className="cover">
        {board.cover_url ? (
          <img src={board.cover_url} alt={board.name} />
        ) : (
          <div className="placeholder">无封面</div>
        )}
      </div>
      
      {/* 画板信息 */}
      <div className="info">
        <h3>{board.name}</h3>
        <p>{board.description}</p>
        <span>{board.is_public ? '公开' : '私密'}</span>
        <span>{board.canvas_count} 个画布</span>
      </div>
    </div>
  )
}

// 创建/编辑画板弹窗
function BoardModal({ board, onSave }) {
  const [name, setName] = useState(board?.name || '')
  const [description, setDescription] = useState(board?.description || '')
  const [isPublic, setIsPublic] = useState(board?.is_public || false)
  
  return (
    <form onSubmit={() => onSave({ name, description, is_public: isPublic })}>
      <input 
        value={name} 
        onChange={e => setName(e.target.value)}
        placeholder="画板名称"
        maxLength={50}
      />
      <textarea 
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="描述（可选）"
        maxLength={200}
      />
      <label>
        <input 
          type="checkbox" 
          checked={isPublic}
          onChange={e => setIsPublic(e.target.checked)}
        />
        公开画板（任何人可查看）
      </label>
      <button type="submit">保存</button>
    </form>
  )
}
```

---

## 二、画布（Canvas）

### 2.1 功能需求

- 每个画板内可创建多个画布
- 每个画布可自定义命名（默认：画布1、画布2...）
- 支持拖拽排序
- 画布切换时保持内容（实时协作也保持连接）
- 画布内容独立存储（每个画布一个 Yjs room）

### 2.2 数据库设计

```sql
CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT '画布 1',     -- 自定义名称
  sort_order INTEGER DEFAULT 0,            -- 排序序号
  yjs_room_id TEXT UNIQUE NOT NULL,        -- Yjs 房间ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 获取画板的所有画布（按排序）
-- SELECT * FROM canvases WHERE board_id = ? ORDER BY sort_order
```

### 2.3 前端实现 - 画布切换器

```jsx
// components/CanvasSwitcher.jsx
import { useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

function CanvasSwitcher({ 
  canvases, 
  currentCanvasId, 
  onSwitch, 
  onReorder,
  onRename,
  onCreate,
  onDelete 
}) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  // 拖拽排序
  const handleDragEnd = (result) => {
    if (!result.destination) return
    
    const items = Array.from(canvases)
    const [reordered] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reordered)
    
    // 更新排序序号
    const updated = items.map((item, index) => ({
      ...item,
      sort_order: index
    }))
    
    onReorder(updated)
  }

  return (
    <div className="canvas-switcher">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="canvases" direction="horizontal">
          {(provided) => (
            <div 
              ref={provided.innerRef} 
              {...provided.droppableProps}
              className="canvas-tabs"
            >
              {canvases.map((canvas, index) => (
                <Draggable 
                  key={canvas.id} 
                  draggableId={canvas.id} 
                  index={index}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`canvas-tab ${
                        canvas.id === currentCanvasId ? 'active' : ''
                      }`}
                      onClick={() => onSwitch(canvas.id)}
                    >
                      {editingId === canvas.id ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={() => {
                            onRename(canvas.id, editName)
                            setEditingId(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              onRename(canvas.id, editName)
                              setEditingId(null)
                            }
                          }}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span 
                          onDoubleClick={() => {
                            setEditingId(canvas.id)
                            setEditName(canvas.name)
                          }}
                          title="双击重命名"
                        >
                          {canvas.name}
                        </span>
                      )}
                      
                      {/* 删除按钮（至少保留一个画布） */}
                      {canvases.length > 1 && (
                        <button 
                          onClick={e => {
                            e.stopPropagation()
                            if (confirm('确定删除此画布？')) {
                              onDelete(canvas.id)
                            }
                          }}
                          className="delete-btn"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      {/* 新建画布按钮 */}
      <button 
        onClick={onCreate}
        className="create-canvas-btn"
        title="新建画布"
      >
        +
      </button>
    </div>
  )
}
```

### 2.4 Yjs Room 管理

```javascript
// hooks/useCanvas.js
import { useEffect, useState } from 'react'
import { useCollaboration } from './useCollaboration'

export function useCanvas(boardId, canvasId) {
  const [canvas, setCanvas] = useState(null)
  const [canvases, setCanvases] = useState([])
  const [loading, setLoading] = useState(true)
  
  const { doc, synced, awareness } = useCollaboration(canvasId, boardId)

  // 加载画布列表
  const loadCanvases = async () => {
    const { data } = await supabase
      .from('canvases')
      .select('*')
      .eq('board_id', boardId)
      .order('sort_order')
    
    setCanvases(data || [])
    setLoading(false)
  }

  // 创建新画布
  const createCanvas = async (name) => {
    const newCanvasId = crypto.randomUUID()
    const yjsRoomId = `board_${boardId}_${newCanvasId}`
    
    const { data, error } = await supabase
      .from('canvases')
      .insert({
        board_id: boardId,
        name: name || `画布 ${canvases.length + 1}`,
        yjs_room_id: yjsRoomId,
        sort_order: canvases.length
      })
      .select()
      .single()
    
    if (!error) {
      setCanvases([...canvases, data])
    }
    
    return { data, error }
  }

  // 重命名画布
  const renameCanvas = async (id, newName) => {
    const { error } = await supabase
      .from('canvases')
      .update({ name: newName })
      .eq('id', id)
    
    if (!error) {
      setCanvases(canvases.map(c => 
        c.id === id ? { ...c, name: newName } : c
      ))
    }
  }

  // 删除画布
  const deleteCanvas = async (id) => {
    const { error } = await supabase
      .from('canvases')
      .delete()
      .eq('id', id)
    
    if (!error) {
      setCanvases(canvases.filter(c => c.id !== id))
    }
  }

  // 重新排序
  const reorderCanvases = async (updatedCanvases) => {
    setCanvases(updatedCanvases)
    
    // 批量更新数据库
    const updates = updatedCanvases.map((c, idx) => ({
      id: c.id,
      sort_order: idx
    }))
    
    await supabase.from('canvases').upsert(updates)
  }

  useEffect(() => {
    loadCanvases()
  }, [boardId])

  return {
    canvases,
    currentCanvas: canvas,
    loading,
    createCanvas,
    renameCanvas,
    deleteCanvas,
    reorderCanvases,
    yjs: { doc, synced, awareness }
  }
}
```

---

## 三、分享功能

### 3.1 功能需求

- 以画板为单位进行分享
- 被分享者可以看到该画板下的所有画布
- 权限级别：
  - **viewer** (查看者)：只读，不能编辑
  - **editor** (编辑者)：可编辑所有画布
  - **commenter** (评论者)：可评论、不能编辑
- 支持两种方式：
  - 邀请特定用户（通过用户名/邮箱）
  - 生成公开分享链接（可设置过期时间）

### 3.2 数据库设计

```sql
-- 用户间邀请
CREATE TABLE board_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('editor', 'viewer', 'commenter')),
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- 公开分享链接
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  token TEXT UNIQUE NOT NULL,              -- 随机token
  permission TEXT DEFAULT 'viewer',
  expires_at TIMESTAMPTZ,                  -- 过期时间
  max_uses INTEGER,                        -- 最大使用次数
  used_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 权限验证逻辑

```javascript
// lib/permissions.js

export async function getBoardPermission(boardId, userId, shareToken = null) {
  // 1. 检查是否是所有者
  const { data: board } = await supabase
    .from('boards')
    .select('owner_id, is_public')
    .eq('id', boardId)
    .single()
  
  if (board?.owner_id === userId) {
    return { permission: 'owner', canEdit: true }
  }
  
  // 2. 检查是否被直接分享
  if (userId) {
    const { data: share } = await supabase
      .from('board_shares')
      .select('permission')
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .single()
    
    if (share) {
      return {
        permission: share.permission,
        canEdit: share.permission === 'editor'
      }
    }
  }
  
  // 3. 检查分享 token
  if (shareToken) {
    const { data: tokenData } = await supabase
      .from('share_tokens')
      .select('*')
      .eq('token', shareToken)
      .eq('board_id', boardId)
      .single()
    
    if (tokenData) {
      // 检查是否过期
      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        return { permission: null, error: 'Token expired' }
      }
      
      // 检查使用次数
      if (tokenData.max_uses && tokenData.used_count >= tokenData.max_uses) {
        return { permission: null, error: 'Token max uses reached' }
      }
      
      // 增加使用次数
      await supabase
        .from('share_tokens')
        .update({ used_count: tokenData.used_count + 1 })
        .eq('id', tokenData.id)
      
      return {
        permission: tokenData.permission,
        canEdit: tokenData.permission === 'editor'
      }
    }
  }
  
  // 4. 检查是否公开
  if (board?.is_public) {
    return { permission: 'viewer', canEdit: false }
  }
  
  // 无权限
  return { permission: null }
}
```

### 3.4 WebSocket 权限验证（PartyKit）

```typescript
// yjs-server/server.ts
async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
  const url = new URL(ctx.request.url)
  const token = url.searchParams.get('token')        // JWT token
  const shareToken = url.searchParams.get('share')   // 分享token
  const roomId = url.pathname.slice(1)               // board_{boardId}_{canvasId}
  
  const boardId = roomId.split('_')[1]
  
  // 验证权限
  let userId = null
  let permission = null
  let isReadOnly = true
  
  if (token) {
    // 验证 Supabase JWT
    const user = await this.verifySupabaseToken(token)
    if (user) {
      userId = user.id
      const perm = await this.checkBoardPermission(boardId, user.id)
      permission = perm.permission
      isReadOnly = !perm.canEdit
    }
  } else if (shareToken) {
    // 验证分享 token
    const perm = await this.checkShareToken(boardId, shareToken)
    permission = perm.permission
    isReadOnly = !perm.canEdit
  } else {
    // 检查是否公开
    const isPublic = await this.checkIsPublic(boardId)
    if (!isPublic) {
      conn.close(1008, 'Unauthorized')
      return
    }
    permission = 'viewer'
  }
  
  // 设置连接元数据
  conn.setState({ userId, permission, isReadOnly })
  
  // 连接 Yjs
  return onConnect(conn, this.room, {
    load: () => this.loadYDoc(roomId),
    callback: {
      handler: (doc) => this.saveYDoc(roomId, doc, userId),
      debounceWait: 30000
    }
  })
}

// 广播权限信息给所有客户端
broadcastPermission(conn, permission, isReadOnly) {
  this.room.broadcast(JSON.stringify({
    type: 'permission',
    userId: conn.state.userId,
    permission,
    isReadOnly
  }))
}
```

### 3.5 前端分享组件

```jsx
// components/SharePanel.jsx
function SharePanel({ boardId }) {
  const [shares, setShares] = useState([])
  const [shareLinks, setShareLinks] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPermission, setNewPermission] = useState('viewer')
  
  // 加载分享列表
  useEffect(() => {
    loadShares()
  }, [boardId])
  
  const loadShares = async () => {
    const { data } = await supabase
      .from('board_shares')
      .select('*, profiles:user_id(*)')
      .eq('board_id', boardId)
    
    setShares(data || [])
    
    const { data: links } = await supabase
      .from('share_tokens')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
    
    setShareLinks(links || [])
  }
  
  // 邀请用户
  const inviteUser = async () => {
    // 查找用户
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', newUsername)
      .single()
    
    if (!user) {
      alert('用户不存在')
      return
    }
    
    await supabase.from('board_shares').insert({
      board_id: boardId,
      user_id: user.id,
      permission: newPermission
    })
    
    loadShares()
    setNewUsername('')
  }
  
  // 生成分享链接
  const createShareLink = async (permission, expiresDays = 7) => {
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresDays)
    
    await supabase.from('share_tokens').insert({
      board_id: boardId,
      token,
      permission,
      expires_at: expiresAt.toISOString()
    })
    
    loadShares()
  }
  
  return (
    <div className="share-panel">
      <h3>分享画板</h3>
      
      {/* 邀请用户 */}
      <div className="invite-section">
        <h4>邀请协作者</h4>
        <input
          value={newUsername}
          onChange={e => setNewUsername(e.target.value)}
          placeholder="输入用户名"
        />
        <select value={newPermission} onChange={e => setNewPermission(e.target.value)}>
          <option value="viewer">查看者</option>
          <option value="editor">编辑者</option>
          <option value="commenter">评论者</option>
        </select>
        <button onClick={inviteUser}>邀请</button>
        
        {/* 已邀请列表 */}
        <ul>
          {shares.map(share => (
            <li key={share.id}>
              {share.profiles.username} - 
              {share.permission === 'editor' ? '编辑者' : 
               share.permission === 'viewer' ? '查看者' : '评论者'}
              <button onClick={() => removeShare(share.id)}>移除</button>
            </li>
          ))}
        </ul>
      </div>
      
      {/* 分享链接 */}
      <div className="link-section">
        <h4>分享链接</h4>
        <button onClick={() => createShareLink('viewer')}>生成查看链接</button>
        <button onClick={() => createShareLink('editor')}>生成编辑链接</button>
        
        <ul>
          {shareLinks.map(link => (
            <li key={link.id}>
              <input 
                value={`${window.location.origin}/board/${boardId}?token=${link.token}`}
                readOnly
              />
              <button onClick={() => copyToClipboard(link.token)}>复制</button>
              <button onClick={() => revokeLink(link.id)}>撤销</button>
              {link.expires_at && (
                <span>过期: {new Date(link.expires_at).toLocaleDateString()}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

---

## 四、画布内容功能

### 4.1 功能概览

| 类型 | 功能 | 自动播放 | 实现方式 |
|------|------|----------|----------|
| 手绘 | Excalidraw 原生 | - | Excalidraw 组件 |
| 静态图片 | 导入/粘贴 | - | Excalidraw Image 元素 |
| GIF | 导入/粘贴 | ✅ 循环播放 | Excalidraw Image + GIF 识别 |
| 视频 | 导入/嵌入 | ✅ 循环播放 | 自定义 HTML 元素 |
| 音频 | 导入/嵌入 | ❌ 点击播放 | 自定义 HTML 元素 |

### 4.2 静态图片导入

```jsx
// Excalidraw 原生支持
function handleImageUpload = async (file) => {
  // 1. 上传到 Supabase Storage
  const { data: { publicUrl } } = await uploadToStorage(file)
  
  // 2. 添加到 Excalidraw
  const imageElement = {
    type: 'image',
    fileId: generateId(),
    status: 'saved',
    x: 100,
    y: 100,
    width: 300,
    height: 200
  }
  
  excalidrawAPI.addFiles([{
    id: imageElement.fileId,
    dataURL: publicUrl,
    mimeType: file.type,
    created: Date.now()
  }])
  
  excalidrawAPI.updateScene({
    elements: [...elements, imageElement]
  })
}
```

### 4.3 GIF 图片（自动循环播放）

```jsx
// 检测并处理 GIF
function isGif(url) {
  return url.toLowerCase().endsWith('.gif')
}

// 在 Excalidraw 中渲染 GIF
// 方案1：使用静态帧（简单但不播放动画）
// 方案2：使用 HTML 覆盖层（可播放动画）

// 方案2实现：自定义渲染
function CustomGifElement({ element }) {
  const [isPlaying, setIsPlaying] = useState(true)
  
  if (!isGif(element.fileUrl)) {
    return null // 使用 Excalidraw 默认渲染
  }
  
  return (
    <div 
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        pointerEvents: 'none' // 让点击穿透到 Excalidraw
      }}
    >
      <img 
        src={element.fileUrl}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  )
}
```

### 4.4 视频（自动循环播放）

```jsx
// components/MediaElements.jsx

// 视频元素
export function VideoElement({ element, isSelected }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        border: isSelected ? '2px solid blue' : 'none'
      }}
    >
      <video
        src={element.url}
        autoPlay
        loop
        muted
        playsInline
        style={{ width: '100%', height: '100%' }}
        controls={isSelected} // 选中时显示控制条
      />
    </div>
  )
}

// 添加视频到画布
export async function addVideoElement(excalidrawAPI, videoFile) {
  // 上传视频
  const { url } = await uploadToStorage(videoFile)
  
  // 获取视频尺寸
  const video = document.createElement('video')
  video.src = url
  await new Promise(resolve => {
    video.onloadedmetadata = resolve
  })
  
  const aspectRatio = video.videoWidth / video.videoHeight
  const maxWidth = 400
  const width = Math.min(maxWidth, video.videoWidth)
  const height = width / aspectRatio
  
  // 创建自定义元素数据（存储在 Yjs 中）
  const videoElement = {
    id: generateId(),
    type: 'video',  // 自定义类型
    url: url,
    x: 100,
    y: 100,
    width: width,
    height: height,
    createdAt: Date.now()
  }
  
  return videoElement
}
```

### 4.5 音频（点击播放）

```jsx
// 音频元素
export function AudioElement({ element, isSelected }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef(null)
  
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }
  
  return (
    <div
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width || 200,
        height: element.height || 60,
        background: '#f0f0f0',
        border: isSelected ? '2px solid blue' : '1px solid #ccc',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        padding: 10,
        cursor: 'pointer'
      }}
      onClick={togglePlay}
    >
      <audio
        ref={audioRef}
        src={element.url}
        onEnded={() => setIsPlaying(false)}
      />
      
      {/* 播放按钮图标 */}
      <button style={{ marginRight: 10 }}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      
      {/* 音频名称 */}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {element.name || '音频文件'}
      </span>
      
      {/* 波形/进度可视化（简化版） */}
      <div style={{ width: 60, height: 20, background: '#ddd', borderRadius: 2 }}>
        {isPlaying && <div className="playing-indicator">♪</div>}
      </div>
    </div>
  )
}

// 添加音频
export async function addAudioElement(audioFile) {
  const { url } = await uploadToStorage(audioFile)
  
  return {
    id: generateId(),
    type: 'audio',
    url: url,
    name: audioFile.name,
    x: 100,
    y: 100,
    width: 200,
    height: 60
  }
}
```

### 4.6 在 Excalidraw 中渲染自定义元素

```jsx
// pages/Editor.jsx
import { useEffect, useRef } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import { VideoElement } from '../components/MediaElements'
import { AudioElement } from '../components/MediaElements'

export default function Editor() {
  const excalidrawRef = useRef(null)
  const containerRef = useRef(null)
  const [customElements, setCustomElements] = useState([])
  
  // 从 Yjs 加载自定义元素
  useEffect(() => {
    if (!doc) return
    
    const yElements = doc.getMap('customElements')
    
    yElements.observe(() => {
      const elements = Array.from(yElements.values())
      setCustomElements(elements)
    })
    
    // 初始加载
    setCustomElements(Array.from(yElements.values()))
  }, [doc])
  
  // 渲染自定义元素覆盖层
  const renderCustomOverlay = () => {
    return customElements.map(element => {
      switch (element.type) {
        case 'video':
          return (
            <VideoElement
              key={element.id}
              element={element}
              isSelected={selectedElementIds.has(element.id)}
            />
          )
        case 'audio':
          return (
            <AudioElement
              key={element.id}
              element={element}
              isSelected={selectedElementIds.has(element.id)}
            />
          )
        case 'gif':
          // GIF 使用 img 标签自动播放
          return (
            <div
              key={element.id}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                pointerEvents: 'none'
              }}
            >
              <img
                src={element.url}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          )
        default:
          return null
      }
    })
  }
  
  return (
    <div ref={containerRef} className="editor-container">
      <Excalidraw
        ref={excalidrawRef}
        onChange={handleExcalidrawChange}
        // ...其他配置
      />
      
      {/* 自定义媒体元素覆盖层 */}
      <div className="custom-elements-overlay">
        {renderCustomOverlay()}
      </div>
      
      {/* 媒体上传按钮 */}
      <div className="media-toolbar">
        <input
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={handleMediaUpload}
          style={{ display: 'none' }}
          id="media-upload"
        />
        <label htmlFor="media-upload" className="upload-btn">
          📎 插入媒体
        </label>
      </div>
    </div>
  )
}
```

### 4.7 拖拽上传媒体文件

```jsx
function handleDrop = async (e) => {
  e.preventDefault()
  
  const files = Array.from(e.dataTransfer.files)
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await addImageElement(file)
    } else if (file.type.startsWith('video/')) {
      await addVideoElement(file)
    } else if (file.type.startsWith('audio/')) {
      await addAudioElement(file)
    }
  }
}

// 粘贴上传
function handlePaste = async (e) => {
  const items = e.clipboardData.items
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      await addImageElement(file)
    }
  }
}
```

---

## 五、完整数据流

```
用户操作
  ↓
Excalidraw / 自定义组件
  ↓
Yjs Document (本地)
  ↓
┌─────────────────────────────────────────┐
│          分发到所有连接用户              │
│  ┌─────┐    ┌─────┐    ┌─────┐         │
│  │用户A│ ←→ │Yjs服务器│ ←→ │用户B│         │
│  └─────┘    └─────┘    └─────┘         │
└─────────────────────────────────────────┘
  ↓
定期保存 (每30秒)
  ↓
Supabase PostgreSQL (持久化存储)
  ↓
新用户加入时加载历史数据
```

---

## 六、实施优先级

| 阶段 | 功能 | 工期 |
|------|------|------|
| Phase 1 | 画板创建、命名、列表 | 2天 |
| Phase 2 | 画布多标签、命名、排序 | 3天 |
| Phase 3 | 分享功能（邀请+链接） | 3天 |
| Phase 4 | 基础手绘 + 图片 | 2天 |
| Phase 5 | GIF、视频（自动播放） | 2天 |
| Phase 6 | 音频（点击播放） | 2天 |
| **总计** | | **14天** |

---

*文档版本: v2.0*  
*更新日期: 2026-04-25*
