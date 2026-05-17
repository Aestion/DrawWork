# DrawWork 修复总览

## 已完成的修复 ✅

### 安全修复 (8个问题)
1. ✅ Yjs WebSocket 认证 - `yjs-server/index.js`
2. ✅ 文件上传 MIME 白名单 + 魔数检查 - `backend/src/routes/uploads.js`
3. ✅ Rate Limiting - `backend/src/app.js`
4. ✅ 错误处理脱敏 - `backend/src/app.js`
5. ✅ CORS 白名单 - `backend/src/app.js`
6. ✅ bcrypt 迭代 12→13 - `backend/src/routes/auth.js`
7. ✅ JWT Secret 强制验证 - `backend/src/utils/jwt.js`
8. ✅ SQL Like 转义 - `backend/src/routes/admin.js`

### 测试
- 后端单元测试: 78/78 通过 ✅

---

## 待修复问题 🔧

### 问题 1: 投票功能 400 错误
**文件**: `backend/src/routes/votes.js`
**修复**:
```javascript
// 第 1-7 行，添加 getJwtSecret 导入
const { Vote, VoteRecord, Canvas } = require('../models')
const { getJwtSecret } = require('../utils/jwt')  // 添加这行

// 第 56-57 行，替换匿名 session 生成
const anonymousSessionId = vote.is_anonymous
  ? crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${getJwtSecret()}`).digest('hex')
  : null
```

---

### 问题 2: 思维导图连接线未隐藏
**文件**: `frontend/src/components/Editor/MindMapEditor.jsx`
**症状**: 折叠节点时，子节点隐藏但连接线仍显示
**修复**: 在 edges 渲染时添加 hiddenEdgeIds 检查
```javascript
// 找到 edges 渲染逻辑，添加过滤
const visibleEdges = edges.filter(e => 
  !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)
)
```

---

### 问题 3: 评论弹窗位置
**文件**: `frontend/src/components/Editor/CommentPanel.jsx`
**需求**: 弹窗应在鼠标点击位置弹出，而非固定左上角

---

### 问题 4: 评论气泡拖动
**文件**: `frontend/src/components/Editor/CommentPin.jsx`
**需求**: 气泡应可拖动，且位置需要协作同步

---

### 问题 5: 评论删除功能
**文件**: 
- 后端: `backend/src/routes/comments.js` (添加删除接口)
- 前端: `frontend/src/components/Editor/CommentPanel.jsx` (添加删除按钮)

---

### 问题 6: Excalidraw 工具图标闪烁
**文件**: `frontend/src/components/Editor/ExcalidrawWrapper.jsx`
**症状**: 选中工具时图标一直闪烁
**可能原因**: CSS 动画或 React 重复渲染

---

## 环境配置提醒 ⚠️

新的 `.env` 要求：
```bash
# JWT_SECRET 必须 >= 32 字符
JWT_SECRET=drawwork-secret-key-for-jwt-token-generation

# CORS 配置（添加你的前端地址）
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

*修复完成时间: 2026-05-13*
