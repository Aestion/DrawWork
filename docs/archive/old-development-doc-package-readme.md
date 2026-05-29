# DrawWork 开发文档包

## 文档说明

本文件夹包含 DrawWork 项目的完整开发文档，已对照实际代码库更新至最新版本。

## 快速导航

| 文档 | 内容 | 适用人员 |
|------|------|----------|
| [01_项目概述.md](./01_项目概述.md) | 项目简介、技术栈、项目结构、快速开始 | 所有人 |
| [02_功能需求.md](./02_功能需求.md) | 功能需求清单 + 实现状态跟踪 | 产品经理、开发 |
| [03_技术架构.md](./03_技术架构.md) | 系统架构、组件说明、API 接口总览 | 架构师、开发 |
| [04_数据库设计.md](./04_数据库设计.md) | 数据库表结构、模型关系图 | 后端开发 |
| [05_配置文件说明.md](./05_配置文件说明.md) | Docker、Nginx、环境变量配置 | 运维、开发 |
| [06_实施计划.md](./06_实施计划.md) | 开发进度跟踪、里程碑状态 | 项目经理、开发 |
| [07_运维手册.md](./07_运维手册.md) | 日常运维、备份恢复、故障排查 | 运维人员 |
| [08_稳定性优先开发方案.md](./08_稳定性优先开发方案.md) | 安全、性能、可用性优化方案 | 架构师、开发、运维 |
| [11_Docker部署指南.md](./11_Docker部署指南.md) | Docker 部署架构、命名规则、部署流程、故障排查 | 运维、开发 |

## 项目概况

- **项目名称**: DrawWork
- **用途**: 在线协作白板工具（支持手绘、思维导图、看板、泳道图）
- **技术栈**: React 18 + Vite + Express + Sequelize + Yjs + SQLite/PostgreSQL
- **开发状态**: 核心功能 ✅ | 迭代优化 🔄

## 核心功能

1. **画板管理** — 创建/编辑/删除画板，支持公开/私密
2. **多画布** — 每个画板可包含多个画布，支持四种类型
3. **Excalidraw 手绘** — 富文本、GIF/视频/音频、导出 PNG/SVG/JSON
4. **思维导图** — 多根节点、自动布局、Markdown 导入导出、跨树连接
5. **看板** — 列管理、卡片拖拽、3秒撤销
6. **泳道图** — 水平/垂直泳道、箭头连接、元素拖拽
7. **分享协作** — 邀请用户 + 分享链接，四级权限控制
8. **评论** — 画布定位锚点、线程回复、@ 提及
9. **投票** — 匿名/实名投票、实时计票
10. **实时协作** — Yjs CRDT 多人同步、光标显示
11. **快照** — 版本保存和恢复
12. **通知** — 站内通知系统

## 文档版本记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-04-25 | v1.0 | 初始版本 |
| 2026-04-25 | v1.1 | 补充结构化工具、评论、投票等功能说明 |
| **2026-05-18** | **v2.0** | **对照实际代码库全面更新，修正数据库字段、API 端点、项目结构、技术栈等信息** |
| **2026-05-22** | **v2.1** | **新增 Docker 部署指南（11_Docker部署指南.md）** |

---

*DrawWork Development Team*
*2026-05-18*

---

## 2026-05-22 实时协同与删除闪回修复

- 新增记录：[10_2026-05-22_实时协同与删除闪回修复记录.md](./10_2026-05-22_实时协同与删除闪回修复记录.md)
- 覆盖问题：腾讯思维 A/B 分享协同时 B 端不实时刷新；Excalidraw 普通元素删除后短暂闪回。
- 验收范围：腾讯思维实时同步、腾讯思维刷新持久化、Excalidraw 单元素删除协同、前端单测与生产构建。

---

## 2026-05-22 项目现状补充

- 代码结构：后端在 `backend/src`，核心 REST API 位于 `routes/`，权限由 `middleware/permission.js` 统一判断；前端在 `frontend/src`，主要页面为 Dashboard、Editor、ShareRedirect；协同服务在 `yjs-server/src/server.js`。
- 分享协同链路：画板 owner 通过 `POST /api/boards/:id/shares` 直邀用户，或通过 `POST /api/boards/:id/tokens` 生成分享链接；访问 `/s/:token` 时前端调用 `GET /api/shares/validate` 验证并跳转。
- 分享链接计数规则：匿名打开链接只做预览验证，不消耗 `max_uses`；只有登录用户首次通过 token 获得画板访问权时，后端才在事务内创建 `BoardShare` 并递增 `used_count`；已获得访问权的用户刷新链接不重复计数。
- 测试入口：分享相关后端覆盖在 `backend/src/__tests__/shares.test.js` 和 `backend/src/__tests__/shareValidate.test.js`；Level 1 浏览器覆盖在 `test/level1-playwright/specs/share.spec.js`、`share-link.spec.js`、`collaboration.spec.js`。
- 本次验收命令：`cd backend && npm test -- --runTestsByPath src/__tests__/shares.test.js src/__tests__/shareValidate.test.js src/__tests__/notifications.test.js src/__tests__/boards.test.js src/__tests__/snapshots.test.js`，当前结果 5 suites / 32 tests 通过。
- 本次新增详档：[09_2026-05-22_项目理解与分享协同验收.md](./09_2026-05-22_项目理解与分享协同验收.md)
