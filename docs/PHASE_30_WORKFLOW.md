# PHASE 30 WORKFLOW — PTW State Machine, Approval, LOTO/Stop-Work

> อัปเดตล่าสุด: 2026-09-24

## 1. ขั้นตอนการทำงานจริง (Happy Path)

```
WO/งาน → create (draft) → submit (requested) → risk_review → approve_step×n (approved)
      → activate (active) ── LOTO points + lock + zero-energy verify ── gas_test
      ── worker_add (authorization) + entry ── PPE confirm ── checklist pre_work
      └→ ปฏิบัติงาน → complete (completed) → checklist post_work + final inspection → close (closed)
```

## 2. สถานะ + Transitions ที่ถูกกฎ (`wp_valid_transitions`)

| จาก | ไป ถูกกฎ |
|---|---|
| draft | requested, cancelled |
| requested | risk_review, approved, rejected, cancelled |
| risk_review | approved, requested, rejected, cancelled |
| approved | active, requested, rejected, cancelled |
| active | suspended, completed, expired, requires_review, cancelled |
| suspended | active, expired, cancelled |
| expired | requires_review, cancelled, closed |
| requires_review | approved, closed, cancelled |
| completed | closed, cancelled |
| closed / cancelled / rejected | (terminal) |

- อื่นที่ไม่ตรงกฎ → `409 BAD_TRANSITION`
- transition แต่ละตัว map ไป timestamp column (`wp_timestamp_col`) เช่น `active→activated_at`

## 3. Approval Chain (`permit_approvals`)

สร้างโดย `wp_ensure_approval_steps` ตาม `permit_types.approval_flow_json` (role_key ตามลำดับ)

| ประเภทงาน (seed) | flow เริ่มต้น |
|---|---|
| general_work / hot_work / work_at_height / excavation / lifting / other | supervisor → safety |
| electrical / line_breaking | supervisor → safety → area_owner |
| confined_space / chemical | supervisor → safety → area_owner |

- Sorted steps; `PRIOR_STEP_PENDING` กันการข้ามขั้น
- `wp_can_approve_step` re-check ว่าผู้ตัดสินใจเป็น role ที่กำหนด (backend) — ไม่เชื่อข้อมูล frontend
- decision = `approved | rejected | revision_requested` (NOT `approve`) — API use `approve_step`
- ลำดับครบ → สถานะ `approved` (เฉพาะเมื่อ `wp_require_approval=1`)
- High/Critical risk ต้องมี role ตาม `risk_matrix_required_approval` (เช่น manager) ก่อน approve (`FORBIDDEN_STEP`)

## 4. เงื่อนไขก่อนผ่านแต่ละขั้น (backend ตรวจเสมอ)

| เงื่อนไข | ละเมิดเมื่อ | error code |
|---|---|---|
| ต้องมี risk review ก่อน approve | `wp_require_risk_review=1` และยังไม่มี | `RISK_REQUIRED` |
| approval ครบก่อน activate | ยังไม่ครบทุกขั้น | `FORBIDDEN_STEP` |
| gas test บังคับก่อน active | type ต้อง gas + ยังไม่มีผล | `GAS_REQUIRED` |
| LOTO/Isolation บังคับ | type ต้อง isolation + ยังไม่ verify | `ISOLATION_REQUIRED` |
| PPE ยืนยัน | ยังไม่ครบตาม type | `PPE_REQUIRED` |
| worker authorization | มี worker แต่ cert ไม่ผ่าน/หมดอายุ | `NOT_AUTHORIZED` |
| lock/tag | lock/tag ยังไม่ออก (ต้องมี lock_no หรือ tag_no) | `LOCK_TAG_REQUIRED` |
| stop work ค้าง | มี stop work ที่ยัง unresolved → ห้าม transition | `ACTIVE_STOP` |

## 5. LOTO / Zero Energy

```
loto_add (point: energy_type/source) → loto_lock (lock_no|tag_no, state=locked)
→ loto_verify (zero-energy verification: verify_by/verified_at) → กลับ energy restore
→ loto_remove (หลังงาน เสร็จ robust + verifier)    [detail: remove ต้องผ่าน card ยืนยัน]
```

- Isolation point validation บน backend; removal ต้องมีเหตุผล และจุดถูกล็อกก่อน
- Asset ที่ isolation: เปลี่ยนสถานะต้องผ่าน `ar_lifecycle_change()` (rule 13 ใน CURRENT_STATE)

## 6. Gas Test

- `permit_gas_tests`: หนึ่ง result ครอบก๊าซ (O2/LEL/H2S/CO/other) read at time + instrument
- Instrument calibration RED → `409 INSTRUMENT_RED` (block เมื่อ `wp_gas_block_red=1`);
  AMBER → warning (`wp_gas_warn_amber`)
- ตรวจ expiry ตามนโยบาย settings — ห้ามใช้ expired calibration instrument

## 7. Suspension / Resume / Stop Work

**Suspension (plan-เหตุ):** `suspend(reason)` → suspended; `resume()` ต้องผ่าน re-verification
(record ใหม่) → active

**Emergency Stop Work (`stop_work`):**
```
active → stop_work (reporter/reason) → STATUS stop active
→ review (resolved → กลับ active หลัง re-assessment ที่จำเป็น / cancel)
```
- **ห้าม resume อัตโนมัติ** หลัง stop work — ต้อง `stop_work_review` ก่อน (`ACTIVE_STOP`)
- ประวัติครบใน `stop_work_reports` + `permit_suspensions` + audit

## 8. Permit Close

- `complete()` → completed (ตรวจ pre/post checklist ไม่ครบ? `CHECKLIST_INCOMPLETE`)
- `close()` → ตรวจ `wp_require_final_inspection`: ต้องมี checklist post_work
- ปิดแล้วไม้ได้เปิดต่อ (closed terminal) — ต้องการงานต่อ → ใบใหม่

## 9. Expiry (Policy-driven)

- `wp_handle_expiry()`: `active` ที่ `valid_until` ผ่าน → `expired` (เมื่อ `wp_auto_expire_enabled=1`)
  → policy `wp_expiry_policy`: `expire` = หมดอายุเลย / `review` = `requires_review`
- `expired` → `requires_review` (ตรวจซ้ำ) → `approved` ใหม่ / `closed` / `cancelled`
- Notification events: `expiring` (ก่อนหมดอายุ) / `expired`

## 10. Worker Authorization

- `worker_add` → ตรวจ certification: หมดอายุ → `NOT_AUTHORIZED` (`wp_cert_expired_block=1`)
- `entry`/`exit` บันทึกเวลา (confined space: entry ต้องถูกต้อง — ใช้ audit ตาม)

## 11. Frontend UI Mapping

- `StatusStepper.tsx`: 7 ขั้น label (ร่าง→ขออนุญาต→ประเมินเสี่ยง→อนุมัติ→ปฏิบัติงาน→เสร็จงาน→ปิดใบ) —
  สถานะ real จาก backend (`wp_detail.status_label`), กลุ่ม status → ขั้น stepper
- Detail page แสดง transition buttons ตาม `can` matrix + concrete safety rules
- Action ที่เปลี่ยนข้อมูลทุกตัวต้องเปิด modal ยืนยัน + ส่งต่ backend verify