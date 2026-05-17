# DrawWork 真实用户模拟测试框架设计

> 设计日期: 2026-05-13
> 目标: 用 OS 级真实用户模拟 (pyautogui) 全面测试 DrawWork，搭配 AI 维修循环，覆盖 Excalidraw + MindMap 两大编辑器

---

## 1. 现状审计

### 1.1 当前测试资产分布（分散在 9 个位置）

| 路径 | 类型 | 状态 |
|------|------|------|
| `backend/__tests__/` | Jest 后端单元测试 (10 个 spec) | ✅ 保留原地 |
| `e2e/tests/` | Playwright E2E (16 个文件) | ⏩ 迁移到新目录 |
| `e2e/loop/` | AI 维修循环 (runner + reporter) | ⏩ 迁移到新目录 |
| `frontend/e2e/` | Playwright 思维导图专项 (3 个 spec) | ⏩ 迁移到新目录 |
| `frontend/test/` | Vitest 前端单元测试 | ✅ 保留原地 |
| `docs/testing/` | 手动测试计划文档 (44 个 case) | ⏩ 归档 |
| `docs/test-plan-mindmap.md` | MindMap 专项测试点 (60+ 项) | ⏩ 归档作为测试参考 |
| 根目录 7 个松散 .py 文件 | 各种测试脚本 + 工具 | 见 1.2 |
| `test-results/devtools/` 下 7 个 .py | Playwright + API 混合脚本 | ⏩ 废弃 |

### 1.2 根目录 .py 文件处理

| 文件 | 说明 | 处置 |
|------|------|------|
| `real_user_automation.py` | pyautogui 线性脚本 (硬编码坐标) | → `test/archive/` |
| `interactive_automation.py` | pyautogui 交互式 (有骨架无内容) | → `test/archive/` |
| `test-drawwork-e2e.py` | Playwright 早期版本 | → `test/archive/` |
| `test-drawwork-final.py` | Playwright 最终版 | → `test/archive/` |
| `test-drawwork-full.py` | Playwright 完整版 | → `test/archive/` |
| `mcp-screenshot-server.py` | 截图 HTTP 服务器 | ✅ 保留原位 (独立工具) |
| `screenshot-http-server.py` | 截图 HTTP 服务器 | ✅ 保留原位 (独立工具) |

废弃: 5 个；保留: 2 个。

### 1.3 `test-results/devtools/` 下 .py 文件处理

| 文件 | 说明 | 处置 |
|------|------|------|
| `devtools/comprehensive-test-suite.py` | Playwright + API 混合 | → `test/archive/` |
| `devtools/journey2-collaboration-test.py` | 协作专项 | → `test/archive/` |
| `devtools/journey3-share-permissions-test.py` | 权限专项 | → `test/archive/` |
| `devtools/phase1/tc001_homepage_test.py` | 首页专项 | → `test/archive/` |
| `devtools/phase1/tc004_login_test.py` | 登录专项 | → `test/archive/` |
| `devtools/phase1/tc_full_flow_test.py` | 全流程 v1 | → `test/archive/` |
| `devtools/phase1/tc_full_flow_test2.py` | 全流程 v2 | → `test/archive/` |

废弃: 7 个。该目录本身一并删除。

### 1.4 废弃的输出目录

| 目录 | 处理方式 |
|------|----------|
| `e2e/results/` | Playwright 输出；完成迁移后整体删除 |
| `test-results/` | 旧测试输出；完成迁移后整体删除 |
| `test-screenshots/` | 旧手动截图；完成迁移后整体删除 |
| `frontend/e2e/` | 前端 Playwright 副目录；迁移后整体删除 |

---

## 2. 新目录结构

### 2.1 整体布局

```
E:\DrawWork\test/
├── README.md                             # 测试架构总览 + 快速开始
├── requirements.txt                      # Python 依赖
│
├── config/
│   ├── settings.yaml                     # 全局配置 (端口、超时、账号)
│   └── test-accounts.md                  # 测试账号表 (真实账号 + 自动生成规则)
│
├── service-manager/
│   ├── __init__.py
│   ├── manager.py                        # 启动/停止/健康检查 前后端+Yjs
│   └── port-killer.py                    # 清理端口占用
│
├── shared/
│   ├── __init__.py
│   ├── coord-manager.py                  # 窗口定位 + 相对坐标计算
│   ├── screenshot-diff.py                # 截图对比 (像素级 diff)
│   └── report.py                         # 统一报告格式 (JSON + HTML)
│
├── api/                                  # === 后端 API 直测 ===
│   ├── conftest.py                       # pytest fixtures (service manager, db reset)
│   ├── test_auth_api.py                  # 注册/登录/登出/Token 刷新
│   ├── test_boards_api.py                # 画板 CRUD
│   ├── test_canvases_api.py              # 画布 CRUD + 类型切换
│   ├── test_shares_api.py               # 分享/邀请/权限
│   ├── test_comments_api.py              # 评论/回复
│   └── test_uploads_api.py              # 文件上传
│
├── level1-playwright/                    # === Level 1: Playwright ===
│   ├── package.json                      # @playwright/test 依赖
│   ├── playwright.config.js              # Playwright 配置 (迁移自 e2e/)
│   ├── specs/                            # 所有 Layer 1 测试
│   │   ├── auth.spec.js                  # 注册/登录/登出
│   │   ├── dashboard.spec.js             # 画板 CRUD
│   │   ├── editor.spec.js                # 编辑器加载 + 画布切换
│   │   ├── persistence.spec.js           # 数据持久化 (刷新后恢复)
│   │   ├── realtime.spec.js              # 实时同步 (Yjs 状态验证)
│   │   ├── collaboration.spec.js         # 协作 (多 browser context)
│   │   ├── share.spec.js                 # 分享 (真实账号)
│   │   ├── share-link.spec.js            # 分享链接 (匿名访问)
│   │   ├── security.spec.js              # XSS/注入/权限
│   │   ├── media.spec.js                 # 媒体上传/持久化
│   │   ├── media-drag.spec.js            # 媒体拖拽到画布
│   │   ├── tool-sync.spec.js             # 工具切换同步
│   │   ├── laser-pointer.spec.js         # 激光笔
│   │   ├── smoke-test.js                 # 冒烟测试 (关键路径快速验证)
│   │   ├── mindmap.spec.md               # MindMap 手动测试检查清单
│   │   └── mindmap/                      # 思维导图专项 (从 frontend/e2e 迁移)
│   │       ├── mindmap.spec.js
│   │       ├── mindmap-features.spec.js
│   │       ├── mindmap-switch.spec.js
│   │       └── helpers.js
│   └── utils/
│       └── helpers.js                    # 账号/API 辅助 (从 e2e/tests 迁移)
│
├── level2-pyautogui/                     # === Level 2: 真实用户模拟 ===
│   ├── __init__.py
│   ├── conftest.py                       # pytest fixtures (CoordManager, ServiceManager)
│   │
│   ├── common/                           # 公共流程
│   │   ├── test_auth.py                  # 登录/注册 (pyautogui 版)
│   │   └── test_navigation.py            # 页面导航 (Dashboard→Editor→Canvas切换)
│   │
│   ├── excalidraw/                       # Excalidraw 画布测试
│   │   ├── test_drawing.py               # 图形绘制 (矩形/椭圆/箭头/线)
│   │   ├── test_tools.py                 # 工具切换 + 选择
│   │   ├── test_shortcuts.py             # 快捷键 (Ctrl+Z/R/V/C)
│   │   ├── test_text.py                  # 文字工具 (输入/编辑/中英文)
│   │   ├── test_manipulation.py          # 移动/缩放/旋转/多选
│   │   ├── test_drag_drop.py             # 拖拽到画布
│   │   └── test_undo_redo.py             # Undo/Redo 多次操作 + 深度验证
│   │
│   └── mindmap/                          # 思维导图画布测试
│       ├── test_nodes.py                 # 节点创建/编辑/删除
│       ├── test_keyboard.py              # 键盘导航 (Tab/Enter/Arrow/Delete)
│       ├── test_collapse.py              # 折叠/展开 (点击 + 子节点验证)
│       ├── test_search.py                # Ctrl+F 搜索 + 结果导航
│       ├── test_styles.py                # 样式 (颜色/字体/边框/字号)
│       ├── test_cross_tree.py            # 跨树连接 (Shift+Click)
│       └── test_copy_paste.py            # 复制/粘贴 (同画布+跨画布)
│
├── mixed/                                # === 混合模式: API 准备 + pyautogui 验证 ===
│   ├── test_collaboration.py             # 两个真实 Chrome 窗口协同编辑验证
│   ├── test_offline_reconnect.py         # DevTools CDP 断网 → 恢复 → 数据完整性
│   └── test_share_permissions.py         # API 设置权限 → 浏览器体验不同角色
│
├── visual-baseline/                      # === 视觉回归基线 ===
│   └── baselines/                        # 黄金截图
│       ├── excalidraw_empty.png
│       ├── excalidraw_rectangle.png
│       ├── excalidraw_arrow.png
│       ├── mindmap_empty.png
│       └── mindmap_nodes.png
│
├── loop/                                 # === AI 维修循环 ===
│   ├── __init__.py
│   ├── runner.py                         # 主循环控制器
│   ├── reporter.py                       # 失败报告生成器 (HTML + markdown)
│   └── fix-rules.md                      # AI 修复判定规则 (给 OpenClaw 驱动)
│
├── results/                              # 测试输出 (gitignored)
│   ├── screenshots/                      # 失败时自动截图
│   ├── videos/                           # Playwright 失败录像
│   ├── reports/                          # HTML / JSON 报告
│   ├── diffs/                            # 视觉回归差异图
│   └── .gitkeep
│
└── archive/                              # 废弃文件归档 (保留供参考)
    ├── README.md                         # 每个文件的来源 + 废弃原因
    ├── real_user_automation.py
    ├── interactive_automation.py
    ├── test-drawwork-e2e.py
    ├── test-drawwork-final.py
    ├── test-drawwork-full.py
    ├── comprehensive-test-suite.py
    ├── journey2-collaboration-test.py
    ├── journey3-share-permissions-test.py
    ├── tc001_homepage_test.py
    ├── tc004_login_test.py
    ├── tc_full_flow_test.py
    ├── tc_full_flow_test2.py
    └── chrome-devtools-mcp-test-suite.md
```

---

## 3. 核心架构

### 3.1 分工边界 (四层)

```
Layer           Responsibility                        Tool             Example Tests
─────           ──────────────                        ────             ─────────────
API             Backend logic, data integrity,         pytest+requests  注册/画板CRUD/权限/
                auth enforcement without browser                        评论/文件上传

Level 1         Page loading, form filling, route      Playwright      登录流程/表单验证/
(Playwright)    navigation, console error detection    (headless)       XSS注入/路由跳转/
                                                                       媒体上传/分享链接

Level 2         Canvas drawing, keyboard shortcuts,    PyAutoGUI       画矩形/节点编辑/
(PyAutoGUI)     tool switching, drag-and-drop,         (OS-level)      Ctrl+Z/Ctrl+F/
                mouse trajectory, pixel verification                    拖选/样式修改

Mixed           Scenarios that need multiple layers:   API+PyAutoGUI   协同编辑 (两个真窗口)/
                API prepares data, pyautogui acts on UI                 断网重连/分享权限
```

### 3.2 核心模块设计

#### 3.2.1 `shared/coord-manager.py` — 窗口相对坐标

解决 pyautogui 最核心的痛点：**硬编码坐标**。

```python
class CoordManager:
    """基于窗口标题定位，所有操作坐标均为窗口内的相对偏移"""

    def __init__(self, window_title="DrawWork - *"):
        self.window = None
        self.window_title = window_title

    def locate_window(self, retries=10) -> bool:
        """用 pygetwindow 找到目标窗口并激活"""

    @property
    def offset_x(self) -> int:   # → 窗口左上角屏幕 x
    @property
    def offset_y(self) -> int:   # → 窗口左上角屏幕 y

    def screen_xy(self, rel_x, rel_y) -> tuple:
        """窗口内相对坐标 → 屏幕绝对坐标"""
        return (self.offset_x + rel_x, self.offset_y + rel_y)

    # 常用区域 (基于窗口尺寸比例计算，不再硬编码像素)
    def canvas_center(self) -> tuple:
        """画布区域中心 (窗口右侧 main 区域)"""

    def toolbar_button(self, index) -> tuple:
        """左侧工具栏第 N 个按钮"""

    def sidebar_tab(self, tab_name) -> tuple:
        """侧边栏 tab"""
```

**窗口探测顺序：**
1. 通过 `gw.getWindowsWithTitle()` 匹配包含 `localhost:5173` / `vite` / `DrawWork` 的窗口
2. 激活并最大化
3. 后续所有鼠标操作均基于窗口左上角坐标 + 比例偏移

#### 3.2.2 `service-manager/manager.py` — 服务生命周期

```python
class ServiceManager:
    """
    启动/停止 三个服务 (backend + yjs + frontend)
    健康检查 + 端口占用清理 + 超时等待
    """

    def start_all(self):          # 按顺序启动，等待健康检查
    def stop_all(self):           # 关闭所有子进程 + 清理端口
    def is_healthy(self) -> bool: # 检查所有服务端口响应
    def restart_frontend(self):   # 单独重启前端 (修 bug 后)
    def reset_database(self):     # 删除 dev.db → 运行 migrate → 保留配置的测试账号
                                  # 不删除 node_modules / uploads / 其他数据文件
```

**`reset_database()` 具体行为：**
1. 关闭后端服务
2. 删除 `backend/dev.db`（仅当前测试用的 SQLite）
3. 重新启动后端 (自动触发 migration，创建新库)
4. 如果配置了固定的测试账号，通过 API 预创建它们
5. 不影响 `backend/uploads/` 等其他持久化目录

#### 3.2.3 `shared/screenshot-diff.py` — 视觉验证

```python
class ScreenshotDiff:
    """截图 + 像素对比"""

    def capture_region(self, region: tuple) -> Image:
        """截取指定屏幕区域 (画布)"""

    def compare(self, actual: Image, baseline: str, threshold=0.05) -> dict:
        """与基线对比
        返回: { passed: bool, diff_pct: float, diff_path: str, message: str }
        diff 图统一输出到 test/results/diffs/
        """

    def update_baseline(self, name: str, image: Image):
        """人工确认后更新基线 (将实际截图复制到 baselines/)"""

    def generate_diff_image(self, img1, img2) -> Image:
        """生成红绿标注差异图 (红色=新增, 绿色=缺失)"""
```

#### 3.2.4 `loop/runner.py` — AI 维修循环

```python
class LoopRunner:
    """
    全自动循环：
    1. 重置数据库 + 启动服务
    2. 依次跑 API → Level 1 → Level 2 → Mixed
    3. 收集失败 → 写入 failures.json
    4. loop/reporter.py 读取 failures.json → 生成 readable 失败报告 → 写入 results/reports/
    5. 如果全部通过 → 退出循环，生成最终报告
    6. 如果有失败 → 写入 fix-request.md (含截图路径、错误信息、DOM 快照)
    7. OpenClaw 读取 fix-request.md → 自动修复源码或测试脚本
    8. 修复完成后触发重跑
    9. 如果同一 case 连续失败 >= 5 次 → 放弃自动修复，标记为 manual triage
    10. 如果单次循环超过 30 分钟 → 超时退出
    """

    # 状态追踪
    self.retry_counts = {}     # {test_name: consecutive_failures}
    self.loop_start_time       # 防止超时死循环
    self.max_retries = 5
    self.max_loop_time = 30 * 60  # 30 minutes
```

**修复触发机制:**
- `loop/runner.py` 在检测到失败后写 `test/results/fix-request.md`
- OpenClaw 通过 cron 或 heartbeat 检查该文件是否存在
- 如果存在 → 读取失败详情 → 尝试修复源码或测试脚本
- 修复完成后删除 `fix-request.md` → runner 检测到文件消失 → 自动重跑
- runner 轮询间隔: 每 5 秒检查一次 fix-request.md 是否已被删除

### 3.3 维修循环判定与终止逻辑

```
test 执行
    │
    ├── 全部通过 → ✅ 退出循环 (exit code 0)
    │
    └── 有失败 → 分类判定:
            │
            ├── 服务未就绪 (connection refused / 502)
            │       → 重试 3 次 (wait 5s interval)
            │       → 仍失败 → 标记 "环境异常"，继续下一个 test
            │
            ├── 元素未找到 (Playwright timeout)
            │       → 截图 + DOM 快照 → 写入 fix-request.md
            │       → retry_count += 1
            │       → if retry_count >= 5: skip, 标记 manual triage
            │
            ├── 坐标偏移 (pyautogui 点错位置)
            │       → 当前全屏截图 → 写入 fix-request.md
            │       → 可能原因: UI 布局变了 or 窗口位置变了
            │       → AI 判断: 修改 coord-manager 偏移量 or 前端 bug
            │
            ├── 像素差异超出阈值 (visual regression >= 5%)
            │       → 生成 diff 图 → 写入 fix-request.md
            │       → AI 判断: 是预期的 UI 变更? 更新基线
            │                    是渲染 bug? 修复前端
            │
            └── API 返回错误 (4xx / 5xx)
                    → 记录 response body + route → 写入 fix-request.md
                    → AI 修复后端代码
                    → 修复完需要 restart_backend()

异常终止条件:
- 同一 test 连续失败 >= 5 次 → 放弃，标记 manual triage
- 全部 tests 标记 manual triage → 退出循环 (exit code 1)
- 整体循环超过 30 分钟 → 超时退出 (exit code 2)
```

### 3.4 单独运行某一层

| 场景 | 命令 |
|------|------|
| 跑全量循环 | `python test/loop/runner.py` |
| 只跑 API 层 | `pytest test/api/ -v --html=test/results/reports/api.html` |
| 只跑 Level 1 | `npx playwright test --config test/level1-playwright/playwright.config.js` |
| 只跑 Level 2 | `pytest test/level2-pyautogui/ -v` |
| 只跑 Level 2 的 Excalidraw | `pytest test/level2-pyautogui/excalidraw/ -v` |
| 只跑 Level 2 的 MindMap | `pytest test/level2-pyautogui/mindmap/ -v` |
| 只跑混合模式 | `pytest test/mixed/ -v` |
| 跑某一层后出 HTML 报告 | `pytest test/level2-pyautogui/ -v --html=test/results/reports/l2.html` |
| 跑 Level 2 时看到鼠标操作 | 设置环境变量 `HEADLESS=0`，pyautogui 会移动真实鼠标 (默认 HEADLESS=1 禁用) |

---

## 4. 实施阶段

### 阶段 1：基础设施 (Day 1-2)

- [ ] 创建 `test/` 完整目录结构 (所有空文件 + __init__.py)
- [ ] 实现 `service-manager/manager.py` (启动/停止/健康检查/端口清理)
- [ ] 实现 `service-manager/port-killer.py`
- [ ] 实现 `shared/coord-manager.py` (窗口定位 + 相对坐标)
- [ ] 实现 `shared/screenshot-diff.py` (基线对比 + diff 生成)
- [ ] 实现 `shared/report.py` (JSON + HTML 报告模板)
- [ ] 迁移 e2e Playwright 测试 → `test/level1-playwright/`
- [ ] 迁移 `frontend/e2e/` → `test/level1-playwright/specs/mindmap/`
- [ ] 废弃旧文件 → 移入 `test/archive/`
- [ ] 删除旧输出目录 (`test-results/`, `test-screenshots/`)

### 阶段 2：API 直测 (Day 3)

- [ ] `api/conftest.py` — pytest fixtures (service_manager, clean_db, api_client)
- [ ] `api/test_auth_api.py` — 注册/登录/登出/Token 刷新/错误密码
- [ ] `api/test_boards_api.py` — 画板 CRUD
- [ ] `api/test_canvases_api.py` — 画布 CRUD (4 种类型)
- [ ] `api/test_shares_api.py` — 分享/邀请/权限验证
- [ ] `api/test_comments_api.py` — 评论创建/回复/删除
- [ ] `api/test_uploads_api.py` — 文件上传/下载

### 阶段 3：Level 2 基础 — Excalidraw (Day 4-6)

- [ ] `level2-pyautogui/conftest.py` — CoordManager + ServiceManager fixtures
- [ ] `common/test_auth.py` — pyautogui 登录/注册
- [ ] `common/test_navigation.py` — 页面跳转 (Dashboard→Editor→Canvas 切换)
- [ ] `excalidraw/test_drawing.py` — 绘制矩形/椭圆/箭头/直线 (截图对比验证)
- [ ] `excalidraw/test_tools.py` — 工具切换 (R/E/A/L hotkeys + 工具栏点击)
- [ ] `excalidraw/test_shortcuts.py` — 键盘快捷键 (Ctrl+C/V/Z/D)
- [ ] `excalidraw/test_text.py` — 文字工具 (英文/中文输入)
- [ ] `excalidraw/test_manipulation.py` — 选区移动/缩放/旋转/多选
- [ ] `excalidraw/test_drag_drop.py` — 媒体拖放到画布
- [ ] `excalidraw/test_undo_redo.py` — Undo/Redo 深度验证 (连续 20 步)
- [ ] 生成 Excalidraw 视觉基线截图 (empty / rectangle / arrow / text / multi-elements)

### 阶段 4：Level 2 进阶 — MindMap (Day 7-9)

- [ ] `mindmap/test_nodes.py` — 节点 CRUD (Tab→子节点 / Enter→兄弟 / Delete→删除)
- [ ] `mindmap/test_keyboard.py` — 键盘导航 (Arrow 移动焦点 / Ctrl+Enter→多根节点)
- [ ] `mindmap/test_collapse.py` — 折叠/展开验证 (子节点是否隐藏/显示)
- [ ] `mindmap/test_search.py` — Ctrl+F 搜索 + 匹配高亮 + 清空恢复
- [ ] `mindmap/test_styles.py` — 样式修改 (背景色/字体色/边框/字号)
- [ ] `mindmap/test_cross_tree.py` — Shift+Click 跨树连接 (创建/验证/删除)
- [ ] `mindmap/test_copy_paste.py` — 复制粘贴 (同画布/跨画布)
- [ ] 生成 MindMap 视觉基线截图

### 阶段 5：混合模式 (Day 10-11)

- [ ] `mixed/test_collaboration.py`
  - API 创建 User A + User B + 共享画板
  - 启动两个独立 Chrome 窗口 (User A 和 User B 分别登录)
  - User A 在 Excalidraw 画矩形 → 验证 User B 的 canvas 同步出现
  - User B 在 MindMap 创建节点 → 验证 User A 的 interface 同步更新
  - 包含 Yjs presence (在线人数显示) 验证
- [ ] `mixed/test_offline_reconnect.py`
  - User A 正常登录 → API 创建画布
  - 通过 Chrome DevTools Protocol (CDP) `Network.emulateNetworkConditions` 模拟断网
  - User A 继续操作画布 → 验证本地操作不受影响
  - 恢复网络 → 验证积压数据自动同步到后端
- [ ] `mixed/test_share_permissions.py`
  - API 创建分享链接 (viewer / editor 两种)
  - 匿名浏览器打开 viewer 链接 → 验证只能看不能编辑
  - 匿名浏览器打开 editor 链接 → 验证可以编辑
  - 验证错误的 token 被拒绝

### 阶段 6：维修循环 + 收尾 (Day 12-13)

- [ ] `loop/reporter.py` — 读取 pytest/playwright 原始输出 → 生成结构化失败报告
- [ ] `loop/fix-rules.md` — 编写给 AI 看的修复判定规则
- [ ] `loop/runner.py` — 实现全自动循环控制器 (含 retry tracking / timeout)
- [ ] 端到端验证：故意注入一个 bug → 确认循环能检测 → 修复 → 确认通过
- [ ] 更新 `e2e/package.json` scripts → 重定向到 `test/level1-playwright/`
- [ ] 编写 `test/README.md` (架构说明 + 快速开始 + 添加新测试的指南)
- [ ] 删除 `e2e/` 目录 (完成迁移后)
- [ ] 删除 `frontend/e2e/` 目录 (完成迁移后)

---

## 5. 依赖

### Python 依赖 (`test/requirements.txt`)

```
pyautogui>=0.9.54       # OS 级鼠标/键盘模拟
Pillow>=10.0.0          # 截图 + 像素对比 (注意 PyPI 包名是 Pillow)
pytest>=8.0.0           # 测试框架
pytest-html>=4.0.0     # HTML 报告
PyYAML>=6.0             # 配置管理
PyGetWindow>=0.0.9      # 窗口定位 (PyPI 包名是 PyGetWindow，import 是 pygetwindow)
opencv-python>=4.9.0   # 高级图像对比 (可选，提升 diff 精度)
requests>=2.31.0        # API 直测 HTTP 客户端
```

### Node.js 依赖 (`test/level1-playwright/package.json`)

从 `e2e/package.json` 迁移，内容不变:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.x",
    "playwright": "^1.x"
  }
}
```

---

## 6. 变更清单汇总

### 创建
- `test/` 完整目录结构 (约 55+ 文件)

### 迁移
- `e2e/tests/` 全部 16 个文件 → `test/level1-playwright/specs/`
- `e2e/playwright.config.js` → `test/level1-playwright/`
- `e2e/package.json` → `test/level1-playwright/`
- `e2e/loop/` → `test/loop/`
- `e2e/test-accounts.md` → `test/config/`
- `frontend/e2e/mindmap*.spec.js` + `helpers.js` → `test/level1-playwright/specs/mindmap/`
- `docs/testing/chrome-devtools-mcp-test-suite.md` → `test/archive/`
- `docs/test-plan-mindmap.md` → `test/archive/mindmap-test-plan-reference.md`

### 废弃 (移入 `test/archive/`，共 12 个文件)
- 根目录: `real_user_automation.py`, `interactive_automation.py`, `test-drawwork-e2e.py`, `test-drawwork-final.py`, `test-drawwork-full.py` (5 个)
- `test-results/devtools/`: `comprehensive-test-suite.py`, `journey2-collaboration-test.py`, `journey3-share-permissions-test.py`, `tc001_homepage_test.py`, `tc004_login_test.py`, `tc_full_flow_test.py`, `tc_full_flow_test2.py` (7 个)

### 删除
- `test-results/` 完整目录
- `test-screenshots/` 完整目录
- 完成迁移后的 `e2e/` 完整目录
- 完成迁移后的 `frontend/e2e/` 完整目录

---

## 7. 注意事项

1. **pyautogui 需要独占屏幕** — 运行 Level 2 时不能同时操作电脑，建议在专用 VM 或空闲机器上跑。Windows 下需要确保显示器不熄灭（禁用锁屏/睡眠）。
2. **不能 headless** — Level 2 依赖真实屏幕渲染，Linux 无 X server 会直接失败。CI 可以用 Windows VM + RDP。
3. **保留 `backend/__tests__/`** — Jest 单元测试与后端代码紧密耦合，保持原位不受影响。
4. **保留 `frontend/test/`** — Vitest 单元测试与前端代码紧密耦合，保持原位不受影响。
5. **测试账号管理** — `test/config/test-accounts.md` 记录所有固定测试账号（如 546564249liu@gmail.com），新注册的临时账号由 API 自动创建并在 `reset_database()` 后销毁。
6. **yjs-server 测试** — 无独立的 ws 单元测试，WebSocket 协同验证全部在 `mixed/test_collaboration.py` 中通过真实窗口交互完成。
7. **维修循环不自动提交代码** — `loop/runner.py` 只生成失败报告，修复由 OpenClaw 执行。AI 修复完成后需人工确认才能 commit。
8. **Level 1 和 Level 2 可并行跑** (在不同机器上)，但 Level 2 内部串行 (pyautogui 一次只能控制一个鼠标)。
9. **基线截图需要定期审查** — 每次 UI 大改版后，需人工确认所有基线是否需要更新。
