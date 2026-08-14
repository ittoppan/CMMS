#!/usr/bin/env bash
#
# tsc-check.sh — ตรวจ TypeScript (tsc --noEmit) แบบบังคับ 0 error
#
# เหตุผล: ล้าง type error ครบแล้ว (96 จุด → 0) ไม่มี debt เหลือ
# → บังคับ tsc 0 error แบบเต็ม — error ตัวไหนก็ BLOCK หมด
#
# ใช้:
#   bash scripts/tsc-check.sh            (จาก repo root)
#
# exit 0 = ผ่าน (0 error) / exit 1 = มี type error (บล็อก)

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
FRONT="$REPO_ROOT/frontend"

if [ ! -d "$FRONT/node_modules" ]; then
  echo "[tsc-check] ⚠️ frontend/node_modules ไม่มี — ข้าม (รัน npm ci ก่อน)"
  exit 0
fi

cd "$FRONT" || exit 1

if ! command -v npx >/dev/null 2>&1; then
  echo "[tsc-check] ⚠️ ไม่พบ npx — ข้ามการตรวจ"
  exit 0
fi

OUT="$(npx tsc --noEmit 2>&1)"
RC=$?

if [ $RC -eq 0 ]; then
  echo "[tsc-check] ✅ tsc ผ่าน — ไม่มี type error"
  exit 0
fi

echo "[tsc-check] ❌ BLOCKED: พบ TypeScript error — ต้องแก้ให้ครบ 0 ก่อน push"
printf '%s\n' "$OUT" | grep "error TS" | sed 's/^/    /'
exit 1
