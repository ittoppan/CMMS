# PHASE 31 NOTIFICATIONS — module `contractor`

> Phase 31 — 13 เทมเพลตในตาราง `notification_templates` (module = `contractor`)
> seed โดย `scripts/apply_phase31_contractor_management.php`

## 1. กลไก

Engine ยิงผ่าน `ctr_notify()`:

```php
function ctr_notify(PDO $pdo, string $event, string $title, string $message, string $url, ?int $targetUid = null): void {
    if (!function_exists('sendLineTemplatePush')) return;   // ทำงานต่อได้แม้ไม่มี LINE
    if (!$targetUid) return;                                  // ไม่มีผู้รับ = ไม่ยิง
    try {
        sendLineTemplatePush($targetUid, 'contractor/' . $event, ['title' => $title, 'message' => $message], $url);
    } catch (Throwable $e) {
        error_log('ctr_notify: ' . $e->getMessage());         // ยิงไม่สำเร็จห้ามทำให้ transaction พัง
    }
}
```

- ผู้รับหลัก = `internal_owner_id` ของผู้รับเหมา / ผู้รับผิดชอบงาน
- **ยิงล้มเหลวไม่ทำให้งานล้ม** — จับ `Throwable` แล้ว log
- ไม่มี target = ข้ามเงียบ ๆ (ไม่ spam)

## 2. เทมเพลต 13 รายการ

| event | หัวเรื่อง | เมื่อไหร่ | priority | ลิงก์ |
|---|---|---|---|---|
| `qualifying_required` | ต้องกรมการประเมินคุณสมบัติ: `{company_name}` | ส่งเข้ารอบประเมิน | medium | `/contractors/{contractor_id}` |
| `qual_result` | ผลการประเมินคุณสมบัติ: `{company_name}` | ผู้อนุมัติตัดสินรอบประเมิน | high | `/contractors/{contractor_id}` |
| `qual_expiring` | คุณสมบัติใกล้หมดอายุ: `{company_name}` | ใกล้ `valid_until` | medium | `/contractors/{contractor_id}` |
| `doc_expiring` | เอกสารใกล้หมดอายุ: `{company_name}` | ใกล้ `expiry_date` | medium | `/contractors/{contractor_id}` |
| `doc_expired` | เอกสารหมดอายุ: `{company_name}` | เลยวันแล้ว | high | `/contractors/{contractor_id}` |
| `cert_expiring` | ใบรับรองกำลังหมดอายุ: `{worker}` | ใบรับรองพนักงานใกล้หมดอายุ | medium | `/contractors/{contractor_id}` |
| `assignment_assigned` | มอบหมายงานภายนอก: `{assignment_no}` | `ctr_assign()` | high | `/contractors/work?assignment={assignment_id}` |
| `assignment_status` | สถานะงานภายนอกเปลี่ยน: `{assignment_no}` | ทุกครั้งที่สถานะเดิน | medium | `/contractors/work?assignment={assignment_id}` |
| `sla_breach` | งานภายนอกเกิน SLA: `{assignment_no}` | เลยกำหนด | high | `/contractors/work?assignment={assignment_id}` |
| `permit_required` | งานภายนอกต้องมีใบอนุญาต: `{assignment_no}` | พยายามเข้า `work_started` โดยไม่มี PTW | high | `/contractors/work?assignment={assignment_id}` |
| `acceptance_result` | ผลตรวจรับงานภายนอก: `{assignment_no}` | ตรวจรับงานรอบใหม่ | medium | `/contractors/work?assignment={assignment_id}` |
| `contract_expiring` | สัญญาใกล้หมดอายุ: `{contract_no}` | ใกล้ `end_date` | medium | `/contractors/{contractor_id}` |
| `blocked` | ผู้รับเหมาถูกบล็อก: `{company_name}` | เปลี่ยนสถานะเป็น `blocked` | **critical** | `/contractors/{contractor_id}` |

## 3. ตัวแปรในเทมเพลต

| ตัวแปร | ที่มา |
|---|---|
| `{company_name}` / `{contractor_no}` | ผู้รับเหมา |
| `{contractor_id}` | id ผู้รับเหมา (ใช้ต่อใน URL) |
| `{assignment_id}` / `{assignment_no}` / `{title}` / `{work_order_no}` | งานภายนอก |
| `{old_status}` / `{new_status}` / `{note}` | การเปลี่ยนสถานะ |
| `{result}` / `{score}` / `{valid_until}` | ผลประเมินคุณสมบัติ |
| `{doc_type}` / `{doc_no}` / `{expiry_date}` | เอกสาร |
| `{worker}` / `{certification_code}` | ใบรับรองพนักงาน |
| `{contract_no}` / `{end_date}` | สัญญา |
| `{step}` / `{due_at}` | SLA |
| `{round}` / `{reason}` / `{review_date}` / `{planned_end}` | ตรวจรับงาน / บล็อก |

## 4. การตั้งค่า

แก้ได้จากหน้า Notification Center (admin) เพราะทุกเทมเพลตอยู่ใน `notification_templates`
- ปิดเฉพาะ event: `UPDATE notification_templates SET enabled=0 WHERE module='contractor' AND event='sla_breach'`
- ปรับ lead time: `contractor_reminder_days` / `contractor_sla_metrics` ใน settings

## 5. ข้อควรระวัง

- **ไม่มี job ตั้งเวลายิงใน Phase 31** — `doc_expiring` / `qual_expiring` / `contract_expiring`
  คำนวณแล้วแสดงใน dashboard + data-quality ส่วนการยิงตามเวลาให้เสริม cron ในอนาคต
- เทมเพลตที่ยิงทันทีหลัง action: `qual_result`, `assignment_*`, `sla_breach`,
  `permit_required`, `acceptance_result`, `blocked`
- ตรวจสอบการส่งจริง: ดู `notification_center` / log ของ `sendLineTemplatePush`
