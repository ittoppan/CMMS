#!/usr/bin/env bash
#
# phpstan-check.sh — ตรวจ PHP ด้วย PHPStan (phpstan.neon: level 3 + baseline)
#
# ใช้:
#   bash scripts/phpstan-check.sh        (จาก repo root)
#
# ต้องมีก่อน: composer install  (ติดตั้ง vendor/bin/phpstan)
#
# exit 0 = ผ่าน (ไม่มี error ใหม่) / exit 1 = พบ error (บล็อก push)
# error เดิม 60 รายการถูกล็อกไว้ใน phpstan-baseline.neon — ห้ามเพิ่มเข้า baseline
# ให้แก้โค้ดจริง (หรือถ้าแก้หมดแล้ว PHPStan จะฟ้องว่า pattern ไม่ match → ลบออก)

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
cd "$REPO_ROOT" || exit 1

if ! command -v php >/dev/null 2>&1; then
  echo "[phpstan] ⚠️ ไม่พบ php ใน PATH — ข้ามการตรวจ"
  exit 0
fi

if [ ! -x vendor/bin/phpstan ]; then
  echo "[phpstan] ⚠️ ยังไม่มี vendor/bin/phpstan — ข้าม (รัน: composer install)"
  exit 0
fi

OUT="$(vendor/bin/phpstan analyse --no-progress --memory-limit=1G 2>&1)"
RC=$?

if [ $RC -eq 0 ]; then
  echo "[phpstan] ✅ ผ่าน — ไม่มี error ใหม่ (level 3 + baseline)"
  exit 0
fi

echo "[phpstan] ❌ BLOCKED: PHPStan พบ error — แก้โค้ด (อย่าเพิ่มเข้า baseline)"
printf '%s\n' "$OUT" | tail -40 | sed 's/^/    /'
exit 1
