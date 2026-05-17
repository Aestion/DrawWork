#!/bin/bash
# ============================================
# DrawWork 备份脚本
# ============================================

set -e

BACKUP_DIR="${BACKUP_DIR:-/opt/drawwork/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
HOSTNAME=$(hostname)

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

echo "[$(date)] 开始备份..."

# 备份数据库
echo "[$(date)] 备份数据库..."
docker exec drawwork-postgres pg_dump -U postgres drawwork | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"

# 备份文件存储
echo "[$(date)] 备份文件..."
tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" -C /opt/drawwork/data minio 2>/dev/null || true

# 备份配置文件
echo "[$(date)] 备份配置..."
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" -C /opt/drawwork config

# 创建备份信息文件
cat > "$BACKUP_DIR/info_${DATE}.txt" << EOF
备份时间: $(date)
服务器: $HOSTNAME
数据库: db_${DATE}.sql.gz
文件: uploads_${DATE}.tar.gz
配置: config_${DATE}.tar.gz
EOF

echo "[$(date)] 备份完成:"
ls -lh "$BACKUP_DIR"/*_${DATE}.*

# 清理旧备份
echo "[$(date)] 清理 ${RETENTION_DAYS} 天前的备份..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -delete

# 计算备份大小
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$(date)] 当前备份目录大小: $BACKUP_SIZE"

echo "[$(date)] 备份流程结束"
