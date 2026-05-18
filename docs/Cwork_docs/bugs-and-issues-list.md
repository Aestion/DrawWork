# DrawWork 项目 Bugs 和问题清单

**检查日期：2026-05-18**

---

## 🔴 高优先级问题（建议修复）

### 1. 冗余备份文件

**文件列表：**
- `backend/src/routes/admin.js.bak` (3.5 KB)
- `backend/src/utils/jwt.js.bak` (3.8 KB)

**问题描述：**
- `.bak` 备份文件不应提交到代码库
- 可能会造成混淆，不知道哪个是当前正确版本

**建议修复：**
```bash
rm backend/src/routes/admin.js.bak
rm backend/src/utils/jwt.js.bak
```

**风险：** ⚠️ 低 - 删除前先检查是否真的不需要

---

### 2. 临时/调试脚本在版本库中

**文件列表：**
- `backend/create_user.js` (1.5 KB)
- `backend/reset_321_password.js` (1.3 KB)
- `backend/check_321_access.js` (1.6 KB)
- `backend/share_board_to_321.js` (1.5 KB)
- `backend/init-user.js` (1.7 KB)
- `scripts/init-user.js` (1.7 KB)

**问题描述：**
- 这些是针对特定用户的一次性调试脚本
- 包含硬编码的测试用户邮箱（123@qq.com, 321@qq.com）
- 包含硬编码的测试密码（123456）
- 不应该在正式代码库中

**建议修复：**
- 删除或移动到 `.gitignore` 的位置
- 或创建 `scripts/dev/` 目录并添加到 `.gitignore`

**风险：** ⚠️ 低 - 不影响生产

---

### 3. 巨大的冗余文件

**文件：**
- `excalidraw_source_copy.js` (9.37 MB)

**问题描述：**
- 9.37 MB 的单个文件，体积巨大
- 看起来是 `@excalidraw/excalidraw` 库的源代码副本
- 项目已经通过 npm 依赖了该库，此文件完全冗余
- 拉取/推送代码会非常慢

**建议修复：**
```bash
rm excalidraw_source_copy.js
# 在 .gitignore 中添加类似的大文件规则
```

**风险：** ⚠️ 低 - 确认不使用即可安全删除

---

### 4. .env 配置问题

**问题：**
- 项目根目录和 `config/` 目录都有 `.env` 文件
- `config/.env` 内容可能未同步

**当前配置位置：**
- `/.env` (实际使用)
- `/config/.env` (副本)

**建议修复：**
- 保留根目录的 `.env`
- 可以将 `config/.env.example` 作为模板
- 删除或忽略 `config/.env`

---

## 🟡 中优先级问题（建议优化）

### 5. 未使用的导入

#### 前端组件

**文件：`frontend/src/components/Editor/KanbanEditor.jsx:1`**
```jsx
// 现在：
import { useEffect, useState, useCallback, useRef, memo } from 'react'
// 实际上只使用了：useEffect, useState, useRef
// useCallback 和 memo 未使用

// 建议改为：
import { useEffect, useState, useRef } from 'react'
```

**文件：`frontend/src/components/Editor/SwimlaneEditor.jsx:1`**
```jsx
// 现在：
import { useEffect, useState, useCallback, useRef, memo } from 'react'
// 实际上只使用了：useEffect, useState, useRef
// useCallback 和 memo 未使用

// 建议改为：
import { useEffect, useState, useRef } from 'react'
```

**文件：`frontend/src/components/Editor/CommentPin.jsx:1`**
```jsx
// 这个是正常的，useRef 实际上在第6行有使用
import { useState, useRef } from 'react'  // ✓ 正常
```

---

### 6. 硬编码的默认值

**文件：`backend/src/config/minio.js`**
```js
// 当前：
const minioClient = new Minio.Client({
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',  // 硬编码
})

// 建议：
const minioClient = new Minio.Client({
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY,  // 移除硬编码默认值
})
// 如未配置，让它直接报错而不是使用不安全的默认值
```

---

### 7. 可能的测试文件残留

**文件：**
- `frontend/test-dblclick.png` (29 KB)
- `frontend/test-debug.png` (0.5 KB)
- `test/level1-playwright/fixtures/test-video.mp4` (4.7 MB)

**问题：**
- 这些看起来是开发/测试时的临时文件
- `test-dblclick.png` 和 `test-debug.png` 在 frontend 根目录下不合适

**建议：**
- 移到 `test/` 或 `docs/` 目录
- 或确认不需要后删除

---

### 8. 重复的 init-user.js

**文件：**
- `backend/init-user.js`
- `scripts/init-user.js`

**问题：**
- 两个文件内容几乎相同
- 只有一份即可

**建议：**
- 保留 `scripts/init-user.js`
- 删除 `backend/init-user.js`

---

### 9. console.log 在生产环境

**文件：`yjs-server/src/server.js`**
```js
// 建议：
// 引入 winston 或 pino 日志库
// 替换 console.log 为 logger.info 等
```

---

## 🟢 低优先级问题（可选修复）

### 10. 组件参数顺序不一致

**问题：**
```jsx
// MindMapEditor 和 SwimlaneEditor：
MindMapEditor({ canvasId, roomId, ... })
SwimlaneEditor({ canvasId, roomId, ... })

// KanbanEditor：
KanbanEditor({ canvasId, roomId, ... })
// 顺序是对的，但建议写一个 types.d.ts 或文档说明
```

---

### 11. 未完成的 TODO

**文件：`frontend/src/components/Editor/KanbanEditor.jsx`**
```jsx
// TODO: Implement drag indicators
// 这个 TODO 可以补充完整，或标记为 Won't Fix
```

---

### 12. package.json 依赖优化

**backend/package.json：**
```json
{
  // "y-leveldb" 未使用
  // "ioredis" 只有在配置了 REDIS_URL 时才使用（可选）
}
```

---

## 📊 影响评估

| 类别 | 数量 | 对项目的影响 |
|------|------|-------------|
| 🔴 高优先级 | 4 项 | 影响仓库体积和维护 |
| 🟡 中优先级 | 5 项 | 优化代码质量 |
| 🟢 低优先级 | 3 项 | 可选改进 |

---

## 🛠️ 修复建议顺序

**第一轮（安全删除）：**
1. 删除备份文件 (.bak)
2. 删除临时调试脚本（create_user.js, reset_321_password.js 等）
3. 删除大文件（excalidraw_source_copy.js）
4. 清理重复的 init-user.js

**第二轮（代码优化）：**
5. 清理未使用的导入
6. 更新 .gitignore
7. 处理硬编码默认值

**第三轮（可选优化）：**
8. 添加日志库
9. 优化依赖
10. 统一组件接口

---

## ⚠️ 注意事项

在修复之前：
- [ ] 先确认 `excalidraw_source_copy.js` 确实不需要
- [ ] 检查是否还有其他地方引用了临时脚本
- [ ] 备份本地开发环境（至少先提交当前状态）
- [ ] 删除前先确认 git 没有未提交的重要工作

---

*报告生成：2026-05-18*
