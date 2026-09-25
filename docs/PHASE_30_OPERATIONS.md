# PHASE 30 OPERATIONS — KPI, Data Quality, Runbook

> อัปเดตล่าสุด: 2026-09-24

## 1. Safety Dashboard KPI (`wp_dashboard`)

จากข้อมูลจริง (÷0 → N/A, ไม่ guess):

1. **กำลังปฏิบัติงาน (active)** — จำนวน `status='active'`
2. **รออนุมัติ (pending)** — `requested/risk_review` เป็น draft/suspended
3. **จุด LOTO กำลังทำงาน** — `permit_loto_points` ที่ state=locked ของ permits active/suspended
4. **งานเสี่ยงสูง/วิกฤต** — permit risk level high/critical ที่ยังไม่ closed
   + `stop_work_reports` unresolved ค้าง
   + `safety_actions` overdue ตาม deadline

> UI: ป้ายสไตล์ AndonLamp (`ok/warn/down/idle`) — ใช้ Design System เดิม ไม่ hardcode hex

## 2. Data Quality Checks (`wp_data_quality`) 11 รายการ

ตรวจความสมบูรณ์ของข้อมูล PTW (คืน list item + count ละรายการ):

1. `no_wo_asset` — permit (ไม่ใช่ cancelled/closed) ไม่ผูก WO และไม่มี asset
2. `missing_risk` — ไม่ใช่ draft/cancelled แต่ไม่มี risk assessment
3. `pending_forever` — approved ค้าง > 48 ชม. ยังไม่ activate
4. `expired_not_closed` — expired / requires_review ยังไม่ ปิด (closed_at ว่าง)
5. `active_expired_time` — active แต่เลย `end_at` แล้ว (จะโดน expiry policy ต่อไป)
6. `missing_close_ts` — closed แต่ไม่มี `closed_at`
7. `missing_final_check` — closed แต่ไม่มี checklist post_work (final inspection)
8. `open_action_past` — safety_actions ยัง open/in_progress แต่เกิน due_date
9. `cert_expired_worker` — permit ยังไม่จบ แต่มี worker certification_status = not_authorized
10. `missing_approval_approved` — approved แต่ยังมีขั้น approval decision=pending
11. `gas_no_instrument` — gas test result=pass แต่ไม่ผูก instrument

## 3. Runbook ประจำวัน

- **เช้า**: เปิด dashboard → ดู active + expiring + stop work ค้าง → follow-up
- **สิ้นวัน**: ตรวจ permits ที่ `expired` → พาทำ `requires_review`/`closed`
- **รอบสัปดาห์**: data-quality report + safety actions backlog ติดตาม
- **ทุกครั้งที่ code เปลี่ยน**: รัน gates (TEST_PLAN §5) + apply script idempotent

## 4. เรื่องที่ admin ตั้งได้ (ไม่ต้องแก้โค้ด)

- ประเภทงาน + ข้อกำหนด (`permit_types` / `permit_type_requirements`)
- Risk matrix scales/thresholds/required approval (settings)
- Approval chain ต่อ type (`approval_flow_json`)
- Policy: `wp_require_*`, `wp_expiry_policy`, `wp_gas_*`, `wp_cert_*`, `wp_valid_hours_default`,
  `wp_permit_no_prefix`, `wp_high_risk_approval`
- Menu grants (menu_permissions) — เพิ่ม/ลด role

## 5. Monitoring / Alert

- Notification events `work_permit/*` (stop_work, high_risk = critical priority) — ฝั่ง
  `NotificationCenterService` มี dedup (event_key) / channels ตาม config
- log ผ่าน standard `audit_log` — ตรวจหาการ override (Forbidden→mass 403 ใน access log)

## 6. Known limits / Roadmap

- `contractors` เป็น master เบื้องต้น (รับสร้างผ่าน API/DB) — ยังไม่มี UI จัดการผู้รับจ้างเต็มรูปแบบ
- `locations` ยังไม่มี CRUD API แยก (ผูกผ่าน options) — สอดตาม Phase plane
- QR scan ของ permit/loto point ยังเป็น integration จุดถัดไป (Phase 24 scan.php reuse)
- แสดงผล reports แบบ safety (10+ types) อยู่ใน backlog ต่อยอด data-quality
- Calendar/SLA แสดง PTW แยก — รอ phase ถัดไป