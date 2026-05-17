# Browser Automation E2E Loop 实施计划

> **For agentic workers:** Use subagent-driven-development or executing-plans.

**Goal:** 为 DrawWork 搭建 Playwright E2E 自动化测试闭环，支持一键测试、失败报告、AI 修复循环。
**Architecture:** 在 `e2e/` 目录下构建 Playwright 测试套件 + Node.js 编排脚本，通过 `npm run e2e:loop` 启动后端(SQLite)、前端(Vite)、Playwright(headless) 的完整链路。
**Tech Stack:** Playwright, Node.js, SQLite, Vite, Express

## 任务列表

### Phase 1: 基础设施

- [ ] **1.1 安装 Playwright**
  - `cd e:\DrawWork && npm install -D @playwright/test`
  - `npx playwright install chromium`
  - 验证安装：`npx playwright --version`

- [ ] **1.2 创建目录结构**
  - `mkdir -p e2e/tests e2e/loop e2e/results/screenshots`
  - `touch e2e/.gitignore`（忽略 results/）

- [ ] **1.3 编写 Playwright 配置**
  - 文件：`e2e/playwright.config.js`
  - 配置：baseURL `http://localhost:5173`，projects `chromium`，outputDir `e2e/results/`

- [ ] **1.4 编写测试编排器 (runner.js)**
  - 文件：`e2e/loop/runner.js`
  - 功能：
    1. `spawn` 启动后端 `NODE_ENV=test node backend/src/app.js`
    2. `spawn` 启动前端 `npm run dev -- --port 5173`
    3. 等待后端 `/health` 就绪、前端 `http://localhost:5173` 可访问
    4. 执行 `npx playwright test`
    5. 收集 exit code
    6. kill 前后端进程
    7. exit code 非 0 时调用 reporter.js

- [ ] **1.5 编写证据收集器 (reporter.js)**
  - 文件：`e2e/loop/reporter.js`
  - 功能：遍历 `e2e/results/` 下的 test-results，提取失败信息，生成 `last-failure-report.md`

- [ ] **1.6 添加 npm script**
  - 修改根目录 `package.json`（新建）或复用现有
  - 添加 `"e2e:loop": "node e2e/loop/runner.js"`

### Phase 2: TDD 编写测试

- [ ] **2.1 RED — 写第一个失败的 auth 测试**
  - 文件：`e2e/tests/auth.spec.js`
  - 测试：访问 `/register`，填写表单，提交，验证跳转到 `/`
  - 运行：`npm run e2e:loop`
  - 验证：测试因「找不到注册按钮/表单」而失败（预期）

- [ ] **2.2 GREEN — 让 auth 测试通过**
  - 如果测试因前端已存在而通过，则验证通过
  - 如果失败因真实 bug，则修复（但当前阶段基础设施优先，不应有大改）
  - 运行并确认通过

- [ ] **2.3 RED — 写 dashboard 测试**
  - 文件：`e2e/tests/dashboard.spec.js`
  - 测试：登录 → 创建画板 → 验证列表中出现 → 点击进入
  - 运行并确认失败（如果前端有 bug）或通过

- [ ] **2.4 GREEN — 让 dashboard 测试通过**
  - 修复必要代码使测试通过

- [ ] **2.5 RED — 写 editor 测试**
  - 文件：`e2e/tests/editor.spec.js`
  - 测试：进入 `/board/:id` → 等待 Excalidraw 加载 → 截图验证
  - 运行并确认失败或通过

- [ ] **2.6 GREEN — 让 editor 测试通过**
  - 修复必要代码使测试通过

### Phase 3: 集成与验证

- [ ] **3.1 编写 VSCode Task**
  - 文件：`.vscode/tasks.json`
  - 添加 task：`E2E: Run All Tests`，命令 `npm run e2e:loop`

- [ ] **3.2 编写 README**
  - 文件：`e2e/README.md`
  - 说明：安装、运行、调试（headless=false）、报告解读

- [ ] **3.3 验证完整闭环**
  - 步骤：
    1. 故意在前端注入一个 bug（如把 `DashboardPage.jsx` 中某个 API 调用路径写错）
    2. 运行 `npm run e2e:loop`
    3. 验证：测试失败，生成 `last-failure-report.md`
    4. 我（AI）读取报告 → 定位 bug → 修复代码
    5. 再次运行 `npm run e2e:loop`
    6. 验证：测试通过 ✅

## 验收标准

- [ ] `npm run e2e:loop` 单命令启动并运行所有测试
- [ ] 测试失败时生成 `e2e/results/last-failure-report.md`
- [ ] 报告包含：失败测试名、截图路径、console 错误、网络错误
- [ ] 测试通过时进程 exit code 为 0，失败时为 1
- [ ] 每次运行数据库干净（SQLite memory）
- [ ] VSCode Task 可用
