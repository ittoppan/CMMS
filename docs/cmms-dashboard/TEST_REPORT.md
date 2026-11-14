# CMMS-TPT — Test Report

> รอบ: 2026-11-14 (หลังเพิ่ม KPI drill-down + เอกสาร)
> ใช้ป้าย PASS / FAIL / BLOCKED / NOT TESTED ตามจริง — ไม่กล่าวอ้างสิ่งที่ไม่ได้รัน

## ผลการตรวจที่รันจริง

| # | รายการ | คำสั่ง | ผล |
|---|---|---|---|
| 1 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** (0 error) |
| 2 | Design audit (strict) | `python scripts/design-audit.py --strict` | **PASS** (242 หน้า, FAIL 0, WARN 0) |
| 3 | Production build | `cd frontend && npm run build` | **PASS** (exit 0) |
| 4 | Pre-push hook | `git push` (pre-push รัน tsc + next build) | **PASS** |
| 5 | ข้อมูล KPI เทียบฐานจริง | สคริปต์ PHP เรียก `kpi_core_metrics()` / `kpi_pm_metrics()` / `kpi_asset_health()` | **PASS** (ค่าที่ได้ตรงกับ SQL ที่นับเอง: open 99, overdue 71, PM 0, MTTR null) |

## ผลตรวจ KPI เทียบต้นทาง (evidence)

```
total_wo_created = 10      (created_at อยู่ในเดือนนี้)
wo_completed_in_range = 0  (completed_at NULL 99/99)
completion_rate = 0         (0/10)
mttr_hours = null           (ไม่มี repair_time_minutes/completed_at)
mtbf_hours = null           (ไม่มี breakdown ที่ปิดงาน)
sla_compliance_pct = null   (ไม่มีใบปิดที่มี due date)
pm.completion_rate = null   (pm_am 0 แถว)
downtime_minutes = 0        (คอลัมน์เป็น 0 ทุกแถว)
cost_total = 0              (cost_* เป็น 0 ทุกแถว)
overdue_wo = 71             (กฎเปิดเกิน 7 วัน)
assets: total 82 / running 82 / down(=มีใบงานค้าง) 82
```

## สิ่งที่ยังไม่ได้ทดสอบ (NOT TESTED)

| รายการ | เหตุผล |
|---|---|
| คลิก KPI → หน้ารายการที่กรองแล้ว | ไม่ได้เปิดเบราว์เซอร์ตรวจด้วยตาในรอบนี้ (ตรวจเฉพาะ type/build) |
| TV rotation จริง (นับถอยหลัง/สลับหน้า/pause) | ต้องเปิดหน้าเว็บค้างไว้ ≥ 45 วินาที |
| รูปช่าง/รูปปัญหาแสดงจริง | `before_image_path` ว่าง 99/99 และไม่มี work_assignees ที่ถูกต้อง → UI จะขึ้น "ไม่มีรูป" ตามข้อมูล |
| Export PDF/Excel | ไม่ได้รัน (ต้องมี session + ข้อมูลที่เลือก) |
| ทดสอบสิทธิ์ 2 บทบาท | ไม่ได้ล็อกอินด้วยบัญชีอื่นในรอบนี้ |
| Responsive ที่ความละเอียดอื่น | รอบก่อนตรวจ 1920×1080 / 2560×1440 / 3840×2160 แล้ว; รอบนี้ไม่ได้ตรวจซ้ำ |

## ข้อควรระวังที่พบระหว่างทดสอบ

1. การค้นหาโค้ดด้วย `grep` ทั้ง `frontend/` จะโดนไฟล์ build ใน `frontend/.next` (ไฟล์ .map ขนาดใหญ่) — ควรจำกัด path หรือใช้ `-g '!*.map'`
2. `work_assignees.ref_id` = 1,2,3 แต่ `repair.id` เริ่มที่ 6 → ข้อมูลมอบหมายช่างเป็น orphan ทั้ง 5 แถว
