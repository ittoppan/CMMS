# MASTER UX PRIORITY — CMMS-TPT

> Phase 1 · 2026-11-23 · ลำดับงานที่ต้องทำก่อน-หลัง พร้อมเหตุผลและผลกระทบ
> อ้างรหัสปัญหา: C#/H#/M# จาก `MASTER_UX_AUDIT.md`, U# จาก `MASTER_UI_AUDIT.md`

## ลำดับที่แนะนำ (บนลงล่าง)

| ลำดับ | งาน | รหัส | Phase | ทำไมต้องก่อน | ผลถ้าไม่ทำ |
|---:|---|---|---|---|---|
| 1 | ปิด D3.2 Supervisor overview (commit + เทส) | H3, U2 | 6 | โค้ดเสร็จและ tsc ผ่านแล้ว แต่ยังไม่ถูกบันทึก/ยืนยัน | งานหาย, รายงานไม่ตรงจริง |
| 2 | Queue workspace: mobile card + debounce + total/pagination + states | C1, H1, H2 | 6 | Foreman ใช้งานหน้างานไม่ได้ = งานหลักของระบบ | ต้องกลับไปใช้กระดาษ |
| 3 | Work Order detail: compact summary + aging + mobile | M1 | 6 | ใช้ร่วมกับ queue ทุกวัน | อ่านช้า พลาดกำหนด |
| 4 | Responsive 768/1440 + axe ทั้ง 3 breakpoint (หน้าใน Phase 6) | H9 | 6 | ปิดช่อง "ผ่านแค่ 390" | regression มือถือ/แท็บเล็ต |
| 5 | Dashboard KPI validation + INSUFFICIENT DATA + last-updated | C2 | 4 | ตัวเลขผิดทำให้ตัดสินใจผิด | ผู้บริหารไม่เชื่อระบบ |
| 6 | Drill-down KPI → ใบงาน (เมื่อ API รองรับ) | M3 | 4/9 | ลดการค้นหาด้วยมือ | เสียเวลา |
| 7 | Reports/Export parity + permission + progress | H5 | 9 | export ผิด = ข้อมูลรั่ว/รายงานผิด | ความเสี่ยง compliance |
| 8 | Wallboard TBT: แยก chart เป็น lazy module | H4 | 4 | เครื่องหน้างานช้า | wallboard ใช้งานจริงไม่ได้ |
| 9 | PM/Planning: ตรวจ workflow ด้วยข้อมูลจริง | C2 (PM=0) | 7 | ต้องมีข้อมูลก่อน | ตรวจไม่ได้ → BLOCKED |
| 10 | Role-based landing + menu-permission alignment | H6, H7 | 3 | ลด 403/สับสน | ผู้ใช้ไม่รู้จะเริ่มไหน |
| 11 | Asset/Spare: server-side pagination | M4 | 8 | payload 1MB ช้า | เปิดหน้านาน |
| 12 | 13 route ใหม่เข้า UI migration table + แก้ header/spacing | C4, U1 | 4/6 | รักษามาตรฐานเดิม | UI แตกแถว |
| 13 | Design tokens + component library docs | — | 2 | ทำให้ phase หลังเร็ว/สม่ำเสมอ | แก้ซ้ำไม่จบ |
| 14 | ลบ demo pages + tmp files | U5 | 2 | ความสะอาด/ความปลอดภัย | route แปลกใน production |
| 15 | API enforcement ทีละกลุ่ม (หลัง UAT role) | C3 | 11 | ปิดช่องสิทธิ์ | ข้อมูลเกินสิทธิ์ |

## สิ่งที่ **ห้าม** ทำก่อนได้รับอนุมัติ

| งาน | เหตุผล |
|---|---|
| เพิ่ม filter department/date-range/description-search ใน `supervisor.php` | ต้องเปลี่ยน API contract |
| บังคับสิทธิ์ endpoint ที่หน้าเว็บยังพึ่งพา (users list, sage_items, pm_am, spare_parts) | จะทำให้ role จริง 403 |
| ปิด/ลบใบงาน 126 ใบ (ข้อมูลนำเข้า) | ผิดกฎห้าม mass close |
| Deploy production / migration | ต้องผ่าน Staging + อนุมัติเจ้าของระบบ |
| เปลี่ยน auth (approval token, LINE LIFF) | ผิดกฎ preserve |

## ตัวชี้วัดความสำเร็จของ UX (วัดซ้ำหลังจบแต่ละ phase)

| Flow | ปัจจุบัน | เป้า |
|---|---|---|
| User แจ้งซ่อม | 4 คลิก | ≤4 (คงไว้) |
| Foreman เห็นงานค้าง | 1 คลิก | ≤1 |
| Foreman มอบหมายงานจาก queue | ยังไม่วัด | ≤2 (เลือก → assign) |
| Operate เปิดงานตัวเอง | 1 คลิก | ≤2 |
| Operate ปิดงาน (checksheet) | ยังไม่วัด | ≤5 |
| Queue บนมือถือ | อ่านไม่ได้ | อ่านได้ไม่ต้อง scroll แนวนอน |
