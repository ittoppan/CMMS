#!/usr/bin/env bash
#
# next-build-check.sh — ตรวจว่า `next build` (output:standalone) ผ่านครบ
#
# เหตุผล: เหตุการณ์ล็อกอินไม่ได้ (2026-08-30) เกิดจาก Turbopack build fail
#   (Unterminated regexp / JSX ไม่ปิด) โดยที่ `tsc --noEmit` ผ่าน — เพราะ tsc
#   ตรวจเฉพาะ type ไม่ได้ตรวจ ecmascript parse/build จริงของ Turbopack
#   → build ค้างกลายเป็น .next ที่ไม่มี standalone/server.js → ensure-next ฟ้อง
#     server.js not found → :3001 ล่ม → เข้าใช้งานระบบไม่ได้
#   ตรงนี้จะจับ error นั้นได้ก่อน push
#
# สำคัญ — build ไปที่ distDir แยก (.next-verify-check) ไม่ใช่ .next:
#   โปรเจกต์นี้รันอยู่บนเครื่อง production (node server.js :3001 ถือ CWD ที่
#   .next/standalone) — ถ้า build เขียนทับ .next จะเจอ EBUSY ไฟล์ถูกล็อก หรือ
#   อาจไปรบกวน server ที่กำลังรัน → ใช้ $env:NEXT_DIST_DIR (next.config.ts) แยก
#   จาก .next ที่ server ใช้ — เหมือนที่ deploy-next.ps1 ทำกับ .next-verify
#
# ใช้:
#   bash scripts/next-build-check.sh      (จาก repo root)
#
# exit 0 = ผ่าน / exit 1 = build พัง (บล็อก push)
# ข้าม: git push --no-verify (ไม่แนะนำ)

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
FRONT="$REPO_ROOT/frontend"
DIST_DIR=".next-verify-check"

if [ ! -d "$FRONT/node_modules" ]; then
  echo "[next-build] ⚠️ frontend/node_modules ไม่มี — ข้าม (รัน npm ci ก่อน)"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[next-build] ⚠️ ไม่พบ npm — ข้ามการตรวจ"
  exit 0
fi

cd "$FRONT" || exit 1

# เคลียร์ dist แยกเดิม (ไม่แตะ .next ที่ server ใช้)
rm -rf "$DIST_DIR"

echo "[next-build] npm run build -> distDir=$DIST_DIR ..."
# แยก error ออกจาก output (Next 16 เขียน error ไป stderr)
BUILD_OUT="$(NEXT_DIST_DIR="$DIST_DIR" npm run build 2>&1)"
RC=$?

# next build (distDir ≠ .next) auto-rewrite next-env.d.ts / tsconfig.json →
# ต้อง restore กลับให้ working tree สะอาด (ไม่ทิ้ง diff ปลอมไว้ตอน push)
restore_generated() {
  git checkout -- "$FRONT/next-env.d.ts" "$FRONT/tsconfig.json" 2>/dev/null
  rm -rf "$FRONT/$DIST_DIR"
}

if [ $RC -ne 0 ]; then
  echo "[next-build] ❌ BLOCKED: next build พัง (exit $RC) — ต้องแก้ก่อน push"
  printf '%s\n' "$BUILD_OUT" | grep -iE "error|failed|unterminated|expected|missing|EBUSY" | tail -30 | sed 's/^/    /'
  restore_generated
  exit 1
fi

if [ ! -f "$FRONT/$DIST_DIR/standalone/server.js" ]; then
  echo "[next-build] ❌ BLOCKED: next build ผ่านแต่ $DIST_DIR/standalone/server.js ไม่เกิด"
  echo "    ตรวจ next.config.ts output:'standalone' + turbopack.root ว่าตั้งถูกไหม"
  restore_generated
  exit 1
fi

if [ ! -f "$FRONT/$DIST_DIR/BUILD_ID" ]; then
  echo "[next-build] ❌ BLOCKED: $DIST_DIR/BUILD_ID ไม่เกิด — build ไม่สมบูรณ์"
  restore_generated
  exit 1
fi

BUILD_ID="$(cat "$FRONT/$DIST_DIR/BUILD_ID" 2>/dev/null)"
restore_generated

echo "[next-build] ✅ ผ่าน — BUILD_ID=${BUILD_ID:-?}  standalone/server.js มีอยู่"
exit 0
