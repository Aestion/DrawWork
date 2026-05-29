# DrawWork 测试指南

## 后端测试

```bash
cd backend
npm test
```

## 前端单元测试

```bash
cd frontend
npm run test:unit
```

## 浏览器端到端测试

先启动本地开发服务，再执行：

```bash
cd frontend
npm run test:e2e
```

Playwright 用例主要位于 `test/level1-playwright/specs/`。

## GUI 自动化测试

PyAutoGUI 用例位于 `test/level2-pyautogui/`。

