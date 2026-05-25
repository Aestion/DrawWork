# Version Enhancement + TencentMind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance version history (naming, deletion, auto/manual distinction) and extend version support to TencentMind canvas type.

**Architecture:** Add `name` column to `yjs_snapshots` for version labeling. Extend POST/DELETE API. Refactor VersionHistory UI (inline naming input, hover delete, auto-save styling). Add `useImperativeHandle` to TencentMindEditor for getSnapshotData/loadData, route via EditorPage type-dispatch.

**Tech Stack:** Node.js/Express (backend), React (frontend), Sequelize (ORM), Yjs (CRDT), simple-mind-map (TencentMind), Vitest (frontend tests), Supertest (backend tests)

---

## File Structure

| File | Status | Responsibility |
|------|--------|---------------|
| `backend/src/models/yjsSnapshot.js` | Modify | Add `name` field |
| `backend/src/routes/snapshots.js` | Modify | Accept `name` on POST, return `name` on GET, add DELETE endpoint |
| `backend/src/__tests__/snapshots.test.js` | Modify | Tests for `name` field, DELETE endpoint |
| `frontend/src/components/Editor/VersionHistory.jsx` | Modify | Naming input, delete button, auto/manual distinction, restore loading |
| `frontend/src/pages/EditorPage.jsx` | Modify | Type-dispatch save/restore, add deleteSnapshot, add tencentMindRef |
| `frontend/src/components/Editor/TencentMindEditor.jsx` | Modify | Add useImperativeHandle with getSnapshotData/loadData |
| `frontend/src/components/Editor/__tests__/VersionHistory.test.jsx` | Create | Tests for version history UI |
| `frontend/src/pages/__tests__/EditorPage.test.jsx` | Modify | Tests for type-dispatch and delete |

---

### Task 1: Add `name` column to yjs_snapshots model + backend migration

**Files:**
- Modify: `backend/src/models/yjsSnapshot.js`
- No migration file (DB uses `sequelize.sync`, but need an ALTER TABLE fallback)

- [ ] **Step 1: Modify model**

Add `name` field to `backend/src/models/yjsSnapshot.js`:

```javascript
name: {
  type: DataTypes.STRING(255),
  allowNull: true
},
```

Insert after `content` field, before `created_by`.

- [ ] **Step 2: Add ALTER TABLE statement for existing DBs**

Create file `backend/src/migrations/add-name-to-yjs-snapshots.sql`:

```sql
ALTER TABLE yjs_snapshots ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT NULL;
```

- [ ] **Step 3: Verify model reflects in test**

Run: `npx jest backend/src/__tests__/snapshots.test.js --no-coverage`
Expected: Existing tests pass (new nullable field is backward-compatible)

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/yjsSnapshot.js backend/src/migrations/
git commit -m "feat: add name column to yjs_snapshots"
```

---

### Task 2: Backend API — name support + DELETE endpoint

**Files:**
- Modify: `backend/src/routes/snapshots.js`
- Modify: `backend/src/__tests__/snapshots.test.js`

- [ ] **Step 1: Write failing test for DELETE endpoint**

Add to `backend/src/__tests__/snapshots.test.js` (before the closing `describe`):

```javascript
// ============================================================
// Delete snapshot endpoint tests
// ============================================================
it('DELETE snapshot removes it and returns 200', async () => {
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Delete Snap Board' })
  const canvas = boardRes.body.canvases[0]

  const createRes = await request(app)
    .post(`/api/canvases/${canvas.id}/snapshot`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ data: Buffer.from('delete-me').toString('base64') })
  expect(createRes.status).toBe(201)

  const delRes = await request(app)
    .delete(`/api/canvases/${canvas.id}/snapshots/${createRes.body.id}`)
    .set('Authorization', `Bearer ${ownerToken}`)
  expect(delRes.status).toBe(200)

  const getRes = await request(app)
    .get(`/api/canvases/${canvas.id}/snapshots/${createRes.body.id}`)
    .set('Authorization', `Bearer ${ownerToken}`)
  expect(getRes.status).toBe(404)
})

it('DELETE snapshot by non-editor returns 403', async () => {
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Delete Perm Board' })
  const canvas = boardRes.body.canvases[0]

  const createRes = await request(app)
    .post(`/api/canvases/${canvas.id}/snapshot`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ data: Buffer.from('perm-test').toString('base64') })

  // Share with viewer
  const { BoardShare } = require('../models')
  await BoardShare.create({
    board_id: boardRes.body.id,
    user_id: viewer.id,
    permission: 'viewer'
  })

  // Viewer cannot delete
  const delRes = await request(app)
    .delete(`/api/canvases/${canvas.id}/snapshots/${createRes.body.id}`)
    .set('Authorization', `Bearer ${viewerToken}`)
  expect(delRes.status).toBe(403)
})

it('DELETE non-existent snapshot returns 404', async () => {
  const delRes = await request(app)
    .delete(`/api/canvases/${testCanvas.id}/snapshots/00000000-0000-0000-0000-000000000000`)
    .set('Authorization', `Bearer ${ownerToken}`)
  expect(delRes.status).toBe(404)
})

it('POST snapshot accepts optional name and returns it in list', async () => {
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Name Snap Board' })
  const canvas = boardRes.body.canvases[0]

  // Create with name
  const createRes = await request(app)
    .post(`/api/canvases/${canvas.id}/snapshot`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      data: Buffer.from('named-snap').toString('base64'),
      name: '初稿完成'
    })
  expect(createRes.status).toBe(201)

  // List should include name
  const listRes = await request(app)
    .get(`/api/canvases/${canvas.id}/snapshots`)
    .set('Authorization', `Bearer ${ownerToken}`)
  expect(listRes.status).toBe(200)
  expect(listRes.body[0]).toHaveProperty('name')
  expect(listRes.body[0].name).toBe('初稿完成')
})

it('POST snapshot without name sets name to null', async () => {
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'No Name Board' })
  const canvas = boardRes.body.canvases[0]

  const createRes = await request(app)
    .post(`/api/canvases/${canvas.id}/snapshot`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ data: Buffer.from('noname').toString('base64') })
  expect(createRes.status).toBe(201)

  const listRes = await request(app)
    .get(`/api/canvases/${canvas.id}/snapshots`)
    .set('Authorization', `Bearer ${ownerToken}`)
  expect(listRes.body[0].name).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest backend/src/__tests__/snapshots.test.js --no-coverage`
Expected: New tests fail (DELETE route not found, name not returned)

- [ ] **Step 3: Add DELETE endpoint + name support to snapshots.js**

```javascript
// Add after the POST route (before GET list)

// DELETE /api/canvases/:id/snapshots/:snapshotId — 删除快照
router.delete('/:id/snapshots/:snapshotId', authMiddleware, checkCanvasPermission('editor'), async (req, res, next) => {
  try {
    const snapshot = await YjsSnapshot.findOne({
      where: { id: req.params.snapshotId, canvas_id: req.params.id }
    })
    if (!snapshot) {
      return res.status(404).json({ error: '快照不存在' })
    }
    await snapshot.destroy()
    res.json({ message: '快照已删除' })
  } catch (err) {
    next(err)
  }
})
```

And update POST to accept/validate `name`:

In POST route, change the validation to accept `name`:
```javascript
const { data, name } = req.body

if (!data) {
  return res.status(400).json({ error: '缺少数据' })
}
if (typeof data !== 'string' || !/^[A-Za-z0-9+/=\n\r]+$/.test(data)) {
  return res.status(400).json({ error: '快照数据格式无效' })
}

const snapshot = await YjsSnapshot.create({
  canvas_id: canvasId,
  content: Buffer.from(data, 'base64'),
  created_by: req.user.id,
  name: typeof name === 'string' && name.trim().length > 0 ? name.trim().substring(0, 255) : null
})
```

And update both GET list and GET by ID to return `name`:

In list endpoint, add `'name'` to attributes:
```javascript
attributes: ['id', 'name', 'createdAt', 'created_by'],
```

In list serializer:
```javascript
const result = snapshots.map(s => ({
  id: s.id,
  name: s.name || null,
  created_at: serializeCreatedAt(s),
  created_by: s.User ? { id: s.User.id, username: s.User.username } : null
}))
```

In GET by ID:
```javascript
res.json({
  id: snapshot.id,
  name: snapshot.name || null,
  data: Buffer.from(snapshot.content).toString('base64'),
  created_at: serializeCreatedAt(snapshot),
  created_by: snapshot.User ? { id: snapshot.User.id, username: snapshot.User.username } : snapshot.created_by
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest backend/src/__tests__/snapshots.test.js backend/src/__tests__/snapshot-format.test.js --no-coverage`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/snapshots.js backend/src/__tests__/snapshots.test.js
git commit -m "feat: add name field and DELETE endpoint to snapshot API"
```

---

### Task 3: VersionHistory UI — naming, delete, auto/manual distinction, restore loading

**Files:**
- Modify: `frontend/src/components/Editor/VersionHistory.jsx`
- Create: `frontend/src/components/Editor/__tests__/VersionHistory.test.jsx` (optional smoke tests)

- [ ] **Step 1: Rewrite VersionHistory.jsx**

The complete new component:

```jsx
import { useState, useEffect, useRef } from 'react'
import api from '../../lib/axios'

function formatTime(dateStr) {
  if (!dateStr) return '当前版本'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleString('zh-CN')
}

export default function VersionHistory({ canvasId, onClose, onSave, onRestore, onDelete }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [showNaming, setShowNaming] = useState(false)
  const [versionName, setVersionName] = useState('')
  const inputRef = useRef(null)

  const fetchSnapshots = () => {
    setLoading(true)
    setError('')
    api.get(`/canvases/${canvasId}/snapshots`)
      .then(res => {
        setSnapshots(res.data || [])
        setLoading(false)
      })
      .catch(() => {
        setError('获取版本列表失败')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchSnapshots()
  }, [canvasId])

  // Focus input when naming appears
  useEffect(() => {
    if (showNaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [showNaming])

  const handleSaveClick = () => {
    const manualCount = snapshots.filter(s => s.created_by).length
    setVersionName(`手动保存版本 ${manualCount + 1}`)
    setShowNaming(true)
  }

  const handleSaveConfirm = async () => {
    if (!onSave || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(versionName.trim() || null)
      setShowNaming(false)
      fetchSnapshots()
    } catch (e) {
      setError('保存版本失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCancel = () => {
    setShowNaming(false)
    setVersionName('')
  }

  const handleSaveKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveConfirm()
    if (e.key === 'Escape') handleSaveCancel()
  }

  const handleRestore = async (snapshotId) => {
    if (restoringId) return
    if (!confirm('确定要恢复到此版本吗？当前未保存的内容将丢失。')) return
    setRestoringId(snapshotId)
    setError('')
    try {
      await onRestore(snapshotId)
      onClose()
    } catch (e) {
      setError('恢复版本失败')
      setRestoringId(null)
    }
  }

  const handleDelete = async (snapshotId) => {
    if (deletingId) return
    if (!confirm('确定要删除此版本吗？此操作不可撤销。')) return
    setDeletingId(snapshotId)
    setError('')
    try {
      if (onDelete) {
        await onDelete(snapshotId)
      } else {
        await api.delete(`/canvases/${canvasId}/snapshots/${snapshotId}`)
      }
      setDeletingId(null)
      fetchSnapshots()
    } catch (e) {
      setError('删除版本失败')
      setDeletingId(null)
    }
  }

  const latestId = snapshots.length > 0 ? snapshots[0].id : null

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">版本历史</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Naming input (shown when saving) */}
        {showNaming && (
          <div className="px-5 pt-3 pb-2 border-b">
            <label className="text-xs text-gray-500 mb-1 block">为当前版本命名：</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={versionName}
                onChange={e => setVersionName(e.target.value)}
                onKeyDown={handleSaveKeyDown}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                maxLength={255}
              />
              <button
                onClick={handleSaveConfirm}
                disabled={saving}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm whitespace-nowrap"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={handleSaveCancel}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Save button (hidden when naming is open or onSave is null) */}
        {onSave && !showNaming && (
          <div className="px-5 pt-3">
            <button
              onClick={handleSaveClick}
              className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
            >
              保存为版本
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded border border-red-200">
            {error}
          </div>
        )}

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">暂无历史版本</div>
          ) : (
            <ul className="space-y-2">
              {snapshots.map(s => {
                const isAuto = !s.created_by
                const isLatest = s.id === latestId
                const isRestoring = restoringId === s.id
                const isDeleting = deletingId === s.id

                return (
                  <li
                    key={s.id}
                    className={`group relative py-2.5 px-3 rounded-lg border transition-colors ${
                      isAuto
                        ? 'border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-50'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: name/time */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">
                          {s.name || formatTime(s.created_at)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          {isAuto ? (
                            <span className="bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">自动保存</span>
                          ) : s.created_by?.username ? (
                            <span>{s.created_by.username}</span>
                          ) : null}
                          <span>{!s.name && isAuto ? '' : formatTime(s.created_at)}</span>
                        </div>
                      </div>

                      {/* Right: current badge / restore button */}
                      <div className="flex items-center gap-2">
                        {isLatest ? (
                          <span className="text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                            {isRestoring ? '恢复中...' : '当前版本'}
                          </span>
                        ) : onRestore ? (
                          <button
                            onClick={() => handleRestore(s.id)}
                            disabled={isRestoring}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {isRestoring ? '恢复中...' : '恢复'}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Delete button (manual saves only, appears on hover) */}
                    {!isAuto && onDelete && (
                      <div className="mt-2 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={isDeleting}
                          className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isDeleting ? '删除中...' : '🗑️ 删除此版本'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run existing frontend tests to check for regressions**

Run: `npx vitest run --reporter=verbose --changed` or `npx jest frontend/src/components/Editor/__tests__/ --no-coverage`
Expected: Existing tests pass (VersionHistory was not previously tested directly)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Editor/VersionHistory.jsx
git commit -m "feat: redesign version history UI with naming, delete, auto/manual distinction"
```

---

### Task 4: EditorPage — type-dispatch save/restore, deleteSnapshot, TencentMind ref

**Files:**
- Modify: `frontend/src/pages/EditorPage.jsx`

- [ ] **Step 1: Add tencentMindRef and type-dispatch logic**

Changes to `EditorPage.jsx`:

Add `tencentMindRef` alongside `excalidrawRef`:
```javascript
const excalidrawRef = useRef(null)
const tencentMindRef = useRef(null)  // NEW
```

Update `saveSnapshot` to accept `name` param and dispatch by type:
```javascript
const saveSnapshot = async (name) => {
  if (!currentCanvas) return
  if (DISABLED_CANVAS_TYPES.has(currentCanvas.type)) return
  setSnapshotSaving(true)
  try {
    let base64
    if (currentCanvas.type === 'excalidraw') {
      base64 = excalidrawRef.current.getSnapshotData()
    } else if (currentCanvas.type === 'tencentmind') {
      base64 = tencentMindRef.current.getSnapshotData()
    } else {
      return
    }
    if (!base64) return
    await api.post(`/canvases/${currentCanvas.id}/snapshot`, { data: base64, name })
  } finally {
    setSnapshotSaving(false)
  }
}
```

Update `restoreSnapshot` to dispatch by type:
```javascript
const restoreSnapshot = async (snapshotId) => {
  if (!currentCanvas) return
  if (DISABLED_CANVAS_TYPES.has(currentCanvas.type)) return
  const res = await api.get(`/canvases/${currentCanvas.id}/snapshots/${snapshotId}`)
  if (currentCanvas.type === 'excalidraw') {
    excalidrawRef.current.loadData(res.data.data)
  } else if (currentCanvas.type === 'tencentmind') {
    tencentMindRef.current.loadData(res.data.data)
  }
}
```

Add `deleteSnapshot`:
```javascript
const deleteSnapshot = async (snapshotId) => {
  if (!currentCanvas) return
  await api.delete(`/canvases/${currentCanvas.id}/snapshots/${snapshotId}`)
}
```

Wire `ref` to TencentMindEditor in the render section. Find the TencentMindEditor render and add `ref={tencentMindRef}`. It's likely rendered like:
```jsx
<TencentMindEditor ... />
```
Change to:
```jsx
<TencentMindEditor ref={tencentMindRef} ... />
```

Update VersionHistory props to pass `onDelete`:
```jsx
<VersionHistory
  canvasId={currentCanvas.id}
  onClose={() => setShowVersionHistory(false)}
  onSave={canEdit ? saveSnapshot : null}
  onRestore={canEdit ? restoreSnapshot : null}
  onDelete={canEdit ? deleteSnapshot : null}   // NEW
/>
```

- [ ] **Step 2: Verify by running frontend tests**

Run: `npx vitest run --reporter=verbose --changed` (or the project's test command)
Expected: No regressions

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/EditorPage.jsx
git commit -m "feat: add type-dispatch version support and TencentMind ref"
```

---

### Task 5: TencentMindEditor — add getSnapshotData / loadData

**Files:**
- Modify: `frontend/src/components/Editor/TencentMindEditor.jsx`

- [ ] **Step 1: Add useImperativeHandle**

Find the `forwardRef` wrapper at line 389. After the main hooks and before the `return` statement, add:

```javascript
useImperativeHandle(ref, () => ({
  getSnapshotData() {
    if (!originDataRef.current) return null
    const json = JSON.stringify(originDataRef.current)
    return btoa(unescape(encodeURIComponent(json)))
  },
  loadData(base64Data) {
    try {
      const jsonStr = decodeURIComponent(escape(atob(base64Data)))
      const data = JSON.parse(jsonStr)
      if (!data || !data.rootTopic) {
        console.error('[TencentMind] Invalid snapshot data: missing rootTopic')
        return
      }
      originDataRef.current = data
      syncToYjs(data)
    } catch (err) {
      console.error('[TencentMind] Failed to load snapshot:', err)
    }
  }
}), [syncToYjs])
```

Place this after the `broadcastCurrentData` function (around line 1385) and before `handleLayoutChange`.

- [ ] **Step 2: Run existing TencentMind tests**

Run: `npx vitest run --reporter=verbose frontend/src/components/Editor/TencentMindEditor.test.jsx` (or jest equivalent)
Expected: Existing tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Editor/TencentMindEditor.jsx
git commit -m "feat: add getSnapshotData and loadData to TencentMindEditor"
```

---

### Task 6: Integration verification

- [ ] **Step 1: Run all backend tests**

```bash
npx jest --no-coverage
```

Expected: All pass

- [ ] **Step 2: Run all frontend tests**

```bash
npx vitest run --reporter=verbose
```

Expected: All pass

- [ ] **Step 3: Manual smoke test checklist**
  - [ ] Open excalidraw canvas → click "版本" → see version history panel
  - [ ] Click "保存为版本" → see naming input with default name → save
  - [ ] Verify saved version appears in list with name
  - [ ] Hover over saved version → see "删除" button at bottom
  - [ ] Click "删除" → confirm → version removed from list
  - [ ] Hover over auto-saved version → no delete button, different styling
  - [ ] Click "恢复" → see "恢复中..." state → canvas reloads
  - [ ] Open TencentMind canvas → "版本" button works → save/restore flow works
