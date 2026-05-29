# 2026-05-22 项目理解与分享协同验收

## 项目结构速览

| 模块 | 路径 | 说明 |
|------|------|------|
| 后端 API | `backend/src` | Express + Sequelize，REST API、权限中间件、模型定义 |
| 前端应用 | `frontend/src` | React + Vite，Dashboard、Editor、分享跳转页 |
| 协同服务 | `yjs-server/src` | Yjs WebSocket 同步、协同房间、快照持久化 |
| 自动化测试 | `backend/src/__tests__`, `test/level1-playwright`, `test/mixed` | Jest、Playwright、PyAutoGUI/混合测试 |
| 开发文档 | `DrawWork_开发文档包` | 面向后续查阅的需求、架构、运维和稳定性资料 |

## 分享协同链路

1. Owner 创建画板后，可通过 `POST /api/boards/:id/shares` 邀请指定用户。
2. Owner 可通过 `POST /api/boards/:id/tokens` 生成分享链接 token。
3. 前端 `/s/:token` 调用 `GET /api/shares/validate` 验证链接。
4. 匿名用户只做链接预览和登录引导，不消耗 `max_uses`。
5. 登录用户首次通过 token 加入时，后端在事务内检查 `max_uses`、创建 `BoardShare(source=token)`、递增 `used_count`。
6. 已有权限的用户再次打开链接不重复消耗次数。

## 本次修复点

- 修复分享链接 `max_uses` 计数语义：次数消耗绑定到“首次授予登录用户访问权”，避免匿名预览烧掉次数，也避免登录用户通过 `consume=false` 绕过计数。
- 补充分享链接后端测试：匿名预览不计数、登录首次加入计数为 1。
- 补充 Level 1 Playwright 用例：`test/level1-playwright/specs/share-link.spec.js` 覆盖匿名预览、首个登录用户加入、第二个用户超限拒绝。
- 修复快照 API 响应缺少 `created_at` 的既有回归：Sequelize timestamp 属性应从 `createdAt` 序列化为接口字段 `created_at`。

## 验收命令

```bash
cd backend
npm test -- --runTestsByPath src/__tests__/shares.test.js src/__tests__/shareValidate.test.js src/__tests__/notifications.test.js src/__tests__/boards.test.js src/__tests__/snapshots.test.js
```

当前验收结果：5 个测试套件、32 个测试全部通过。

说明：`npm test` 后端全量套件本次在 3 分钟超时，未作为通过结论；已用相关套件覆盖分享、权限、通知、画板、快照回归。
