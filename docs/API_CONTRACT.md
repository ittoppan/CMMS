# API CONTRACT — CMMS-TPT (REST / JSON)

> เวอร์ชัน: 2026-09-16 · ดูนโยบายที่เกี่ยวข้องใน `docs/SECURITY.md`
> (Phase 19 เพิ่ม idempotency/conflict ของ offline sync — §12-13)

API ทั้งหมดเป็น PHP ภายใต้ `public/api/v1/*.php` เซิร์ฟโดย IIS (port 8081)
และผ่าน proxy ฝั่ง Next.js ที่ `/api/*` (ดู `frontend/next.config.ts` rewrites)

---

## 1. รูปแบบทั่วไป

- Content-Type: `application/json; charset=utf-8`
- Authentication: session cookie (`HttpOnly`, `SameSite=Lax`)
- การเปลี่ยนข้อมูล: client ต้องส่ง header `X-CSRF-Token` (ดูข้อ 2)
- **Error มาตรฐาน** (ทุก endpoint):

```json
{ "success": false, "error": "ข้อความ", "code": "UNAUTHENTICATED" }
```

| Code | HTTP | เมื่อไหร่ |
|---|---|---|
| `UNAUTHENTICATED` | 401 | ยังไม่ login |
| `SESSION_EXPIRED` | 401 | session หมดเวลา |
| `PERMISSION_DENIED` | 403 | role ไม่มีสิทธิ์ (`requirePerm`) |
| `FORBIDDEN` | 403 | ต้องการ admin (หรือ CSRF ถูกปิดหน้า) |
| `INVALID_CREDENTIALS` | 401 | login ผิด |
| `VALIDATION_ERROR` | 400 | input ผิด |
| `NOT_FOUND` | 404 | ไม่พบข้อมูล |
| `CONFLICT` | 409 | ขัดแย้ง/ซ้ำ |
| `METHOD_NOT_ALLOWED` | 405 | method ไม่รองรับ |
| `INTERNAL_ERROR` | 500 | error ภายใน (log ไว้ server) |

---

## 2. CSRF Flow

1. `GET /api/v1/csrf.php` → `{ "csrf_token": "…" }` (สร้าง session + token)
   - ใช้ cache 1 ครั้งต่อ session ฝั่ง client (`frontend/lib/api.ts`)
2. ทุก POST/PUT/PATCH/DELETE → header `X-CSRF-Token: <token>`
   - โยงกับ `$_SESSION['csrf_token']` ด้วย `hash_equals`
   - fallback: `_csrf`/`csrf_token` ใน POST body หรือ JSON body
   - fallback origin/referer เมื่อผ่าน trusted origin (Next proxy)
3. `enforceCsrf()` (จาก `src/csrf.php`) → ไม่ผ่าน ตอบ `403` และหยุดทันที

Frontend รายใหม่ใช้ `apiFetch()` / `apiJson()` ใน `frontend/lib/api.ts`
ซึ่งเพิ่ม token ให้อัตโนมัติ

---

## 3. Auth

### `POST /public/api/auth/login.php` (proxy: `/api/auth/login.php`)
Body: `{ "username": string, "password": string }`
- สำเร็จ → 200 `{ "status": "ok", "message": "…", "user": {...} }`
- ผิด → 401 `{ code: "INVALID_CREDENTIALS" }` (บันทึก `LOGIN_FAIL`,
  severity `security`)
- สำเร็จบันทึก `LOGIN`, `session_regenerate_id()`

### `GET /public/logout.php` (proxy: `/logout.php`)
- ล้าง cookie + session → บันทึก `LOGOUT` → redirect หน้า login

---

## 4. Audit Log

### `GET /api/v1/audit_logs.php`
สิทธิ์: `audit_log:view` (role 1,2,6) — อื่นตอบ 403 `PERMISSION_DENIED`

**รายการ** — query params:
| param | ค่า | ความหมาย |
|---|---|---|
| `page` | int ≥1 | หน้า (default 1) |
| `limit` | 1..100 | ต่อหน้า (default 50) |
| `from` | `YYYY-MM-DD` | ตั้งแต่ |
| `to` | `YYYY-MM-DD` | ถึง |
| `user_id` | int | ผู้ใช้ |
| `action` | string | filter action ตรงตัว |
| `resource` | string | filter resource_type |
| `severity` | `info`/`warning`/`security` | ระดับ |
| `search` | string | LIKE กับ description/user_name/action/resource_type |

Response 200:
```json
{
  "items": [
    {
      "id": 1, "created_at": "2026-09-15 12:00:00",
      "user_id": "1", "user_name": "Admin",
      "action": "LOGIN", "resource_type": "auth", "resource_id": "",
      "description": "…", "severity": "info",
      "ip_address": "127.0.0.1", "user_agent": "…", "request_id": "…"
    }
  ],
  "total": 123, "page": 1, "limit": 50, "pages": 3
}
```

**รายละเอียด** `?id=<id>` → 200 row เดียว (`old_value`/`new_value`
decode เป็น JSON object ถ้าเป็น JSON ที่ถูกต้อง); 404 `NOT_FOUND` ถ้าไม่มี

**Filter options** `?filters=1` →
`{ "actions": [], "users": [{user_id,user_name}], "resources": [], "severities": [...] }`

**อื่นๆ**: POST/PUT/DELETE → 405 `METHOD_NOT_ALLOWED` (append-only)

---

## 5. Settings

### `GET/PUT /api/v1/settings.php`
- GET: ต้อง login; ค่าลับคืนเป็น `"••••••••"` + flag `masked: true`
- POST/PUT: ต้อง `settings:manage` (admin เท่านั้นตาม matrix) มิฉะนั้น 403
  `PERMISSION_DENIED`
- ค่าลับที่ส่งกลับมาเป็น `"••••••••"` → backend **ข้าม** ไม่เขียนทับ
- บันทึก `SETTING_CHANGE`/`SETTING_ADD`

### `GET/PUT /api/v1/line_notify.php`, `GET/PUT /api/v1/email_notify.php`
- การเขียน: `settings:manage` ยกเว้น `bind_liff_user_id` (ผูกบัญชี LINE
  ของตัวเอง — อนุญาตทุก role)
- GET → mask ค่าลับ; PUT ส่ง `"••••••••"` → ข้ามเขียนทับ

### `GET/PUT /api/v1/pwa_settings.php`
- การเขียน: `requireLogin($pdo, true)` (admin)

---

## 6. User / Role / Permission

| Endpoint | สิทธิ์ | Audit |
|---|---|---|
| `users.php` GET | login | — |
| `users.php` POST/PUT/DELETE | admin | `USER_CREATE/USER_UPDATE/USER_DELETE` |
| `roles.php` GET | login | — |
| `roles.php` POST/PUT/DELETE | admin (ผ่าน `requireLogin($pdo,true)`) | `ROLE_*` |
| `menu_permissions.php` GET/PUT | login / admin เขียน | `PERMISSION_CHANGE` |
| `profile.php` GET/PUT | login | `PROFILE_UPDATE`, `PASSWORD_CHANGE` (warning) |

### Permission check helper (`src/helpers/permissions.php`)
```
requirePerm($pdo, $module, $action, $message?)   // 403 + audit ถ้าไม่มีสิทธิ์
canPerm($pdo, $module, $action)                  // bool
perm_allowed($pdo, $roleId, $module, $action)    // bool
permModuleAliases($module)                       // map เมนู key → โมดูลหลัก
```
`PERMISSION_MATRIX` แสดงโมดูล × action ต่อ role (ดู `SECURITY.md` §3)

---

## 7. Reports

### `GET /api/v1/reports.php` (+ `?export=excel|csv|pdf`)
- ต้อง login; บันทึก `REPORT_EXPORT`
- ตรวจสอบความถูกต้องของรูปแบบ export (ลิสต์รูปที่ backend รองรับจริง)

---

## 8. Sage 300 (การเงิน/คลัง)

- `src/helpers/sage300.php` — อ่าน credential จาก `.env` เท่านั้น
  (`SAGE300_DB_DSN/USER/PASS`, `ODBC_DSN`) — **ไม่มีค่า default/fallback**
  ในโค้ด
- `public/pages/settings/sage300_config.php` — admin เท่านั้น + `enforceCsrf()`
- รหัสผ่านจะไม่แสดงค่าจริง (แสดง `••••••••`) และไม่ส่ง user/pass ผ่าน
  frontend ค่าใหม่

---

## 9. Import Excel

### `GET/POST /api/v1/import_excel.php?action=...`
- action: `template` (GET), `validate` (POST multipart), `errors_xlsx`
  (POST JSON), `import` (POST JSON), `history` (GET)
- dataset: `repair | asset | pm_am | spare_parts | calibration`
- ต้อง login; POST ทั้งหมดบังคับ CSRF (`enforceCsrf`)
- ตรวจซ้ำฝั่ง server + transaction; max 5000 rows / 10MB
- identifier whitelist (`^[a-zA-Z_][a-zA-Z0-9_]*$`) สำหรับ table/column
  ที่ใช้ใน SQL (defense-in-depth)

---

## 10. PWA / Misc

- `GET /api/v1/csrf.php` — สร้าง/คืน `csrf_token`
- `GET /api/v1/menu_permissions.php?user=1` — เมนูที่ role นั้นเห็น
  (sidebar filter) — ใช้คีย์เมนูจาก `src/menu_catalog.php`
- `GET /api/v1/audit_logs.php` — ดู §4

---

## 11. ระเบียบเพิ่ม endpoint ใหม่ (D.O.D.)

1. `require_once` db.php + auth.php + csrf.php (+ api.php, permissions.php
   ถ้าใช้)
2. `session_start()` แล้วเส้นทางที่ไม่ใช่ GET (หรือเปลี่ยนข้อมูล) → `enforceCsrf()`
3. `requireLogin($pdo)` ทันทีใน try
4. กำหนดสิทธิ์: ถ้าไม่ใช่ทุกคน → `requirePerm($pdo, $module, $action, $msg)`
   (module/action ต้องมีใน `PERMISSION_MATRIX` ก่อน)
5. ตรวจ input ล่วงหน้า, ใช้ prepared statement เสมอ, ไม่มี `ORDER BY`
   จาก user โดยตรง (จำกัด whitelist)
6. ใช้ `api_fail()`/`apiJson` error format เดียว — ห้าม echo ข้อมูลผิดพลาด
   จาก DB ตรง ๆ
7. จุดที่เปลี่ยนข้อมูลหลัก → `audit_log(...)`
8. เพิ่ม เมนูใน `src/menu_catalog.php` + `menu_permissions` seed (ถ้าจำเป็น)
9. ตรวจด้วย `php scripts/security_check.php` (ต้องผ่าน 0 failed) + lint PHP +
   `npm run typecheck` ฝั่ง frontend

---

## 12. Idempotency / Offline Sync (Phase 19)

จุดประสงค์: ทนสายเครือข่ายกับใช้ซ้ำ (double-submit) โดยไม่ทำงานซ้ำสอง
client ส่ง **`X-Client-Action-Id`** (UUID v4 เช่น `action_<ulid>`) กับทุก
request ที่เปลี่ยนข้อมูล แล้ว backend ตอบสำเร็จแบบ idempotent

### 12.1 กลไก

- `src/helpers/idempotency.php` — `idempotency_guard(...)`, `find_prev_result(...)`,
  `has_processed(...)` ตรวจ `client_action_log` table:
  - `client_action_id UNIQUE` + index บน `(client_action_id, action_type, entity_type, entity_id)`
  - รายการสำเร็จ → ตอบ **ผลเดิมซ้ำ (replay)** ด้วย HTTP 200 พร้อม
    `X-Idempotent-Replay: 1`, `success: true` — client เห็นว่าส่งสำเร็จโดยไม่ทำงานซ้ำ
  - รายการค้าง `processing` → **425 `TOO_EARLY`** (รอให้ฝั่งเก่า/ใหม่จบก่อน)
- ใช้กับ: `repair.php` (create WO), `spare_usage.php` (add spare ส่วนล็อกกันคู่),
  `repair_attachment.php` (upload)
- **รายการซ้ำจริง** (ไม่มี client_action_id หรือซ้ำแต่ payload ต่าง → ทะเบียน
  ล็อก) → ตอบ `VALIDATION_ERROR`/`CONFLICT` (409) ตามปกติ

### 12.2 Conflict detection (stale `base_updated_at`)

- API หลักที่แก้ข้อมูลพร้อมกัน (`repair.php` PUT, `spare_usage.php` add):
  - client ส่ง `base_updated_at` (ค่า `updated_at` ตอนโหลด) ใน payload
  - backend เปรียบเทียบกับ `updated_at` ปัจจุบันของบันทึกฝั่ง server
  - ต่างกัน → **409 `CONFLICT`** `{ code, server_updated_at }` + บันทึก
    `SYNC_CONFLICT` audit (severity warning)
- Client (SyncEngine) ตอบสนอง 409 อย่างไร: ทำเครื่องหมาย item
  `CONFLICT` → หยุด retry อัตโนมัติ เหลือให้คนจัดการใน Sync Center
  (ดู `docs/PWA.md`)

### 12.3 Header/response ที่เกี่ยวข้องกับ sync

| Header | ฝั่ง | ความหมาย |
|---|---|---|
| `X-Client-Action-Id` | request | idempotency key ของ action |
| `X-Request-Id` | success | ระบุ request เดียวกันข้าม retry (audit) |
| `X-Idempotent-Replay: 1` | success | response นี้คือ replay ของผลเดิม |

Migration: `database/migration_20260916_phase19_pwa_offline.sql`
(run via `scripts/apply_phase19_offline.php`)

---

## 13. `repair_attachment.php` (เพิ่ม GET — Phase 19)

อัปโหลดรูปงานซ่อม (ก่อน/หลัง) สำหรับ offline technician flow

| Method | เส้นทาง | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `?work_order_id=` | ช่างที่ได้รับงาน/ผู้ดูแล | multipart `file` |
| GET | `?work_order_id=` | ช่างที่ได้รับงาน/ผู้ดูแล | รายการไฟล์ของ WO นั้น |

### GET response 200
```json
{
  "items": [
    {
      "id": 3, "work_order_id": 12,
      "uploaded_by": "E01117", "file_path": "uploads/repair/12/abcd.jpg",
      "file_name": "img_1.jpg", "file_size": 123456, "mime_type": "image/jpeg",
      "created_at": "2026-09-16 10:00:00"
    }
  ]
}
```
- input `work_order_id` ตรวจเป็น int เท่านั้น; ไม่มี → `VALIDATION_ERROR`
- รายการปรากฏเฉพาะ user ที่เป็นผู้รับผิดชอบงาน (assigned) หรือ supervisor
- POST ไม่มีไฟล์ / เกิน `MAX_FILE_SIZE` / ชนิดไม่ใช่ภาพ → `VALIDATION_ERROR`

---

## 14. `cost.php` — Maintenance Cost & Budget (Phase 26)

Base `/api/v1/cost.php` · ดู (GET) ต้อง role **1, 2, 6** (`kpi_can_see_cost`) ·
POST ต้อง **1, 2, 6** (`cost_can_manage_budget`) + CSRF + audit

### 14.1 GET — ต้นทุน / งบประมาณ

| `action` | params | response (ย่อ) |
|---|---|---|
| `settings` | — | `{ settings }` = `cost_config()` (currency, labor_rate, thresholds, other_available) |
| `summary` | filter*, range* | `{ summary, range, filters_applied }` — ยอดต่อคอมโพเนนต์ + availability |
| `work-order` | `id` (int) | `{ work_order }` — breakdown 4 คอมโพเนนต์ + flag `available` + `unavailable_components` |
| `trend` | filter*, range* | `{ trend[] }` — เดือนจริง (label/month/wo_count/parts/labor/external/other/total) |
| `by-type` | filter*, range* | `{ items[], preventive_total, corrective_total, pm_ratio }` |
| `by-department` | +`limit` | `{ items[] }` |
| `by-asset` | +`limit` | `{ items[] }` |
| `high-assets` | +`high_cost_threshold` | `{ threshold, items[] }` |
| `parts` | +`limit` | `{ items[] }` — อะไหล่ต้นทุนสูงสุด |
| `repeat-parts` | +`limit` | `{ items[] }` — ใช้ซ้ำ ≥ 2 ใบ |
| `pm` | filter*, range* | `{ preventive, corrective, preventive_total, corrective_total, preventive_ratio }` |
| `breakdown` | filter*, range* | `{ wo_count, total, downtime_minutes, by_asset[] }` |
| `emergency` | filter*, range* | `{ critical, high, critical_total, high_total, total, wo_count }` |
| `forecast` | +`year` | `{ year, ytd_total, monthly_avg, full_year_projection, months_remaining, projection_remaining }` |
| `data-quality` | filter*, range* | `{ currency, wo_count, warnings[], overall_ok }` |
| `filters` | — | ตัวเลือกตัวกรอง + `maintenance_types` + `years` |
| `budget` | +`year`, `department_id` | `{ currency, items[], alerts, config, can_manage }` |
| `budget-vs-actual` | +`year`, `department_id` | `{ currency, years, year, series[], config }` |

`filter*` = `range|range_start|range_end`, `department_id`, `asset_id`, `asset_category`,
`source_type`, `priority`, `status`, `maintenance_type`

### 14.2 POST — งบประมาณ (mutation)

```jsonc
// สถานะ: draft → submitted → active → closed · (ยกเลิกได้ draft/submitted)
{ "action": "budget/create", "year": 2026, "month": 5, "department_id": null,
  "allocated_budget": 350000, "currency": "THB", "notes": "งบค่าแรง" }
{ "action": "budget/update", "id": 4, "allocated_budget": 400000, "notes": "" }   // draft/submitted
{ "action": "budget/adjust", "id": 4, "adjustment_amount": -25000, "reason": "ลดงบเครื่องลม" }  // active
{ "action": "budget/submit" | "budget/approve" | "budget/close" | "budget/cancel", "id": 4 }
```

- error กลาง: `VALIDATION_ERROR` (400) / `ACCESS_DENIED` (403) / `CONFLICT` (สถานะไม่ตรง)
- ทุก action บันทึก audit `BUDGET_*`

### 14.3 ตัวอย่าง `budget` GET (ย่อ)
```json
{ "currency": "THB", "can_manage": true,
  "config": { "warning_pct": 80, "exceed_pct": 100 },
  "alerts": { "counts": { "NORMAL": 6, "WARNING": 1, "EXCEEDED": 1 }, "has_warning": true, "has_exceeded": true },
  "items": [ { "id": 5, "year": 2026, "month": 5, "month_name": "พ.ค.", "department_id": null,
     "department_name": null, "status": "active", "allocated_budget": 350000, "adjustments": 0,
     "effective_budget": 350000, "actual": 693800, "utilization_pct": 198.23,
     "remaining": -343800, "alert": "EXCEEDED", "alert_label": "เกินงบประมาณ" } ] }
```

Migration: `database/migration_20260920_phase26_cost_budget.sql`
(run via `scripts/apply_phase26_cost_budget.php` — idempotent)