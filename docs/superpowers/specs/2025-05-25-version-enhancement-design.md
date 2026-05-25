# 版本功能优化 + TencentMind 支持设计文档

> **Date:** 2025-05-25
> **Status:** Approved Design

## 目标

1. 优化现有版本（快照）功能的用户体验：版本命名、删除、恢复 loading、区分手动/自动保存
2. 将版本功能扩展到 TencentMind 画布类型

---

## 背景

当前版本功能仅支持 `excalidraw` 画布类型。用户通过"保存为版本"按钮手动创建快照，Yjs 服务器每 10 秒自动创建快照（保留 5 个）。现有问题：

- 版本无名称，只有时间戳，难以识别
- 无用版本无法删除
- 手动/自动保存的版本在 UI 上无法区分
- 恢复操作没有 loading 反馈
- 仅 excalidraw 支持版本功能

---

## 变更范围

### 1. 数据库

**`yjs_snapshots` 表** 新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `VARCHAR(255)`, nullable | 版本名称。手动保存时有值，自动保存为 null |

向后兼容：已有数据 `name = null`，前端自动降级为时间戳展示。

### 2. API

| 方法 | 路径 | 变更 |
|------|------|------|
| `POST /api/canvases/:id/snapshot` | body 可选加 `name` 字段 | 接受可选的 `name` 字符串 |
| `DELETE /api/canvases/:id/snapshots/:snapshotId` | **新增** | 删除指定快照（仅创建者可删，或画布 owner） |
| `GET /api/canvases/:id/snapshots` | 返回加 `name` 字段 | 列表返回增加 `name` |
| `GET /api/canvases/:id/snapshots/:snapshotId` | 返回加 `name` 字段 | 单条返回增加 `name` |

### 3. 前端 UI — VersionHistory.jsx

**保存流程改造：**
- 点击"保存为版本" → 弹出命名输入框（inline 在弹窗顶部）
- 默认名称 `手动保存版本 N`（N 取当前手动版本数 + 1）
- 用户可编辑 → 按回车或点击确认 → 调用 `onSave(name)`
- EditorPage 的 `saveSnapshot` 接受 `name` 参数，传给 API

**版本列表改造：**
- 手动保存：显示版本名（有 name 时）或时间戳（name 为 null），`created_by` 有值时显示用户名
- 自动保存（`created_by = null`）：灰色背景、虚线边框、"自动保存"标签，**无删除按钮**
- 当前版本：绿色"当前版本"徽章，仅最新一条

**交互改造：**
- 恢复按钮：点击后按钮变"恢复中..." + disabled，防止重复点击
- 删除按钮：**悬停**在版本项时才显示，位于卡片**左下角**（"恢复"在右上角），确保间距足够大
  - 删除前确认弹窗
  - 仅手动保存的版本可删除
- 删除后自动刷新列表
- 错误提示保留

### 4. 前端编排 — EditorPage.jsx

```javascript
// Ref for TencentMind
const tencentMindRef = useRef(null)

// saveSnapshot - 根据类型分发
const saveSnapshot = async (name) => {
  let base64
  if (currentCanvas.type === 'excalidraw') {
    base64 = excalidrawRef.current.getSnapshotData()
  } else if (currentCanvas.type === 'tencentmind') {
    base64 = tencentMindRef.current.getSnapshotData()
  }
  await api.post(`/canvases/${id}/snapshot`, { data: base64, name })
}

// restoreSnapshot - 根据类型分发
const restoreSnapshot = async (snapshotId) => {
  const res = await api.get(`/canvases/${id}/snapshots/${snapshotId}`)
  if (currentCanvas.type === 'excalidraw') {
    excalidrawRef.current.loadData(res.data.data)
  } else if (currentCanvas.type === 'tencentmind') {
    tencentMindRef.current.loadData(res.data.data)
  }
}

// deleteSnapshot - 新增
const deleteSnapshot = async (snapshotId) => {
  await api.delete(`/canvases/${id}/snapshots/${snapshotId}`)
}
```

- VersionHistory 组件新增 Props: `onDelete`
- restore 流程增加 loading 状态管理

### 5. TencentMindEditor.jsx

**变更：**
- 已经是 `forwardRef`，添加 `useImperativeHandle` 暴露两个方法
- `getSnapshotData()`: 使用 `originDataRef.current` 直接获取当前完整 Tencent-format 状态树（包含 `rootTopic`、`layout`、`theme`、`relationships` 等），序列化为 JSON → base64
- `loadData(base64Data)`: 解码 base64 → JSON，设 `originDataRef.current = data`，通过 `syncToYjs(data)` 写入 Yjs Map
  - Yjs observer 检测到变化 → `setTencentData(data)` + `setRemoteUpdateVersion()`
  - 远程更新 effect 接收新数据 → 通过 `setData()` / `applyRemoteDataInPlace()` 应用到 simple-mind-map 实例
  - 复用已有的 `applyingRemoteUpdateRef` + `ignoreDataChangeUntilRef` 机制，防止 saveData 误覆盖

```javascript
useImperativeHandle(ref, () => ({
  getSnapshotData() {
    if (!originDataRef.current) return null
    const json = JSON.stringify(originDataRef.current)
    return btoa(unescape(encodeURIComponent(json)))
  },
  loadData(base64Data) {
    const jsonStr = decodeURIComponent(escape(atob(base64Data)))
    const data = JSON.parse(jsonStr)
    originDataRef.current = data
    syncToYjs(data)  // Yjs observer → setTencentData → remote update effect → mind map apply
  }
}), [syncToYjs])
```

**原理**：`syncToYjs(data)` 调用 `yMap.set('__tencent_state', clonedData)`，触发 Yjs observer 的 `applyObservedData()` → `setTencentData(data)` → `setRemoteUpdateVersion(v+1)`。TencentMindEditor 中的远程更新 effect 检测到版本变化后，通过 `applyRemoteDataInPlace()` 或 `setData() + render()` 将数据应用到 simple-mind-map 实例，同时抑制 `data_change` 事件防止回存。

**删除权限说明：**
- `DELETE /api/canvases/:id/snapshots/:snapshotId` 使用 `checkCanvasPermission('editor')` 中间件
- 仅画布编辑者及以上角色可删除快照
- 自动保存（`created_by = null`）在 UI 上不展示删除按钮

---

## 不变的部分

- Yjs 自动保存逻辑不变（`yjs-server/src/server.js`）
- 数据库关联不变
- 快照数据的 base64 编码格式不变
- 其他画布类型（kanban、swimlane）不变
- 权限校验不变

---

## 测试计划

1. **版本命名**：保存时传入 name → 列表返回 name → UI 展示 name
2. **版本删除**：创建后删除 → 列表不再包含 → 404 获取已删版本
3. **恢复 loading**：恢复按钮点击后变 disabled
4. **手动/自动区分**：created_by=null 的展示"自动保存"标签和无删除按钮
5. **TencentMind 快照**：保存 TencentMind 状态 → 恢复后状态一致
6. **回归**：excalidraw 版本功能不受影响
