# DASHBOARD_VERIFY — ตรวจสอบงานสร้าง Dashboard (read-only)

สร้างเมื่อ: 2026-11-22
ฐานเปรียบเทียบ (pre-work): commit `a54ea970` (feat: redesign My Dashboard)
HEAD ปัจจุบัน: `531cfe4b` (feat(onboarding): add inline master-data entry forms)
หมายเหตุ: ตรวจสอบแบบ read-only ไม่แก้โค้ด/ข้อมูล (ยกเว้น artifact build ชั่วคราว `.next-verify`)

---

## 1. ผลการรัน (checks)

| รายการ | คำสั่ง | ผล |
|--------|--------|----|
| TypeScript | `npx tsc --noEmit` (cwd frontend) | ✅ PASS — 0 error |
| Design audit | `python scripts/design-audit.py` | ✅ PASS — pages scanned 265, FAIL 0, WARN 0 |
| Next build | `NEXT_DIST_DIR=.next-verify npm run build` (cwd frontend) | ✅ PASS — BUILD_ID `IHOAFDJ2wU4WBhHS7hN1N`, standalone/server.js มีอยู่ |
| Playwright (all) | `npm run test:e2e` | ✅ PASS — 153 passed, 0 failed (5.6m) |

หมายเหตุ: build ใช้ `NEXT_DIST_DIR=.next-verify` ตามที่กำหนด; production server บน :3001 ไม่ถูกหยุด

---

## 2. ตรวจสอบสถานะจาก `docs/DASHBOARD_BUILD.md`

- ตารางรายการ: **36 แถว** (รวม Phase 0), ทุกแถวสถานะ `done`, `partial/todo/skipped = 0`
- สรุปท้ายไฟล์: `done: 35, partial: 0, todo: 0, skipped: 0` (นับเฉพาะรายการ 1–36 หัก Phase 0 = 35) — ตรงกัน
- รายการที่ตั้ง `done` แต่ไม่มีไฟล์/หน้า/ตารางจริง: **ไม่พบ** (ดู §3–§4)
- รายการที่มีไฟล์จริงแต่ตั้ง `todo/partial`: **ไม่พบ** (ทุกหน้าใหม่มีไฟล์และ build ผ่าน)
- ข้อสังเกต: DASHBOARD_BUILD.md ระบุ registry "26 รายการ" ใน Phase 1 แต่ registry จริงมี **31 รายการ** — ตัวเลขใน doc เก่า (ไม่ใช่ข้อผิดพลาดเชิงโค้ด) — แก้ใน doc ได้ภายหลัง

---

## 3. ตรวจสอบ `frontend/lib/dashboard-registry.ts`

- รายการทั้งหมด: **31** รายการ, ทุกรายการ `status: "ready"` (ไม่มี planned/partial)
- ทุก `href` มีหน้าจริงใน `frontend/app/(dashboard)/...` หรือ `frontend/app/...` → **ผ่านทั้ง 31** (ตรวจสอบด้วยสคริปต์ไฟล์)
- ทุก `perm` key อยู่ใน `src/menu_catalog.php` → **ผ่านทั้ง 21 distinct keys** (dashboard, supervisor, reports, planning, planning/calendar, iot/condition, shutdown, asset_reliability, asset_reliability/lifecycle, reliability, reliability/bad-actors, calibration/dashboard, rca, spare_parts/overview, spare_parts/sage_po, cost, workforce, contractor, knowledge, safety/work_permit, system_health)
- หน้าใหม่ 9 รายการ (backlog-aging, shift-handover, pm-compliance, data-quality, production-impact, utility-energy, facility, predictive-ai, lubrication) ใช้ perm `dashboard` → ผ่าน route guard `/dashboard` prefix

---

## 4. ตารางใหม่ (4 ตาราง)

| ตาราง | Migration | Endpoint | หน้ากรอก (เขียน) | Dashboard ที่อ่าน (อ่าน) | ตรงกัน? |
|-------|-----------|----------|------------------|--------------------------|---------|
| `shift_handovers` | `database/migration_20261122_dashboard_shift_handover.sql` | `public/api/v1/shift_handover.php` | `/dashboard/shift-handover` (POST) | `/dashboard/shift-handover` (GET) | ✅ ตรง (ตารางเดียวกัน) |
| `utility_readings` | `database/migration_20261122_dashboard_utility.sql` | `public/api/v1/utility_energy.php` | `/dashboard/utility-energy` (POST) | `/dashboard/utility-energy` (GET) | ✅ ตรง |
| `lubrication_points` | `database/migration_20261122_dashboard_lubrication.sql` | `public/api/v1/lubrication.php` | `/dashboard/lubrication` (action add_point) | `/dashboard/lubrication` (GET) | ✅ ตรง |
| `lubrication_logs` | `database/migration_20261122_dashboard_lubrication.sql` | `public/api/v1/lubrication.php` | `/dashboard/lubrication` (action mark_done) | `/dashboard/lubrication` (GET, ผ่าน points.last_done) | ✅ ตรง |

**ปัญหาอันดับหนึ่ง (form ↔ table mismatch): ไม่พบ** — ทุกหน้ากรอก POST ลงตารางเดียวกับที่ dashboard GET อ่าน (ตรวจสอบจากโค้ด PHP: INSERT/SELECT ชื่อตารางเดียวกัน)

หมายเหตุ: `production_impact`, `facility`, `data_quality`, `predictive_ai`, `pm-compliance`, `backlog-aging` ไม่ได้สร้างตารางใหม่ — อ่านจาก `production_hours`, `asset_registry`, `repair`, `dashboard.php?action=overview` ตามลำดับ

---

## 5. API ใหม่ (7 ไฟล์)

| Endpoint | requirePerm | prepared statement | validate input |
|----------|-------------|-------------------|----------------|
| `shift_handover.php` | ✅ `requirePerm($pdo,'dashboard','view')` | ✅ (2) | ✅ วันที่/กะ |
| `data_quality.php` | ✅ | ❌ (query คงที่ ไม่มี input) | N/A (read-only, ไม่มี param) |
| `production_impact.php` | ✅ | ❌ (query คงที่) | N/A |
| `utility_energy.php` | ✅ | ✅ (2) | ✅ ประเภท/วันที่/ตัวเลข |
| `facility.php` | ✅ | ❌ (query คงที่) | N/A |
| `predictive_ai.php` | ✅ | ❌ (query คงที่) | N/A |
| `lubrication.php` | ✅ | ✅ (3) | ✅ ชื่อ/point_id/วันที่ |

หมายเหตุ: 4 endpoint ที่ใช้ `query()` ไม่มี prepared เพราะไม่มี user input (aggregate query คงที่) — ไม่มีช่องโหว่ injection; แต่ถ้าต้องการความสม่ำเสมอ อาจเปลี่ยนเป็น prepare ได้ในอนาคต (ไม่บังคับ)

---

## 6. "ไม่มีข้อมูล" vs 0

ตรวจสอบ pattern `?? 0`, `|| 0`, `toFixed` ในหน้า dashboard ใหม่ทั้ง 9 ไฟล์

| ไฟล์ | ผล |
|------|----|
| `data-quality/page.tsx` | ✅ `pct()` คืน `"ไม่มีข้อมูล"` เมื่อ d≤0 |
| `pm-compliance/page.tsx` | ✅ `completion_rate`/`on_time_pct` แสดง `"ไม่มีข้อมูล"` เมื่อ null |
| `predictive-ai/page.tsx` | ⚠️ `avg_resolution_hours ?? "—"` ใช้ "—" แทน "ไม่มีข้อมูล" (ควรเป็น "ไม่มีข้อมูล" เพื่อให้ตรง spec) |
| `production-impact/page.tsx` | ✅ empty state แยก; toFixed ใช้เฉพาะเมื่อ totalRecords>0 |
| `utility-energy/page.tsx` | ✅ empty state "ยังไม่มีข้อมูลมิเตอร์" |
| `facility/page.tsx` | ✅ empty state "ยังไม่มีข้อมูลสินทรัพย์" |
| `lubrication/page.tsx` | ✅ empty state "ยังไม่มีจุดหล่อลื่น" |
| `backlog-aging/page.tsx` | ✅ empty state "ยังไม่มีงานค้าง" |
| `shift-handover/page.tsx` | ✅ empty state "ยังไม่มีบันทึกส่งกะ" |

**ข้อสังเกต:** `predictive-ai/page.tsx` บรรทัด `data.avg_resolution_hours ?? "—"` ควรเปลี่ยน "—" → "ไม่มีข้อมูล" (minor, ไม่กระทบ build) — รายงานเท่านั้น ไม่แก้ตามข้อห้าม

---

## 7. เมนู/สิทธิ์

- หน้าใหม่ทั้งหมดอยู่ใต้ prefix `/dashboard` → route guard ใช้ perm `dashboard` (view)
- `dashboard` view granted ให้ role 1 (Admin), 2 (Manager), 6 (Asst.Manager), 3 (Operate), 4 (Operator), 5 (Viewer), 7 (Foreman), 8 (Officer), 10 (Officer-Read) ใน PERMISSION_MATRIX → hierarchy Manager ⊇ Asst.Manager ⊇ Foreman ⊇ Operate ถือว่า **ผ่าน** (dashboard view ทุก role ที่ระบุ)
- `profile`/`notifications`/`register`: 
  - notifications & register: granted ทุก role ที่ตรวจ (1,2,3,5,6,7,8,9,10)
  - **profile: ขาด row ใน menu_permissions สำหรับ role 8 (Officer)** — อาจทำให้ Officer ไม่เห็นเมนูโปรไฟล์ (ถ้า frontend ใช้ menu_permissions เป็นแหล่งสิทธิ์) — ข้อสังเกต pre-existing ไม่ใช่ regression จากงานนี้
- Playwright `role-menus.spec.ts`: Viewer & Officer-Read ผ่าน (visible set ตรง, hidden routes 403) — ยืนยันแล้ว

---

## 8. seed data ที่ค้าง

- ตารางใหม่ 4 ตาราง: **0 แถว** ทั้งหมด (shift_handovers, utility_readings, lubrication_points, lubrication_logs)
- `users` ที่ username ขึ้นต้น `e2e`: **2 แถว** = `e2e_viewer`, `e2e_officer_read` (บัญชีทดสอบถาวรสำหรับ role-menus spec, ไม่ใช่ seed จาก globalSetup) — ไม่ใช่ leftover จากงานนี้
- `e2e_bot` (globalSetup) ถูกลบแล้ว (teardown ทำงาน)
- ไม่พบข้อมูลทดสอบในตารางใหม่

---

## 9. git diff vs `a54ea970` (ไฟล์เดิมที่ถูกแก้)

ไฟล์เดิมที่ถูกแก้ (ไม่ใช่ registry/menu/portal/wallboard):
- `frontend/app/(dashboard)/onboarding/page.tsx` — เพิ่ม inline master-data forms (commit `531cfe4b`); fetchCount/refresh logic เดิมยังอยู่
- `frontend/lib/i18n.ts` — เปลี่ยน label "menu.dashboard" (แดชบอร์ดภาพรวม → ศูนย์รวม Dashboard) เท่านั้น
- `src/menu_catalog.php` — เปลี่ยน label 'dashboard' เท่านั้น

ไฟล์เดิมที่ถูกแทนที่ (ไม่ใช่ "แก้" แต่เปลี่ยนเนื้อหา):
- `frontend/app/(dashboard)/dashboard/page.tsx` — เดิม wallboard (1340 บรรทัด) → กลายเป็น Portal; logic wallboard ย้ายไป `/dashboard/wallboard/page.tsx` (copy, เนื้อหาเหมือนเดิมยกเว้น line endings CRLF vs LF)

จุดที่ logic เดิมเปลี่ยน (fetch/useQuery/useMutation/onSubmit/permission/router):
- `onboarding/page.tsx`: เพิ่ม state formValues/formError/saving/successMsg, loadAux, validate, submit (POST ไปยัง API เดิม), renderForm; ไม่ได้แก้ fetchCount/refresh หรือ permission
- `dashboard/page.tsx`: ทั้งหน้าเปลี่ยนจาก wallboard เป็น Portal (PageShell + HubGrid + search + localStorage frequent) — ไม่มี fetch/useQuery ของเดิมที่ wallboard; wallboard ย้ายไปไฟล์ใหม่โดยไม่แก้ logic
- `i18n.ts`/`menu_catalog.php`: ไม่มี logic เปลี่ยน (label only)

---

## 10. ข้อสรุป

- Build/checks ทั้งหมดผ่าน (tsc, design-audit, build, Playwright 153/153)
- Registry 31 รายการ status ready, href จริง, perm key อยู่ใน menu_catalog
- 4 ตารางใหม่: form ↔ table ตรงกันทุกรายการ (ไม่มีปัญหาอันดับหนึ่ง)
- API ใหม่ทั้ง 7 มี requirePerm + validate ( prepared สำหรับ endpoint ที่รับ input)
- Empty state/"ไม่มีข้อมูล" มีครบทุกหน้า (ยกเว้น predictive-ai ใช้ "—" แทน "ไม่มีข้อมูล" — minor)
- Seed data ไม่ค้างในตารางใหม่
- ไฟล์เดิมที่แก้นอกเหนือจาก registry/menu/portal/wallboard: `onboarding/page.tsx`, `i18n.ts`, `menu_catalog.php` (label-only ยกเว้น onboarding)

**ข้อควรระวัง/ไม่แน่ใจ:**
- `predictive-ai/page.tsx` ใช้ "—" แทน "ไม่มีข้อมูล" (minor)
- Officer (role 8) ขาด row `profile` ใน menu_permissions (pre-existing)
- DASHBOARD_BUILD.md ระบุ registry "26 รายการ" แต่จริง 31 (doc เก่า)
- wallboard page มี line endings CRLF ขณะที่ต้นฉบับ (git) เป็น LF (content เหมือนกัน)