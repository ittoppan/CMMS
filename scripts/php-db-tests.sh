#!/usr/bin/env bash
#
# php-db-tests.sh — รันชุดทดสอบ PHP ที่ต้องใช้ฐานข้อมูล (scratch database) สำหรับ CI
#
# แต่ละชุดใน scripts/test_*.php จะ clone โครงสร้างจาก DB ที่ .env ชี้ไว้ ไปยัง
# <db>_coretest / <db>_misctest ของตัวเอง แล้วลบเมื่อจบ — ข้อมูลจริงไม่ถูกเขียน
#
# ต้องมีก่อนรัน:
#   1) MySQL ที่ใช้งานได้ + .env ชี้ไป DB ที่มี schema ครบ (ใน CI: DB_NAME=cmms_ci
#      ที่สร้างด้วย `php scripts/ci-bootstrap-db.php cmms_ci`)
#   2) ส่วนขยาย pdo_mysql
#
# ใช้:
#   bash scripts/php-db-tests.sh
#
# รายการนี้คือชุดที่ "ผ่านบน schema ครบแต่ข้อมูลว่าง" (ตรวจเมื่อ 2026-11-19: 31/31 ผ่าน)
# ชุดที่ยังไม่ใส่ เพราะต้องมีข้อมูล seed จริง (roles/settings/notification_templates):
#   test_asset_reliability.php, test_shutdown.php,
#   test_phase32_document_control.php, test_phase32_engineering_change.php
# ชุดที่ต้องมี HTTP server (ไม่ใส่ใน CI): test_csrf.php, test_phase32_api.php, test_phase35_api.php

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1

if ! command -v php >/dev/null 2>&1; then
  echo "[php-db-tests] ⚠️ ไม่พบ php ใน PATH"
  exit 1
fi

ENV_FILE="$REPO_ROOT/.env"
DB_NAME_FROM_ENV="$(grep -E '^DB_NAME=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')"
echo "[php-db-tests] DB_NAME=${DB_NAME_FROM_ENV:-unknown} (tests create their own <db>_*test scratch databases)"
case "${DB_NAME_FROM_ENV:-}" in
  *_ci) ;;
  *) echo "[php-db-tests] ⚠️ ไม่ใช่ DB ที่ลงท้าย _ci — ในเครื่อง dev ถือว่าปกติ (ใช้ scratch DB) แต่ใน CI ต้องเป็น cmms_ci" ;;
esac

TESTS=(
  test_analytics.php
  test_approval_service.php
  test_auth.php
  test_calibration.php
  test_contractor.php
  test_core_helpers.php
  test_cost.php
  test_dispatch_service.php
  test_document_control.php
  test_engineering_change.php
  test_failure.php
  test_iot.php
  test_knowledge.php
  test_kpi.php
  test_menu_nav.php
  test_misc_helpers.php
  test_next_code.php
  test_notification_center.php
  test_notifications.php
  test_phase35_shutdown.php
  test_phase36_engine.php
  test_planning.php
  test_reports.php
  test_reliability.php
  test_safety.php
  test_sage300.php
  test_scan.php
  test_security.php
  test_services.php
  test_spare_optimization.php
  test_workforce.php
)

FAILED=0
PASSED=0
for t in "${TESTS[@]}"; do
  path="$REPO_ROOT/scripts/$t"
  if [ ! -f "$path" ]; then
    echo "[php-db-tests] ⚠️ ไม่พบ scripts/$t — ข้าม"
    continue
  fi
  out="$(php "$path" 2>&1)"
  rc=$?
  summary="$(printf '%s\n' "$out" | grep -oiE 'PASS [0-9]+ +FAIL [0-9]+' | tail -1)"
  if [ "$rc" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    printf '[php-db-tests] ✅ %-34s %s\n' "$t" "$summary"
  else
    FAILED=$((FAILED + 1))
    printf '[php-db-tests] ❌ %-34s exit=%s %s\n' "$t" "$rc" "$summary"
    printf '%s\n' "$out" | tail -12 | sed 's/^/      /'
  fi
done

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "[php-db-tests] ❌ $FAILED ชุดไม่ผ่าน (ผ่าน $PASSED)"
  exit 1
fi
echo "[php-db-tests] ✅ ผ่านทุกชุด ($PASSED)"
exit 0
