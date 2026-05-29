#!/bin/bash
# ============================================
# DrawWork 备份脚本
# ============================================

set -e

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
HOSTNAME=$(hostname)

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

echo "[$(date)] 开始备份..."

# 备份数据库
echo "[$(date)] 备份数据库..."
docker exec drawwork-postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"

# 备份文件存储
echo "[$(date)] 备份文件..."
tar -czf "$BACKUP_DIR/files_${DATE}.tar.gz" -C "$PROJECT_DIR/data" minio uploads 2>/dev/null || true

# 备份配置文件
echo "[$(date)] 备份配置..."
tar -czf "$BACKUP_DIR/deploy_${DATE}.tar.gz" -C "$PROJECT_DIR" deploy

# 创建备份信息文件
cat > "$BACKUP_DIR/info_${DATE}.txt" << EOF
备份时间: $(date)
服务器: $HOSTNAME
数据库: db_${DATE}.sql.gz
文件: files_${DATE}.tar.gz
部署配置: deploy_${DATE}.tar.gz
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
