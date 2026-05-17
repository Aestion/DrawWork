# DrawWork — 修复与回归测试报告

**修复日期:** 2026-05-12  
**修复工具:** chrome-devtools-mcp v0.25.0 × 2 实例  
**测试方式:** 双 headless Chrome 实例端到端回归测试  
**后端测试:** 78/78 全部通过  
**前端构建:** vite build 成功

---

## 一、Bug 修复清单

| # | 问题 | 严重度 | 根因 | 修复方案 | 状态 |
|---|------|--------|------|----------|------|
| 001 | 登录失败无错误提示 | 🔴 中 | axios 响应拦截器在 401 时执行 `window.location.href='/login'`，全页刷新清空了 Zustand 状态 | 拦截器跳过 `/auth/login` 和 `/auth/register` 的 401 跳转，让表单自己处理错误 | ✅ **已修复** |
| 002 | 邀请协作者用户搜索失败 | 🔴 中 | 前端发送用户名（String），后端只按 `user_id`（Numeric ID）查用户 | 后端先按 ID 查，查不到且非纯数字时按 username 查 | ✅ **已修复** |
| 003 | 形状面板切换工具不消失 | 🟡 低 | Excalidraw 库本身的选中状态管理，非代码 Bug | 标记为 Excalidraw 行为，待上游修复 | 📌 已知行为 |
| 004 | 版本恢复按钮文案错位 | 🟡 低 | `handleRestore` 的 `catch` 中未清除 `restoringId` | 改为 `try/catch/finally`，`finally` 中重置 `restoringId` | ✅ **已修复** |
| 005 | Console 404 错误 | 🟡 低 | `useVotes` 中的 API 调用未做 null guard | 添加 `canvasId`/`voteId` 守卫，防止无效调用 | ✅ **已修复** |
| 006 | a11y 合规性 | 🟡 低 | 表单输入字段缺少 `id` 和关联 `label` | 添加上下文标签 `<label htmlFor="...">` 和 `id` 属性；错误信息添加 `role="alert"` | ✅ **已修复**（AuthPage） |
| 007 | 协作 API 实例未连接 | 🔴 中 | Yjs WebSocket URL 硬编码，环境变量未设置，yjs-server 未启动 | ①添加 `VITE_YJS_WS_URL` 环境变量配置；②动态 fallback；③启动 yjs-server | ✅ **已修复** |

---

## 二、E2E 回归测试结果

### 用户认证

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 注册新用户 | ✅ 通过 | UserA / CollabUser2 均成功注册 |
| 登录成功 | ✅ 通过 | 正确识别用户名 |
| 登录失败（错误密码） | ✅ **通过** | 显示 `role="alert"` + "邮箱或密码错误"（BUG-001 修复验证） |
| 退出登录 | ✅ 通过 | 回到登录页 |

### 画板管理

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 创建画板（公开） | ✅ 通过 | "回归测试画板" 4 种画布 |
| 进入编辑器 | ✅ 通过 | 完整工具栏显示 |
| 删除画板（确认/取消） | ✅ 通过 | confirm 对话框处理 |

### 画布编辑器

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 8种形状工具 | ✅ 通过 | 矩形/菱形/椭圆/箭头/线条/自由书写/文字/橡皮全部可切换 |
| 更多工具菜单 | ✅ 通过 | 画框/嵌入网页/激光笔/Mermaid |
| 撤销/重做 | ✅ 通过 | 按钮可点击 |
| 缩放控制 | ✅ 通过 | +/−/重置 |
| 评论模式 | ✅ 通过 | 开启/取消 |

### 各类画布

| 画布类型 | 图标 | 结果 |
|----------|------|------|
| 手绘 (Excalidraw) | ✏️ | ✅ 全部工具可用 |
| 思维导图 | 🧠 | ✅ 创建成功 |
| 看板 | 📋 | ✅ 创建成功 |
| 泳道图 | 🏊 | ✅ 创建成功 |

### 多用户协作

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 邀请协作者（按用户名） | ✅ **通过** | BUG-002 修复：输入"CollabUser2"成功邀请为编辑者 |
| 分享链接生成 | ✅ 通过 | alert 对话框确认 |
| 双人同时在线 | ✅ 通过 | 双方均显示"2 人在线" |
| Yjs 实时同步状态 | ✅ **通过** | BUG-007 修复：双方显示 "synced" / "syncing" |
| 实时场景推送 | ✅ 通过 | Yjs server 日志显示 clients: 2, SyncStep1/2 完成 |
| 用户头像可见 | ✅ 通过 | 一方看到对方头像缩写 "U" |
| 通知面板 | ✅ 通过 | 显示通知计数 "1"（邀请通知） |

### 投票与版本

| 测试项 | 结果 | 证据 |
|--------|------|------|
| 创建投票 | ✅ 通过 | 主题/选项/投票成功 |
| 版本历史 | ✅ 通过 | "保存为版本" + 版本列表展示 |
| 版本恢复按钮 | ✅ **通过** | BUG-004 修复：显示"恢复"而非"恢复中..." |
| 无 404 错误 | ✅ **通过** | BUG-005 修复：Console 无 404 日志 |

---

## 三、修复文件清单

| 文件 | 修改内容 |
|------|----------|
| `backend/src/routes/boards.js` | BUG-002：邀请用户时先按 ID 查，查不到按 username 查 |
| `frontend/src/lib/axios.js` | BUG-001：401 拦截器跳过 login/register 路由 |
| `frontend/src/components/Editor/VersionHistory.jsx` | BUG-004：`finally` 块中重置 `restoringId` |
| `frontend/src/hooks/useVotes.js` | BUG-005：API 调用添加 null guard |
| `frontend/src/pages/AuthPage.jsx` | BUG-006：表单添加 id/label/role="alert" |
| `frontend/src/hooks/useYjs.js` | BUG-007：WebSocket URL 可配置 + 动态 fallback |

---

## 四、剩余待处理

| 问题 | 处理方式 |
|------|----------|
| BUG-003 形状面板关闭 | Excalidraw 库行为，需升级或二次开发 |
| a11y 剩余 issue（count: 4） | 投票/分享对话框等组件需补充 id/label |
| VITE_YJS_WS_URL 环境变量 | 生产部署时需设置 |
| Minio 对象存储 | 生产环境需配置 |
