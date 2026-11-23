# Phase 9 — P9-4: รายงาน PDF ประจำเดือน (`/reports/monthly_pdf`) audit

> วันที่: 2026-11-23 · ขอบเขต: หน้า `/reports/monthly_pdf` + `/api/v1/analytics_monthly.php`
> สถานะ: **AUDIT + 2 จุดแก้ UI เสร็จ** (ยังเหลือ P9-1/P9-2/P9-3 ของ Phase 9 หลัก)

## 1. Before audit — สิ่งที่พบ

| # | ระดับ | สิ่งที่พบ | หลักฐาน |
|---|---|---|---|
| M1 | **HIGH** | หน้าดึงข้อมูลจาก `/api/v1/index.php` (raw dump ทุกใบงาน) เพื่อคำนวณ `yearCost` — ไม่มี scope ตาม role, ดึงทั้งตารางมาคำนวณในเบราว์เซอร์ และข้อมูลไม่ตรงกับ cost ที่รายงาน | `frontend/app/(dashboard)/reports/monthly_pdf/page.tsx` (ก่อนแก้) |
| M2 | **HIGH** | ชื่อผู้ลงนามดึงจาก `/api/v1/menu_permissions.php?user=1` — hardcode `user=1` ทำให้รายงานแสดงชื่อ "admin" เสมอ ไม่ว่าใครเปิด | ไฟล์เดิม |
| M3 | MEDIUM | `monthCost = cur.cost * 10000` — API ส่ง cost เป็น หมื่นบาท (ROUND(.../10000,1)) หน้าคูณ 10000 กลับ → สมมติว่าหน่วยเดิม "หมื่นบาท" ต้องตรวจให้แน่ใจ | `analytics_monthly.php:18-21`, page.tsx |
| M4 | LOW | `pm_am` นับจาก `YEAR(created_at)` ไม่ใช่ due/completed date — PM compliance อาจไม่ตรงกับ "แผนของปีนั้น" จริง | `analytics_monthly.php:78` |
| M5 | INFO | หน้าใช้ `html2canvas` + `jsPDF` (client-side) — ไม่ใช่ export ฝั่งเซิร์ฟเวอร์, ไม่มี `report_audit_log` | ไฟล์เดิม |

## 2. สิ่งที่แก้ (UI only, ไม่แตะ API)

1. **ตัดการดึง `/api/v1/index.php`** ออกจากหน้า — `yearCost` คำนวณจาก `monthly` (cost × 10000) ที่ดึงจาก `analytics_monthly.php` แล้ว → ข้อมูลหนึ่งแหล่ง, ไม่มี raw dump ในเบราว์เซอร์
2. **เปลี่ยน endpoint ชื่อผู้ใช้** จาก `menu_permissions.php?user=1` เป็น `profile.php` (session-based) → รายงานแสดงชื่อผู้ใช้ที่ล็อกอินจริง

## 3. สิ่งที่วัดได้ (ข้อมูลจริง 2026, role admin)

- `analytics_monthly.php?year=2026` คืน 12 เดือน, `cost` เป็น หมื่นบาท (ROUND(.../10000,1)) — หน้าคูณ 10000 กลับเป็นบาท → หน่วยสอดคล้องกับ API
- `mtbf`/`mttr` มาจากตาราง `mtbf_mttr` จริง (round AVG) — ไม่มี mock
- `workOrders` state ยังเก็บไว้ (ไม่ใช้แล้ว) — ไม่กระทบ build

## 4. Tests

| การทดสอบ | ผล |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `NEXT_DIST_DIR=.next-verify npm run build` | exit 0 (รันรวมกับ commit ถัดไป) |

## 5. Known issues / ยังไม่ปิด

| # | ระดับ | เรื่อง | หมายเหตุ |
|---|---|---|---|
| P9-4a | MEDIUM | PDF ยังเป็น client-side (html2canvas) — ไม่มี server-side render/audit log | ต้องเขียน endpoint ใหม่ถ้าต้องการ audit |
| P9-4b | LOW | M4: PM compliance นับจาก `YEAR(created_at)` ของ pm_am — ควรยืนยันกับเจ้าของว่าต้องการ "แผนของปี" หรือ "แผนที่ครบในปี" |
| P9-4c | LOW | ชื่อผู้ลงนาม "นายสมศักดิ์ รักดี" และ "ผจก. ฝ่ายผลิต..." เป็นค่า hardcode ในหน้า — ควรดึงจากข้อมูลองค์กรหรือปล่อยให้กรอก | ไม่แตะในรอบนี้ |

## 6. สิ่งที่ต้องอนุมัติ

- อนุมัติให้ลบ `workOrders` state ที่ไม่ใช้แล้ว (dead code) หรือจะเก็บไว้
- อนุมัติแก้ M4 (PM compliance นับจาก due_date แทน created_at) — เป็นการเปลี่ยนสูตร ต้องได้อนุมัติเจ้าของระบบ
