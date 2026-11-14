# CMMS-TPT — API Integration

## หลักการ

- Dashboard ฝั่ง Next.js เรียก PHP API ผ่าน relative path `/api/v1/*.php` (cookie session)
- ไม่มีการ query DB จาก browser; ไม่มี service ใหม่
- การ parse/จัดรูปแบบทำที่ `frontend/lib/dashboard.ts` (`apiJson`, `fetchOverview`, `fetchTrend`, ...)

## Endpoint ที่ dashboard ใช้จริง

### `GET /api/v1/dashboard.php?action=overview`
พารามิเตอร์: `range` (`today|this_week|this_month|last_month|this_year|last_7d|last_30d` ฯลฯ), `department_id`,
`priority`, `status`, `asset_id`, `source_type`
คืน: `core`, `counts` (ใน `core`), `alerts`, `pm`, `assets`, `tech_workload` (เฉพาะ role 1/2/6/7), `options`, `can`

### `GET /api/v1/dashboard.php?action=trend&range=...`
- ข้อจำกัด: helper `kpi_trend()` จำกัดช่วง ≤ 62 วัน
- Dashboard 12 เดือนจึงเรียก 12 ครั้ง (รายเดือน) แล้วรวมยอด — ระบุไว้ในโค้ดและเอกสาร

### `GET /api/v1/dashboard.php?action=wo&group=all|open|overdue|completed&limit=&offset=`
รายการใบงานสำหรับ drill-down/timeline (มี `limit` สูงสุดตาม helper)

### `GET /api/v1/workload.php`
ไม่มีพารามิเตอร์; คืน `data[]` (ต่อช่าง) + `summary`
ใช้โดย `/repair/workload`

### `GET /api/v1/repair.php?status=open_active&with_total=1&limit=500`
คืนใบงานค้างพร้อม `assigned_name`, `assigned_avatar`, `assigned_avatar_legacy`,
`before_image_path`, `after_image_path`, `estimated_completion_date`
ใช้เติมรายละเอียดงาน + รูปปัญหาในแดชบอร์ดพนักงาน

### `GET /api/v1/repair_attachment.php?work_order_id=<id>`
รูป/ไฟล์แนบแยก (category `failure_image` = ก่อนซ่อม) — ต้องเป็นช่างผู้รับงานหรือหัวหน้า

### `GET /api/v1/mtbf_mttr.php`, `/api/v1/spare_optimization.php?action=availability`, `/api/v1/asset_stats.php`
ใช้ใน wallboard (MTBF/MTTR/plant map/อะไหล่)

## สิทธิ์ (บังคับที่ server)

| Endpoint | Gate |
|---|---|
| ทุก endpoint | `requireLogin($pdo)` |
| mutation ทุกตัว | `enforceCsrf()` |
| `action=cost` | `kpi_can_see_cost($roleId)` + `requireRole` |
| `action=tech` | role 1,2,6,7 |
| `repair_attachment.php` | ช่างผู้รับงาน/ทีม หรือ supervisor |

## รูปแบบ error

- PHP ตอบ `{status:'error', message:...}` หรือ HTTP 4xx/5xx พร้อม JSON
- ฝั่ง UI: `apiJson()` โยน error → dashboard แสดงแบนเนอร์ + คงค่าล่าสุดไว้ (ไม่ล้างข้อมูล)

## สิ่งที่ยังไม่มี (จึงไม่สร้าง)

- endpoint สำหรับ KPI ที่ต้องใช้ชั่วโมงเดินเครื่อง/OEE (ไม่มีข้อมูลต้นทาง)
- endpoint สรุป PM compliance แบบรายเดือน (ตาราง PM ว่าง — จะเพิ่มเมื่อมีข้อมูล)
- GraphQL/BFF ใหม่: ไม่จำเป็น
