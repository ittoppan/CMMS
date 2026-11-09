# PHASE 30 NOTIFICATIONS — module `work_permit`

> อัปเดตล่าสุด: 2026-09-24 · ส่งผ่าน `NotificationCenterService::notify()` (ไม่ใช้ legacy LineService)

## 1. Events (notification_templates module=work_permit)

| event | priority | ใครได้รับ / เมื่อไร |
|---|---|---|
| `requested` | high | requester — หลัง submit |
| `approval_required` | high | ผู้ตัดสินใจขั้นถัดไป — หลัง submit/risk review ครบ |
| `approved` | high | ผู้เกี่ยวข้อง — ครบทุกขั้น |
| `rejected` | medium | requester (+ reason) |
| `activated` | high | worker/owner — permit เริ่มใช้ได้ (ถึง valid_until) |
| `expiring` | high | ก่อนหมดอายุ (ช่วง config) |
| `expired` | high | พ้น valid_until → ตาม policy |
| `suspended` | high | ระงับ + reason |
| `resumed` | high | กลับมาทำงาน + re-verification |
| `closed` | high | ปิดใบ + สรุป |
| `stop_work` | critical | คนเกี่ยวข้องทั้งหมด — Emergency STOP WORK |
| `high_risk` | critical | approval role — งาน High/Critical |
| `cert_expired` | medium | worker cert หมดอายุ → authorization |
| `gas_red_block` | high | gas test โดน block (calibration RED) |

## 2. Template variables

`{permit_no}`, `{permit_type}`, `{asset_name}`, `{requester}`, `{approval_step}`,
`{valid_until}`, `{risk_level}`, `{reporter}`, `{worker}`, `{instrument}`, `{reason}`,
`{permit_id}` (url `/safety/work_permit/{permit_id}`)

## 3. ตัวอย่าง URL target

- ลิงก์ทุก event → `/safety/work_permit/{permit_id}` (detail)
- ช่วยให้กดจาก LINE/แอปไปยังหน้างานได้ทันที

## 4. หมายเหตุ integration

- Phase 30 **ไม่ใช้** `ApprovalService` legacy (`NotificationService::sendLineMessage` /
  `public/approve.php`) สำหรับ flow ใหม่ — approval ผ่าน `work_permit.php` + `safety.php` โดยตรง
  (เหตุผล: ระยะ เก่า auto-approve + ไม่มีสายขั้น many types)
- `wp_notify()` เรียกจากไขลาน engine (create/submit/approve/activate/suspend/resume/stop_work/close/high risk/expiry/cert/gas block)