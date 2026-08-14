#!/usr/bin/env bash
#
# tsc-check.sh — ตรวจ TypeScript (tsc --noEmit) โดยยอม error เดิมใน baseline
#
# เหตุผล: โปรเจคมี type error สะสมอยู่แล้ว + next.config ใช้ ignoreBuildErrors
# → ถ้าบังคับ tsc 0 error ตรงๆ จะบล็อกทุก push
# → วิธีนี้บล็อกเฉพาะ "error ใหม่" ที่ยังไม่มีใน frontend/tsc-baseline.txt
#
# ใช้:
#   bash scripts/tsc-check.sh            (จาก repo root)
#   frontend/tsc-baseline.txt            = เอาต์พุต tsc ปัจจุบัน (commit ไว้ด้วย)
#   อัปเดต baseline: cd frontend && npx tsc --noEmit > tsc-baseline.txt 2>&1
#
# exit 0 = ผ่าน (0 error ใหม่) / exit 1 = มี error ใหม่ (บล็อก)

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
FRONT="$REPO_ROOT/frontend"
BASELINE="$FRONT/tsc-baseline.txt"

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

# normalize: ตัด (line,col) ออก → เปรียบเทียบที่ file + error code + message
# (line number เปลี่ยนได้ตามการแก้ไขไฟล์ จึงไม่นับเป็น error ใหม่)
NORM="$(printf '%s\n' "$OUT" | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//g' | sort -u)"

if [ -f "$BASELINE" ]; then
  BASE_NORM="$(grep "error TS" "$BASELINE" | sed -E 's/\([0-9]+,[0-9]+\)//g' | sort -u)"
else
  BASE_NORM=""
fi

NEW="$(comm -13 <(printf '%s\n' "$BASE_NORM") <(printf '%s\n' "$NORM"))"

N_TOTAL="$(printf '%s\n' "$NORM" | grep -c .)"
N_BASE="$(printf '%s\n' "$BASE_NORM" | grep -c .)"

if [ -n "$NEW" ]; then
  echo "[tsc-check] ❌ พบ TYPE ERROR ใหม่ (ไม่อยู่ใน $BASELINE):"
  printf '%s\n' "$NEW" | sed 's/^/    /'
  echo ""
  echo "[tsc-check] รวม $N_TOTAL จุด (เดิมใน baseline $N_BASE) — error ใหม่ = $(printf '%s\n' "$NEW" | grep -c .)"
  echo "[tsc-check] แก้ error ใหม่ก่อน push หรืออัปเดต baseline ถ้าจงใจ:"
  echo "           cd frontend && npx tsc --noEmit > tsc-baseline.txt 2>&1"
  exit 1
fi

echo "[tsc-check] ⚠️ มี error เดิมใน baseline $N_BASE จุด (ไม่บล็อก) — error ใหม่ = 0 ✅"
exit 0
