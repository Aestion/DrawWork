# DrawWork 内网部署优化方案

> 适用场景：公司内部使用，有内网服务器  
> 核心目标：功能稳定、数据安全、操作便利

---

## 一、架构调整（内网版）

```
┌─────────────────────────────────────────────────────────────┐
│                       公司内网环境                           │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   员工电脑    │    │   员工电脑    │    │   员工电脑    │  │
│  │  (浏览器)     │    │  (浏览器)     │    │  (浏览器)     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         └───────────────────┼───────────────────┘          │
│                             ▼                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                   公司内网服务器                       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │ │
│  │  │   Nginx     │  │  Node.js    │  │ PostgreSQL  │   │ │
│  │  │  (静态文件)  │  │  y-websocket│  │   (数据)    │   │ │
│  │  │  + 反向代理  │  │  + API      │  │             │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │ │
│  │  ┌─────────────┐  ┌─────────────┐                    │ │
│  │  │   Minio     │  │  Redis      │                    │ │
│  │  │  (文件存储)  │  │  (缓存/会话) │                    │ │
│  │  └─────────────┘  └─────────────┘                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
│  访问地址: http://drawwork.company.local 或内网IP            │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、技术栈选择（稳定优先）

| 组件 | 选择 | 理由 |
|------|------|------|
| **前端** | React 18 + Excalidraw 0.17.6 | 稳定版本，避免最新版 Bug |
| **后端 API** | Node.js + Express | 成熟稳定，团队熟悉度高 |
| **实时协作** | y-websocket (官方) | 最稳定的 Yjs WebSocket 实现 |
| **数据库** | PostgreSQL 15 | 企业级稳定，支持 JSON/数组 |
| **认证** | 自建 JWT + bcrypt | 内网无需 OAuth，简单可靠 |
| **文件存储** | Minio | S3 兼容，内网部署简单 |
| **缓存/会话** | Redis 7 | 会话管理、在线状态 |
| **反向代理** | Nginx | 静态文件、负载均衡、SSL |
| **容器化** | Docker Compose | 一键部署，便于维护 |

---

## 三、关键优化点

### 3.1 一键部署脚本

```bash
#!/bin/bash
# deploy.sh - 一键部署脚本

echo "🚀 DrawWork 内网部署脚本"

# 检查 Docker
docker --version || (echo "请先安装 Docker" && exit 1)
docker-compose --version || (echo "请先安装 Docker Compose" && exit 1)

# 创建目录
mkdir -p /opt/drawwork/{data,logs,uploads}
cd /opt/drawwork

# 下载配置
curl -O https://raw.githubusercontent.com/your-repo/drawwork/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/your-repo/drawwork/main/.env.example
cp .env.example .env

# 配置环境变量
read -p "请输入内网域名或IP: " HOST
echo "APP_URL=http://$HOST" >> .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env

# 启动服务
docker-compose up -d

echo "✅ 部署完成！"
echo "访问地址: http://$HOST"
echo "管理员账号: admin / admin123"
```

### 3.2 Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/dist:/usr/share/nginx/html
      - ./uploads:/var/www/uploads
    depends_on:
      - api
      - yjs
    restart: always

  api:
    image: drawwork/api:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://postgres:password@postgres:5432/drawwork
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./logs:/app/logs
    depends_on:
      - postgres
      - redis
      - minio
    restart: always

  yjs:
    image: drawwork/yjs:latest
    environment:
      - REDIS_URL=redis://redis:6379
      - API_URL=http://api:3000
    ports:
      - "3001:3001"
    depends_on:
      - redis
      - api
    restart: always
    # 多实例部署时：
    # deploy:
    #   replicas: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD:-drawwork123}
      - POSTGRES_DB=drawwork
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./backups:/backups
    restart: always
    # 自动备份
    command: >
      sh -c "
        echo '0 2 * * * pg_dump -U postgres drawwork > /backups/drawwork_$(date +\%Y\%m\%d).sql' | crontab -
        docker-entrypoint.sh postgres
      "

  redis:
    image: redis:7-alpine
    volumes:
      - ./data/redis:/data
    restart: always

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=${MINIO_PASSWORD:-minio123456}
    volumes:
      - ./data/minio:/data
    restart: always

  # 可选：管理后台
  adminer:
    image: adminer
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    restart: always
```

### 3.3 Nginx 配置（负载均衡 + 静态文件）

```nginx
# nginx.conf
upstream yjs_backend {
    ip_hash;  # 保持 WebSocket 会话
    server yjs:3001;
    # 多实例时：
    # server yjs2:3001;
    # server yjs3:3001;
}

upstream api_backend {
    server api:3000;
}

server {
    listen 80;
    server_name _;
    client_max_body_size 100M;

    # 前端静态文件
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api/ {
        proxy_pass http://api_backend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://yjs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # WebSocket 长连接
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # 文件存储
    location /uploads/ {
        alias /var/www/uploads/;
        expires 1y;
    }

    # Minio 控制台（仅内网）
    location /minio/ {
        proxy_pass http://minio:9001/;
        proxy_set_header Host $host;
    }
}
```

---

## 四、功能稳定性优化

### 4.1 数据安全（三重保障）

```
┌─────────────────────────────────────────────────────────────┐
│                     数据安全保障                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 实时同步                                          │
│  ├── Yjs CRDT 自动合并冲突                                  │
│  ├── WebSocket 断线重连                                     │
│  └── 本地 IndexedDB 缓存                                    │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 定期快照                                          │
│  ├── 每 30 秒自动保存到 PostgreSQL                          │
│  ├── 每画布保留最近 50 个版本                               │
│  └── 支持历史版本回滚                                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 定时备份                                          │
│  ├── 每日凌晨 2 点自动全量备份                              │
│  ├── 保留最近 30 天备份                                     │
│  └── 支持一键恢复                                           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 自动备份脚本

```bash
#!/bin/bash
# backup.sh - 每日自动备份

BACKUP_DIR="/opt/drawwork/backups"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

# 备份数据库
docker exec drawwork_postgres_1 pg_dump -U postgres drawwork > "$BACKUP_DIR/db_$DATE.sql"

# 备份文件存储
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" /opt/drawwork/uploads

# 清理旧备份
find $BACKUP_DIR -name "db_*.sql" -mtime +$KEEP_DAYS -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +$KEEP_DAYS -delete

# 发送通知（可选）
echo "备份完成: $DATE" | mail -s "DrawWork 每日备份" admin@company.com
```

### 4.3 监控与健康检查

```javascript
// 健康检查端点
app.get('/health', async (req, res) => {
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkMinio(),
    checkDiskSpace()
  ])
  
  const allHealthy = checks.every(c => c.status === 'ok')
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: checks
  })
})

// 前端定期健康检查
setInterval(async () => {
  const res = await fetch('/api/health')
  if (!res.ok) {
    // 显示系统维护提示
    showMaintenanceWarning()
  }
}, 30000)
```

---

## 五、操作便利性优化

### 5.1 管理员后台

```javascript
// 内置简单管理界面
app.get('/admin', requireAdmin, (req, res) => {
  res.send(`
    <h1>DrawWork 管理后台</h1>
    
    <h2>系统状态</h2>
    <ul>
      <li>数据库: ${dbStatus}</li>
      <li>Redis: ${redisStatus}</li>
      <li>在线用户: ${onlineUsers}</li>
      <li>磁盘使用: ${diskUsage}</li>
    </ul>
    
    <h2>用户管理</h2>
    <table>
      <tr><th>用户名</th><th>画板数</th><th>操作</th></tr>
      ${users.map(u => `
        <tr>
          <td>${u.username}</td>
          <td>${u.boardCount}</td>
          <td>
            <button onclick="resetPassword('${u.id}')">重置密码</button>
            <button onclick="deleteUser('${u.id}')">删除</button>
          </td>
        </tr>
      `).join('')}
    </table>
    
    <h2>备份管理</h2>
    <button onclick="createBackup()">立即备份</button>
    <button onclick="downloadLatestBackup()">下载最新备份</button>
    
    <h2>系统设置</h2>
    <form>
      <label>最大文件上传大小: <input type="number" value="50" /> MB</label>
      <label>自动保存间隔: <input type="number" value="30" /> 秒</label>
      <button type="submit">保存设置</button>
    </form>
  `)
})
```

### 5.2 用户自助功能

```javascript
// 功能列表
const userFeatures = {
  // 数据导出
  'export-board': async (boardId) => {
    const data = await exportBoardData(boardId)
    downloadJSON(data, `board-${boardId}.json`)
  },
  
  // 批量导入
  'import-boards': async (files) => {
    for (const file of files) {
      await importBoardFromJSON(file)
    }
  },
  
  // 回收站
  'trash': {
    list: async () => await getDeletedBoards(),
    restore: async (boardId) => await restoreBoard(boardId),
    permanentDelete: async (boardId) => await permanentDeleteBoard(boardId)
  },
  
  // 快捷键
  'shortcuts': {
    'Ctrl+S': '手动保存',
    'Ctrl+Z': '撤销',
    'Ctrl+Shift+Z': '重做',
    'Ctrl+D': '复制选中元素',
    'Delete': '删除选中元素',
    'Space+Drag': '平移画布'
  }
}
```

### 5.3 一键更新脚本

```bash
#!/bin/bash
# update.sh - 一键更新到最新版本

echo "🔄 DrawWork 更新脚本"

cd /opt/drawwork

# 备份当前数据
echo "📦 备份当前数据..."
./backup.sh

# 拉取最新镜像
echo "⬇️ 拉取最新版本..."
docker-compose pull

# 停止服务
echo "🛑 停止当前服务..."
docker-compose down

# 运行数据库迁移（如果有）
echo "🔄 运行数据库迁移..."
docker-compose run --rm api npm run migrate

# 启动服务
echo "🚀 启动服务..."
docker-compose up -d

# 健康检查
echo "✅ 检查服务状态..."
sleep 5
curl -f http://localhost/health || (echo "❌ 更新失败，请检查日志" && exit 1)

echo "✅ 更新完成！"
```

---

## 六、实施计划（内网版）

### Phase 0：服务器准备（1天）

- [ ] 确认服务器配置（建议 4核8G+，SSD）
- [ ] 安装 Docker + Docker Compose
- [ ] 配置内网域名/IP
- [ ] 开放必要端口（80/443/3001）

### Phase 1：基础设施部署（1天）

- [ ] 部署 PostgreSQL + Redis
- [ ] 部署 Minio
- [ ] 配置 Nginx
- [ ] 部署 y-websocket
- [ ] 配置自动备份

### Phase 2：后端 API（2天）

- [ ] 用户认证（JWT）
- [ ] 画板/画布 CRUD
- [ ] 分享功能
- [ ] 文件上传

### Phase 3：前端开发（3天）

- [ ] Excalidraw 集成
- [ ] 画板/画布管理
- [ ] 分享界面
- [ ] 媒体文件支持

### Phase 4：实时协作（2天）

- [ ] Yjs 集成
- [ ] 权限控制
- [ ] 在线用户显示
- [ ] 断线重连

### Phase 5：测试优化（2天）

- [ ] 多人压力测试
- [ ] 性能优化
- [ ] 使用培训文档
- [ ] 部署上线

**总工期：11天**

---

## 七、运维手册

### 日常维护

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api
docker-compose logs -f yjs

# 重启服务
docker-compose restart api

# 查看磁盘使用
df -h

# 清理旧日志
docker system prune -f
```

### 故障排查

| 问题 | 排查命令 | 解决方案 |
|------|---------|---------|
| 无法访问 | `curl http://localhost/health` | 检查 Nginx 和防火墙 |
| 协作不同步 | `docker-compose logs yjs` | 重启 yjs 服务 |
| 登录失败 | `docker-compose logs api` | 检查数据库连接 |
| 磁盘满了 | `df -h` | 清理备份文件 |

---

## 八、与之前方案的对比

| 维度 | 公网云服务方案 | 内网部署方案（本方案） |
|------|--------------|---------------------|
| **部署位置** | Supabase + Vercel | 公司内网服务器 |
| **数据安全** | 云端托管 | 完全内网，物理隔离 |
| **访问方式** | 公网域名 | 内网 IP/域名 |
| **维护成本** | $0-65/月 | 服务器折旧（已存在） |
| **部署要求** | 低 | 需要 Docker 知识 |
| **扩展性** | 自动扩展 | 手动扩容 |
| **定制性** | 受限 | 完全可控 |

---

*方案版本: v2.0*  
*适用场景: 公司内部使用*  
*更新日期: 2026-04-25*
