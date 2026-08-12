#!/usr/bin/env bash
# ============================================================
# CMMS-TPT Backup Script — ฐานข้อมูล + โฟลเดอร์ uploads
#
# วิธีใช้:
#   ./scripts/backup.sh                 # backup ทั้งหมด (DB + uploads)
#   ./scripts/backup.sh --db-only       # เฉพาะฐานข้อมูล
#   ./scripts/backup.sh --uploads-only  # เฉพาะไฟล์อัปโหลด
#
# ตั้งค่าใน .env (หรือ environment):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
#   BACKUP_DIR          (ค่าเริ่มต้น: <project>/backups)
#   BACKUP_RETENTION_DAYS (ค่าเริ่มต้น: 30 — ลบ backup เก่ากว่า N วัน)
#
# ตั้ง cron (Linux) / Task Scheduler (Windows + Git Bash):
#   0 2 * * *  /path/to/project/scripts/backup.sh >> /path/to/project/logs/backup.log 2>&1
# ============================================================
set -euo pipefail

# ── locate project root (โฟลเดอร์ที่มี .env) ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── load .env ────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . <(grep -E '^(DB_|BACKUP_|APP_NAME)' "$PROJECT_ROOT/.env" | sed 's/^/export /' || true)
    set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-cmms_tpt}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
APP_NAME="${APP_NAME:-cmms-tpt}"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
UPLOADS_DIR="$PROJECT_ROOT/public/uploads"

STAMP="$(date +%Y%m%d_%H%M%S)"
MODE="${1:-all}"

mkdir -p "$BACKUP_DIR"
echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') — start (mode=$MODE, retention=${RETENTION_DAYS}d)"

# ── 1. Database dump ─────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "--db-only" ]; then
    # หา mysqldump: PATH -> MYSQLDUMP env -> ตำแหน่งติดตั้ง Windows ทั่วไป
    MYSQLDUMP="${MYSQLDUMP:-}"
    if [ -z "$MYSQLDUMP" ] && command -v mysqldump >/dev/null 2>&1; then
        MYSQLDUMP="$(command -v mysqldump)"
    fi
    if [ -z "$MYSQLDUMP" ]; then
        while IFS= read -r cand; do
            [ -z "$cand" ] && continue
            if [ -x "$cand" ]; then MYSQLDUMP="$cand"; break; fi
        done <<'EOF'
/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe
/c/Program Files/MySQL/MySQL Server 5.7/bin/mysqldump.exe
/c/xampp/mysql/bin/mysqldump.exe
/c/Program Files/MySQL/MySQL Workbench 8.0/mysqldump.exe
EOF
    fi
    if [ -n "$MYSQLDUMP" ]; then
        DB_FILE="$BACKUP_DIR/${APP_NAME}_db_${STAMP}.sql"
        if [ -n "$DB_PASS" ]; then
            MYSQL_PWD="$DB_PASS" "$MYSQLDUMP" -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" \
                --single-transaction --routines --triggers --default-character-set=utf8mb4 \
                "$DB_NAME" > "$DB_FILE"
        else
            "$MYSQLDUMP" -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" \
                --single-transaction --routines --triggers --default-character-set=utf8mb4 \
                "$DB_NAME" > "$DB_FILE"
        fi
        # gzip (ลบ .sql เปล่า ถ้า gzip ไม่มี)
        if command -v gzip >/dev/null 2>&1; then
            gzip -f "$DB_FILE"
            echo "[backup] DB dump: ${DB_FILE}.gz ($(du -h "${DB_FILE}.gz" | cut -f1))"
        else
            echo "[backup] DB dump: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"
        fi
    else
        echo "[backup] ⚠️  ไม่พบ mysqldump ใน PATH — ข้ามการสำรอง DB (ติดตั้ง MySQL client)"
    fi
fi

# ── 2. Uploads ───────────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "--uploads-only" ]; then
    if [ -d "$UPLOADS_DIR" ]; then
        if command -v tar >/dev/null 2>&1; then
            UP_FILE="$BACKUP_DIR/${APP_NAME}_uploads_${STAMP}.tar.gz"
            # tar exit 1 = มีไฟล์เปลี่ยน/หายระหว่าง backup (ปกติ) — ไม่ถือว่าล้มเหลว
            # exit 2 = ข้อผิดพลาดร้ายแรง — ล้มเหลวจริง
            set +e
            tar -czf "$UP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>>"$BACKUP_DIR/backup_warnings.log"
            TAR_RC=$?
            set -e
            if [ "$TAR_RC" -gt 1 ]; then
                echo "[backup] ⚠️ tar ล้มเหลว (exit $TAR_RC) — ข้ามการสำรอง uploads"
                rm -f "$UP_FILE"
            else
                echo "[backup] Uploads: $UP_FILE ($(du -h "$UP_FILE" | cut -f1))"
                [ "$TAR_RC" -eq 1 ] && echo "[backup] (มีไฟล์ที่เปลี่ยนระหว่าง backup — ดู backup_warnings.log)"
            fi
        elif command -v zip >/dev/null 2>&1; then
            UP_FILE="$BACKUP_DIR/${APP_NAME}_uploads_${STAMP}.zip"
            (cd "$(dirname "$UPLOADS_DIR")" && zip -rq "$UP_FILE" "$(basename "$UPLOADS_DIR")")
            echo "[backup] Uploads: $UP_FILE ($(du -h "$UP_FILE" | cut -f1))"
        else
            echo "[backup] ⚠️  ไม่พบ tar/zip — ข้ามการสำรอง uploads"
        fi
    else
        echo "[backup] ไม่พบโฟลเดอร์ uploads ($UPLOADS_DIR) — ข้าม"
    fi
fi

# ── 3. ลบ backup เก่า ────────────────────────────────────────
if [ "$RETENTION_DAYS" -gt 0 ]; then
    DELETED=$(find "$BACKUP_DIR" -type f \( -name '*.sql' -o -name '*.sql.gz' -o -name '*.tar.gz' -o -name '*.zip' \) \
        -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
    echo "[backup] ลบไฟล์ backup เก่ากว่า ${RETENTION_DAYS} วัน: $DELETED ไฟล์"
fi

echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') — done ✅  (โฟลเดอร์: $BACKUP_DIR)"
