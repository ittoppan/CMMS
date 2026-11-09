# PHASE 29 WORKFLOW — ขั้นตอนปฏิบัติงานสอบเทียบ

> อัปเดตล่าสุด: 2026-09-23
> เอกสารนี้อธิบาย **state machine การปฏิบัติงาน (workflow)** ของรอบสอบเทียบแบบ end-to-end
> ตั้งแต่แผน → วันที่ครบกำหนด → ลงมือสอบเทียบ → จุดวัด → ผล → ตรวจอนุมัติ → ประวัติ/รอบถัดไป
> การคำนวณ error / tolerance / pass-fail / next_due / compliance — **ทั้งหมดคำนวณที่ backend**
> (`src/helpers/calibration.php`) ตาม rule 7 ของ `docs/PHASE_29_CURRENT_STATE.md`

## 1. ขั้นตอนภาพรวม (Happy Path)

```
สร้างแผน (plan_save)
   │  active + next_calibration_date (backend)
   ▼
adopt_plan  →  เกิดรอบ (แถว calibration) status=`scheduled`, calibration_date=NULL
   │           (เก็บ plan_id/procedure/standard/calibrator จากแผน)
   ▼
run_start  →  status=in_progress, started_at=now, calibrator_id=uid
   │
   ▼
run_save_points  →  บันทึกจุดวัด (DELETE+INSERT แทนทั้งชุด) , backend คำนวณ error/error_pct/result
   │               + environment JSON (temp/humidity/./source) (ถ้าส่ง)
   ▼
run_complete  →  ตรวจ cal_validate_submit (ความครบถ้วน) → status=pending_review
   │               (คำนวณผลรวมจริงจากจุดวัด: pass/fail/conditional + oot_flag)
   │
   ▼
run_review (decision=approve)  →  cal_finalize_approved()
   │                               เขียน calibration_history (immutable, เก็บ calibration_id)
   │                               อัปเดตรอบ → status=approved, approved_by/at
   │                               คำนวณ next_calibration_date = calibration_date + interval
   ▼
รอบถัดไป / แจ้งเตือน due
```

> สถานะ `pending_review` ตั้งเมื่อ `cal_require_review=1` (default); ถ้าปิดก็คอมมิตตรงได้ขึ้นกับ policy
> — แต่ migration ฝัง default ให้ review บังคับ.

## 2. State Machine (ข้อมูลจริงจาก `cal_workflow_transitions()`)

Enum ย่อยของ `calibration.status` (Phase 29 ขยายจากเดิม 5 ค่า):
`scheduled, pending, in_progress, pending_review, approved, completed, overdue, cancelled, rejected`

| from | ไปได้ (to) |
|---|---|
| `scheduled` | in_progress, cancelled, overdue |
| `pending` | in_progress, cancelled |
| `in_progress` | pending_review, cancelled, completed |
| `pending_review` | approved, rejected, in_progress |
| `approved` | *(terminal — immutable)* |
| `completed` | *(terminal)* |
| `rejected` | in_progress, cancelled |
| `cancelled` | *(terminal)* |
| `overdue` | in_progress, cancelled |

กฎสำคัญ:
- `approved`/`completed` = **immutable** — ห้าม edit/delete (API ตรวจ `ALREADY_FINAL` 409)
- `rejected` → กลับไป `in_progress` แก้จุดวัดใหม่ได้ (run_save_points อนุญาตบน rejected)
- `run_start` ใช้ `cal_can_transition()`; `run_complete` ตรวจ transition เอง (ไม่อนุญาตจาก approved/completed)
- `cal_schedule`/dashboard คำนวณ overdue จาก `next_calibration_date < CURDATE()` (backend)

## 3. ลำดับการเปลี่ยนสถานะใน API (payload ตัวอย่าง)

### 3.1 `plan_save` — สร้าง/แก้แผน
```
POST /api/v1/calibration_management.php  (X-CSRF-Token )
{ "action":"plan_save", "asset_id":4, "interval_months":12,
  "method":"internal", "provider_type":"internal", "status":"active", "notes":"..." }
→ { "success":true, "plan_id":4 }
```
- เปลี่ยน interval: backend คำนวณ next_calibration_date; ถูก audit และแจ้งเตือน `interval_changed`
- ตัวแปร `$method/$provider/$status` ถูก sanitize เป็น `(string)($in[...] ?? default)` + in_array ใน `cal_plan_save` (line ~240)

### 3.2 `adopt_plan` — สร้างรอบจากแผน
```
{ "action":"adopt_plan", "plan_id":4, "calibration_type":"full" }
→ { "success":true, "id":3, "message":"สร้างรอบสอบเทียบแล้ว" }
```
- `calibration_date` = NULL (scheduled) — คอลัมน์ถูกขยายให้ nullable ผ่าน migration (Phase 29)
- audit `CAL_RUN_ADOPT`

### 3.3 `run_start`
```
{ "action":"run_start", "calibration_id":3 } → { "success":true, "message":"เริ่มการสอบเทียบแล้ว" }
```

### 3.4 `run_save_points` — 1..n จุด
```
{ "action":"run_save_points", "calibration_id":3,
  "environment":{"temp":25.4,"humidity":52,"source":"manual"},
  "points":[
    {"point_label":"Zero","nominal_value":0,"measured_value":0.1,"tolerance":0.5,"is_critical":true,"unit":"mA"},
    {"point_label":"Span","nominal_value":10,"measured_value":10.02,"tolerance":0.5,"is_critical":false,"unit":"mA"}
  ] }
→ { "success":true, "saved_points":2 }
```
- DELETE+INSERT ทั้งชุดใน transaction — **ไม่เก็บจุดซ้ำ**
- `cal_compute_point()`: error = measured−nominal, error_pct (%) ถ้า nominal≠0, result = |error|≤tolerance
- อนุญาต state: `in_progress`, `pending_review`, `rejected`, `pending`

### 3.5 `run_complete`
```
{ "action":"run_complete", "calibration_id":3,
  "calibration_date":"2026-09-23", "certificate_number":"CAL-SMOKE-2026-001",
  "notes":"..." }
→ { "success":true, "message":"บันทึกผลสอบเทียบแล้ว (รอผู้ตรวจสอบอนุมัติ)",
     "status":"pending_review", "result":"pass",
     "computed":{"points_total":2,"points_passed":2,"points_failed":0,...,"result":"pass","oot":false} }
```
- `cal_validate_submit($pdo,$id,$calDate)` — ตรวจจุดวัด≥1, ครบถ้วน (ถ้า config เปิด), ระบุวันที่
- `cal_run_computed()` ใช้ `cal_compliance_mode` (all_points_pass / critical_points_only)
- fail/conditional 1 จุด → `oot=true` → `oot_flag=1` + สร้าง OOT event (ถ้า `cal_rca_on_fail=1`)
- audit `CAL_RUN_COMPLETE` + แจ้งเตือน `review_pending`

### 3.6 `run_review`
```
approve: { "action":"run_review", "calibration_id":3, "decision":"approve", "review_notes":"..." }
→ { "success":true, "next_calibration_date":"2027-09-23", "result":"pass", "history_id":1 }

reject:  { "action":"run_review", "calibration_id":3, "decision":"reject", "reason":"..." }
→ { "success":true, "message":"ปฏิเสธผลสอบเทียบแล้ว (เปิดให้แก้ไขจุดวัดใหม่)" }
```
- reject **ต้องมี `reason`** (VALIDATION_ERROR ถ้าไม่มี)
- **immutable ตรงนี้สำคัญที่สุด** — หลัง approve ห้ามแก้ผล; ถ้าจะเปลี่ยนรอบใหม่จริงต้องสร้างรอบใหม่

## 4. Fail / Out-of-Tolerance (OOT) Path

```
run_complete → result=fail (หรือ conditional) & policy cal_rca_on_fail=1
   │
   ▼
cal_run_computed: oot=true  →  อัปเดต oot_flag=1
   │
   ▼
cal_oot_create(): สร้าง calibration_oot_events
   │  oot_code = OOT-YYYYMMDD-XXXX  (unique)
   │  last_known_good_date = รอบมาตรฐานล่าสุดที่ผ่าน / detected_date = วันนี้
   │  affected_period_start/end, risk_assessment (ให้ผู้รับผิดชอบกรอก)
   ▼
oot_update(): assessment/result/fail_action (ผู้รับผิดชอบเลือก: adjust/repair/recalibrate/send_external/scrap/investigate)
   │  investigation_status: open→investigating→resolved→closed
   ▼
ลิงก์: rca_id (Phase 27 failure.php) / repair_id (WO) — ระบบไม่เดาคำตอบเอง (rule 3/4)
```

## 5. หลัง Approval — History & Next Due

`cal_finalize_approved()` (line ~593):
1. transaction ป้องกัน race
2. INSERT `calibration_history` — คัดลอก: asset_id, calibration_date, next_calibration_date(ใหม่),
   type, performed_by, standard_used, result, certificate_number, cost, notes, created_by, **calibration_id**
3. UPDATE `calibration` → status=approved, approved_by/at, reviewed_by/at, `oot_flag`, result_action
4. คำนวณ `next_calibration_date` = calibration_date + interval_months (calendar) — ใช้บน DB row
5. ตั้ง `calibration.next_calibration_date` ใหม่
6. แจ้งเตือน `approved`
7. audit `CAL_RUN_REVIEW` / `CAL_FINALIZE`

- `calibration_history` **append-only** — ไม่มี UPDATE/DELETE ในโค้ด (rule 6)
- `calibration_history.calibration_id` ใช้ data-quality ตรวจ `approved_without_history`
- เมื่อแผน next_calibration_date เปลี่ยน → จะเป็นตัวจ้างรอบถัดไป (schedule หน้า `/calibration/schedule`)

## 6. ที่มาของ next_due / กำหนดการ

- **Plan**: `next_calibration_date` = last_calibration_date + interval_months (เดินจากที่นี่เป็นหลัก)
- **Run ที่ทำเสร็จ**: approved ด้วย date + interval → history เก็บค่าใหม่; แผนอัปเดต
- **Instrument status** (`calibration_instruments.status`): ระบบคำนวณ due/overdue จากข้อมูลจริง
- สี GREEN/AMBER/RED: จาก `next_calibration_date` vs `cal_alert_days` (ดู KPIS doc)

## 7. โฟลว์สำรอง / ยกเลิก

| สถานการณ์ | วิธี |
|---|---|
| รอบ scheduled ที่ไม่ต้องการทำแล้ว | ผ่าน `cancelled` (ยังไม่เปิด API แยก — ใช้ DB/admin ผ่าน flow อนาคต) |
| โหลดซ้ำ / offline | ทุก action มี idempotency reusable (`clientActionKeyFromRequest`) — specs PWA doc |
| แก้จุดวัดหลัง review reject | รอบกลับ `in_progress` → `run_save_points` ใหม่ → `run_complete` ใหม่ |

## 8. ตัวอย่างผลรันจริง (Smoke test 2026-09-23)

รอบ INS-002 (run 3) ผ่านครบ: plan_save→adopt_plan→run_start→run_save_points(2 จุด pass)→run_complete
→pending_review→run_review approve → **history_id=1, next_calibration_date=2027-09-23**.
ใบรับรองถูกสร้างเวอร์ชันและ supersede ถูกต้อง (v1→v2→v3 active) — ดู `docs/PHASE_29_TEST_PLAN.md`.