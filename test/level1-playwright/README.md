# DrawWork 自动化测试（Level 1 — Playwright）

## 前置要求

- Node.js >= 20
- Python（仅用于其他技能，测试本身纯 Node.js）
- Chromium（Playwright 自动安装）

## 安装

```bash
# 在项目根目录（已自动完成）
npm install -D @playwright/test
npx playwright install chromium
```

## 运行测试

### 一键运行完整闭环

```bash
npm run e2e:loop
```

流程：
1. 启动 Backend（SQLite memory，port 3000）
2. 启动 Frontend（Vite dev，port 5173）
3. 等待服务就绪
4. 运行 Playwright E2E 测试
5. 收集结果 → 失败时生成 `test/level1-playwright/results/last-failure-report.md`
6. 自动关闭所有进程

### VSCode 快捷方式

`Ctrl+Shift+P` → `Tasks: Run Task` → 选择 `E2E: Run All Tests`

### 查看 HTML 报告

```bash
npm run e2e:report
```

### 调试用：有头模式

修改 `test/level1-playwright/playwright.config.js`：

```js
use: {
  headless: false,  // 弹出真实浏览器
}
```

## 测试文件

| 文件 | 覆盖场景 |
|------|---------|
| `test/level1-playwright/specs/auth.spec.js` | 注册、登录 |
| `test/level1-playwright/specs/dashboard.spec.js` | 创建/删除画板 |
| `test/level1-playwright/specs/editor.spec.js` | 编辑器加载、画布切换 |

## AI 修复循环

1. 运行 `npm run e2e:loop`
2. 如果失败，查看 `test/level1-playwright/results/last-failure-report.md`
3. 修复源码
4. 再次运行 `npm run e2e:loop`
5. 循环直到 ✅

## 目录结构

```
test/level1-playwright/
├── playwright.config.js     # Playwright 配置
├── specs/
│   ├── auth.spec.js         # 认证流程
│   ├── dashboard.spec.js    # 画板管理
│   └── editor.spec.js       # 编辑器
├── fixtures/
│   └── test-video.mp4       # 测试用视频文件
├── loop/
│   ├── runner.js            # 前后端启停 + 测试编排
│   └── reporter.js          # 失败报告生成
└── results/                 # 测试结果（gitignored）
```
