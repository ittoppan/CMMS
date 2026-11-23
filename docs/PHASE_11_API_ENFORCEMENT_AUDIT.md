# Phase 11 — API Enforcement Audit (auth / CSRF / permission ที่ชั้น API)

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] API enforcement` ใน Phase 11
> สภาพแวดล้อม: production build `http://localhost:3001` · บัญชี `e2e_viewer` (role 5 Viewer, `is_active=1`)
> วิธี: อ่านโค้ด `src/auth.php`, `src/csrf.php` + สแกนทั้ง 113 endpoint ใน `public/api/v1/` + ยิง GET จริง 16 endpoint ด้วย session ของ role 5 แล้วเทียบกับ `menu_permissions` ใน DB

---

## 1. CSRF: บังคับที่จุดเดียว (ครอบทั้งระบบ)

`src/auth.php:92–97` ใน `requireLogin()`:

```php
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();   // 403 ถ้า token/Origin/Referer ไม่ผ่าน
}
```

→ **ทุก endpoint ที่เรียก `requireLogin()` ได้ CSRF อัตโนมัติ** ไม่ต้องเรียกเอง

| ตัวชี้วัด | ค่า |
|---|---|
| endpoint ทั้งหมด | 113 |
| เรียก `enforceCsrf()` เอง (ซ้ำซ้อนแต่ปลอดภัย) | 69 |
| มี branch เขียนข้อมูล (`'POST'`/`'PUT'`/`'PATCH'`/`'DELETE'`/`$_POST[`) | 81 |
| เขียนข้อมูล **และไม่เรียก `requireLogin()` ก่อน** | **1** → `asset_hub.php` |
| endpoint ที่เขียน SQL (`INSERT/UPDATE/DELETE/REPLACE`) | 51 |
| เขียน SQL แต่ไม่มี `requirePerm()`/`requireRole()` | 25 |

**ตรวจ `asset_hub.php` แล้ว — ไม่ใช่ช่องโหว่**: ไฟล์มีคำสั่งเขียน SQL **0 คำสั่ง** (grep `INSERT INTO|UPDATE … SET|DELETE FROM` = 0) และคอมเมนต์บรรทัด 20 ระบุว่า "อ่านเท่านั้น (GET/POST ที่ไม่เขียนข้อมูล) จึงไม่ต้องใช้ CSRF" — POST ทำหน้าที่รับ JSON body เท่านั้น

**สรุป CSRF: ผ่าน** — ไม่พบ endpoint ที่เขียนข้อมูลแล้วหลุดการตรวจ CSRF

---

## 2. Permission ที่ชั้น API: ไม่สอดคล้องกับเมนู

### 2.1 ค่าจริงจาก DB

`menu_permissions` ของ role 5: **granted 25 จาก 162 คีย์** (15.4%)
คีย์ที่เกี่ยวข้อง granting=0 ทั้งหมด: `spare_parts`, `spare_parts/stock_take`, `pm_am`, `forms`, `suppliers`, `equipment_borrowing`, `manuals`, `mtbf_mttr`, `planning`, `asset_registry`

### 2.2 ผลยิง GET จริงด้วย role 5

| endpoint | HTTP | สิ่งที่ได้ | สิทธิ์เมนูของ role 5 | ตรงกัน? |
|---|---|---|---|---|
| `pm_plans.php` | **200** | `count=0` | `planning`=0 | ❌ ไม่ตรง |
| `pm_am.php` | **200** | 3 แถว (seed) | `pm_am`=0 | ❌ |
| `stock_take.php` | **200** | `data=[]` | `spare_parts/stock_take`=0 | ❌ |
| `spare_parts.php` | **200** | **1,870 แถว / 1,467,011 bytes** | `spare_parts`=0 | ❌ |
| `checklist_templates.php` | **200** | 4 แถว | `forms`=0 | ❌ |
| `suppliers.php` | **200** | 2 แถว | `suppliers`=0 | ❌ |
| `equipment_borrowing.php` | **200** | 0 แถว | `equipment_borrowing`=0 | ❌ |
| `manuals.php` | **200** | 0 แถว | `manuals`=0 | ❌ |
| `mtbf_mttr.php` | **200** | 18 แถว | `mtbf_mttr`=0 | ❌ |
| `production_hours.php` | **200** | 500 แถว | ไม่มีคีย์เมนูตรง (รายงานผลผลิต) | ❌ |
| `asset_registry.php` | 403 | `{success:false, code}` | `asset_registry`=0 | ✅ |
| `sage_sync.php` | 403 | — | `spare_parts/sage_sync`=0 | ✅ |
| `import_excel.php` | 403 | — | `reports/import_excel`=0 | ✅ |
| `page_editor.php` | 403 | — | `editor/builder`=0 | ✅ |
| `repair_options.php` | 403 | — | ต้องมีสิทธิ์ repair | ✅ |
| `machine_bom.php` | 403 | — | `asset_registry/bom_tree`=0 | ✅ |

**ตัวเลขสรุป: 16 endpoint ที่ทดสอบ → 10 หลุด (HTTP 200 ทั้งที่ granted=0), 6 กันได้**

---

## 3. Findings

| ID | ระดับ | อาการ | หลักฐาน | ต้องอนุมัติ? |
|---|---|---|---|---|
| E11-1 | **HIGH** | API 10 endpoint ไม่ตรวจสิทธิ์เมนู — ผู้ใช้ที่ถูกล็อกเมนูยังเรียกข้อมูลได้ตรง ๆ ด้วย session ของตัวเอง (page gate ทำงาน แต่ API ไม่ทำงาน) | ตาราง §2.2: 200 + `menu_permissions.is_granted=0` | ใช่ (แตะ authorization = S1/S2) |
| E11-2 | MEDIUM | `repair.php` ฯลฯ กันด้วย `requirePerm()` แต่ตระกูล `pm_*`, `spare_parts*`, `suppliers`, `manuals` ไม่เรียกเลย (25 ไฟล์ที่เขียน SQL ไม่มี permission check) | §1 ตารางตัวชี้วัด | ใช่ |
| E11-3 | MEDIUM | `spare_parts.php` คืนทั้งตาราง **1,870 แถว = 1.47 MB** ไม่มี pagination ให้ role ที่มีสิทธิ์อ่านเท่านั้น — เป็นภาระเครือข่าย/handset | §2.2 แถว `spare_parts.php` | ใช่ (Phase 8 contract) |
| E11-4 | LOW | `enforceCsrf()` ถูกเรียกซ้ำใน 69 ไฟล์ ทั้งที่ `requireLogin()` จัดการแล้ว — ไม่ใช่บั๊ก แต่เป็นโค้ดซ้ำเสี่ยงลืมในไฟล์ใหม่ | §1 | ไม่เร่ง |

**ข้อจำกัดของข้อสรุป E11-1:** ทดสอบเฉพาะ **GET (อ่าน)** เพราะการยิง POST/PUT/DELETE จะเขียนข้อมูลจริงลง DB ซึ่งยังไม่ได้รับอนุมัติ
→ สิ่งที่พิสูจน์ได้คือ "อ่านหลุด"; การเขียน **มีแนวโน้มหลุดด้วย** (ไฟล์เดียวกัน กันแค่ `requireLogin`) แต่ **ยังไม่ได้ทดสอบ**

---

## 4. สิ่งที่ยังไม่ได้ตรวจ

- การเขียน (POST/PUT/DELETE) ของ 10 endpoint ข้างต้น — ต้องอนุมัติให้ทดสอบแบบเขียนแล้วย้อนกลับ หรือใช้ DB สำรอง
- role อื่น (2 Manager, 3 Operate, 6/7) — ทดสอบเฉพาะ role 5
- `user_permissions` (ตารางรายบุคคล) ว่านิยามทับ `menu_permissions` อย่างไร
- endpoint ที่ไม่ได้อยู่ใน 16 ตัวที่สุ่ม — ที่เหลืออีก 97 ตัวยังไม่ได้ยิงจริง
- `X-LIFF-Id-Token` path ของ `asset_hub.php`/`line_register.php` (ไม่ได้ทดสอบจาก LIFF จริง)

## 5. สรุปสถานะ checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] API enforcement` | **ตรวจแล้ว (อ่าน)** — CSRF ผ่านทั้งระบบ, permission หลุด 10/16 endpoint; การเขียนยังไม่ทดสอบ |
