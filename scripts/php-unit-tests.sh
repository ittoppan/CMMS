#!/usr/bin/env bash
#
# php-unit-tests.sh — รันชุดทดสอบ PHP ที่ "ไม่ต้องใช้ DB" ทั้งหมด (เร็ว, ไม่เขียนข้อมูล)
#
# ใช้ร่วมกัน 2 ที่ เพื่อไม่ให้รายการทดสอบเพี้ยนกัน:
#   - pre-push hook (scripts/git-hooks/pre-push) — ก่อน tsc/next build เพื่อรู้ผลเร็ว
#   - CI (.github/workflows/ci.yml, job phplint) — ตรวจซ้ำบน GitHub
#
# กติกาการรับเข้า list นี้: สคริปต์ต้องรันได้บนเครื่องที่ไม่มี MySQL / ไม่มี .env
#   - ห้าม require src/config/db.php และห้ามเรียก getDb()
#   - ห้ามใช้ HTTP จริง (พอร์ต 8081/3001) หรือสร้าง scratch database
#   → สคริปต์ที่ต้องใช้ DB (ส่วนใหญ่ใน scripts/test_*.php) ยังต้องรันมือบนเครื่องที่มี DB
#
# ใช้:
#   bash scripts/php-unit-tests.sh          # exit 0 = ผ่านทุกชุด, 1 = มีชุดที่ไม่ผ่าน
#
# เพิ่มชุดใหม่: เติม path ใน TESTS ด้านล่าง (และตรวจว่าผ่านกติกาข้างบน)

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1

if ! command -v php >/dev/null 2>&1; then
  echo "[php-tests] ⚠️ ไม่พบ php ใน PATH — ข้ามชุดทดสอบ PHP"
  exit 0
fi

# ชุดทดสอบที่ไม่ใช้ DB
TESTS=(
  "scripts/test_pm_reminders_reset.php"   # กติกา reset last_notified_at (accept vs reopen)
  "scripts/test_xlsx.php"                 # writer/reader Excel (ไม่มี DB เลย)
)

FAILED=0
RAN=0
for t in "${TESTS[@]}"; do
  path="$REPO_ROOT/$t"
  if [ ! -f "$path" ]; then
    echo "[php-tests] ⚠️ ไม่พบ $t — ข้าม"
    continue
  fi
  echo ""
  echo "[php-tests] php $t"
  if php "$path"; then
    RAN=$((RAN + 1))
  else
    echo "[php-tests] ❌ FAIL: $t"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "[php-tests] ❌ $FAILED ชุดไม่ผ่าน (ผ่าน $RAN) — แก้ก่อน push"
  exit 1
fi
echo "[php-tests] ✅ ผ่านทุกชุด ($RAN)"
exit 0
