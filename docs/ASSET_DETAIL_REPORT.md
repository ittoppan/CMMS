# รายงานผลออกแบบหน้ารายละเอียดเครื่องจักร (Asset Detail)

## 1. แก้แล้ว
- Permission enforcement (backend):
  - asset_registry.php GET คืน 403 สำหรับ role ที่ไม่มีเมนู asset_registry (User=9, Viewer=5) โดยเพิ่ม module asset_registry แยกจาก asset ใน PERMISSION_MATRIX (roles 1,2,3,6,7,8,10 ได้ view; 1,2,6,7,8 ได้ edit)
  - asset_measurements.php POST อนุญาต Operate (role 3) ขึ้นไปเขียนค่ามิเตอร์; Viewer/Officer-Read/User ได้ 403
  - scan.php/asset_hub ยังใช้ module asset (User ยังสแกน QR แจ้งซ่อมได้)
- Frontend page.tsx:
  - เพิ่ม KpiStrip import, แท็บ 7 แท็บ (ภาพรวม/ประวัติซ่อม/PM & ตรวจเช็ค/อะไหล่ & BOM/เอกสาร/ความน่าเชื่อถือ/เทคนิค)
  - ช่องว่างแสดง "ยังไม่ได้กรอก" (แทน "-")
  - เพิ่มแถบ "ข้อมูลเครื่องครบ x/10 ช่อง" เฉพาะผู้มีสิทธิ์แก้ไข + ปุ่มไปหน้าแก้ไข
  - Quick actions: ปุ่มแจ้งซ่อมเครื่องนี้ (primary), ทำเช็คชีท PM, แก้ไข, QR, ผัง
  - ไม่มีค่า 98.5% (ไม่เคยมีใน source)
- docs/REPAIR_BACKLOG_REPORT.md สร้างแล้ว (114 ใบงานค้าง, แยกตามสถานะ/อายุ/ที่มา/asset_id)

## 2. ยังไม่แก้และเหตุผล
- ปุ่ม "เบิกอะไหล่" (issue_center): ไม่มี route /issue_center ในโปรเจกต์ → ซ่อนปุ่ม (ตาม spec)
- การย้ายฟอร์มมิเตอร์จากแท็บภาพรวมไปแท็บ "เทคนิค": คงไว้ในภาพรวมเพื่อไม่เปลี่ยนพฤติกรรม (spec อนุญาต "ย้าย logic เดิมมาใช้ใต้โครงใหม่")
- MTBF/MTTR: คำนวณจริงไม่ได้ (downtime_minutes 0/114) → ไม่แสดงค่า 0; แสดง "ไม่มีข้อมูล" ผ่าน empty state แท็บความน่าเชื่อถือ
- PM ครั้งถัดไป: pm_am 0 แถว → empty state "ยังไม่มีแผน PM" + ปุ่มไปหน้า PM & AM (เฉพาะผู้มีสิทธิ์)

## 3. ให้ตัดสินใจ
- เกณฑ์แยกข้อมูลเก่าจากการนำเข้า (docs/REPAIR_BACKLOG_REPORT.md §5): ใช้เกณฑ์ A-D หรือปรับ; ยังไม่ได้ปิดใบงานใด
- ลบข้อมูลทดสอบ e2e_user (14 ใบ, created_by=565) หลังรันเทส — ทำแล้วโดย fixture teardown
- อนุมัติ deploy production (ทำแล้ว: BUILD_ID M2nyF5DmBFU3EH6mPo7DY)

## 4. ผลเทสทั้งชุด
- tsc --noEmit: PASS (0 errors)
- scripts/design-audit.py --diff HEAD: PASS (0 FAIL, 0 WARN)
- Playwright ทั้งชุด (166 tests): 166 passed, 0 failed
- ลบข้อมูลทดสอบ: e2e_* active = 0
- git status: เฉพาะไฟล์ที่ตั้งใจแก้

## 5. BUILD_ID และ commit hash
- BUILD_ID: M2nyF5DmBFU3EH6mPo7DY
- commit hash: f768d08650e7e096edd3642c26ed74289f9e4484 (HEAD ก่อนแก้; ยังไม่ commit การแก้ใหม่)
