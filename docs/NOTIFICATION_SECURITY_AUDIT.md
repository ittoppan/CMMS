# PHASE 09 — Notification System Security Audit

> วันที่: 2026-11-19
> ขอบเขต: ตรวจสอบความปลอดภัยของระบบ notification (API endpoints, RBAC, input validation, CSRF, SQL injection, XSS)

---

## 1. สรุปภาพรวม

| หมวด | สถานะ | หมายเหตุ |
|---|---|---|
| CSRF Protection | ✅ | enforceCsrf() บนทุก non-GET request |
| Authentication | ✅ | requireLogin() ทุก endpoint |
| RBAC (Rules) | ✅ | canSupervisor() สำหรับ rules CRUD |
| RBAC (Templates) | ✅ | requirePerm(settings, manage) สำหรับ templates |
| RBAC (template_validate/preview) | ✅ Fixed | เพิ่ม requirePerm แล้ว |
| SQL Injection | ✅ | ใช้ prepared statements ทุกจุด |
| XSS | ✅ | Frontend ไม่ใช้ dangerouslySetInnerHTML สำหรับ notification content |
| Input Validation (time) | ✅ Fixed | ปรับ regex ให้ validate HH:MM จริง (00-23:00-59) |
| Input Validation (preferences) | ✅ | ตรวจสอบ channel และ type อยู่ใน allowlist |
| Rate Limiting | ⚠️ | test_push_self ไม่มี rate limit (low risk) |
| Data Isolation | ✅ | markRead ใช้ user_id = ? ใน WHERE clause |

---

## 2. รายการที่ตรวจสอบ

### 2.1 CSRF Protection
- **notifications.php**: `if ($method !== 'GET') enforceCsrf();` ✅
- **push_subscribe.php**: ตรวจสอบแยก (ไม่ได้ audit ใน phase นี้)
- **ทุก POST/PUT/DELETE** ผ่าน CSRF check ✅

### 2.2 Authentication
- **requireLogin($pdo)** ถูกเรียกใน notifications.php ทุก request ✅
- **session_start()** ถูกเรียก ✅
- **user_id** อ่านจาก `$_SESSION['user_id']` (ไม่จาก request) ✅

### 2.3 RBAC (Role-Based Access Control)

| Endpoint | Permission | สถานะ |
|---|---|---|
| list, count, preferences, quiet_hours, push_status | ตัวเอง (user_id จาก session) | ✅ |
| mark_read, mark_all_read | ตัวเอง | ✅ |
| rules (GET/PUT/DELETE) | canSupervisor() | ✅ |
| templates (GET) | requirePerm(settings, manage) | ✅ |
| template (PUT) | requirePerm(settings, manage) | ✅ |
| test_push (POST) | requirePerm(settings, manage) | ✅ |
| test_push_self (POST) | ทุก user (อุปกรณ์ตัวเอง) | ✅ (acceptable) |
| template_validate (POST) | requirePerm(settings, manage) | ✅ Fixed |
| template_preview (POST) | requirePerm(settings, manage) | ✅ Fixed |
| meta (GET) | ทุก user ที่ login | ✅ (needed for UI) |

### 2.4 SQL Injection
- **listForUser**: ใช้ prepared statements + parameterized queries ✅
- **markRead**: ใช้ prepared statements + `user_id = ?` ✅
- **savePreferences**: ใช้ prepared statements ✅
- **saveQuietHours**: ใช้ prepared statements ✅
- **saveRule**: ใช้ prepared statements ✅
- **deleteRule**: ใช้ prepared statements ✅
- **push_status**: ใช้ prepared statements ✅
- **LIMIT/OFFSET**: cast เป็น (int) ✅

### 2.5 XSS (Cross-Site Scripting)
- **Frontend**: ไม่ใช้ `dangerouslySetInnerHTML` สำหรับ notification content ✅
- **Backend**: JSON output ใช้ `JSON_UNESCAPED_UNICODE` (ไม่ escape HTML, แต่ JSON encoding ป้องกัน injection) ✅
- **Template rendering**: `substituteVars()` ใช้ string replacement (ไม่ eval) ✅

### 2.6 Input Validation

| Input | Validation | สถานะ |
|---|---|---|
| quiet_hours start/end | regex `^(?:[01]\d|2[0-3]):[0-5]\d$` | ✅ Fixed |
| preferences rows | channel ∈ CHANNELS, type ∈ TYPES | ✅ |
| mark_read ids | intval + filter > 0 | ✅ |
| rules name/module | required (not empty) | ✅ |
| rules priority | validPriority() allowlist | ✅ |
| rules channels | intersect with CHANNELS | ✅ |
| rules delay/max_repeats/dedup | max(0, ...) / max(1, ...) | ✅ |
| templates title/message/url | mb_substr truncation | ✅ |
| templates priority | validPriority() allowlist | ✅ |

### 2.7 Data Isolation
- **markRead**: `WHERE user_id = ? AND id IN (...)` — ป้องกัน user อ่าน notification ของคนอื่น ✅
- **preferences**: `WHERE user_id = ?` ✅
- **quiet_hours**: `WHERE user_id = ?` ✅
- **listForUser**: `WHERE n.user_id = ?` ✅
- **countsForUser**: `WHERE user_id = ?` ✅

---

## 3. ช่องโหว่ที่พบและแก้ไข

### 3.1 Missing RBAC on template_validate/template_preview (Fixed)
- **ปัญหา:** POST `template_validate` และ `template_preview` ไม่มี RBAC check → user ทั่วไปเรียกได้
- **ความเสี่ยง:** Medium — ข้อมูล template (sample vars) อาจรั่วไหล
- **แก้ไข:** เพิ่ม `requirePerm($pdo, 'settings', 'manage', ...)` แล้ว

### 3.2 Weak time validation in saveQuietHours (Fixed)
- **ปัญหา:** regex `/^\d{2}:\d{2}$/` ยอมรับค่า invalid (99:99)
- **ความเสี่ยง:** Low — MySQL TIME type จะ reject แต่ถ้า column เป็น VARCHAR จะเก็บค่า invalid
- **แก้ไข:** ปรับ regex เป็น `/^(?:[01]\d|2[0-3]):[0-5]\d$/`

---

## 4. ข้อแนะนำเพิ่มเติม (ไม่ได้แก้ใน phase นี้)

### 4.1 Rate Limiting สำหรับ test_push_self
- **ความเสี่ยง:** Low — user สามารถ spam push ถึงตัวเองได้
- **คำแนะนำ:** เพิ่ม rate limit (เช่น 5 ครั้ง/นาที) ใน test_push_self

### 4.2 meta endpoint เปิดให้ทุก user
- **ความเสี่ยง:** Low — เปิดเผย roles list และ system metadata
- **คำแนะนำ:** พิจารณาจำกัดให้เฉพาะ supervisor หรือ cache ใน frontend

### 4.3 push_status endpoint ไม่มี RBAC
- **ความเสี่ยง:** Low — แต่กรองด้วย user_id แล้ว (เฉพาะของตัวเอง)
- **คำแนะนำ:** ไม่ต้องแก้ (acceptable)

### 4.4 Notification content ไม่มี XSS sanitization ใน backend
- **ความเสี่ยง:** Low — frontend ใช้ React (auto-escape) + ไม่ใช้ dangerouslySetInnerHTML
- **คำแนะนำ:** ไม่ต้องแก้ (frontend handles escaping)

---

## 5. สรุป

ระบบ notification มีความปลอดภัยดี:
- CSRF + Auth + RBAC ครบถ้วน (หลังจากแก้ไข 2 จุด)
- SQL injection ป้องกันด้วย prepared statements
- XSS ป้องกันโดย React auto-escape
- Data isolation ด้วย user_id filtering

ช่องโหว่ที่พบ (2 จุด) แก้ไขแล้ว:
1. Missing RBAC on template_validate/template_preview ✅
2. Weak time validation in saveQuietHours ✅
