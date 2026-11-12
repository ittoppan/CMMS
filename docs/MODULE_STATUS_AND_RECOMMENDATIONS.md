# CMMS-TPT: สถานะโมดูลและข้อเสนอแนะ (จากโครงสร้างโปรเจกต์จริง)

อัปเดตจากการตรวจสอบโค้ดจริง (`frontend/app/(dashboard)`, `frontend/lib/pageLayout.ts`, `public/api/v1`) วันที่อ้างอิง: 2026-11-12

## 1) โมดูลที่มีอยู่และทำได้ (ภาพรวม)

| กลุ่ม | โมดูล/ฟังก์ชันหลัก | เส้นทาง/จุดอ้างอิงสำคัญ |
|---|---|---|
| งานซ่อมบำรุง (WO) | แจ้งซ่อม, รายการ/มอบหมาย/ติดตาม, งานของฉัน, field work, workload, kanban, ประวัติ, อนุมัติ, ฟอร์ม/ออกแบบฟอร์ม, คู่มือ | `/repair`, `/dashboard`, `/approval`, `/forms`, `/manuals`, `/field`, `public/api/v1/repair.php`, `supervisor.php` |
| PM/AM & ตรวจเช็ค & ทรัพย์สิน | แผน PM/ปฏิทิน/checksheet/จัดตาราง, Inspections (run/templates), ทะเบียนทรัพย์สิน, QR, BOM/criticality, ยืม-คืนอุปกรณ์ | `/pm_am`, `/inspections`, `/asset_registry`, `/assets`, `/equipment_borrowing`, `pm_am.php`, `inspections.php`, `asset_registry.php` |
| สอบเทียบ (Calibration) | เครื่องมือ/แผน/ตาราง/ใบรับรอง, dashboard, มาตรฐาน/ขั้นตอน, OOT, รายงาน, data quality, mobile, PO/tracking | `/calibration/*`, `calibration.php`, `calibration_management.php`, `calibration_tracking.php` |
| อะไหล่/จัดซื้อ/ผู้รับเหมา | คลัง/ยอดคงเหลือ/เบิก-จ่าย/คืน/จอง, Sage (shipments/PO/sync), optimization, ซัพพลายเออร์, ผู้รับเหมา/งานจ้าง | `/spare_parts/*`, `/suppliers`, `/contractors`, `spare_parts.php`, `sage_*`, `contractor.php` |
| วางแผน/กำลังคน/หัวหน้างาน | ศูนย์วางแผน/ปฏิทิน, แผนงานส่วนตัว, workforce (ช่าง/ทักษะ/ใบรับรอง/อบรม/capacity/กะ/ทีม/conflicts), supervisor (queue/review/plan/verify), shutdown, process flows | `/planning`, `/workforce/*`, `/supervisor/*`, `/shutdown`, `planning.php`, `workforce.php`, `supervisor.php` |
| วิเคราะห์/รายงาน/การเงิน | Analytics/BI, KPI, advanced, ESG/carbon, TCO, รายงาน, Andon, ต้นทุน, งบประมาณ | `/analytics/*`, `/reports`, `/andon-board`, `/cost`, `/budget` |
| ความน่าเชื่อถือ (Reliability) | Lifecycle, criticality, aging, replacement, overhaul, measurements, relationships/components, data quality, reports | `/asset-reliability/*`, `/reliability/*`, `asset_*`, `asset_reliability.php` |
| RCA/Failure/MTBF-MTTR | Failure events, RCA (5-Why, evidence, measurements, actions, links, effectiveness), taxonomy, MTBF/MTTR | `/rca/*`, `/mtbf_mttr`, `failure.php`, `mtbf_mttr.php` |
| วิศวกรรม/ความรู้/เอกสาร/ความปลอดภัย | Engineering changes, Knowledge base (ค้นหา/บทความ/usage/gaps), เอกสาร, คู่มือ, Safety | `/engineering-changes`, `/knowledge/*`, `/documents`, `/manuals`, `/safety` |
| ระบบ/ผู้ใช้/แจ้งเตือน | ผู้ใช้, บทบาท/สิทธิ์เมนู, โปรไฟล์, notifications (inbox/history/prefs/rules), settings, audit log, feedback, IoT, sync | `/users`, `/roles`, `/notifications/*`, `/settings/*`, `/audit-log`, `/iot`, `notifications.php`, `push_subscribe.php`, `settings.php` |

## 2) ความพร้อมที่ปรับปรุงล่าสุด
- รวมหน้าตั้งค่า repair options/แผนก/สถานที่ และ redirect เส้นทางเดิม
- บังคับ CSRF สำหรับ mutation สำคัญ, pagination คลังอะไหล่ (opt-in, backward-compatible)
- Competency/qualification gate ในการมอบหมาย (backend) และแสดงสาเหตุบล็อกใน UI มอบหมาย (repair assign, supervisor assign dialog)
- บังคับคุณภาพข้อมูลปิดงาน (root cause/วิธีแก้ไข/failure code ตามการตั้งค่า)
- SLA overdue + escalation alerts, smoke check (`scripts/smoke-check.sh`), คู่มือตั้งค่า Email+PWA (`docs/EMAIL_PUSH_PRODUCTION_SETUP.md`)

## 3) ข้อเสนอแนะลำดับถัดไป (อิงของที่มีจริง)

### เฟส A — ใช้งานจริงให้ครบวงจร (เร่งด่วน)
- [ ] ตั้งค่า Production แจ้งเตือน: SMTP, HTTPS, เปิด push, ให้ผู้ใช้ subscribe (`/settings/push`), ตั้ง Scheduler (`alert_check.php`, `notification_engine.php`)
- [ ] รันบริการแบบเสถียร/auto-restart, ตั้ง backup + ทดสอบกู้คืน
- [ ] ทดสอบ end-to-end ตามบทบาท: แจ้งซ่อม→มอบหมาย→ปิดงาน, PM, เบิกอะไหล่, รายงาน, แจ้งเตือน

### เฟส B — ปิดช่องว่างเชิงกระบวนการ
- [ ] **RCA/CAPA ปิดวงจร:** เชื่อม RCA/actions กับ WO/failure code ให้ครบ, บังคับติดตาม owner/due/status/ผลลัพธ์ก่อนปิด RCA, รายงาน action ค้าง/เกินกำหนด
- [ ] **Work Permit/LOTO/Safety gate:** ต่อยอด `/safety` เป็นเงื่อนไขก่อนเริ่ม/ปิดงานเสี่ยง พร้อมหลักฐาน/ลายเซ็น
- [ ] **Competency gate ครบทุกจุด UI:** แสดง/เตือนคุณสมบัติก่อนยืนยันใน supervisor queue/plan ทุก flow และสรุปสาเหตุรวม

### เฟส C — เพิ่มประสิทธิภาพเชิงวิเคราะห์/วางแผน
- [ ] **Meter/Condition-based PM:** ใช้ `asset_measurements`/IoT เป็นทริกเกอร์ PM ตามชั่วโมง/รอบ/ค่าขีดจำกัด
- [ ] **Reorder/MRP อะไหล่:** จุดสั่งซื้อจากการใช้จริง/lead time/safety stock, การจองอะไหล่ต่องาน, ต้นทุนรวม
- [ ] **KPI/SLA drill-down:** MTBF/MTTR, availability, PM compliance, backlog aging, SLA breach กดลงถึงใบงานต้นทาง
- [ ] **Asset lifecycle/TCO เชิงตัดสินใจ:** เปรียบเทียบซ่อม-เปลี่ยน, อายุคงเหลือ, แผนงบลงทุน

### เฟส D — คุณภาพระบบระยะยาว
- [ ] **Audit/Compliance:** ค้น/กรอง/ส่งออก audit trail สะดวก, e-sign/การอนุมัติสำคัญ
- [ ] **Data quality governance:** กฎความครบถ้วน/ซ้ำซ้อนของ master data และรายงานสุขภาพข้อมูล
- [ ] **E2E/Regression tests:** ชุดทดสอบ flow หลักอัตโนมัติ

## 4) หมายเหตุ
- หลีกเลี่ยงการเพิ่มฟีเจอร์ใน PHP pages (`public/pages/*`) ให้พัฒนาใน `frontend/app` และ `/api/v1/*` ตามสถาปัตยกรรมปัจจุบัน
- การเปลี่ยนแปลงควรผ่าน `tsc --noEmit`, `next build`, และ `design-audit.py --strict` ก่อน deploy
