#!/usr/bin/env bash
#
# gen-ci-schema.sh — regenerate database/ci_schema_structure.sql (structure only, no rows)
#
# ทำไมต้องมี: CI (job `phpdb`) ต้องมี schema ครบ 253 ตาราง เพื่อให้ scripts/test_*.php
# ที่ใช้ scratch database รันได้ — แต่ไฟล์ SQL ในรีโป (schema.sql + migration_*.sql)
# พึ่งพากันเอง สร้างได้ไม่ครบ และมี `USE cmms_tpt;` ที่เสี่ยงไปเขียน DB จริง
#
# ⚠️ ไฟล์ผลลัพธ์มี "โครงสร้างเท่านั้น" (mysqldump --no-data) — ห้ามมีข้อมูลลูกค้า/secret
#
# ใช้ (บนเครื่องที่ต่อ DB จริงได้ และมี .env):
#   bash scripts/gen-ci-schema.sh
#
# หลังแก้ schema (migration ใหม่) ให้ regenerate แล้ว commit ไฟล์ผลลัพธ์ด้วย

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
OUT="$REPO_ROOT/database/ci_schema_structure.sql"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[gen-ci-schema] ⚠️ ไม่พบ .env — ต้องมี DB_HOST/DB_USER/DB_PASS/DB_NAME"
  exit 1
fi

# อ่านค่าจาก .env (ไม่ echo ค่า secret)
get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'\r'; }
DB_HOST="$(get DB_HOST)"; DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(get DB_PORT)"; DB_PORT="${DB_PORT:-3306}"
DB_USER="$(get DB_USER)"; DB_USER="${DB_USER:-root}"
DB_NAME="$(get DB_NAME)"; DB_NAME="${DB_NAME:-cmms_tpt}"

DUMP=""
for c in "$(command -v mysqldump 2>/dev/null)" \
         "/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe" \
         "/c/Program Files/MySQL/MySQL Server 5.7/bin/mysqldump.exe"; do
  if [ -n "$c" ] && [ -x "$c" ]; then DUMP="$c"; break; fi
done
if [ -z "$DUMP" ]; then
  echo "[gen-ci-schema] ⚠️ ไม่พบ mysqldump"
  exit 1
fi

export MYSQL_PWD="$(get DB_PASS)"

{
  printf -- "-- CMMS-TPT — structure-only schema for CI (generated, no rows, no routines)\n"
  printf -- "-- regenerate: bash scripts/gen-ci-schema.sh  (mysqldump --no-data --skip-triggers --no-tablespaces)\n\n"
  "$DUMP" -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" \
    --no-data --skip-triggers --no-tablespaces --skip-comments \
    --set-gtid-purged=OFF --single-transaction "$DB_NAME"
} > "$OUT" || { echo "[gen-ci-schema] ❌ mysqldump ล้มเหลว"; exit 1; }

TABLES="$(grep -c '^CREATE TABLE' "$OUT")"
INSERTS="$(grep -c '^INSERT' "$OUT" || true)"
echo "[gen-ci-schema] ✅ $OUT  tables=$TABLES inserts=$INSERTS  (ต้องได้ tables ครบและ inserts=0)"
[ "$INSERTS" -eq 0 ] || { echo "[gen-ci-schema] ❌ พบ INSERT — dump นี้ต้องมีโครงสร้างเท่านั้น"; exit 1; }
