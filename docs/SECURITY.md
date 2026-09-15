# SECURITY — นโยบายและเอกสารความปลอดภัย (Phase 18)

> เวอร์ชัน: 2026-09-15 · ใช้กับ CMMS-TPT

เอกสารนี้สรุปกลไกความปลอดภัยที่ใช้ (และบังคับใช้) ทั้งระบบ ตั้งแต่
การยืนยันตัวตน → สิทธิ์แบบ RBAC → บันทึกตรวจสอบ → การจัดการความลับ →
CORS/CSRF → hardening headers → มาตรฐาน error response

---

## 1. หลักการบังคับใช้ (Non-Negotiable)

1. ทุก endpoint ที่คืน/เปลี่ยนข้อมูล ต้องเริ่มจาก `requireLogin()` เสมอ
   (ไม่อนุญาตให้เข้าถึงข้อมูล โดยไม่ login — ยกเว้น `login.php`, `csrf.php`)
2. ทุก endpoint ที่ **เปลี่ยนข้อมูล** (POST/PUT/PATCH/DELETE) ต้องผ่าน
   `enforceCsrf()` (จาก `src/csrf.php`) — ห้ามเขียน endpoint ใหม่แล้วลืม
3. การกำหนดสิทธิ์ใช้ **RBAC กลาง** — ห้ามแก้ `if ($user['role'] == ...)`
   แบบกระจัดกระจาย เพิ่ม/แก้สิทธิ์ที่ `src/helpers/permissions.php`
   (ตาราง `PERMISSION_MATRIX`) แล้วเรียก `requirePerm($pdo, $module, $action)`
4. **ห้าม commit secrets** — token/password/.env ลงใน git (ดูข้อ 5)
5. **ห้ามเปิดเผยค่า secret ผ่าน API** — คืนค่าเป็น `••••••••` (sentinel
   `SETTING_MASKED`) เสมอ ดูข้อ 6
6. **ห้าม CORS wildcard** (`Access-Control-Allow-Origin: *`) — ใช้
   `cmms_cors_headers()` (เฉพาะ origin ที่เชื่อถือได้)
7. Error response มาตรฐาน: `{ "success": false, "error": "…", "code": "…" }`
   — ห้ามหลุด stack trace / SQL error ออกไป client (`api_fail`,
   `api_forbidden` ใน `src/helpers/api.php`)

---

## 2. การยืนยันตัวตน (Session)

ไฟล์: `src/auth.php`, `public/api/auth/login.php`, `public/logout.php`

| เรื่อง | รายละเอียด |
|---|---|
| Cookie | `httponly` + `samesite=Lax` + `secure` เมื่อเข้า via HTTPS (`cmms_secure_session`) |
| Regenerate | `session_regenerate_id()` ทุกครั้งที่ login และทุก ~10 นาที (`cmms_enforce_session_lifecycle`) |
| Idle timeout | อ่านจาก settings `session_timeout_mins` (default 120) → ตอบ `SESSION_EXPIRED` |
| รหัส error | `UNAUTHENTICATED` (ยังไม่ login), `SESSION_EXPIRED` (หมดเวลา), `FORBIDDEN` (admin-only) |
| Audit | `LOGIN` / `LOGIN_FAIL`(severity=security) / `LOGOUT` |

ตรวจสอบได้ด้วย: `php scripts/security_check.php` (ข้อ 1 — ทุก endpoint
ที่ไม่มี session ต้องตอบ `401 UNAUTHENTICATED`)

---

## 3. สิทธิ์ (RBAC) — Permission Matrix

ไฟล์: `src/helpers/permissions.php`

- ตาราง `PERMISSION_MATRIX` กำหนด `module` × `action` ต่อ role
  (actions หลัก: `view`, `create`, `update`, `delete`, `approve`,
  `complete`, `verify`, `close`, `manage`)
- บทบาท: 1 Admin, 2 Manager, 6 Asst. Manager ≈ Manager,
  7 Foreman, 3 Technician, 4 Operator, 5 Viewer
- หลักการ default-safe: **deny by default** — ผู้ดูแลระบบ (1) ได้ทั้งหมด,
  `settings:manage` ให้ Admin เท่านั้น ส่วน role อื่นได้ `settings:view`
- override รายบุคคล: `user_permissions` (ถ้ามีแถว → override ชนะ matrix)
- Helper:
  - `canPerm($pdo, $module, $action)` — ตรวจ session user
  - `requirePerm($pdo, $module, $action, $msg)` — ไม่ผ่าน → `api_forbidden()`
    (ตอบ 403 + บันทึก `PERMISSION_DENIED` severity=security)
  - `perm_allowed($pdo, $roleId, $module, $action)`
  - `permModuleAliases($module)` — แมปคีย์เมนู (เช่น `reports/monthly_pdf`)
    ไปยังโมดูลหลัก (เช่น `reports`)
- **การเรียกตรวจสอบต้องใช้ชื่ออัลลีแอส ไม่ใช่ path นิยามเองดื้อ ๆ**

### สิทธิ์หน้า Audit Log
`audit_log:view` ให้กับ Admin/Manager/Asst. Manager เท่านั้น (role 1,2,6)
หน้า `/audit-log` และ sidebar กรองด้วยเมนู `menu_permissions.audit_log`
ที่ seed ไว้แล้ว (role เหล่าอื่นจะเห็น AccessDenied)

---

## 4. บันทึกตรวจสอบ (Audit Log)

ไฟล์: `src/helpers/audit.php`, API `public/api/v1/audit_logs.php`,
ตาราง `audit_logs`

- เขียนแบบ **append-only** — ไม่มี API แก้/ลบ (แต่ `scripts/security_check.php`
  ลบแถวทดสอบ `SECURITY_CHECK` ได้ — ใช้เฉพาะ script)
- เรียก: `audit_log($pdo, $action, $resourceType, $resourceId, $description, $oldValue, $newValue, $severity)`
- severity: `info` | `warning` | `security` (`PERMISSION_DENIED` และ
  `LOGIN_FAIL` ใช้ `security`)
- ข้อมูลอัตโนมัติ: user จาก session, IP (`REMOTE_ADDR`/`X-Forwarded-For`),
  User-Agent (ตัด 250), `X-Request-ID` (request correlation)
- `old_value`/`new_value` ถูก JSON-encode (ตัด 4000 ตัว) และกรองคีย์ลับ
  (ถ้าคีย์ตรง `API_SECRET_KEYS` → mask ไม่บันทึกค่าจริง)
- API: `GET /api/v1/audit_logs.php`
  - รายการ: `page`, `limit` (≤100), `from`, `to`, `user_id`, `action`,
    `resource`, `severity`, `search` → `{ items, total, page, limit, pages }`
  - รายละเอียด: `?id=123` → decode `old_value`/`new_value` เป็น object
  - ตัวเลือกตัวกรอง: `?filters=1`
  - วิธีอื่น (POST/PUT…) → `405 METHOD_NOT_ALLOWED`

### event หลักที่บันทึก
`LOGIN`, `LOGIN_FAIL`, `LOGOUT`, `PERMISSION_DENIED`,
`USER_CREATE/USER_UPDATE/USER_DELETE`, `ROLE_CREATE/ROLE_UPDATE/ROLE_DELETE`,
`PERMISSION_CHANGE`, `SETTING_CHANGE/SETTING_ADD`, `PASSWORD_CHANGE`,
`PROFILE_UPDATE`, `REPORT_EXPORT`, `REQUEST_APPROVE/REQUEST_REJECT/REQUEST_CANCEL`,
`WORK_ORDER_COMPLETE/WORK_ORDER_VERIFY/WORK_ORDER_CLOSE`

---

## 5. การจัดการความลับ (Secrets)

- อ่านจาก `.env` หรือ environment variable เท่านั้น (`src/config/env.php`,
  `src/helpers/sage300.php` ใช้ `envFileFrom`/`envPersist`)
- `.env` อยู่ใน `.gitignore` — **ห้าม commit** (เคยมี bot token รั่วใน
  ประวัติ git → revoke แล้วลบจากประวัติ)
- `.gitignore` cover: `.env`, `.env.*`, `*.local`, temp
- Sage 300: **ไม่มีค่า default** ในโค้ด — ถ้าไม่มี env → คืน error ชัดเจน
  (เดิมมี `sa`/`sql2u` fallback → ลบแล้ว) ตั้งได้จากหน้า
  `/settings/sage300` (มีเฉพาะ admin + ผ่าน CSRF)

---

## 6. Masks ของค่าลับใน API

ไฟล์: `src/helpers/api.php`

- `apiIsSecretKey($key)` — key ตรงรายการ `API_SECRET_KEYS` หรือมีคำว่า
  `token/secret/private` หรือลงท้าย `_pass/password`
- `apiMaskSecret($value)` → sentinel `••••••••` (`SETTING_MASKED`)
- `apiMaskSettingsRows($rows)` — สำหรับแถว settings (เพิ่ม flag `masked`)
- `apiMaskSecretArray($data)` — สำหรับ payload env/notif (mask ตามชื่อคีย์)
- **flow ฝั่ง client**: ถ้า payload ส่งค่า `••••••••` กลับมาในคีย์ลับ →
  backend **ข้าม** ไม่เขียนทับค่าเดิม (ใช้ใน settings / line_notify /
  email_notify / sage300_config)

---

## 7. CORS / CSRF

ไฟล์: `src/csrf.php`

### CORS (`cmms_cors_headers`)
- ส่ง `Access-Control-Allow-Origin` เฉพาะเมื่อ origin ผ่าน `csrfTrustedOrigin()`
  (host == HTTP_HOST หรือ loopback หรือ RFC1918 LAN หรืออยู่ใน
  `ALLOWED_ORIGINS` env / `settings.allowed_origins` แบบ wildcard `*.domain`)
- OPTIONS preflight: อนุญาต `GET, POST, PUT, PATCH, DELETE`,
  headers `Content-Type, X-CSRF-Token, X-Request-ID, Origin`

### CSRF (`enforceCsrf`)
ตรวจ (อย่างใดอย่างหนึ่งผ่าน = OK):
1. `X-CSRF-Token` header / `_csrf` / `csrf_token` เทียบ `$_SESSION['csrf_token']`
   (ใช้ `hash_equals`)
2. `Origin` อยู่ใน trusted (Next.js proxy → Origin ของเบราว์เซอร์)
3. `Referer` อยู่ใน trusted

- Webhook LINE (`line_webhook.php`) ยกเว้น — ยืนยันด้วย signature จาก LINE
- ตอบไม่ผ่าน → `403` + ข้อความ JSON (ไม่เปิดเผยรายละเอียด)

---

## 8. Security Headers

### Next.js (`frontend/next.config.ts` headers)
`/:path*`:
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`,
`Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
`X-Permitted-Cross-Domain-Policies: none`

### IIS/PHP (`web.config`)
`<httpProtocol><customHeaders>` — เดียวกัน (X-Frame-Options DENY,
nosniff, Referrer-Policy, Permissions-Policy, X-Permitted-Cross-Domain-Policies)
+ URL Rewrite ไป `public/`, hidden segments (`.env`, `.git`, `src`,
`database`, `node_modules`) และ block `.env/.sql/.log` extensions

---

## 9. Error Response มาตรฐาน

```
{ "success": false, "error": "<ข้อความ Thai ป้องกันผู้ใช้>", "code": "UPPER_SNAKE" }
```

| Code | HTTP | ความหมาย |
|---|---|---|
| `UNAUTHENTICATED` | 401 | ยังไม่ login (session ไม่มี) |
| `SESSION_EXPIRED` | 401 | login หมดเวลา idle |
| `FORBIDDEN` | 403 | ต้องการสิทธิ์ admin/เฉพาะ แต่ role ไม่พอ |
| `PERMISSION_DENIED` | 403 | `requirePerm` ปฏิเสธ (บันทึก audit ด้วย) |
| `INVALID_CREDENTIALS` | 401 | login ผิด user/pass |
| `VALIDATION_ERROR` | 400 | ข้อมูล input ไม่ถูกต้อง |
| `NOT_FOUND` | 404 | ไม่พบข้อมูล |
| `CONFLICT` | 409 | ซ้ำ/ขัดแย้ง |
| `METHOD_NOT_ALLOWED` | 405 | ใช้ method ไม่ถูก (เช่น เขียนลง audit_logs) |
| `INTERNAL_ERROR` | 500 | ผิดพลาดภายใน (log ฝั่ง server) |

---

## 10. การตรวจสอบอัตโนมัติ

`php scripts/security_check.php`

| หมวด | ตรวจอะไร |
|---|---|
| [1] Auth | ทุก endpoint ต้อง 401 `UNAUTHENTICATED` ไม่มี session |
| [2] CSRF | POST ไม่มี token → ไม่ใช่ 200 (403/401) |
| [3] CORS | ไม่พบ `header('Access-Control-Allow-Origin: *')` ใน `public/`,`src/` |
| [4] Mask | `apiMaskSecret` / `apiMaskSettingsRows` (mask คีย์ลับ, ไม่ mask คีย์ธรรมดา) |
| [5] Matrix | 9 case: admin/manager/asst ดู audit ได้, tech/viewer กันไว้, settings:manage = admin เท่านั้น |
| [6] Audit | `audit_log()` เขียน-อ่านจริง + ล้าง test rows |

ผ่าน = exit 0 / "32 passed, 0 failed" ใช้เป็นเงื่อนไขก่อน push (pre-push hook)

---

## 11. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| `src/auth.php` | session + `requireLogin()` |
| `src/csrf.php` | CSRF token/origin + CORS headers |
| `src/helpers/api.php` | `api_fail`, `api_forbidden`, masking |
| `src/helpers/audit.php` | `audit_log()` |
| `src/helpers/permissions.php` | `PERMISSION_MATRIX`, `canPerm/requirePerm` |
| `src/menu_catalog.php` | รายการเมนู (sidebar/settings) — `audit_log` เพิ่มแล้ว |
| `public/api/v1/audit_logs.php` | API อ่าน audit log |
| `database/migration_20260915_phase18_security.sql` | schema `audit_logs` + seed |
| `scripts/apply_phase18_security.php` | ใช้กับ DB จริงที่รันอยู่แล้ว (idempotent) |
| `scripts/security_check.php` | ตรวจความปลอดภัยอัตโนมัติ |
| `frontend/components/access-denied.tsx` | หน้าแจ้งไม่มีสิทธิ์ |
| `frontend/app/(dashboard)/audit-log/page.tsx` | UI บันทึกตรวจสอบ |