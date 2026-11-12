#!/usr/bin/env bash
set -euo pipefail

# CMMS smoke check - verifies key pages/APIs respond.
# Usage: BASE_URL=http://localhost:3001 SESSION_COOKIE='PHPSESSID=...' ./scripts/smoke-check.sh
# If SESSION_COOKIE is not provided, only public/login endpoints are checked.

BASE_URL="${BASE_URL:-http://localhost:3001}"
COOKIE_HEADER=()
if [[ -n "${SESSION_COOKIE:-}" ]]; then
  COOKIE_HEADER=(-H "Cookie: ${SESSION_COOKIE}")
fi

fail=0
pass=0

check() {
  local name="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${COOKIE_HEADER[@]}" "$url" || echo "000")
  if [[ "$code" == "$expect" || "$expect" == "2xx" && "$code" =~ ^2 ]]; then
    echo "[PASS] $name ($code)"
    pass=$((pass+1))
  else
    echo "[FAIL] $name (got $code, expected $expect) -> $url"
    fail=$((fail+1))
  fi
}

echo "== CMMS Smoke Check =="
echo "BASE_URL=$BASE_URL"

# Public/basic
check "login page" "$BASE_URL/login" 200
check "api csrf" "$BASE_URL/api/v1/csrf.php" 200

if [[ -n "${SESSION_COOKIE:-}" ]]; then
  check "home" "$BASE_URL/home" 200
  check "settings hub" "$BASE_URL/settings" 200
  check "settings repair options" "$BASE_URL/settings/repair-options" 200
  check "repair list" "$BASE_URL/repair" 200
  check "spare parts" "$BASE_URL/spare_parts" 200
  check "users" "$BASE_URL/users" 200
  check "pm plans" "$BASE_URL/pm_am/plans" 200
  check "inspections templates" "$BASE_URL/inspections/templates" 200
  check "reports" "$BASE_URL/reports" 200
  check "api repair list" "$BASE_URL/api/v1/repair.php" 200
  check "api spare parts page1" "$BASE_URL/api/v1/spare_parts.php?limit=20&page=1" 200
  check "api users" "$BASE_URL/api/v1/users.php" 200
else
  echo "[INFO] SESSION_COOKIE not set; skipping authenticated checks"
fi

echo "== Result: PASS=$pass FAIL=$fail =="
if [[ $fail -gt 0 ]]; then
  exit 1
fi
exit 0
