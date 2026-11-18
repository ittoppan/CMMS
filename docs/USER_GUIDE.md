# คู่มือการใช้งาน CMMS-TPT (ฉบับสมบูรณ์ — ทุกฟังก์ชัน)

> ครอบคลุมทุกโมดูลของระบบ CMMS-TPT (Next.js + PHP API) สำหรับผู้ใช้ทุกบทบาท
> เข้าถึงได้ผ่าน `https://cmms-tpt.shares.zrok.io/` บนมือถือ/เว็บ/LINE (zrok tunnel — URL ถาวร)
> อัปเดตล่าสุด: 2026-11-18

## สารบัญ
1. การเข้าสู่ระบบ & บทบาทผู้ใช้
2. Dashboard & Home
3. ระบบงานซ่อม (Repair)
4. ระบบงาน PM&AM
5. ระบบงานสอบเทียบ (Calibration)
6. ทะเบียนทรัพย์สิน / เครื่องจักร
7. Asset Reliability
8. ระบบอะไหล่ (Spare Parts)
9. QR Code & การสแกน
10. ยืม/คืนเครื่องมือ
11. ไฟล์คู่มืออุปกรณ์ (Manuals)
12. ความรู้ (Knowledge)
13. RCA
14. Shutdown / Turnaround
15. การตรวจสอบ (Inspections)
16. งานภาคสนาม (Field Work)
17. IoT
18. เอกสาร & แบบฟอร์ม
19. Engineering Changes
20. Process Flows
21. ความปลอดภัย / Work Permit
22. งบประมาณ & ต้นทุน
23. การวางแผน (Planning)
24. Supervisor
25. Workforce
26. Reliability
27. ซัพพลายเออร์
28. ผู้ใช้งาน & บทบาท
29. รายงาน & KPIs & Andon
30. การแจ้งเตือน
31. Audit Log
32. การตั้งค่า
33. PWA / ติดตั้งแอป
34. โปรไฟล์ & เปลี่ยนรหัสผ่าน
35. TV / Andon Board
36. คู่มือเฉพาะบทบาท
37. LINE โมบายบริดจ์
38. ข้อแนะนำเพิ่มเติม

---

# 1. การเข้าสู่ระบบ & บทบาทผู้ใช้

## 1.1 วิธีเข้าสู่ระบบ
| ช่องทาง | วิธี |
|---|---|
| **เว็บ** | เปิด URL → หน้า Login → กรอก Username/Password หรือกด "เข้าสู่ระบบด้วย LINE" |
| **LINE (แนะนำ)** | กดปุ่ม Rich Menu / ลิงก์ในแชท → ล็อกอินด้วย LINE → ครั้งแรกต้องผูกบัญชี (ข้อ 37.1) |
| **แอป (PWA)** | เปิดหน้าแรกบนมือถือ → Add to Home screen (ดูข้อ 33) |
| **QR** | สแกน QR ที่ตัวเครื่อง → `/scan` → แจ้งซ่อม/ทำ PM ได้ทันที |

- สิทธิ์เข้าเมนู = ตามบทบาท (Admin / Manager / Technician / กำหนดเองได้ที่ `ตั้งค่า > เมนูและสิทธิ์`)
- ปุ่ม "บัญชีทดสอบ" บนหน้า Login มีไว้ทดสอบระบบ
- ลืมรหัสผ่าน: `/change-password` (ผู้ดูแลรีเซ็ตได้ที่ `/users`)

## 1.2 บทบาท (Roles)
- **Admin (role 1)**: จัดการ users/roles/settings/backup/audit → `docs/ADMIN_RUNBOOK.md`
- **Manager (role 2/6)**: เห็น board/KPI + อนุมัติใบเบิกอะไหล่/PO + ออกรายงาน + ดู audit — ไม่รับงานซ่อมเอง
- **Supervisor/Foreman (role 7)**: อนุมัติคำขอ, มอบหมาย/จัดตาราง, verify/ปิดงาน, จัดการช่าง
- **Technician (ช่าง)**: รับงาน/ซ่อม/PM/เบิกอะไหล่
- **Operator (ผู้ควบคุมเครื่อง)**: แจ้งซ่อม + รูป, ติดตามสถานะ
- **Planner**: วางแผน PM, สร้างแผน, generate WO, เลื่อน PM
- **Officer-Read (role 10)**: ดูอย่างเดียว (view-only)
- กำหนดสิทธิ์เข้าเมนูได้ที่ `ตั้งค่า > เมนูและสิทธิ์` (`/settings/menus`)

---

# 2. Dashboard & Home

## 2.1 หน้าแรก (Home) `/home`
- ภาพรวมระบบ: งานค้าง/ด่วน, KPI หลัก, widget คุณภาพข้อมูล, ช่องว่างความรู้ (knowledge gaps)
- ทางลัดไปโมดูลหลัก

## 2.2 Dashboard `/dashboard` (และ `/dashboard/my`, `/dashboard/list`)
- งานค้าง/ด่วน, MTBF/MTTR, ค่าใช้จ่าย, งานของฉัน
- `/dashboard/my` = งานของฉัน (ช่าง), `/dashboard/list` = รายการ

## 2.3 Andon Board `/andon-board`
- บอร์ดแสดงสถานะเครื่อง/งานแบบเรียลไทม์

## 2.4 Alert Center `/alert-center`
- ศูนย์แจ้งเตือน/เหตุการณ์สำคัญ

---

# 3. ระบบงานซ่อม (Repair)

## 3.1 การแจ้งซ่อม `/repair/request` หรือ `/scan`
1. เลือก **เครื่องจักร/เครื่องมือ*** — ค้นหาจากชื่อหรือเลข QR
2. ระบุ **ลักษณะอาการเสีย*** / ความด่วน (ปกติ/ด่วน/CRITICAL) + ประเภทใบงาน, ความปลอดภัย, Product Lot No.
3. แนบ **ภาพ/คลิป** (ถ้ามี)
4. กด **ยืนยัน** → "แจ้งซ่อมสำเร็จ" → ปิด
5. ระบบแจ้งเตือน: LINE กลุ่มช่าง (การ์ดสีแดง+รูป) → หัวหน้ามอบหมาย → ช่างได้ LINE Push + อีเมล
> งานด่วนส่ง LINE ทันทีพร้อมปุ่มดูรายละเอียด

## 3.2 การแจกงานซ่อม (หัวหน้า/วิศวกร) `/repair/assign`
1. กรอง: สถานะ/ช่าง/เลขใบงาน; แถบสรุป รอมอบหมาย/มอบหมายแล้ว/กำลังซ่อม
2. กด **มอบหมายงาน** → เลือกช่างผู้รับผิดชอบ (+ทีม) → **บันทึก** → ช่างเห็นงานใน "งานของฉัน" + ได้ LINE
3. เปลี่ยนช่าง: ปุ่ม **เปลี่ยนช่าง** บนใบงาน → เลือกใหม่ → บันทึก

## 3.3 งานของฉัน (ช่าง) `/repair/my_tasks`
- **งานใหม่**: รับทราบ / เริ่มซ่อม / ไปทำ PM
- **กำลังซ่อม**: ระบุเสร็จวันที่; สถานะ "รออะไหล่" ถ้าเบิกอะไหล่
- **ซ่อมเสร็จแล้ว**: ปิดงาน (Failure Code, Repair Code, Root Cause, Solution + รูปหลังซ่อม)
- ปิดงาน: กด **ดูรายละเอียดปิดงาน** → กรอก → **บันทึก** → ระบบนับ Downtime/ค่าซ่อม

## 3.4 ติดตามงาน `/repair/tracking`
- สถานะ: รอมอบหมาย → มอบหมายแล้ว → รับงาน → กำลังซ่อม → ซ่อมเสร็จ → เรียบร้อย/รอประเมิน

## 3.5 ประเมินงาน `/repair/view` (ปุ่มประเมิน)
- ให้คะแนนดาว + ความเห็น → บันทึก

## 3.6 ประวัติงานซ่อม `/repair/history`
- ตัวกรอง: ช่วงวันที่/เครื่อง/แผนก/ช่าง/ประเภทใบงาน/งานถูกปฏิเสธ
- ดูรายละเอียด, พิมพ์ใบงาน

## 3.7 งานซ่อมอื่นๆ
- `/repair/create`, `/repair/edit`, `/repair/view`, `/repair/kanban`, `/repair/print`, `/repair/workload`
- `/repair/assign`, `/my-repairs`, `/repair-request`

---

# 4. ระบบงาน PM&AM

## 4.1 เช็คชีต PM/AM (เฉพาะวัน due date) `/pm_am/checksheet`
> ทำได้เฉพาะวัน due date ของแผนนั้น; วันอื่นรายการไม่ขึ้น + แจ้งเหตุ + กันฝั่งเซิร์ฟเวอร์
- เข้าได้หลายทาง: สแกน QR → "ทำ PM"; งานของฉัน → "ไปทำ PM"; เมนูเช็คชีต
- ขั้นตอน: เลือกแผน due วันนี้ → ตรวจทีละข้อ (ผ่าน/ไม่ผ่าน/บันทึกค่า) → **บันทึกผล** → ลงนาม 2 ฝ่าย (ผู้ตรวจ+ผู้ควบคุม) → ส่งออก PDF (F-EN-02 ISO)
- Offline: เก็บ snapshot + คิวส่ง; กด "ส่งงานค้างทั้งหมด" เมื่อกลับมามีสัญญาณ

## 4.2 สร้างแผน PM&AM `/pm_am/create`, `/pm_am/batch_schedule`
- ระบุเครื่อง, ประเภท (PM/AM), ความถี่, วันที่เริ่ม/ครบกำหนด, ผู้รับผิดชอบ/ทีม
- รายการตรวจสอบ + บันทึกค่า
- สร้างแบบกลุ่ม: `/pm_am/batch_schedule`
- หลังปิดงานหนึ่งรอบ ระบบสร้างรอบถัดไปอัตโนมัติ

## 4.3 ปฏิทิน PM&AM `/pm_am/calendar`, `/pm_am/dashboard`
- ดูงานตามวัน/เดือน → กดงาน → เปิดเช็คชีต

## 4.4 เลื่อนกำหนด PM (Deferral)
- ปุ่ม **ขอเลื่อน** → ระบุวันใหม่+เหตุผล → LINE หัวหน้า/แอดมิน → กด ✅/❌ ในแชทได้เลย → ช่างแจ้งผล

## 4.5 ประวัติ/ผลงาน PM `/pm_am`, `/pm_am/view`, `/pm_am/edit`, `/pm_am/checklists`, `/pm_am/plans`
- ดูผลย้อนหลัง: การตรวจ, ค่าที่วัด, ผ่าน/ไม่ผ่าน, ลายเซ็น

---

# 5. ระบบงานสอบเทียบ (Calibration)

## 5.1 รายการ & แผน `/calibration`, `/calibration/create`, `/calibration/edit`
- รายการเครื่องมือ + สถานะ: ปีถัดไป, กำหนดสอบเทียบ, หมดอายุ/เลยกำหนด
- เพิ่มแผน: รอบ (เช่น 12 เดือน), ผู้ให้บริการ, เลขใบรับรอง
- แก้ไขประวัติ: วันที่/เลขใบรับรอง/ค่าใช้จ่าย/ผล + ผู้ให้บริการ/PO/อัปโหลด PDF

## 5.2 ปฏิทินสอบเทียบ `/calibration/calendar`, `/calibration/schedule`
- ปฏิทินรายเดือนแสดง Next Due ของทุกเครื่อง; กดวันดูรายการ + สถานะ
- KPI: กำหนดในเดือน/เสร็จ/เกินกำหนด

## 5.3 PO งานสอบเทียบ `/calibration/po`
1. ผู้ให้บริการ + หมายเลข PO
2. อัปโหลดไฟล์ PO (PDF)
3. ส่งอีเมลแจ้งซัพพลายเออร์ (+CC) พร้อมลิงก์ติดตาม
4. บันทึกวันยืนยันผู้ให้บริการ
5. ปิดงานสอบเทียบ: เลขใบรับรอง + อัปโหลดใบเซอร์ + วันสอบเทียบ + วันครบรอบถัดไป + ค่าใช้จ่าย + ผล (Pass/Conditional/Fail) → บันทึกเข้า calibration_history

## 5.4 ติดตามงานสอบเทียบ `/calibration/tracking`
- Pipeline อัตโนมัติ: รอออก PO → มี PO → แจ้งซัพพลายเออร์แล้ว → รอใบรับรอง → เสร็จสิ้น (มีใบเซอร์); เกินกำหนด (สีแดง)
- ดูไฟล์ PO/ใบเซอร์/เวลาแจ้ง/ค่าใช้จ่ายในตารางเดียว + กรอง

## 5.5 อื่นๆ
- `/calibration/dashboard`, `/calibration/instruments`, `/calibration/instruments/[id]`, `/calibration/mobile`, `/calibration/oot`, `/calibration/plans`, `/calibration/procedures`, `/calibration/standards`, `/calibration/certificates`, `/calibration/data-quality`, `/calibration/config`, `/calibration/reports`, `/calibration/run/[id]`

---

# 6. ทะเบียนทรัพย์สิน / เครื่องจักร (Asset Registry & Assets)

## 6.1 รายชื่อเครื่องจักร `/asset_registry`, `/assets`
- ดู/ค้นหา/กรอง: รหัส QR, ชื่อ, ประเภท, สถานที่, แผนก, Criticality A/B/C
- โครงสร้างเครื่องย่อย: `/asset_registry/bom_tree`

## 6.2 ลงทะเบียนเครื่อง `/asset_registry/create`, `/assets/create`
- บังคับ: รหัส QR Code, สถานที่ตั้ง, ประเภท, ชื่อเครื่อง + ยี่ห้อ/รุ่น/Serial/ผู้รับผิดชอบ/งบประมาณ → บันทึก

## 6.3 แก้ไข / ความสำคัญ `/asset_registry/edit`, `/asset_registry/criticality`
- จัดลำดับความสำคัญ (A/B/C) → บำรุงเข้มงวดตามแผน PM

## 6.4 รายละเอียดเครื่อง `/asset_registry/view`, `/asset_registry/[id]`
- ข้อมูลเครื่อง, ประวัติ, BOM, มิเตอร์

## 6.5 ผังโรงงาน `/asset_registry/plant_map`, `/facility-layout`
- แผนผัง 2D ของโรงงาน; กดเครื่องดูรายละเอียด

## 6.6 OEE `/asset_registry/oee`
- OEE Realtime ของเครื่อง

---

# 7. Asset Reliability (ความน่าเชื่อถือของสินทรัพย์)

## 7.1 หน้าหลัก `/asset-reliability`, `/asset-reliability/[id]`
- โปรไฟล์ความน่าเชื่อถือของเครื่อง + แนวโน้ม 12 เดือน + Failure Events + ประวัติวงจรชีวิต + ชิ้นส่วน + การเปลี่ยนชิ้นส่วน + Overhaul

## 7.2 หน้าย่อย
- `/asset-reliability/aging` — วิเคราะห์อายุการใช้งาน
- `/asset-reliability/critical` — เครื่องวิกฤต
- `/asset-reliability/lifecycle` — วงจรชีวิต
- `/asset-reliability/overhaul` — วางแผนยกเครื่อง
- `/asset-reliability/replacement` — วิเคราะห์เปลี่ยนเครื่อง
- `/asset-reliability/reports` — รายงานความน่าเชื่อถือ
- `/asset-reliability/config` — ตั้งค่า
- `/asset-reliability/data-quality` — คุณภาพข้อมูล
- `/asset-reliability/studies`, `/asset-reliability/studies/[id]` — การศึกษาความน่าเชื่อถือ
- `/asset-reliability/trend` — แนวโน้ม
- `/asset-reliability/weibull` — Weibull analysis
- `/asset-reliability/failure-modes` — โหมดความเสียหาย
- `/asset-reliability/bad-actors` — Bad actors
- `/asset-reliability/growth` — การเติบโต
- `/asset-reliability/pm-effectiveness` — ประสิทธิผล PM

---

# 8. ระบบอะไหล่ (Spare Parts)

## 8.1 สต็อกอะไหล่ `/spare_parts`
- แท็บ: ทั้งหมด/หมดคลัง; KPI: จำนวนรายการ, หมดคลัง, มูลค่าคลังรวม
- แต่ละรายการ: รหัส, ชื่อ, คงเหลือ, หน่วย, Min/Max, ราคา, ซัพพลายเออร์
- ต่ำกว่า Min → แจ้งเตือน LINE

## 8.2 เพิ่ม/แก้ไขอะไหล่ `/spare_parts/create`, `/spare_parts/edit`
- ฟิลด์: รหัส (ห้ามซ้ำ), ชื่อ (ห้ามซ้ำ), ประเภท (อะไหล่/วัสดุสิ้นเปลือง), Min/Max, สเปค, หน่วยนับ, ราคา, ซัพพลายเออร์, Lead time (วัน), ไลน์การผลิต, ยี่ห้อ

## 8.3 รับเข้าคลังตาม PO `/spare_parts/sage_po`, `/spare_parts/sage_sync`, `/spare_parts/sage_shipments`
- กรอกเลข PO → เลือกรายการ + จำนวน → ยืนยันการรับเข้าคลัง
- นับสต็อก: `/spare_parts/stock_take`
- ซิงก์ข้อมูลจาก Sage 300: `/spare_parts/sage_sync`

## 8.4 ศูนย์เบิก-จ่าย `/spare_parts/issue_center`
1. เลือกใบงานซ่อม/ผู้เบิก
2. เพิ่มรายการอะไหล่ (หลายรายการ) — ระบบเช็คยอดคงเหลือ
3. ยืนยันการเบิก-จ่าย → ส่งคำขออนุมัติผู้อนุมัติ

## 8.5 อนุมัติใบเบิกอะไหล่
- LINE: การ์ด "🧰 ขอเบิกอะไหล่ #... รออนุมัติ" + ปุ่ม ✅/❌ ในแชท
- Email: ปุ่ม 1-click (ไม่ต้องล็อกอินซ้ำ)
- ศูนย์อนุมัติรวม: `/approval`, `/approval/center`
- ผล → LINE แจ้งช่าง; ผู้อนุมัติลำดับต่อ (Store) ตรวจยอดคงเหลือแล้วปิดใบเบิก

## 8.6 ยอดคงเหลือ `/spare_parts/balances`
- KPI: จำนวนรายการ, มูลค่าคลังรวม, ต่ำกว่า Min, หมดคลัง
- ตารางยอดคงเหลือ; กดแถวขยาย → ประวัติเบิก-จ่ายของชิ้นนั้น

## 8.7 คืนซาก `/spare_parts/returns`
- เตรียมคืนซาก: ระบุจำนวน+เหตุผล → บันทึก (ทิ้งซาก, ไม่เข้าคลังใหม่)
- ประวัติคืนซากย้อนหลัง

## 8.8 การวิเคราะห์ & แจ้งเตือน
- `/spare_parts/optimization`: AI วิเคราะห์ Reorder Point, Class A/B/C, Dead stock
- อะไหล่ต่ำกว่า Min → LINE แจ้งเตือน
- `/spare-reorder`: รายการ reorder

## 8.9 ภาพรวมอะไหล่ `/spare_parts/overview`
- Overview ของคลังอะไหล่

---

# 9. QR Code & การสแกน

- ดาวน์โหลด QR: `/qr-sheet` — เลือกช่วง/สถานที่ → export ไปติดสติกเกอร์ (กลุ่มละ ≤500)
- สแกน: กล้อง/ LINE สแกน QR → `/scan` → เห็นข้อมูลเครื่อง + ปุ่ม แจ้งซ่อม/ทำ PM; กรอกรหัสเครื่องมือได้ถ้าไม่มีป้าย

---

# 10. ยืม/คืนเครื่องมือ (Equipment Borrowing)

`/equipment_borrowing`, `/equipment_borrowing/create`, `/equipment_borrowing/edit`
- ยืม: เลือกเครื่องมือ (ค้น QR) → เหตุผล → บันทึก
- คืน: รายการที่ยืมอยู่ → คืนรายชิ้น/ทั้งหมด
- ประวัติการยืม/คืนย้อนหลัง

---

# 11. ไฟล์คู่มืออุปกรณ์ (Manuals)

`/manuals`, `/manuals/create`, `/manuals/edit`
- ค้นหาเครื่อง (ชื่อ/QR) → อัปโหลด PDF (Specification, แบบแปลน, เอกสารอื่น)
- ช่างเปิดดูหน้างานตอนรับงานได้

---

# 12. ความรู้ (Knowledge Management)

## 12.1 หน้าหลัก `/knowledge`, `/knowledge/articles`, `/knowledge/search`
- บทความความรู้, ค้นหา, ดูรายละเอียด `/knowledge/articles/[id]`

## 12.2 สร้าง/แก้ไขบทความ `/knowledge/articles/create`, `/knowledge/articles/edit`
- เขียนบทความ, แท็ก, หมวดหมู่

## 12.3 Taxonomy `/knowledge/taxonomy`
- จัดหมวดหมู่/แท็ก

## 12.4 Reviews `/knowledge/reviews`
- ตรวจทาน/อนุมัติบทความ

## 12.5 Gaps `/knowledge/gaps`, `/knowledge/gaps/[id]`
- ช่องว่างความรู้ (top knowledge gaps) — ดูว่าอะไรยังไม่มีบทความ

## 12.6 Usage `/knowledge/usage`
- การใช้งานความรู้ (สถิติ)

---

# 13. RCA (Root Cause Analysis)

`/rca`, `/rca/new`, `/rca/events`, `/rca/taxonomy`, `/rca/[id]`
- สร้างเหตุการณ์ RCA ใหม่ → วิเคราะห์สาเหตุ → จัดหมวดหมู่ (taxonomy)
- ดูรายการเหตุการณ์ + รายละเอียด

---

# 14. Shutdown / Turnaround (หยุดเครื่อง)

`/shutdown`, `/shutdown/[id]`, `/documents/shutdown`
- วางแผนหยุดเครื่อง/ซ่อมใหญ่ (turnaround)
- ดูรายละเอียด shutdown

---

# 15. การตรวจสอบ (Inspections)

`/inspections`, `/inspections/templates`, `/inspections/run`, `/inspections/history`
- สร้างเทมเพลตการตรวจสอบ → รันการตรวจสอบ → ดูประวัติ

---

# 16. งานภาคสนาม (Field Work)

`/field`, `/field/plan`, `/field/work/[id]`
- งานภาคสนาม: วางแผน + ดูรายละเอียดงาน

---

# 17. IoT (Monitor / Condition)

- `/iot/monitor` — ติดตามสถานะ IoT
- `/iot/condition` — ตรวจสอบสภาพ (condition monitoring)

---

# 18. เอกสาร (Documents) & แบบฟอร์ม (Forms)

## 18.1 เอกสาร `/documents`, `/documents/create`, `/documents/edit`, `/documents/[id]`
- สร้าง/แก้ไข/ดูเอกสาร

## 18.2 Review `/documents/review`
- ตรวจทานเอกสาร

## 18.3 Manuals `/documents/manuals`
- คู่มือ/เอกสารอ้างอิง

## 18.4 Forms `/documents/forms`, `/forms`, `/forms/designer`, `/forms/run/[id]`
- ออกแบบฟอร์ม (`/forms/designer`) → รันฟอร์ม (`/forms/run/[id]`)

## 18.5 Engineering Changes `/documents/engineering-changes`
- เอกสารการเปลี่ยนแปลงทางวิศวกรรม

## 18.6 Shutdown `/documents/shutdown`
- เอกสารหยุดเครื่อง

## 18.7 Editor `/editor`, `/editor/builder`
- ตัวสร้าง/แก้ไข (builder)

---

# 19. Engineering Changes (เปลี่ยนแปลงทางวิศวกรรม)

`/engineering-changes`, `/engineering-changes/create`, `/engineering-changes/edit`, `/engineering-changes/requests`, `/engineering-changes/[id]`
- สร้างคำขอเปลี่ยนแปลง → อนุมัติ → ติดตาม

---

# 20. Process Flows (แผนผังกระบวนการ)

`/process-flows`
- ดู/จัดการแผนผังกระบวนการ

---

# 21. ความปลอดภัย / Work Permit

`/safety/work_permit`, `/safety/work_permit/create`, `/safety/work_permit/[id]`
- ขอ/อนุมัติใบอนุญาตทำงาน (1-Click ผ่าน LINE/Email)

---

# 22. งบประมาณ & ต้นทุน (Budget & Cost)

## 22.1 Budget `/budget`
- สร้างงบประมาณรายเดือน → ยื่นขออนุมัติ → อนุมัติ → ปรับ → ปิด → ยกเลิก
- KPI: เกินงบ/ใกล้เกณฑ์ (≥80%)
- สถานะ: draft/submitted/approved/closed/cancelled

## 22.2 Cost `/cost`
- ต้นทุน/ค่าใช้จ่าย

## 22.3 Analytics TCO `/analytics/tco`
- Total Cost of Ownership

---

# 23. การวางแผน (Planning)

- `/planning` — วางแผน
- `/planning/calendar` — ปฏิทินวางแผน
- `/pm_am/plans`, `/pm_am/plans/create`, `/pm_am/plans/[id]` — แผน PM

---

# 24. Supervisor (หัวหน้างาน)

- `/supervisor` — หน้า Supervisor
- `/supervisor/queue` — คิวงาน
- `/supervisor/plan` — วางแผน
- `/supervisor/review` — ตรวจทาน
- `/supervisor/verify` — ตรวจสอบ/ปิดงาน

---

# 25. Workforce (กำลังคน/ทักษะ/กะ)

- `/workforce` — ภาพรวม
- `/workforce/technicians`, `/workforce/technicians/[userId]` — รายชื่อช่าง/รายละเอียด
- `/workforce/skills` — ทักษะ
- `/workforce/crews` — ทีมงาน
- `/workforce/shifts` — กะ
- `/workforce/capacity` — ความจุ
- `/workforce/conflicts` — ความขัดแย้ง (มอบหมายงาน)
- `/workforce/training` — การอบรม
- `/workforce/certifications` — ใบรับรอง
- `/workforce/mine` — งานของฉัน (ช่าง)
- `/users/leaderboard` — Leaderboard

---

# 26. Reliability (ความน่าเชื่อถือ)

`/reliability`, `/reliability/assets`, `/reliability/assets/[id]`, `/reliability/bad-actors`, `/reliability/config`, `/reliability/data-quality`, `/reliability/failure-modes`, `/reliability/growth`, `/reliability/page`, `/reliability/pm-effectiveness`, `/reliability/studies`, `/reliability/studies/[id]`, `/reliability/trend`, `/reliability/weibull`
- วิเคราะห์ความน่าเชื่อถือ: bad actors, failure modes, Weibull, trend, growth, PM effectiveness, studies, config, data quality

---

# 27. ซัพพลายเออร์ (Suppliers)

`/suppliers`, `/suppliers/create`, `/suppliers/edit`
- +เพิ่ม/edit: รหัส, ชื่อบริษัท, ที่อยู่, โทร, อีเมล
- ผูกกับ: อะไหล่ (ราคา/Lead time), ผู้ให้บริการสอบเทียบ

---

# 28. ผู้ใช้งาน & บทบาท (Users & Roles)

## 28.1 Users `/users`, `/users/create`, `/users/edit`
- เห็น/ค้นหาผู้ใช้ + ตั้งบทบาท + สถานะใช้งาน
- Reset Password + สร้างผู้ใช้ใหม่
- ผูก LINE (ดูข้อ 37.1)

## 28.2 Roles `/roles`, `/roles/create`, `/roles/edit`
- จัดการบทบาท

## 28.3 Audit Log `/audit-log`
- บันทึกการตรวจสอบ (ดูรายละเอียด)

---

# 29. รายงาน & KPIs & Andon

- `/reports` — ศูนย์รายงาน
- `/reports/assets`, `/reports/cost`, `/reports/downtime`, `/reports/inspections`, `/reports/monthly_pdf`, `/reports/mttr-mtbf`, `/reports/pm`, `/reports/report-center`, `/reports/requests`, `/reports/scheduled`, `/reports/sla`, `/reports/spare-parts`, `/reports/technicians`, `/reports/work-orders`
- `/reports/export_excel`, `/reports/import_excel`
- `/analytics`, `/analytics/advanced`, `/analytics/esg_carbon`, `/analytics/intelligence`, `/analytics/kpi`, `/analytics/tco`
- `/mtbf_mttr`, `/mtbf_mttr/create`, `/mtbf_mttr/edit`, `/mtbf_mttr/production_hours` (create/edit)
- `/andon-board` — Andon Board
- `/kpi` ดูที่ `/analytics/kpi`

---

# 30. การแจ้งเตือน (Notifications)

- `/notifications`, `/notifications/history` — ประวัติการแจ้งเตือน
- `/settings/notifications` — เปิด/ปิด LINE+Email แต่ละเหตุการณ์ + แก้เทมเพลตการ์ด (สี/ข้อความ/ปุ่ม) + LIFF App ID ของ /register
- `/settings/notification-prefs` — ความชอบการแจ้งเตือน
- `/settings/notification-rules` — กฎการแจ้งเตือน
- `/settings/push` — เปิด Web Push (กดเอง ไม่ขออัตโนมัติ)
- `/settings/pwa` — ตั้งค่า PWA

---

# 31. Audit Log

`/audit-log`
- ดูบันทึกการตรวจสอบย้อนหลัง (รายละเอียดแต่ละรายการ)

---

# 32. การตั้งค่า (Settings)

`/settings` แบ่งหมวด:
- `/settings/design` — ดีไซน์/หัวเอกสาร
- `/settings/health` — สถานะระบบ
- `/settings/master/[entity]` — Master data (CRUD master/config)
- `/settings/menus` — เมนูและสิทธิ์ (กำหนดสิทธิ์เข้าถึงเมนูตามบทบาท)
- `/settings/notification-prefs`, `/settings/notification-rules`, `/settings/notifications`
- `/settings/page` (หน้าตั้งค่า)
- `/settings/permission-diff` — เปรียบเทียบสิทธิ์
- `/settings/push` — Web Push
- `/settings/pwa` — PWA
- `/settings/repair-options` — ตัวเลือกงานซ่อม (ประเภทใบงาน, ป้ายแท็ก, รหัสอาการเสีย/ซ่อม, เหตุผลปฏิเสธ)
- `/settings/services` — Services/อื่นๆ
- `/pages`, `/pages/[slug]` — หน้า CMS

---

# 33. PWA / ติดตั้งแอป

- เปิด `https://cmms-tpt.shares.zrok.io/install` บน Chrome/Safari (ไม่ใช่ in-app browser)
- Android: ⋮ → "ติดตั้งแอป" / "เพิ่มไปยังหน้าจอหลัก"
- iOS: แชร์ → "เพิ่มไปยังหน้าจอโฮม"
- ถ้าปุ่มไม่ขึ้น ลองรีโหลดหนึ่งครั้ง (ให้ SW ทำงาน)
- ตั้งค่า PWA: `/settings/pwa`, `/settings/push`

---

# 34. โปรไฟล์ & เปลี่ยนรหัสผ่าน

- `/profile` — โปรไฟล์ผู้ใช้
- `/change-password` — เปลี่ยนรหัสผ่าน

---

# 35. TV / Andon Board

- `/tv` — หน้า TV display
- `/andon-board` — Andon Board

---

# 36. คู่มือเฉพาะบทบาท (ฉบับย่อ)

- **ช่าง (Technician)**: `docs/TECHNICIAN_QUICK_GUIDE.md` — ดู/รับ WO, เปลี่ยนสถานะ Start→Pause/Resume→Done, ภาพก่อน-หลัง, checklist PM/Inspection, เบิกอะไหล่
- **ผู้ควบคุมเครื่อง (Operator)**: `docs/OPERATOR_QUICK_GUIDE.md` — แจ้งซ่อม + รูป, ติดตามสถานะ
- **หัวหน้างาน (Supervisor/Foreman, role 7)**: อนุมัติคำขอ, มอบหมาย/จัดตาราง, verify/ปิดงาน, จัดการช่าง → ใช้ส่วน "อนุมัติ/ตรวจสอบ" ของบทที่ 3 + Dashboard ของหัวหน้า (บทที่ 24)
- **Planner (วางแผน PM)**: ใช้บทที่ 4 (PM&AM): สร้างแผน, generate WO, เลื่อน PM (defer with reason), ตรวจครบกำหนด
- **Manager (role 2/6)**: เห็น board/KPI + อนุมัติใบเบิกอะไหล่/PO + ออกรายงาน (บทที่ 8.5/รายงาน) + ดู audit (บทที่ 31) — ไม่รับงานซ่อมเอง
- **Admin (role 1)**: จัดการ users/roles/settings/backup/audit → `docs/ADMIN_RUNBOOK.md`
- **บัญชีมือถือ/ออฟไลน์**: ล็อกอินแล้วทำได้แม้สัญญาณไม่ดี (คิว sync อัตโนมัติ) — ดู `/sync-center`
- **ข้อจำกัดบัญชี**: ตอนนี้มีบัญชีจริงเพียง 2 (admin+1) — ผู้ใช้จริงต้องถูกสร้างก่อนเปิดใช้งาน (`docs/GO_LIVE_PLAN.md` §3 B-2)

---

# 37. LINE โมบายบริดจ์

## 37.1 ลงทะเบียนผูกบัญชี LINE
หน้า `/register` (ปุ่มใน Rich Menu):
1. กด **ล็อกอินด้วย LINE** (หรือเปิดผ่านหน้า LIFF ของ /register → ได้ LINE ID อัตโนมัติ)
2. กรอกเลขพนักงาน → **ผูกบัญชี** → หน้า "ผูกบัญชีสำเร็จ" + LINE ยืนยันเขียวในแชท
3. ผูกแล้ว → งานที่แจ้ง/รับมีชื่อคุณอัตโนมัติ และรับ Push ถึงตัว

## 37.2 Rich Menu
3 ปุ่มแนะนำ: **แจ้งซ่อม** (`/scan`), **ลงทะเบียนผูก LINE** (`/register`), **หน้าแรก** (`/`)

## 37.3 การแจ้งเตือนผ่าน LINE (Push)
เหตุการณ์หลัก: งานซ่อมถูกมอบหมาย / ช่างรับ-เริ่ม-ปิดงาน / ขอเบิกอะไหล่ + อนุมัติ / PM เกินกำหนด / ขอเลื่อน PM / อะไหล่ต่ำสต็อก / ผูกบัญชีสำเร็จ — ทุกการ์ดปรับได้ใน `ตั้งค่า > การแจ้งเตือน`

---

# 38. ข้อแนะนำเพิ่มเติม

1. **สร้าง LIFF App ของหน้า /register** ใน LINE Developers (endpoint = `https://cmms-tpt.shares.zrok.io/register`) → วาง ID ใน `ตั้งค่า > การแจ้งเตือน` — ลดขั้นตอนล็อกอิน 2 คลิก
2. **อัปเดต `TELEGRAM_BOT_TOKEN` ใน .env** — token เดิมถูก revoke (LINE push ทำงานปกติ แต่แจ้งแอดมินทาง Telegram ยังไม่ได้)
3. **ตั้ง Rich Menu** จริง + เพิ่ม **Deep-link ไปหน้าใบงาน** ในทุกการ์ด (เช่น ปุ่มการ์ด "มอบหมายงาน" → ชี้ `/repair/view?id=`)
4. **ทดสอบ e2e บน LINE**: ผูก → แจ้งซ่อม → มอบหมาย → ช่างรับ/เริ่ม/ปิด → เบิกอะไหล่ → ผู้อนุมัติกดปุ่ม LINE/Email
5. เพิ่มตามโมเดลคู่มือต้นฉบับถัดไป (ยังไม่ได้ทำ): **แจกงานซ่อมตามโซน/แผนก**, **ปฏิทินวันหยุด**, **คืนอะไหล่เข้ายังคลังแบบ reused** (ตอนนี้คืนซากเป็นทิ้งซากอย่างเดียว), **ติดตามงานสอบเทียบรายซัพพลายเออร์** (KPI on-time)

---

*สร้างจากโครงสร้างหน้า frontend/app ทั้งหมด 252 หน้า + docs ที่มีอยู่; ปรับให้ตรงกับระบบที่ใช้งานจริง*