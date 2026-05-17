# 成本分析：自建服务器 vs 云服务

## 一句话结论

是的，如果用你的电脑作为服务器，**可以省下云服务费用**，但会带来**新的隐性成本和风险**。

---

## 当前方案成本构成

| 服务 | 用途 | 免费档 | 付费档 |
|------|------|--------|--------|
| Supabase | 数据库 + 认证 + 存储 | $0 | $25/月 |
| PartyKit/Render | WebSocket 服务器 | $0-5 | $20/月 |
| Vercel | 前端托管 | $0 | $20/月 |
| **总计** | | **$0** | **$65/月** |

**大部分成本确实是服务器成本**，只有 Supabase 的数据库存储是"必须"的（除非你自建数据库）。

---

## 自建服务器方案

### 可行架构

```
你的电脑 (作为服务器)
  ├── PostgreSQL (数据库)
  ├── Node.js + y-websocket (实时协作)
  ├── Minio (文件存储)
  └── Nginx (反向代理)
         ↑
      公网访问 (内网穿透)
         ↑
    用户浏览器
```

### 需要的条件

1. **公网 IP 或内网穿透**
   - 家庭宽带通常没有公网 IP
   - 需要用 frp/ngrok/cf tunnel 做内网穿透
   - 或者申请动态域名解析 (DDNS)

2. **电脑保持开机**
   - 关机 = 服务不可用
   - 建议用旧电脑/NAS/树莓派专门做服务器

3. **网络稳定**
   - 上传带宽要够（多人协作需要）
   - 电信/联通/移动的上行通常 30-100Mbps

---

## 自建 vs 云服务 对比

### 成本对比

| 项目 | 云服务 (Supabase+PartyKit) | 自建 (你的电脑) |
|------|---------------------------|----------------|
| **直接成本** | $0-65/月 | $0 |
| **电费** | - | 约 30-100W × 24h ≈ **15-50元/月** |
| **网络** | - | 已包含在宽带费中 |
| **硬件折旧** | - | 旧电脑假设价值 1000元，3年折旧 ≈ **28元/月** |
| **维护时间** | 几乎为0 | 每月 **2-10小时** (更新/重启/排障) |
| **可靠性成本** | SLA 99.9% | 断电/断网 = 服务中断，无 SLA |

**实际成本**：
- 云服务：$0-65/月 ≈ **0-450元/月**
- 自建：电费 15-50元 + 折旧 28元 + 时间成本 = **约 50-100元/月** (折算)

### 技术对比

| 维度 | 云服务 | 自建 |
|------|--------|------|
| **部署难度** | 低 (一键部署) | 中高 (需配置环境) |
| **维护工作量** | 几乎为0 | 中等 (需定期更新) |
| **可靠性** | 高 (自动备份/故障转移) | 低 (取决于你的网络和电力) |
| **访问速度** | 全球 CDN | 取决于你的上行带宽 |
| **扩展性** | 随时升级 | 受限于硬件 |
| **数据安全** | 专业团队维护 | 你自己负责备份 |
| **外网访问** | 直接访问 | 需要内网穿透 |

### 适用场景

**适合自建的情况**：
- ✅ 你只是自己用 + 少量朋友
- ✅ 你有稳定的公网 IP 或愿意折腾内网穿透
- ✅ 你有24小时开机的设备（NAS/旧电脑）
- ✅ 你愿意承担数据丢失风险（需自己备份）
- ✅ 你想学习服务器运维

**适合云服务的情况**：
- ✅ 要给其他人使用（需要稳定）
- ✅ 你没有公网 IP
- ✅ 不想折腾服务器维护
- ✅ 数据安全要求高
- ✅ 可能需要随时扩展

---

## 混合方案（推荐）

如果你有一台24小时开机的电脑/NAS，可以采用混合方案：

```
方案1：全自建
├── 你的电脑
│   ├── PostgreSQL
│   ├── y-websocket
│   ├── Minio
│   └── 前端静态文件
└── 成本：电费 ~30元/月

方案2：半自建（推荐）
├── Supabase (免费档)
│   ├── PostgreSQL (数据库)
│   ├── Auth (认证)
│   └── Storage (文件存储，可选)
├── 你的电脑
│   └── y-websocket (仅实时协作)
└── 成本：$0 + 电费 ~15元/月

方案3：最小化自建
├── Supabase (免费档) - 数据持久化
├── 你的电脑 - 仅运行 y-websocket
├── 前端托管在 Vercel (免费)
└── 成本：$0 + 电费 ~10元/月
```

### 混合方案实施

**只在你的电脑上跑 y-websocket**：

```javascript
// server.js (在你的电脑上运行)
const WebSocket = require('ws')
const http = require('http')
const { setupWSConnection } = require('y-websocket/bin/utils')

const server = http.createServer()
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
  // 这里可以接入 Supabase 验证 token
  setupWSConnection(ws, req)
})

server.listen(3001, () => {
  console.log('Yjs WebSocket server running on port 3001')
})
```

**内网穿透 (使用 Cloudflare Tunnel)**：

```bash
# 在你的电脑上安装 cloudflared
# Windows: 下载 exe
# Mac: brew install cloudflared
# Linux: 见文档

# 登录 Cloudflare
cloudflared tunnel login

# 创建隧道
cloudflared tunnel create drawwork

# 配置隧道 (~/.cloudflared/config.yml)
tunnel: <你的隧道ID>
credentials-file: ~/.cloudflared/<隧道ID>.json

ingress:
  - hostname: yjs.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404

# 启动隧道
cloudflared tunnel run drawwork
```

**免费获得**：
- `https://yjs.yourdomain.com` → 你的电脑的 3001 端口
- Cloudflare 提供 CDN 加速
- 无需公网 IP
- 免费

---

## 如果你坚持全自建

### 需要的软件栈

```bash
# 1. 安装 PostgreSQL
# Windows: 下载安装包
# Mac: brew install postgresql
# Linux: apt install postgresql

# 2. 安装 Minio (文件存储)
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
./minio server /data

# 3. 安装 Node.js
# 然后运行 y-websocket 服务器

# 4. Nginx (反向代理 + 前端静态文件)
# 配置示例见下文
```

### Nginx 配置

```nginx
# /etc/nginx/nginx.conf

server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/drawwork/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 转发到 Supabase (如果你用 Supabase)
    # 或者转发到本地后端 (如果全自建)
    location /api/ {
        proxy_pass http://localhost:3000/;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Minio 存储
    location /storage/ {
        proxy_pass http://localhost:9000/;
    }
}
```

---

## 我的建议

### 推荐方案：混合模式

| 组件 | 部署位置 | 理由 |
|------|----------|------|
| **数据库** | Supabase (免费) | 数据最重要，云服务更可靠 |
| **认证** | Supabase (免费) | 安全敏感，交给专业团队 |
| **文件存储** | Supabase 或本地 Minio | 小文件用云端，大文件用本地 |
| **实时协作** | **你的电脑** | 只需要一个 WebSocket 服务 |
| **前端** | Vercel (免费) 或 本地 Nginx | 都可以 |

**优势**：
- 数据库有自动备份，数据安全
- 协作服务器自建，省下一部分费用
- 即使你的电脑关机，画板数据还在
- 协作功能只是临时不可用，重新开机即可恢复

### 如果全自建，请做好以下准备

1. **数据备份脚本** (每天自动执行)
```bash
#!/bin/bash
# backup.sh
pg_dump drawwork > /backup/drawwork_$(date +%Y%m%d).sql
rsync -av /backup/ user@remote-server:/backups/
```

2. **自动重启脚本**
```bash
# 使用 pm2 或 systemd 管理服务
pm2 start yjs-server.js --name drawwork-yjs
pm2 start minio --name drawwork-storage
pm2 save
pm2 startup
```

3. **监控告警**
```bash
# 简单的健康检查脚本
curl -f http://localhost:3001/health || send-alert-email
```

---

## 最终对比表

| 维度 | 全云服务 | 全自建 | 混合 (推荐) |
|------|---------|--------|------------|
| **月成本** | $0-65 | 50-100元 | $0-10元 |
| **可靠性** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **维护量** | 极低 | 高 | 低 |
| **数据安全** | 高 | 中 (看你自己) | 高 |
| **上线难度** | 简单 | 复杂 | 中等 |
| **扩展性** | 好 | 差 | 好 |

---

*分析日期: 2026-04-25*
