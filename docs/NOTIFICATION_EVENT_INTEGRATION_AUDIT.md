# PHASE 08 — CMMS Event Integration Audit

> วันที่: 2026-11-19
> ขอบเขต: ตรวจสอบว่า CMMS events ทั้งหมดเชื่อมต่อกับระบบ unified notification (NotificationCenterService) หรือไม่
> วิธีตรวจสอบ: ค้นหา notify calls ใน src/, public/api/v1/, scripts/ และ cross-reference กับ notification_templates ใน DB

---

## 1. สรุปภาพรวม

| หมวด | Modules | Templates ใน DB | Triggered by code | สถานะ |
|---|---|---|---|---|
| ผ่าน (trigger ครบ) | repair, spare_parts, maintenance_requests, budget, inspections, system, engineering_change, document (บางส่วน), work_permit (บางส่วน) | — | — | ✅ |
| Trigger บางส่วน | pm_am, calibration, rca, shutdown, spare_optimization, work_permit, document, iot | — | — | ⚠️ |
| ยังไม่ integrate | asset_reliability, contractor, knowledge, reliability, workforce | — | — | ❌ |
| Gap ใน DB (trigger ใช้ event ที่ไม่มี template) | iot | — | — | ⚠️ |

---

## 2. Modules ที่ผ่าน (trigger ครบ)

### 2.1 repair (15/15) ✅
**Trigger sources:** repair.php (created, accepted), supervisor.php (assigned, paused, resumed, planned, rescheduled, reopened, completed, closed, verified, emergency), notification_engine.php (sla_at_risk, sla_breached, escalated)
**Templates:** accepted, assigned, closed, completed, created, emergency, escalated, paused, planned, reopened, rescheduled, resumed, sla_at_risk, sla_breached, verified

### 2.2 spare_parts (3/3) ✅
**Trigger sources:** notification_engine.php (low_stock), supervisor.php (approved, issued)
**Templates:** approved, issued, low_stock

### 2.3 maintenance_requests (3/3) ✅
**Trigger sources:** supervisor.php (created, approved, rejected)
**Templates:** approved, created, rejected

### 2.4 budget (3/3) ✅
**Trigger sources:** cost.php (alert, over, approved)
**Templates:** alert, approved, over

### 2.5 inspections (1/1) ✅
**Trigger sources:** notification_engine.php (failed)
**Templates:** failed

### 2.6 system (2/2) ✅
**Trigger sources:** supervisor.php (error, sync_failed)
**Templates:** error, sync_failed

### 2.7 engineering_change (12/13) ⚠️
**Trigger sources:** engineering_change.php (cancelled, submitted, review_required, impact_assessment, approval_required, rejected, approved, implemented, verification_*, completed)
**Templates:** approval_required, approved, cancelled, completed, impact_assessment, implementation_due, implemented, rejected, review_required, submitted, verification_fail, verification_partial, verification_pass
**Gap:** `implementation_due` — ไม่มี trigger (scheduled event, ต้องเพิ่มใน notification_engine หรือ cron)

### 2.8 document (10/16) ⚠️
**Trigger sources:** document_control.php (review_required, revision_rejected, revision_approved, approval_required, revision_effective, revision_superseded, revision_obsolete, ack_assigned, ack_completed, ack_exception)
**Templates:** ack_assigned, ack_completed, ack_exception, ack_overdue, approval_required, review_due, review_overdue, review_required, revision_approved, revision_effective, revision_obsolete, revision_rejected, revision_submitted, revision_superseded, training_due, training_expiring
**Gaps (6):** ack_overdue, review_due, review_overdue, revision_submitted, training_due, training_expiring — ไม่มี trigger (scheduled events, ต้องเพิ่มใน notification_engine)

---

## 3. Modules ที่ Trigger บางส่วน

### 3.1 pm_am (2/3) ⚠️
**Trigger sources:** notification_engine.php (due, overdue), supervisor.php (completed)
**Templates:** completed, due, overdue
**สถานะ:** ครบทุก event ✅ (due+overdue จาก engine, completed จาก code)

### 3.2 calibration (2/8) ⚠️
**Trigger sources:** notification_engine.php (due), calibration_management.php (review_pending, approved)
**Templates:** approved, due, interval_changed, oot_detected, overdue, result_failed, review_pending, standard_expired
**Gaps (5):** interval_changed, oot_detected, overdue, result_failed, standard_expired — ไม่มี trigger
**คำแนะนำ:** เพิ่ม trigger ใน calibration_management.php เมื่อเกิดเหตุการณ์เหล่านี้ (OOT detected, result failed, etc.)

### 3.3 rca (4/7) ⚠️
**Trigger sources:** failure.php (assigned, reopened, verification_required, action_assigned)
**Templates:** action_assigned, action_due, action_overdue, assigned, overdue, reopened, verification_required
**Gaps (3):** action_due, action_overdue, overdue — ไม่มี trigger (scheduled events)

### 3.4 shutdown (6/10) ⚠️
**Trigger sources:** shutdown_core.php (status_changed), shutdown_readiness.php (readiness_blocked, ready, startup_blocked, startup_ready), shutdown_baselines.php (baseline_created)
**Templates:** baseline_created, cancelled, completed, created, execution_started, readiness_blocked, ready, startup_blocked, startup_ready, status_changed
**Gaps (4):** cancelled, completed, created, execution_started — ไม่มี trigger
**คำแนะนำ:** เพิ่ม trigger ใน shutdown_core.php เมื่อสร้าง/ยกเลิก/เสร็จสิ้น shutdown

### 3.5 spare_optimization (3/12) ⚠️
**Trigger sources:** spare_optimization.php (reservation_created, reservation_released, reservation_expired)
**Templates:** criticality_review_due, minmax_review_due, reservation_conflict, reservation_created, reservation_expired, reservation_expiring, reservation_released, run_completed, slow_moving_review, stockout_risk, substitute_decision, substitute_proposed
**Gaps (9):** criticality_review_due, minmax_review_due, reservation_conflict, reservation_expiring, run_completed, slow_moving_review, stockout_risk, substitute_decision, substitute_proposed — ไม่มี trigger
**คำแนะนำ:** เพิ่ม trigger ใน spare_optimization.php เมื่อเกิดเหตุการณ์เหล่านี้

### 3.6 work_permit (12/14) ⚠️
**Trigger sources:** safety.php (approval_required, high_risk, rejected, approved, activated, suspended, resumed, closed, expired, gas_red_block, stop_work, cert_expired)
**Templates:** activated, approval_required, approved, cert_expired, closed, expired, expiring, gas_red_block, high_risk, rejected, requested, resumed, stop_work, suspended
**Gaps (2):** expiring, requested — ไม่มี trigger
**คำแนะนำ:** เพิ่ม trigger เมื่อสร้าง work_permit ใหม่ (requested) และเมื่อใกล้หมดอายุ (expiring, ต้องเพิ่มใน notification_engine)

### 3.7 iot (1/8) ⚠️ + Gap ใน DB
**Trigger sources:** iot_alarm.php (alarm_critical, alarm_warning — severity-based)
**Templates:** alarm_acknowledged, alarm_closed, alarm_detected, alarm_escalated, alarm_resolved, connector_failed, device_offline, point_stale
**ปัญหา:** code trigger ใช้ event 'alarm_critical'/'alarm_warning' แต่ DB มี 'alarm_detected'/'alarm_escalated' — ไม่ตรงกัน!
**คำแนะนำ:** แก้ iot_alarm.php ให้ trigger 'alarm_detected' (เมื่อ alarm ใหม่) และ 'alarm_escalated' (เมื่อ severity critical) แทน 'alarm_critical'/'alarm_warning'

### 3.8 spare_parts low_stock (engine) ✅
**Trigger sources:** notification_engine.php
**สถานะ:** ครบ

---

## 4. Modules ที่ยังไม่ integrate (ใช้ legacy LINE เท่านั้น)

### 4.1 asset_reliability ❌
**สถานะ:** ใช้ `sendLineTemplatePush()` (legacy) — ไม่ผ่าน unified notification
**Functions:** ar_notify_lifecycle_change(), ar_notify_component_replace()
**Templates ใน DB:** component_replaced, criticality_review_due, lifecycle_change, overhaul_due, retirement_review (5)
**คำแนะนำ:** เปลี่ยน ar_notify_* ให้เรียก NotificationCenterService::notify() แทน sendLineTemplatePush

### 4.2 contractor ❌
**สถานะ:** ใช้ `sendLineTemplatePush()` (legacy) — ไม่ผ่าน unified notification
**Functions:** ctr_notify() (blocked, qual_result, permit_required, assignment_status, acceptance_result)
**Templates ใน DB:** acceptance_result, assignment_assigned, assignment_status, blocked, cert_expiring, contract_expiring, doc_expired, doc_expiring, permit_required, qual_expiring, qual_result, qualifying_required, sla_breach (13)
**คำแนะนำ:** เปลี่ยน ctr_notify ให้เรียก NotificationCenterService::notify() แทน sendLineTemplatePush

### 4.3 knowledge ❌
**สถานะ:** ไม่มี notify call เลย
**Templates ใน DB:** article_not_helpful, article_published, article_submitted, article_superseded, document_revision_changed, gap_assigned, gap_escalated, gap_opened, gap_resolved, review_due, review_overdue (11)
**คำแนะนำ:** เพิ่ม notify calls ใน knowledge helper functions

### 4.4 reliability ❌
**สถานะ:** ไม่มี notify call เลย
**Templates ใน DB:** action_raised, bad_actor_detected, data_quality_critical, kpi_definition_changed, study_approved, study_closed, study_created, study_submitted, weibull_insufficient (9)
**คำแนะนำ:** เพิ่ม notify calls ใน reliability helper functions

### 4.5 workforce ❌
**สถานะ:** ไม่มี notify call เลย
**Templates ใน DB:** assignment_conflict, capacity_warning, certification_expired, certification_expiring, crew_created, shift_assigned, skill_assigned, training_due (8)
**คำแนะนำ:** เพิ่ม notify calls ใน workforce helper functions

---

## 5. สรุป Gaps ที่ต้องแก้ไข (เรียงตามความสำคัญ)

### 🔴 Critical (ระบบแจ้งเตือนไม่ทำงานจริง)
1. **iot_alarm** — event name ไม่ตรงกับ DB template (alarm_critical/alarm_warning vs alarm_detected/alarm_escalated) → แจ้งเตือนจะไม่พบ template → fallback ใช้ title/message ที่ส่งมา (ยังทำงานแต่ไม่ใช้ template ที่ตั้งค่าไว้)

### 🟠 High (modules ไม่ใช้ unified notification เลย)
2. **asset_reliability** — ใช้ legacy LINE, ไม่ผ่าน unified pipeline (ไม่มี in-app, ไม่มี quiet hours, ไม่มี delivery tracking)
3. **contractor** — ใช้ legacy LINE, ไม่ผ่าน unified pipeline

### 🟡 Medium (scheduled events ที่ยังไม่มี trigger)
4. **calibration** — 5 events (interval_changed, oot_detected, overdue, result_failed, standard_expired)
5. **shutdown** — 4 events (cancelled, completed, created, execution_started)
6. **spare_optimization** — 9 events
7. **work_permit** — 2 events (expiring, requested)
8. **document** — 6 events (ack_overdue, review_due, review_overdue, revision_submitted, training_due, training_expiring)
9. **rca** — 3 events (action_due, action_overdue, overdue)
10. **engineering_change** — 1 event (implementation_due)

### 🟢 Low (modules ที่ยังไม่มี notify calls เลย)
11. **knowledge** — 11 templates ไม่มี trigger
12. **reliability** — 9 templates ไม่มี trigger
13. **workforce** — 8 templates ไม่มี trigger

---

## 6. คำแนะนำสำหรับ PHASE ถัดไป

- **PHASE 09 (Security audit):** ตรวจสอบ RBAC, input validation, CSRF ใน notification endpoints
- **PHASE 10 (E2E testing):** ทดสอบ notification flow จริง (trigger → inbox → delivery → channel)
- **PHASE 11 (Production deployment):** deploy พร้อม monitoring

### ลำดับการแก้ไขที่แนะนำ:
1. แก้ iot_alarm event name (critical, ง่าย)
2. migrate asset_reliability + contractor จาก legacy LINE → unified (high, ปานกลาง)
3. เพิ่ม scheduled triggers ใน notification_engine.php สำหรับ overdue/expiring events (medium)
4. เพิ่ม notify calls ใน knowledge/reliability/workforce (low, ใหญ่)
5. เพิ่ม trigger ใน helper functions สำหรับ events ที่ขาด (medium)
