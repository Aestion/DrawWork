# DrawWork 测试用例总目录

> 最后更新: 2026-05-13
> 覆盖范围: Excalidraw + MindMap (Kanban/Swimlane 不在本次范围)

---

## 统计总览

| 层级 | 工具 | 用例数 | 状态 |
|------|------|--------|------|
| Backend | Jest | ~78 | ✅ 已有 (保留原地) |
| Level 1 | Playwright | ~58 | ✅ 已迁移到 test/level1-playwright/ |
| API | pytest | 0/27 | ❌ 目录不存在，需从头实现 |
| Level 2 | PyAutoGUI | ~32 | ⚠️ 大部分 PASS，2 个测试有代码缺陷 |
| Mixed | API+PyAutoGUI | ~3 | ⚠️ 少于预期，缺少 share-permissions |
| **总计** | | **~171** | |

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

### 2.2 其他 Level 1 文件 (不在原始 58 用例中)

| 文件 | 说明 |
|------|------|
| `mindmap/mindmap-collaboration.spec.js` | 思维导图多人协作用例 |
| `tencentmind/tencentmind-collaboration.spec.js` | TencentMind 协作用例 |

### 2.3 MindMap 专项 (3 文件, 29 用例)

| 文件 | 用例数 | 测试场景 |
|------|--------|----------|
| `mindmap.spec.js` | 14 | 加载根节点 / Tab子节点 / Enter兄弟 / Ctrl+Enter多根 / Delete删除 / 双击编辑 / 布局切换 / 多根混合 / 跨树连接 / 帮助对话框 / 导入导出按钮 / 工具栏+中心 / Error 008 / 快速增删 |
| `mindmap-features.spec.js` | 12 | Ctrl+Z 撤销 / Ctrl+Shift+Z 重做 / 搜索过滤高亮 / 搜索导航 / 样式面板改背景色 / 字号 / Ctrl+F 聚焦搜索 / 方向键导航 / 折叠隐藏子节点 / 复制粘贴 / 样式清空按钮 |
| `mindmap-switch.spec.js` | 3 | 切走切回缓存窗口内 / 缓存过期后 / 多次快速切换 |

---

## 三、API 直测 ❌ (未实现)

位置: `test/api/` — **目录不存在，需要创建**

| 文件 | 计划用例 | 覆盖 | 状态 |
|------|----------|------|------|
| `test_auth_api.py` | 3 | 注册成功 / 登录返回 Token / 错误密码拒绝 | ❌ 未实现 |
| `test_boards_api.py` | 3 | 创建含默认画布 / 列表 / 软删除 | ❌ 未实现 |
| `test_canvases_api.py` | 4 | 创建 4 种类型 / 类型校验 / 列表 / 删除 | ❌ 未实现 |
| `test_shares_api.py` | 4 | 邀请编辑者 / 非 owner 拒绝 / 生成分享 Token / 移除协作者 | ❌ 未实现 |
| `test_comments_api.py` | 3 | 创建评论含坐标 / 回复 / 解决 | ❌ 未实现 |
| `test_uploads_api.py` | 2 | 上传文件 / 无 board 拒绝 | ❌ 未实现 |
| `test_votes_api.py` | 4 | 创建投票 / 提交投票 / 关闭投票 / 查看结果 | ❌ 未实现 |

---

## 四、Level 2: PyAutoGUI 真实用户测试

位置: `test/level2-pyautogui/` (15 文件, ~32 用例, 大部分 PASS)

> **已修复基础设施问题：** port_killer 缺失、文件名连字符→下划线、emoji GBK 编码崩溃、Backend NODE_ENV=test 频率限制

> **当前代码缺陷：** `test_text.py` 全屏像素比对无法检测文本元素（0.00%），`test_drag_drop.py` 使用未定义变量 `board_id` 和硬编码 token

### 4.1 公共 (2 用例)

| 文件 | 用例 | 结果 |
|------|------|------|
| `common/test_auth.py` | 2 | ✅ pyautogui 版登录 / 错误密码视觉验证 |

### 4.2 Excalidraw (15 用例)

| 文件 | 用例 | 结果 |
|------|------|------|
| `test_drawing.py` | 3 | ✅ 矩形 / 椭圆 / 箭头+直线 |
| `test_tools.py` | 2 | ✅ 工具快捷键 R/E/A/L / 工具栏点击切换 |
| `test_shortcuts.py` | 2 | ✅ Undo/Redo / Ctrl+C/V 复制粘贴 |
| `test_text.py` | 2 | ❌ 英文/中文输入 (0.00% 像素变化 — 全屏截图无法检测文本) |
| `test_manipulation.py` | 2 | ✅ 选区移动 / 多选移动 |
| `test_drag_drop.py` | 2 | ❌ `test_drag_image_onto_canvas` 使用了未定义变量 `board_id` 和硬编码 token |
| `test_undo_redo.py` | 2 | ✅ Ctrl+Z 10 步撤销 / Ctrl+Shift+Z 重做恢复 |

### 4.3 MindMap (15 用例)

| 文件 | 用例 | 结果 |
|------|------|------|
| `test_nodes.py` | 4 | ⚠️ 大部分 PASS，依赖像素比对 |
| `test_keyboard.py` | 3 | ⚠️ 大部分 PASS，依赖像素比对 |
| `test_collapse.py` | 2 | ⚠️ 大部分 PASS |
| `test_search.py` | 2 | ✅ Ctrl+F 搜索高亮 / 清空恢复 |
| `test_styles.py` | 2 | ⚠️ 依赖像素比对 |
| `test_cross_tree.py` | 2 | ⚠️ 依赖像素比对 |
| `test_copy_paste.py` | 2 | ⚠️ 依赖像素比对 |

> 注意：多个 MindMap 测试使用全屏像素比对来检测变化，在测试环境中可能产生假失败。建议后续改为 canvas 区域截图。

---

## 五、Mixed ⚠️

位置: `test/mixed/` (3 文件, 6 用例)

| 文件 | 用例 | 覆盖 | 状态 |
|------|------|------|------|
| `test_collaboration.py` | 1 | UserA 画图→UserB 窗口 | ❌ 截图即断言，未验证实际同步内容 |
| `test_offline_reconnect.py` | 2 | 画布正常可操作 / 快速绘制不崩溃 | ❌ 无真正 CDP 断网模拟 / 无恢复同步验证 |
| `test_share_permissions.py` | 3 | viewer不能编辑 / editor可编辑 / 无效token拒绝 | ✅ 已实现 |

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

| 场景 | 现状 | 行动 |
|------|------|------|
| **API 直测** | `test/api/` 目录不存在 | 需要创建 27 个用例（auth/boards/canvases/shares/comments/uploads/votes） |
| **分享权限视觉验证** | 已有文件但 viewer/editor 用 share token 而非 direct share | 像素比对法可能不可靠，考虑改用 Playwright |
| **断网重连** | 有文件但仅验证"不崩溃"，无真正 CDP 断网 | 需要补充 CDP 模拟和同步恢复验证 |
| **双人协同验证** | 有文件但缺乏有效断言（仅截图存在断言） | 补充元素检测断言 |
| **Excalidraw 文字输入** | Level 2 测试存在但像素比对法无效 | ✅ 本文已修复，改用 canvas 区域截图 |
| **拖放上传** | 测试代码有缺陷（未定义变量） | ✅ 本文已修复 |
| **Level 2 公共测试** | `test_navigation.py` 未创建 | 需要实现 Dashboard→Editor 和 Canvas 切换测试 |
| **视觉回归基线** | 功能完整但基线截图未创建 | 需运行一次 `ScreenshotDiff.update_baseline()` |
| **性能基线** | 旧脚本已废弃 | 暂不纳入 |
| **移动端视口** | ❌ 无 | 暂不纳入 |
| **ARIA 无障碍** | ❌ 无 | 暂不纳入 |

---

## 2026-05-22 分享协同测试补充

- `backend/src/__tests__/shareValidate.test.js` 从 3 个用例扩展到 5 个用例，新增：
  - 匿名分享链接预览不消耗 `max_uses`。
  - 登录用户首次通过 token 获得访问权时创建 `BoardShare(source=token)`，并且 `used_count` 精确增加到 1。
- `test/level1-playwright/specs/share-link.spec.js` 从 1 个用例扩展到 2 个用例，新增：
  - 分享链接 `max_uses=1` 时，匿名预览不计数，首个登录用户可加入，第二个登录用户被 400 拒绝。
- 推荐验收命令：
  - `cd backend && npm test -- --runTestsByPath src/__tests__/shares.test.js src/__tests__/shareValidate.test.js src/__tests__/notifications.test.js src/__tests__/boards.test.js src/__tests__/snapshots.test.js`
  - `cd test/level1-playwright && npx playwright test specs/share-link.spec.js --config playwright.config.js`
## 2026-05-23 分享协同补充

- 四类画布验收组合：
  - 手绘：`level1-playwright/specs/collaboration.spec.js` 覆盖增加、删除同步。
  - 腾讯思维：`level1-playwright/specs/tencentmind/tencentmind-collaboration.spec.js` 覆盖实时新增同步。
  - 看板/泳道图：`level1-playwright/specs/structured-canvas-collaboration.spec.js` 覆盖分享进入、在线人数、增加、删除、跨用户编辑同步。
- 单元层新增/整理：`frontend/src/hooks/useKanbanYjs.test.js`、`frontend/src/hooks/useSwimlaneYjs.test.js`。
- 并发处理关注点：看板和泳道图使用 per-item Yjs key；删除改为显式 tombstone，避免多人同时新增时把“本地尚未收到的远端元素”误删。
