# CMMS-TPT — Performance Report

> ยังไม่ได้วัด latency จริง (ไม่มี profiling) — เอกสารนี้บันทึกเฉพาะสิ่งที่ตรวจได้จากโครงสร้างและจำนวนคำขอ

## จำนวนคำขอต่อการโหลด 1 ครั้ง (wallboard `/dashboard`)

| กลุ่ม | จำนวน call | หมายเหตุ |
|---|---:|---|
| `action=overview` | 1 | KPI + alerts + pm + assets |
| `action=trend` | 1 | ช่วงที่เลือก (≤ 62 วัน) |
| trend รายเดือน 12 เดือน | 12 | ข้อจำกัด 62 วัน/ครั้ง → ยิง 12 ครั้งขนาน (`Promise.allSettled`) |
| `action=downtime` | 1 | |
| `action=wo` (recent + open 200) | 2 | ใช้ modal งานค้าง |
| `action=pm` | 1 | |
| `mtbf_mttr`, `asset_stats?plant_map`, `spare_optimization` | 3 | |
| **รวม** | **~21** | ขนานกัน ยกเว้น overview ที่รอก่อน |

หน้า `/repair/workload`: 2 call (`workload.php` + `repair.php?status=open_active&limit=500`)

## การป้องกันที่ใส่ไว้แล้ว

- ใช้ `Promise.allSettled` → endpoint ใดล้มก็ไม่ทำให้ทั้งหน้าเสีย
- จำกัด `limit` ของรายการ (200/500) ไม่โหลดประวัติทั้งหมดเข้า browser
- หลีกเลี่ยง N+1: ตัวชี้วัดช่างมาจาก SQL เดียว (`workload.php` group by)
- `useMemo` สำหรับการจัดกลุ่มงานต่อช่าง (ไม่คำนวณซ้ำทุก render)

## ข้อควรปรับเมื่อข้อมูลโต

1. ถ้า `repair` โตเกิน ~50k แถว: เพิ่ม index ที่ `(status, assigned_to)`, `(created_at)`, `(asset_id, completed_at)` (ตรวจ `SHOW INDEX` ก่อนสร้าง)
2. 12 trend calls ควรแทนด้วย endpoint สรุปรายเดือน (helper ใหม่ใน `src/helpers/kpi.php`) เมื่อมีข้อมูลพอ
3. ควร cache `overview` 30–60 วินาทีที่ระดับ PHP (APCu/file cache) ถ้ามีผู้ใช้หลายจอ

## ยังไม่ได้วัด

- เวลาตอบสนองจริงของแต่ละ endpoint (NOT TESTED)
- ขนาด JS bundle หลังเพิ่มหน้า dashboard (ตรวจได้ด้วย `npm run build` output)
