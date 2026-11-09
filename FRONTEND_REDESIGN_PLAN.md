# Frontend Redesign Plan — CMMS-TOPPAN

ขอบเขต: ทำ design foundation ใหม่ทั่วระบบ + ปรับ frontline หน้าใหญ่ให้ออก "clean, calm enterprise" 
ยังคง: Astryx/TOPPAN blue, PWA shell (sidebar + mobile bottom nav), dark/light ที่มีอยู่

## แนวทางโดยรวม

1. **Foundation ก่อน** — typography scale, spacing rhythm, color role, component tone
   - ปรับที่จุดร่วม (globals, ui primitives) ให้ทุกหน้าถูกปรับโดยปริยาย
   - ยังไม่เนิ่นปรับหน้าตรงจุดจนกว่า language ศูนย์กลางจะคอนซิส
2. **Frontend frontline** — หน้าที่ใช้บ่อย + มีข้อมูลเยอะที่สุด
   - Dashboard manager/admin
   - แจ้งซ่อม (operator/technician)
   - my_tasks / tracking / checksheet (technician)
   - listing หลักๆ: repair, asset_registry, calibration, spare_parts, reports
   - หน้าตั้งค่าเมนู/สิทธิ์ (settings/menus)
3. **Sweep เหลือ** — หน้าอื่นๆ ที่ยังเกาะเก่าตาม consistency language ใหม่

## ไฟล์หลักที่จะปรับ (รอบแรก)

### Foundation
- `frontend/app/globals.css` — typography / spacing / color role / section rhythm
- `frontend/components/ui/card.tsx`
- `frontend/components/ui/button.tsx`
- `frontend/components/ui/input.tsx`
- `frontend/components/ui/badge.tsx`
- `frontend/components/ui/table.tsx`

### Dashboard
- `frontend/app/(dashboard)/dashboard/page.tsx`
- `frontend/components/dashboard/kit.tsx` — KpiCard, SectionHeading, RangePicker, FilterBar, StatusPill, RefreshBlock

### หน้า frontline อื่นๆ (ตามหลัง dashboard)
- หน้าแจ้งซ่อม, my_tasks, tracking, checksheet, calendar
- listing หน้า repair / asset_registry / calibration / spare_parts / reports
- settings/menus

## หลักการออกแบบใหม่ (calm enterprise)

- **Hierarchy ชัด:** จุดสำคัญสุดใหญ่/เด่น/มีพื้นที่ว่าง มากกว่าเน้นสีหรือ density
- **ประกอบง่าย:** ส่วนมากทำจาก card + section heading + control bar + table/badge — ลด custom widget ที่ไม่จำเป็น
- **น้อยคือเยอะ:** KPI card น้อยแต่ชัด, alert ใช้เมื่อต้องกระทำจริง, อื่นๆ secondary/collapse ได้
- **ภาษาสีเดียว:** brand สำหรับจุดดำเนินการสำคัญ, neutral สำหรับโครงสร้าง, status color สำหรับสถานะเท่านั้น
- **Spacing rhythm เดียว:** 8/12/16/24 — ลดกระจัดกระจาย

## สิ่งที่ไม่ทำในรอบนี้

- ไม่รื้อ PWA shell ใหม่
- ไม่เพิ่ม dependency ใหม่นอกจากที่มีอยู่
- ไม่ทำทุกหน้าพร้อมกัน — เริ่มที่ foundation + frontend dashboard แล้วค่อย sweep
