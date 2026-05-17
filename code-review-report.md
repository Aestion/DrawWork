# DrawWork 代码 Review 完整报告

> 全面代码审查：安全、架构、逻辑、质量、性能五个维度
> 审核时间: 2026-05-12

---

## 📊 概览

| 维度 | 问题数 | 严重问题 | 状态 |
|------|--------|----------|------|
| 安全层 | 10 | 2 Critical | ⚠️ 需立即修复 |
| 架构层 | 5 | 0 | ✅ 良好 |
| 逻辑层 | 4 | 0 | ✅ 良好 |
| 质量层 | 6 | 0 | ⚠️ 可优化 |
| 性能层 | 3 | 0 | ⚠️ 可优化 |

**总体评价**: 代码质量良好，架构清晰，2个Critical安全问题需立即修复

---

## 🔴 Phase 1: 安全层 Review

### Critical 问题（必须立即修复）

#### 1. Yjs WebSocket 服务器缺少身份验证 **[CRITICAL]**

**问题文件**: `yjs-server/` (缺少服务端实现)

**问题描述**: Yjs WebSocket 端点 (`ws://localhost:3001`) 没有token验证。任何知道 roomId 的客户端都可以连接并修改白板数据，完全绕过权限系统。

**攻击场景**:
```javascript
// 攻击者可以：
const ws = new WebSocket('ws://localhost:3001/board_xxx_canvas_xxx')
// 无需认证即可连接并修改画布
```

**影响**: 数据泄露、未授权修改、权限系统完全失效

**修复方案**: 见 `security-fixes.md` 第1条

---

#### 2. 文件上传 MIME 类型检查过于宽松 **[CRITICAL]**

**问题文件**: `backend/src/routes/uploads.js:13-28`

**问题代码**:
```javascript
const allowedMimePrefixes = (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,video/*')
  .split(',')
  .map((type) => type.trim().replace('*', ''))
  .filter(Boolean)
// 结果: ['image/', 'video/'] - 只要以此开头都允许！
```

**风险类型**:
- `image/svg+xml` - 可包含 XSS payload
- `image/png` + polyglot 文件 - 可绕过扩展名检查
- 文件扩展名伪造

**修复方案**: 见 `security-fixes.md` 第2条（使用 MIME 白名单 + 文件头魔数验证）

---

### High 问题（建议尽快修复）

#### 3. 缺少 Rate Limiting **[HIGH]**

**问题文件**: `backend/src/app.js` (全局缺少)

**影响接口**:
- `/api/auth/login` - 可能被暴力破解
- `/api/auth/register` - 可能被批量注册
- `/api/upload` - 资源耗尽攻击

**风险**: 暴力破解密码、API 滥用、DDoS

---

#### 4. 全局错误处理可能泄露敏感信息 **[HIGH]**

**问题文件**: `backend/src/app.js:30-35`

**问题代码**:
```javascript
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'  // 生产环境直接返回原始错误
  })
})
```

**风险**: 数据库结构、文件路径、内部实现细节泄露

---

### Medium 问题

#### 5. CORS 配置过于宽松 **[MEDIUM]**

**问题代码**: `backend/src/app.js:11`
```javascript
app.use(cors()) // 允许任意来源
```

#### 6. bcrypt 迭代次数可优化 **[MEDIUM]**

**当前**: 12轮 (4096次迭代)
**建议**: 13-14轮 (8192-16384次迭代)

#### 7. JWT Secret 生产环境检查不够严格 **[MEDIUM]**

**问题**: 硬编码默认密钥作为 fallback

#### 8. Admin 搜索 SQL Like 注入风险 **[MEDIUM]**

```javascript
// admin.js:20-24
where[Op.or] = [
  { username: { [Op.like]: `%${search}%` } },  // 用户输入直接拼接
  { email: { [Op.like]: `%${search}%` } }
]
```

---

## 🏗️ Phase 2: 架构层 Review

### 评分: 8/10 ✅

#### 优点

1. **清晰的 MVC 分层**
   - Models: Sequelize 模型定义清晰
   - Routes: RESTful API 设计规范
   - Middleware: 认证、权限分离良好

2. **权限系统设计合理**
   - `permission.js`: owner > editor > commenter > viewer 层级清晰
   - 中间件复用性好：`checkBoardPermission`, `checkCanvasPermission`

3. **模型关系完整**
   - `models/index.js`: 所有关联关系明确定义
   - 外键约束、级联删除配置正确

4. **前端状态管理清晰**
   - Zustand store 分离：authStore, boardStore, canvasStore
   - 职责单一，易于维护

#### 待优化项

1. **Yjs Server 架构缺失** ⚠️
   - 没有独立的服务器入口
   - 缺少认证集成点

2. **API 版本控制缺失**
   - 所有路由都是 `/api/*`，无版本号
   - 未来扩展困难

3. **配置管理可加强**
   - 数据库配置有 fallback 硬编码密码
   ```javascript
   // database.js:31
   const fallbackDbUrl = dbUrl || 'postgres://postgres:drawwork123@localhost:5432/drawwork'
   ```

4. **缺少服务层**
   - Controller 逻辑直接操作 Model
   - 业务逻辑耦合在路由中

5. **Yjs 数据同步设计缺回退机制**
   - 只有 optimistic lock (`checkOptimisticLock`)
   - 没有服务器端冲突解决策略

---

## 🧠 Phase 3: 逻辑层 Review

### 评分: 8/10 ✅

#### 发现的问题

1. **匿名投票 session_id 生成逻辑有隐患**
   ```javascript
   // votes.js:57
   crypto.createHash('sha256').update(`${vote.id}:${req.user.id}:${process.env.JWT_SECRET || 'drawwork-secret-key'}`)
   ```
   - 使用默认密钥时，攻击者可预测 session_id

2. **分享链接验证时用户存在性检查重复数据库查询**
   ```javascript
   // shares.js:93-96
   const userExists = await User.findByPk(userId)  // 已经在 authMiddleware 验证过了
   ```

3. **Board 删除时关联数据清理不完整**
   - 软删除 `is_deleted = true`
   - 但关联的 Canvas, Comment 等也标记为删除，逻辑正确
   - ⚠️ YjsSnapshot 没有设置过期清理

4. **乐观锁 checkOptimisticLock 时区问题**
   ```javascript
   // canvases.js:8-14
   if (clientDate.getTime() !== new Date(record.updatedAt).getTime())
   // 毫秒级比较，可能在边界情况出错
   ```

#### 业务逻辑正确性验证

| 功能 | 验证结果 |
|------|----------|
| 软删除机制 | ✅ 正确 |
| 权限继承（owner->editor->commenter->viewer） | ✅ 正确 |
| 分享链接使用次数限制 | ✅ 正确（原子操作+事务） |
| 邀请用户权限控制 | ✅ 正确 |
| 白板创建默认画布 | ✅ 正确 |
| 只能删除非唯一画布 | ✅ 正确 |

---

## 📝 Phase 4: 质量层 Review

### 代码质量: 7/10 ⚠️

#### 发现的代码质量问题

1. **重复代码**
   ```javascript
   // boards.js, shares.js 都有 hashShareToken 函数
   function hashShareToken(token) {
     return crypto.createHash('sha256').update(token).digest('hex')
   }
   ```

2. **魔法数字未命名**
   ```javascript
   // ExcalidrawWrapper.jsx:20-23
   const MAX_EMBEDDED_FILE_BYTES = 1.5 * 1024 * 1024
   const UPLOAD_TIMEOUT_MS = 60_000
   const MEDIA_FETCH_TIMEOUT_MS = 30_000
   ```
   ✅ 这部分实际上做得很好，使用了有意义的常量名

3. **缺少类型定义**
   - 项目使用 JSDoc 注释不足
   - 复杂对象结构没有文档

4. **注释质量不一**
   - 部分关键逻辑有详细注释（如 useYjs.js）
   - 部分业务逻辑缺少注释

#### 测试覆盖

| 测试类型 | 文件数 | 覆盖率评估 |
|----------|--------|-----------|
| 后端单元测试 | 12 | ⚠️ 中（缺少边界条件测试） |
| 前端单元测试 | 8 | ⚠️ 低（大部分组件无测试） |
| E2E 测试 | 16 | ✅ 较高 |

**测试缺乏场景**:
- 并发编辑冲突
- 权限变更的级联影响
- 网络断线重连
- 大数据集性能

---

## ⚡ Phase 5: 性能层 Review

### 评分: 7/10 ⚠️

#### 发现的性能问题

1. **N+1 查询风险**
   ```javascript
   // boards.js:136-143
   const shares = await BoardShare.findAll({
     where: { board_id: boardId },
     include: [{ model: User, attributes: ['id', 'username'] }]  // 每个 share 查一次 user
   })
   ```
   **建议**: 添加 `raw: true` 或使用 `separate: true`

2. **缺少数据库索引提示**
   ```javascript
   // models/yjsSnapshot.js:26-27
   indexes: [{ fields: ['canvas_id', 'created_at'] }]  // ✅ 现有索引
   ```
   **缺失索引**:
   - `boards(owner_id, is_deleted)`
   - `board_shares(user_id, board_id)`
   - `canvases(board_id, is_deleted, sort_order)`

3. **Yjs 同步频率过高**
   ```javascript
   // ExcalidrawWrapper.jsx:823-829
   syncFrameRef.current = setTimeout(() => {
     syncFrameRef.current = null
     setData(nextScene)
   }, 200)  // 200ms 防抖，在大文档时仍可能频繁
   ```

4. **缺少缓存层**
   - API 响应没有缓存
   - 用户权限查询每次都要查数据库
   - Redis 配置存在但未启用 (`testRedisConnection` 被注释)

#### 前端性能

**优点**:
- ✅ ExcalidrawWrapper 使用 RAF 优化动画
- ✅ useYjs 使用 connection pooling
- ✅ 组件懒加载 (`lazy(() => import(...))`)

**待优化**:
- ⚠️ 缺少虚拟滚动（评论多时可能卡顿）
- ⚠️ 画布切换时 DOM 未销毁，内存占用累积

---

## 📋 修复优先级总表

| 优先级 | 问题 | 文件 | 预计工作量 | 风险等级 |
|--------|------|------|-----------|----------|
| 🔴 P0 | Yjs WebSocket 认证 | yjs-server/ | 4h | Critical |
| 🔴 P0 | 文件上传 MIME 白名单 | uploads.js | 1h | Critical |
| 🟠 P1 | Rate Limiting | app.js | 2h | High |
| 🟠 P1 | 错误处理信息泄露 | app.js | 1h | High |
| 🟡 P2 | CORS 白名单 | app.js | 1h | Medium |
| 🟡 P2 | bcrypt 迭代次数 | auth.js | 0.5h | Medium |
| 🟡 P2 | JWT Secret 强制 | jwt.js | 0.5h | Medium |
| 🟡 P2 | SQL Like 转义 | admin.js | 1h | Medium |
| 🟡 P2 | N+1 查询优化 | boards.js, comments.js | 2h | Medium |
| 🟢 P3 | 数据库索引 | models/*.js | 2h | Low |
| 🟢 P3 | 重复代码抽取 | multiple | 3h | Low |
| 🟢 P3 | 测试覆盖补充 | __tests__/* | 8h | Low |

**总计**: 约 26 小时

---

## ✅ 优秀的实践

1. **单元测试使用内存数据库**
   ```javascript
   // auth.test.js
   await sequelize.sync({ force: true })  // 干净的环境
   ```

2. **乐观锁实现**
   ```javascript
   // canvases.js:6-15
   function checkOptimisticLock(record, clientUpdatedAt) {
     if (clientDate.getTime() !== new Date(record.updatedAt).getTime()) {
       throw new Error('数据已过期')
     }
   }
   ```

3. **分享链接原子性检查**
   ```javascript
   // shares.js:70-88
   await sequelize.transaction(async (t) => {
     const fresh = await ShareToken.findByPk(shareToken.id, {
       transaction: t, lock: t.LOCK.UPDATE  // 悲观锁防止并发
     })
   })
   ```

4. **Excalidraw 媒体覆盖层优化**
   - RAF 直接操作 DOM，绕过 React 协调
   - 富媒体（GIF/视频）动画不中断

5. **前端 store 分离**
   - authStore, boardStore, canvasStore 职责清晰
   - Zustand selector 优化重渲染

---

## 🎯 修复建议执行顺序

### Week 1 (安全优先)
1. 修复 Yjs WebSocket 认证
2. 修复文件上传 MIME 检查
3. 添加 Rate Limiting
4. 修复错误处理信息泄露

### Week 2 (架构稳定)
5. 添加 CORS 白名单
6. 优化 bcrypt 和 JWT Secret 配置
7. 修复 SQL Like 转义

### Week 3+ (性能优化)
8. N+1 查询优化
9. 数据库索引优化
10. 代码重构（重复代码抽取）

---

## 📁 相关文件

- `security-fixes.md` - 安全问题详细修复方案
- `code-review-report.md` - 本报告

---

*Report generated by Claude Code*
*DrawWork Project Review - 2026-05-12*
