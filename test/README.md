# DrawWork 测试框架

> 真实用户模拟测试 — OS 级 pyautogui + Playwright + API 三层覆盖

---

## 快速开始

```bash
# 1. 安装 Python 依赖
pip install -r test/requirements.txt

# 2. 安装 Node.js 依赖 (Level 1 Playwright)
cd test/level1-playwright && npm install && npx playwright install chromium

# 3. 跑全量循环 (需要真实屏幕)
python test/loop/runner.py

# 4. 只跑某一层
pytest test/api/ -v                                    # API 直测
npx playwright test --config test/level1-playwright/playwright.config.js   # Level 1
pytest test/level2-pyautogui/ -v                       # Level 2 (需要屏幕!)
pytest test/level2-pyautogui/excalidraw/ -v            # 只 Excalidraw
pytest test/level2-pyautogui/mindmap/ -v               # 只 MindMap
pytest test/mixed/ -v                                  # 混合模式
```

---

## 目录

```
test/
├── README.md                 ← 你在这里
├── TEST-CATALOG.md           ← 完整测试用例清单
├── requirements.txt
├── .gitignore
│
├── config/                   # 测试配置 + 账号表
├── service-manager/          # 启动/停止/重置三服务
├── shared/                   # coord-manager / screenshot-diff / report
│
├── api/                      # Level 0: 后端 API 直测 (pytest)
├── level1-playwright/        # Level 1: Playwright 页面测试
│   ├── specs/                # 15 个 spec 文件 (58 用例)
│   └── specs/mindmap/        # MindMap 专项 (3 个 spec)
│
├── level2-pyautogui/         # Level 2: 真实用户模拟
│   ├── common/               # 登录/导航 (pyautogui 版)
│   ├── excalidraw/           # 绘图/工具/快捷键/文字
│   └── mindmap/              # 节点/键盘/折叠/搜索/样式
│
├── mixed/                    # 混合: API 准备 + pyautogui 验证
├── visual-baseline/          # 视觉回归黄金截图
├── loop/                     # AI 维修循环
├── results/                  # 输出 (gitignored)
└── archive/                  # 废弃文件
```

---

## 架构

```
Layer 0: API      → pytest + requests    → 注册/画板/权限/评论
Layer 1: Playwright → headless Chromium   → 表单/路由/安全/XSS
Layer 2: PyAutoGUI  → OS-level mouse/kbd  → 画布绘图/快捷键/拖拽
Mixed:              → API+PyAutoGUI       → 双人协同/离线/分享
```

---

## 添加新测试

1. 确定属于哪一层
2. 在对应目录创建 `test_xxx.py` (Python) 或 `xxx.spec.js` (Playwright)
3. 遵循现有命名规范
4. 更新 `TEST-CATALOG.md` 添加条目
5. 如果是 Level 2，需要视觉基线的话运行一次 `ScreenshotDiff.update_baseline()`

---

## 注意事项

- **Level 2 需要独占屏幕** — pyautogui 会接管鼠标，不能并行跑
- **Level 1 可以 headless** — 适合 CI
- **维修循环不自动 commit** — `loop/runner.py` 只报告，修复需人工确认
- **基线截图定期审查** — UI 大改后需要更新 `visual-baseline/`

---

*更多细节见 [TEST-CATALOG.md](TEST-CATALOG.md)*
