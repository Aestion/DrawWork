# DrawWork 浏览器自动化 E2E 闭环设计

## 目标

在 VSCode 内构建一套 **AI 驱动的浏览器自动化测试闭环**：
- 一键启动后端 + 前端 + Playwright E2E 测试
- 测试失败时自动收集证据（截图、Console 日志、网络错误）
- AI（Claude Code）读取失败报告 → 分析根因 → 修改代码 → 再次运行测试
- 循环直到全部通过

## 架构

```
AI Auto-Fix Loop (Claude Code)
         │
    ┌────┴────┐
    ▼         ▼
Backend    Frontend
(SQLite)   (Vite 5173)
    │         │
    └────┬────┘
         ▼
   Playwright E2E
   (headless Chromium)
         │
    ┌────┴────┐
  通过 ✅    失败 ❌
              │
         证据收集
    • 截图 (PNG)
    • Console errors/warnings
    • 网络失败 (4xx/5xx)
    • Playwright trace
              │
         Markdown 报告
              │
         AI 分析修复
              │
         再次运行测试 (循环)
```

## 核心组件

| 组件 | 路径 | 作用 |
|------|------|------|
| E2E 测试 | `e2e/tests/*.spec.js` | Playwright 测试用例 |
| 测试编排器 | `e2e/loop/runner.js` | 启动后端/前端，执行 Playwright，收集结果 |
| 证据收集器 | `e2e/loop/reporter.js` | 失败时生成 Markdown 报告 |
| 一键入口 | `npm run e2e:loop` | 单命令启动整个闭环 |
| VSCode Task | `.vscode/tasks.json` | Ctrl+Shift+P → Run Task → E2E Test |

## 后端启动策略

- `NODE_ENV=test` → SQLite `:memory:`，每次循环都是干净数据库
- `PORT=3000`
- 自动 `sequelize.sync()` 建表
- 循环结束后自动 `process.kill()` 终止

## 前端启动策略

- `vite dev --port 5173`
- 通过 proxy 连接 `localhost:3000`
- 无头浏览器（默认 `headless: true`）

## Playwright 测试覆盖

1. **auth.spec.js** — 注册账号、登录、JWT 持久化、登出
2. **dashboard.spec.js** — 创建画板、列表展示、删除画板
3. **editor.spec.js** — 进入编辑器、Excalidraw 加载、切换画布类型

## 失败证据收集

- 截图：`e2e/results/screenshots/<test-name>-<timestamp>.png`
- Console 日志：`error`、`warn` 级别
- 网络错误：状态 >= 400 的请求
- Playwright trace ZIP（可选，用于深度调试）
- 汇总报告：`e2e/results/last-failure-report.md`

## AI 修复循环

1. 用户或 loop 触发 `npm run e2e:loop`
2. 通过 ✅ → 结束
3. 失败 ❌ → 输出：`测试失败，报告见 e2e/results/last-failure-report.md`
4. Claude Code 读取报告 → 诊断根因 → 修改源码
5. 再次运行 → 循环

## 技术栈

- Playwright (Node.js)
- SQLite (测试数据库)
- Vite (前端 dev server)
- Express (后端 API)

## 约束

- 不改动现有业务代码（除非修复 bug）
- 测试用例必须独立，不依赖执行顺序
- 每次循环数据库重置，保证可重复性
