# PHASE 26 — Maintenance Cost & Budget Management

> วันที่: 2026-09-21 · ขอบเขต: Cost Analysis Center (`/cost`) + Budget Management (`/budget`) + Dashboard widget

## สรุป

ระบบวิเคราะห์ต้นทุนซ่อมบำรุงและบริหารงบประมาณแบบ end-to-end คำนวณจากข้อมูลจริงทั้งหมด
ผ่านวิวเดียว `v_maintenance_cost` + engine กลาง `src/helpers/cost.php` (single source —
หน้าจอไม่คำนวณยอดต่างที่). ทุกการเรียกต้องผ่าน `kpi_can_see_cost()` (roles 1, 2, 6) และ
การจัดการงบประมาณบังคับผ่าน `cost_can_manage_budget()` (roles 1, 2, 6) + CSRF + audit +
NotificationCenter (แจ้งเตือนเมื่องบใกล้ถึงเกณฑ์/เกิน) ทุกรายการ

## สิ่งที่ทำ

### 1. Data Layer
- วิว `v_maintenance_cost` — โจมคอลัมน์จริงจาก `repair`, `repair_spare_parts`,
  `cost_parts` (fallback ใบเก่า/ใบ import ที่ไม่มีรายการอะไหล่), `wo_response`,
  `asset_registry`, `departments` — พร้อมฟิลด์ snapshot ราคาในใบสั่งซ่อม
- ตาราง `budget_plan` — คอลัมน์เพิ่มเติม `status`, `currency`, `notes`, `created_by`,
  `approved_by`, `approved_at`, `updated_at` (โครงสร้างเดิมจาก Phase ก่อนมีอยู่แล้ว —
  additive ทั้งหมด 12 แถวเดิมถูก backfill `status='active'`)
- ตาราง `budget_adjustment` — บันทึกการปรับงบ (+/−) พร้อม reason + user + timestamp
- settings 6 ตัว: `cost_labor_enabled`, `cost_labor_rate_source`, `cost_external_source`,
  `budget_warning_pct` (80), `budget_exceed_pct` (100), `budget_dept_filter_enabled`

### 2. Engine `src/helpers/cost.php` (เฟสดียว — ห้าม replicate ฝั่ง UI)
- `cost_config()` — อ่าน settings กลาง (labor rate/thresholds/source)
- `cost_summary/trend/by_type/by_department/by_asset` — ต้นทุนรวม + สัดส่วน + แนวโน้ม
- `cost_parts_list/repeat_parts` — อะไหล่ต้นทุนสูง + อะไหล่ที่ใช้ซ้ำข้ามใบ (สัญญาณเสียซ้ำ)
- `cost_pm/breakdown/emergency` — PM vs Corrective, งานเสีย, งานฉุกเฉิน (critical+high)
- `cost_forecast` — พยากรณ์สิ้นปีจากค่าเฉลี่ยรายเดือนจริง (ไม่ใช่ curve-fit)
- `cost_data_quality` — ช่องว่างข้อมูลที่ทำให้คอมโพเนนต์ Not Available
- `cost_wo_breakdown` — แยกคอมโพเนนต์ต่อใบสั่งซ่อม + flag
- `cost_budget_list/vs_actual` — รายการงบ + สถานะ/alert + series เทียบใช้จริง
- `budget_create/update/submit/approve/adjust/close/cancel` — workflow + validation
- แจ้งเตือนอัตโนมัติ `budget:alert` / `budget:over` / `budget:approved` (dedup ด้วย `event_key`)

### 3. API `public/api/v1/cost.php`
- GET (ดูได้เฉพาะ role 1,2,6): `settings, summary, work-order, trend, by-type,
  by-department, by-asset, high-assets, parts, repeat-parts, pm, breakdown, emergency,
  forecast, data-quality, filters, budget, budget-vs-actual`
- POST (ต้อง `cost_can_manage_budget` + CSRF + audit): `budget/create, update, submit,
  approve, adjust, close, cancel`
- `budget` GET เพิ่ม `can_manage` เพื่อให้ UI ซ่อน/แสดงปุ่มจัดการตามบทบาท

### 4. Frontend
- `/cost` — ศูนย์วิเคราะห์ต้นทุน: filter bar (ช่วงเวลา/ประเภทงาน/แผนก/เครื่องจักร),
  KPI 6 ใบ (ค่าแรง/อะไหล่/จ้างภายนอก/อื่น/รวม/จำนวนใบ), banner ความครบถ้วนข้อมูล,
  tabs: ภาพรวม (Pie + เทรนด์ stack + รายแผนก/เครื่อง), แนวโน้ม, PM vs Corrective,
  งานเสีย + ฉุกเฉิน, อะไหล่สูง & ใช้ซ้ำ, เครื่องต้นทุนสูง, พยากรณ์, ตรวจสอบใบสั่งซ่อม
  (WO detail + flag Not Available + รายการอะไหล่ต่อใบ)
- `/budget` — จัดการงบประมาณ: filter ปี/แผนก, alert สรุปเกิน/ใกล้เกณฑ์, กราฟ
  งบ vs ใช้จริง + เส้น %การใช้, ตารางงบ (ยอด + alert + progress bar), workflow ปุ่ม
  (แก้ไข/ยื่น/อนุมัติ/ปรับ/ปิด/ยกเลิก) ผ่าน modal, จำกัดสิทธิ์ด้วย `can_manage`
- Dashboard `/dashboard` — widget "งบประมาณบำรุงรักษา" (การ์ด 12 เดือน) หลังบล็อก
  ค่าใช้จ่ายเดิม + ลิงก์ `/cost` `/budget`
- settings — ตั้งค่า labor source / threshold / แจ้งเตือนแผนก

### 5. Migration + Seed
- `database/migration_20260920_phase26_cost_budget.sql` + `scripts/apply_phase26_cost_budget.php`
  (idempotent — รันซ้ำได้ ผลลัพธ์เสถียร)
- seed menu_permissions (`cost`, `budget` ทุก role ตาม policy) + notif templates

## API Contract (โดยย่อ)
- POST payload:
  - `budget/create`  { year, month, department_id?, allocated_budget, currency?, notes? }
  - `budget/update`  { id, allocated_budget?, notes? }   (draft/submitted)
  - `budget/adjust`  { id, adjustment_amount, reason, currency? }  (active)
  - `budget/submit|approve|close|cancel` { id }
- รายละเอียดเต็มดู `docs/API_CONTRACT.md` § Phase 26

## ผลลัพธ์จากข้อมูลจริง (sandbox)
- 102 ใบสั่งซ่อม · 22 ใบมีชั่วโมง → ค่าแรง ฿699,675 · ไม่มีอะไหล่ที่เบิกจริง (0 แถว) →
  คอมโพเนนต์อะไหล่/จ้างภายนอกแสดง Not Available ตามกฎ (transparency-first)
- พ.ค. 2026 งบ 350,000 vs ใช้จริง 693,800 → EXCEEDED 198.2% (trigger alert)
- ไฟล์ติดตั้งรันซ้ำ: `Phase 26: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)`

## รายละเอียดเพิ่มเติม
- Model/สูตร: `docs/MAINTENANCE_COST_MODEL.md`, `docs/COST_CALCULATIONS.md`,
  `docs/COST_SOURCES.md`, `docs/BUDGET_MODEL.md`, `docs/BUDGET_RULES.md`