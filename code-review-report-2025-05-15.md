# DrawWork 全代码审查报告

> 审查日期: 2026-05-15
> 范围: backend/ (Express API), yjs-server/ (WebSocket), frontend/ (React/Vite)
> 状态: 已修复(7) + 待确认(10) + 需讨论(5)

---

## 一、已修复的问题 (Fixed)

### F1. `yjs-server/index.js` — 死代码
- **路径**: [yjs-server/index.js](yjs-server/index.js)
- **问题**: 陈旧的 Yjs 服务器副本，`y-websocket` 已在 yjs-server/package.json 中通过 `"main": "src/server.js"` 指定入口。此文件完全不参与运行且导入 `../backend/src/` 造成不必要的耦合。
- **操作**: ✅ 已删除

### F2. `yjs-server/src/server.js` — 冗余 require
- **路径**: [yjs-server/src/server.js](yjs-server/src/server.js)
- **问题**: `saveSnapshot()` 函数内部有 `const Y = require('yjs')`（第 279 行），但 Y 已在文件顶部全局导入。
- **操作**: ✅ 已移除

### F3. `routes/snapshots.js:38` — Base64 正则过严
- **路径**: [backend/src/routes/snapshots.js:38](backend/src/routes/snapshots.js#L38)
- **问题**: 正则 `/^[A-Za-z0-9+/=]+$/` 不匹配 base64 中可能出现的 `\n` 和 `\r`。
- **操作**: ✅ 已扩为 `/^[A-Za-z0-9+/=\n\r]+$/`

### F4. `routes/uploads.js:147-159` — 多余二次保存
- **路径**: [backend/src/routes/uploads.js](backend/src/routes/uploads.js)
- **问题**: 先 create（url=''），再设 url，再 save。浪费一次 DB 写操作。
- **操作**: ✅ 改为预生成 id，create 时直接填入 url

### F5. P1 — yjs-server JWT 回落密钥清理
- **路径**: [yjs-server/src/server.js](yjs-server/src/server.js)
- **问题**: `candidateSecrets()` 返回 4 个候选密钥（含 3 个硬编码字符串），任意一个匹配就能伪造 token。`DEFAULT_JWT_SECRET` 常量也不再需要，因为 `.env` 已正确配置 `JWT_SECRET`。
- **调查**: `authenticateToken` 提供了 API 回退验证（调 `/api/auth/me`），所以本地验证失败并非死路。但硬编码回落密钥确实是不必要的攻击面。
- **操作**: ✅
  - 删除 `DEFAULT_JWT_SECRET` 常量
  - 将 `candidateSecrets()` 改为 `verifyLocalToken()` 直接使用 `process.env.JWT_SECRET`
  - 保留 `authenticateToken` 的 API 回退作为本地验证失败后的兜底
  - 添加注释说明 API 回退的作用（如 JWT 轮换期间两服务密钥不同）

### F6. P3+P4 — Redis 条件初始化
- **路径**: [yjs-server/src/server.js](yjs-server/src/server.js)
- **问题**: Redis 客户端无条件连接 `localhost:6379`，在单机开发环境中无必要。该 Redis 用于多实例跨进程消息广播，不是核心功能。
- **操作**: ✅
  - 仅当 `REDIS_URL` 显式设置时才创建 Redis 客户端
  - 所有 `redisSub` 使用处加空值保护（psubscribe、pmessage、error handler、shutdown）

### F7. P13 — 双 WS 服务端添加职责注释
- **路径**: `backend/src/ws-server.js` + `yjs-server/src/server.js`
- **问题**: 两个 WS 服务器端口相同（3001），初次接触者容易混淆。
- **调查**: `ws-server.js` 被 `test/loop/runner.js` 和 `e2e/loop/runner.js` 使用，是 E2E 测试用的简化版。`yjs-server` 是开发/生产用的完整版。二者职责不同，不是冲突关系。
- **操作**: ✅ 为两个文件分别添加了文件级注释，说明各自定位和适用场景

---

## 二、待确认的问题 (Needs Confirmation)

### P2. `authMiddleware` 将 DB 错误吞为 401
- **路径**: [backend/src/middleware/auth.js:12-33](backend/src/middleware/auth.js#L12-L33)
- **问题**: `try/catch` 同时捕获 JWT 错误和 `User.findByPk` 的数据库错误。DB 连接失败时返回 401（"令牌无效或已过期"）而不是 500。
- **建议**: 区分错误类型，DB 错误应返回 500 或传递给 `next(err)`。

### P5. WebP 魔数校验不完整
- **路径**: [backend/src/routes/uploads.js:32](backend/src/routes/uploads.js#L32)
- **问题**: WebP 的魔数只检查 RIFF 容器头 `[0x52, 0x49, 0x46, 0x46]`，未验证第 8-11 字节是否为 "WEBP"。不过由于已配合 MIME 白名单使用，实际风险较低。
- **建议**: 增加 WEBP 特有签名检查。

### P6. Profile 模型的 id 缺少 UUIDV4 默认值
- **路径**: [backend/src/models/profile.js:3-8](backend/src/models/profile.js#L3-L8)
- **问题**: Profile.id 是 User.id 的 1:1 外键，没有设 `defaultValue`。如果某处创建 Profile 时忘了显式传 id，会写 NULL 进来破坏 FK。
- **建议**: 保留当前设计（id 来自 User，无默认值可预防误创建），但在代码中做好防护。

### P8. 全局 Rate Limit 100 次/15 分钟
- **路径**: [backend/src/app.js:52-53](backend/src/app.js#L52-L53)
- **问题**: 全局限制每 IP 100 请求/15 分钟 ≈ 6.6 请求/分钟。Excalidraw 编辑器的频繁保存、Yjs sync、canvas polling 在多人协作场景下很容易触发此限制。
- **建议**: 将全局限流放宽到 200-300/15min，或对静态资源路径放行。

### P9. BCRYPT_ROUNDS 未在 .env 中配置
- **路径**: [backend/src/routes/auth.js:26](backend/src/routes/auth.js#L26)
- **问题**: 所有 `.env` 文件都没有定义 `BCRYPT_ROUNDS`，目前走默认值 13。

### P10. AuditLog 模型创建但未使用
- **路径**: [backend/src/models/auditLog.js](backend/src/models/auditLog.js)
- **问题**: `AuditLog` 模型已定义并在 `models/index.js` 导出，但没有任何路由或中间件写入审计日志。
- **建议**: 在关键管理操作中集成审计日志写入。

### P11. 依赖 `y-websocket` 内部 API（docs/getYDoc）
- **路径**: [yjs-server/src/server.js](yjs-server/src/server.js)
- **问题**: 从 `y-websocket/bin/utils` 解构了 `docs` 和 `getYDoc`，这些是内部导出，版本升级可能导致 break。当前 `package.json` 已锁定 `"y-websocket": "2.0.3"`，短期无风险。

### P12. `boards.js` 获取画板列表先查 shares 再查 boards
- **路径**: [backend/src/routes/boards.js:20-40](backend/src/routes/boards.js#L20-L40)
- **问题**: 先查 `BoardShare.findAll` 拿到所有 sharedBoardIds，再用 IN 子句查 Boards。对于有大量 shared board 的用户，性能可能下降。
- **建议**: 如果用户数量增长，可以改为一站式 JOIN 查询 + Sequelize scope。

### P14. 测试文件内部 `require('../models')`
- **路径**: `snapshot-format.test.js:159,226` 等
- **问题**: 在 `it()` 函数体内部导入 `require('../models')`，应在文件顶部一次导入。

---

## 三、已调查并结案的问题 (Closed After Investigation)

### C1. P7 — BoardShare UNIQUE(board_id, user_id) 约束
- **结论**: ✅ **不是 bug，无需修改**
- **原因**: `BoardShare.destroy()` 是物理 DELETE（无 `paranoid: true`），移除后记录完全消失。重新邀请时 `findOrCreate` → SELECT 不到 → INSERT 新记录，UNIQUE 约束不冲突。Sequelize 的 `findOrCreate` 内部也处理了并发下的 UNIQUE 冲突回退。

### C2. P13 — 两个 WS 服务器端口冲突
- **结论**: ✅ **不是 bug，无需删除**
- **原因**: 两个服务器职责不同：
  - `backend/src/ws-server.js` → E2E 测试用（简化版，无持久化）
  - `yjs-server/src/server.js` → 开发/生产用（完整版，有持久化/Redis）
  - 二者均支持通过环境变量自定义端口，E2E runner 会分配不同端口
- **操作**: 已为两个文件添加职责注释，避免后续维护者混淆

### C3. P3+P4 — Redis 无条件连接
- **结论**: ✅ **已修复**，改为仅当 `REDIS_URL` 显式设置时才初始化 Redis
- **注意**: 该 Redis 用于多 Yjs 服务器实例间的跨进程消息广播，是合理设计，在单机开发中不是必需功能

---

## 四、需讨论的问题 (Discussion Needed)

### D1. `authMiddleware` 全局 401 错误处理策略
`middleware/auth.js` 在 catch 中统一返回 401。当 JWT 密钥轮换时，旧的 refresh token 会马上失效，无法优雅过渡。

### D2. `permission.js` 中间件链模式
DELETE 路由和批量操作使用了 `checkBoardPermission('editor')` + `requirePermission('owner')` 双重中间件链。是否提取为 `requireBoardOwner` helper？

### D3. Yjs snapshot 持久化策略
当前策略：
- Yjs 服务器每 N 秒自动保存 `dirtyRooms`
- 最后一个客户端断开时立即保存
- 只保留 Yjs 自动保存的快照（`created_by IS NULL`）

是否符合产品需求？

### D4. WebSocket 与 REST API 的认证同步
WebSocket 连接时 JWT token 在 URL 参数中（`?token=xxx`），可能被服务器日志记录。

### D5. 文件上传区分本地/Minio 存储
`storagePut` 先尝试 Minio，失败后回退到本地文件系统。需要确认这是否符合预期设计，还是应该显式配置存储后端。

---

## 五、测试覆盖率总结

| 模块 | 测试文件 | 覆盖情况 |
|------|---------|---------|
| Auth | auth.test.js + 各模块集成 | 登录/登出/refresh/me，较完整 |
| Boards | boards.test.js | CRUD + canvas 子资源，缺少 tokens 测试 |
| Shares | shares.test.js + shareValidate.test.js | invite/token CRUD + validate，较完整 |
| Comments | comments.test.js | CRUD + resolve，缺少 position 测试 |
| Votes | votes.test.js | 创建/投票/关闭/结果，较完整 |
| Snapshots | snapshots.test.js + snapshot-format.test.js | 读写/列表/格式兼容，很完整 |
| Notifications | notifications.test.js | CRUD + 触发点集成，较完整 |
| Structured Tools | structuredTools.test.js | 思维导图/看板/泳道图的 CRUD + 乐观锁 |
| Admin | admin.test.js | 用户管理/备份/权限校验，很完整 |
| Uploads | uploads.test.js | 上传/权限/魔数校验，较完整 |

补充建议：缺少 Board.token 撤销流程的测试、乐观锁边界测试、Uploads 魔数负面测试。

---

## 六、安全总评

| 项目 | 状态 | 说明 |
|------|------|------|
| Helmet header | ✅ | CSP 配置合理 |
| CORS | ✅ | 白名单机制 |
| Rate Limiting | ⚠️ | 全局 100/15min 偏严 |
| JWT | ✅ | 回落密钥已清理 |
| 密码 bcrypt | ✅ | 13 rounds |
| 文件上传验证 | ⚠️ | WebP 魔数不完整 |
| 分享令牌哈希 | ✅ | SHA-256 哈希存储 |
| SQL 注入防御 | ✅ | ORM + 参数化查询 |
| 敏感信息泄露 | ✅ | 区分 dev/prod |
| .env 不被提交 | ✅ | 已在 .gitignore 中 |

---

## 七、已修改的文件列表

| 文件 | 修改内容 |
|------|---------|
| `yjs-server/index.js` | 已删除（死代码） |
| `yjs-server/src/server.js` | 移除冗余 require；清理 JWT 回落密钥（删 DEFAULT_JWT_SECRET，candidateSecrets → 仅用 process.env.JWT_SECRET）；Redis 条件初始化 + 空值保护；添加文件级职责注释 |
| `backend/src/routes/snapshots.js` | base64 正则增加 `\n\r` |
| `backend/src/routes/uploads.js` | 消除多余二次保存 |
| `backend/src/ws-server.js` | 添加文件级职责注释 |
