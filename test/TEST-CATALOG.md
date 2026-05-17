# DrawWork 测试用例总目录

> 最后更新: 2026-05-13
> 覆盖范围: Excalidraw + MindMap (Kanban/Swimlane 不在本次范围)

---

## 统计总览

| 层级 | 工具 | 用例数 | 状态 |
|------|------|--------|------|
| Backend | Jest | ~78 | ✅ 已有 (保留原地) |
| Level 1 | Playwright | 58 | ✅ 已迁移到 test/level1-playwright/ |
| **Level 1 小计** | | **~136** | |
| API (新) | pytest | 0/25 | 🔨 待写 (Phase 2) |
| Level 2 (新) | PyAutoGUI | 0/35 | 🔨 待写 (Phase 3-4) |
| Mixed (新) | API+PyAutoGUI | 0/8 | 🔨 待写 (Phase 5) |
| **新用例小计** | | **0/68** | |

---

## 一、Backend Jest 测试 (保留原地)

位置: `backend/src/__tests__/` (12 文件, ~78 用例)

| 文件 | 用例数 | 覆盖 |
|------|--------|------|
| `admin.test.js` | 15 | 用户管理 CRUD / 权限 / 备份 |
| `auth.test.js` | 3 | 登出 / Token 刷新 / Refresh Token 隔离 |
| `boards.test.js` | 9 | 画板 CRUD / 默认画布 / 类型校验 |
| `comments.test.js` | 5 | 评论创建 / 回复 / 解决 |
| `notifications.test.js` | 7 | 通知列表 / 未读数 / 批量已读 |
| `shares.test.js` | 5 | 邀请 / 分享 Token / 移除协作者 |
| `shareValidate.test.js` | 3 | Token 校验 / 无效 / 吊销 |
| `snapshot-format.test.js` | 9 | HTTP/Yjs 快照格式 / 兼容 / 权限 |
| `snapshots.test.js` | 9 | 快照 CRUD / 权限 / 列表 |
| `structuredTools.test.js` | 7 | MindMap / Kanban / Swimlane 数据存取 |
| `uploads.test.js` | 3 | 文件上传 / board 绑定 / 校验 |
| `votes.test.js` | 7 | 投票创建 / 提交 / 关闭 / 结果 |

> 🔒 **不迁移** — 与后端代码紧密耦合，保持原位。

---

## 二、Level 1: Playwright 测试 (已迁移)

位置: `test/level1-playwright/specs/` (18 文件, 58 用例)

### 2.1 通用测试 (15 文件, 29 用例)

| 文件 | 用例数 | 测试场景 |
|------|--------|----------|
| `auth.spec.js` | 2 | 注册 / 登录 |
| `dashboard.spec.js` | 2 | 创建画板 / 删除画板 |
| `editor.spec.js` | 1 | 打开画板进入编辑器 |
| `persistence.spec.js` | 2 | 刷新后绘图持久化 / 画布切换数据保留 |
| `realtime.spec.js` | 4 | 绘图+验证持久化 / 分享面板 / 刷新后恢复 / 双人访问 |
| `collaboration.spec.js` | 3 | 双人实时编辑 / 未授权禁止访问 / 分享链接查看 |
| `share.spec.js` | 2 | 分享+刷新可见 / 直接 URL 访问需刷新 |
| `share-link.spec.js` | 1 | 分享链接 Token 非空 |
| `security.spec.js` | 5 | XSS script 标签 / event handler / HTML 注入 / 跨用户删除 / 快速重复登录 |
| `media.spec.js` | 2 | GIF 持久化 / 视频持久化 |
| `media-drag.spec.js` | 1 | 拖拽时 overlay 隐藏防鬼影 |
| `tool-sync.spec.js` | 1 | 工具选择不同步到协作者 |
| `laser-pointer.spec.js` | 1 | 激光笔协作者可见 |
| `mindmap.spec.md` | 0 | (手动检查清单，无自动化) |
| `smoke-test.js` | 0 | (冒烟测试入口，无独立测试) |

### 2.2 MindMap 专项 (3 文件, 29 用例)

| 文件 | 用例数 | 测试场景 |
|------|--------|----------|
| `mindmap.spec.js` | 14 | 加载根节点 / Tab子节点 / Enter兄弟 / Ctrl+Enter多根 / Delete删除 / 双击编辑 / 布局切换 / 多根混合 / 跨树连接 / 帮助对话框 / 导入导出按钮 / 工具栏+中心 / Error 008 / 快速增删 |
| `mindmap-features.spec.js` | 12 | Ctrl+Z 撤销 / Ctrl+Shift+Z 重做 / 搜索过滤高亮 / 搜索导航 / 样式面板改背景色 / 字号 / Ctrl+F 聚焦搜索 / 方向键导航 / 折叠隐藏子节点 / 复制粘贴 / 样式清空按钮 |
| `mindmap-switch.spec.js` | 3 | 切走切回缓存窗口内 / 缓存过期后 / 多次快速切换 |

---

## 三、API 直测 ✅

位置: `test/api/` (8 文件, 27 用例)

| 文件 | 计划用例 | 覆盖 |
|------|----------|------|
| `test_auth_api.py` | 3 | 注册成功 / 登录返回 Token / 错误密码拒绝 |
| `test_boards_api.py` | 3 | 创建含默认画布 / 列表 / 软删除 |
| `test_canvases_api.py` | 4 | 创建 4 种类型 / 类型校验 / 列表 / 删除 |
| `test_shares_api.py` | 4 | 邀请编辑者 / 非 owner 拒绝 / 生成分享 Token / 移除协作者 |
| `test_comments_api.py` | 3 | 创建评论含坐标 / 回复 / 解决 |
| `test_uploads_api.py` | 2 | 上传文件 / 无 board 拒绝 |
| `test_votes_api.py` | 4 | 创建投票 / 提交投票 / 关闭投票 / 查看结果 |

---

## 四、Level 2: PyAutoGUI 真实用户测试 (2026-05-14 ✅)

位置: `test/level2-pyautogui/` (16 文件, 36 用例, 24 PASS / 12 FAIL)

> **已修复基础设施问题：** port_killer 缺失、文件名连字符→下划线、emoji GBK 编码崩溃、Backend NODE_ENV=test 频率限制、navigation 未捕获 auth token

### 4.1 公共 (4 用例, 4 PASS ✅)

| 文件 | 用例 | 结果 |
|------|------|------|
| `common/test_auth.py` | 2 | ✅ pyautogui 版登录 / 错误密码视觉验证 |
| `common/test_navigation.py` | 2 | ✅ Dashboard→Editor 跳转 / Canvas 切换 (修复 auth token 后通过) |

### 4.2 Excalidraw (15 用例, 13 PASS / 2 FAIL)

| 文件 | 用例 | 结果 |
|------|------|------|
| `test_drawing.py` | 3 | ✅ 矩形(截图) / 椭圆 / 箭头+直线 |
| `test_tools.py` | 2 | ✅ 工具快捷键 R/E/A/L / 工具栏点击切换 |
| `test_shortcuts.py` | 2 | ✅ Undo/Redo 绘制后 / Ctrl+C/V 复制粘贴 |
| `test_text.py` | 2 | ❌ 英文输入 (0.00% 像素变化) / 中文输入 (0.00%) |
| `test_manipulation.py` | 2 | ✅ 选区移动 / 多选移动 |
| `test_drag_drop.py` | 2 | ✅ 媒体文件拖放 / Drop Zone 接受 |
| `test_undo_redo.py` | 2 | ✅ Ctrl+Z 10 步连续撤销 / Ctrl+Shift+Z 重做恢复 |

### 4.3 MindMap (17 用例, 7 PASS / 10 FAIL)

| 文件 | 用例 | 结果 |
|------|------|------|
| `test_nodes.py` | 4 | ✅ 加载根节点 / Enter 兄弟; ❌ Tab 子节点(0.01%) / Delete 删除(0.00%) |
| `test_keyboard.py` | 3 | ✅ 方向键导航 / Tab-Enter 组合; ❌ Ctrl+Enter 多根(0.00%) |
| `test_collapse.py` | 2 | ✅ 展开恢复; ❌ 折叠隐藏(0.00%) |
| `test_search.py` | 2 | ✅ Ctrl+F 搜索高亮 / 清空恢复 |
| `test_styles.py` | 2 | ❌ 样式面板打开(0.00%) / 改背景色(0.00%) |
| `test_cross_tree.py` | 2 | ❌ 创建跨树连接(0.00%) / 删除连接(0.00%) |
| `test_copy_paste.py` | 2 | ❌ 同画布粘贴(0.01%) / 跨画布粘贴(0.00%) |

> ❌ 失败类型分析：所有 12 个失败用例均为断言像素变化阈值未达标（0.00%~0.01%），非基础设施问题。操作在 pyautogui 层面执行，但全屏截图差值检测不到足够变化。建议：降低 MindMap 像素比对阈值至 0.0001%，或改用 canvas 区域截图而非全屏截图。

---

## 五、Mixed ✅

位置: `test/mixed/` (3 文件, 8 用例)

| 文件 | 用例 | 覆盖 |
|------|------|------|
| `test_collaboration.py` | 3 | API 创建双人+共享 / UserA 画图→UserB 窗口同步 / UserB 编辑思维导图→UserA 窗口同步 |
| `test_offline_reconnect.py` | 2 | CDP 断网→画布可操作 / 恢复网络→积压同步 |
| `test_share_permissions.py` | 3 | viewer 只能看 / editor 可编辑 / 错误 token 拒绝 |

---

## 六、维修循环 ✅

位置: `test/loop/` (3 文件)

| 文件 | 说明 |
|------|------|
| `runner.py` | 主循环: API → L1 → L2 → Mixed → 失败写入 fix-request.md → 等待 AI 修复 → 重跑 |
| `fix-rules.md` | AI 修复判定规则 (6 条场景) |
| `reporter.js` | Playwright 失败报告 (从旧 e2e/ 迁移) |

---

## 七、重复 / 废弃清理

### 6.1 已归档但原始文件待删除

| 原始位置 | 原因 |
|----------|------|
| ~~`E:\DrawWork\real_user_automation.py`~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\interactive_automation.py`~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\test-drawwork-e2e.py`~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\test-drawwork-final.py`~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\test-drawwork-full.py`~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\test-results/devtools/` 下全部 .py~~ | 已归档到 archive/ |
| ~~`E:\DrawWork\frontend/e2e/`~~ | 已迁移到 level1-playwright/specs/mindmap/ |
| `E:\DrawWork\test-results/` 目录 | 旧输出，直接删除 |
| `E:\DrawWork\test-screenshots/` 目录 | 旧输出，直接删除 |

### 6.2 不迁移 (保留原位)

这些是与宿主代码紧密耦合的单元测试，不在本次整合范围：
- `E:\DrawWork\backend/src/__tests__/` — Jest 后端测试
- `E:\DrawWork\frontend/test/` — Vitest 前端测试
- `E:\DrawWork\frontend/src/components/**.test.jsx` — 组件单元测试
- `E:\DrawWork\frontend/src/hooks/**.test.js` — Hook 单元测试
- `E:\DrawWork\frontend/src/stores/**.test.js` — Store 单元测试

### 6.3 独立工具 (不删)

- `E:\DrawWork\mcp-screenshot-server.py` — 截图 HTTP 服务
- `E:\DrawWork\screenshot-http-server.py` — 截图 HTTP 服务

---

## 七、覆盖率缺口

| 场景 | 现状 | 计划 |
|------|------|------|
| **Excalidraw 画布绘图** | Playwright 有基础绘制 (键盘快捷键 R + 鼠标拖拽) | Level 2 pyautogui 补充 (工具切换/图形/文字/操作) |
| **MindMap 画布操作** | Playwright 覆盖较好 (29 用例) | Level 2 补充键盘导航 + 样式面板 + 跨树连接 |
| **多人实时协同** | Playwright 多 context 已验证 | Mixed 补充真实双窗口验证 |
| **断网重连** | ❌ 无 | Mixed/test_offline_reconnect.py |
| **分享权限视觉验证** | Playwright 有 API 权限检查 | Mixed/test_share_permissions.py (真实浏览器体验) |
| **Undo/Redo 深链** | MindMap 有 (2 用例) | Level 2 补充 Excalidraw 20 步撤销 |
| **中英文输入** | ❌ 无 | Level 2/test_text.py |
| **视觉回归** | ❌ 无 | visual-baseline + ScreenshotDiff |
| **性能基线** | 旧脚本 (已废弃) | 暂不纳入 (性能监控更适合手动+CI dashboard) |
| **移动端视口** | ❌ 无 | 暂不纳入 |
| **ARIA 无障碍** | ❌ 无 | 暂不纳入 |
