# รายงานช่องว่างหน้ารายละเอียดเครื่องจักร (Asset Detail)

> ไฟล์ที่ตรวจ: `frontend/app/(dashboard)/asset_registry/view/page.tsx`
> API ที่หน้าเรียก (อ่านจากโค้ดจริง): `asset_registry.php?id=`, `index.php?resource=users`, `repair.php?asset_code=`, `index.php?resource=pm-plans`, `calibration.php`, `machine_bom.php?asset_id=`, `inspections.php?schedules=1&asset_id=`, `pm_plans.php?asset_id=&meters=1`, `asset_measurements.php?asset_id=`, `asset_meters.php?asset_id=`, `facility_layout.php`, `fetchKnRelated("asset", id)` (knowledge)
> วิธีตรวจสอบ: อ่านโค้ดหน้า + อ่าน API + ตรวจสอบฐานข้อมูล MySQL จริง (ไม่ได้แก้โค้ด)
> วันที่ตรวจ: 2026-11-22

---

## 1. ตารางสิ่งที่หน้าแสดงอยู่ตอนนี้

| ส่วน/แท็บ | ข้อมูลที่แสดง | API/ตาราง DB ที่มา |
|---|---|---|
| PageHeader (หัวหน้า) | ชื่อเครื่อง (`name`), รหัส (`code`), คำอธิบาย (`description`) | `asset_registry.php?id=` → `asset_registry` |
| Quick actions (การ์ดด้านบน) | ปุ่ม "สร้างงานซ่อม", "แจ้งซ่อมด่วน", "ทำเช็คชีท PM", "แก้ไข", "QR Code", "ผังอาคาร" | UI gating ด้วย `canShow(...)`; ไม่มีตาราง DB เพิ่ม |
| KPI strip (4 การ์ด) | สถานะ (`status`), ระดับความสำคัญ (`criticality`), งานที่ยังเปิดอยู่ (จำนวน repair ที่ status≠completed), ความพร้อมใช้งาน (ค่าคงที่ 98.5%) | `asset_registry`, `repair.php?asset_code=` → `repair` |
| แท็บ "overview" — การ์ดรูปภาพ/QR | รูป (`image_path`), QR code (`qr_code_path`), badge สถานะ, badge ความสำคัญ, รหัส | `asset_registry` |
| แท็บ "overview" — ข้อมูลพื้นฐาน (13 ฟิลด์) | รหัส, ชื่อ, หมวดหมู่ (`category`), ตำแหน่ง (`location`), ระดับความสำคัญ, แผนก (`department`), ผู้ผลิต (`manufacturer`), รุ่น (`model`), หมายเลขเครื่อง (`serial_number`), วันที่ซื้อ (`purchase_date`), ประกันหมด (`warranty_expiry`), ผู้รับผิดชอบ (resolve จาก `users` ผ่าน `responsible_user_id`), สถานะ | `asset_registry`, `index.php?resource=users` |
| แท็บ "overview" — ข้อมูลเพิ่มเติม | รหัสบาร์โค้ด (`barcode`), คู่มือ (`instruction_manual`), แก้ไข sur place (`in_place_edit`), สร้างเมื่อ/แก้ไขเมื่อ | `asset_registry` |
| แท็บ "overview" — ผังอาคาร/พอร์ต | ตำแหน่งบนผัง (`floor_x`,`floor_y`,`work_zone_id`), ปุ่มเปิด `facility_layout.php` | `asset_registry`, `facility_layout.php` |
| แท็บ "overview" — บันทึกค่ามิเตอร์ | ฟอร์มบันทึกค่า (`asset_measurements` insert) + ประวัติการวัด (parameter/value/unit/method/measured_at/measured_by) | `asset_measurements.php?asset_id=`, `asset_meters.php?asset_id=` → `asset_measurements`, `asset_meters` |
| แท็บ "overview" — CBM / PM meter | รายการ PM ที่ผูกมิเตอร์ + สถานะ (ปกติ/ใกล้กำหนด/เกินกำหนด) + ปุ่ม "บันทึกค่า" | `pm_plans.php?asset_id=&meters=1` → `pm_am` (meter_based) |
| แท็บ "overview" — ความรู้ที่เกี่ยวข้อง | บทความความรู้ (`fetchKnRelated("asset", id)`) | `knowledge` (ตาราง `knowledge_article` ฯลฯ) |
| แท็บ "history" — ประวัติเหตุการณ์ | ไทม์ไลน์เหตุการณ์ (repair/PM/inspection), ปุ่ม "เปิด" | `repair.php?asset_code=`, `pm_plans.php?asset_id=`, `inspections.php?schedules=1&asset_id=` → `repair`, `pm_am`, `inspection_schedules` |
| แท็บ "relationship" — BOM/อะไหล่ | รายการ BOM (`machine_bom.php?asset_id=`) | `machine_bom.php` → `machine_bom` |
| แท็บ "relationship" — ผู้รับผิดชอบ | ผู้รับผิดชอบ (resolve จาก `users`) | `asset_registry.responsible_user_id`, `index.php?resource=users` |
| แท็บ "relationship" — อะไหล่ในสต็อก | รายการอะไหล่ที่เกี่ยวข้อง (จาก `index.php?resource=pm-plans`) | `index.php?resource=pm-plans` |
| Modal QR Code | แสดง QR code (`qr_code_path`), ปุ่มพิมพ์ | `asset_registry` |

---

## 2. เทียบกับรายการข้อมูลที่ต้องการ

เกณฑ์: **มีแล้ว** = แสดงบนหน้าแล้ว, **บางส่วน** = แสดงบางส่วน/ข้อมูลไม่ครบ, **ไม่มี** = ไม่แสดงบนหน้า

### ส่วนหัว
| ข้อมูลที่ต้องการ | สถานะ | ข้อมูลใน DB แล้วหรือไม่ (ตาราง/คอลัมน์ + จำนวนแถว) |
|---|---|---|
| สถานะ | มีแล้ว | `asset_registry.status` (enum active/inactive/disposed/under_repair) — 82/82 แถวมีค่า (ทุกแถว active) |
| ตำแหน่ง | บางส่วน | `asset_registry.location` (varchar) — 0/82 แถวมีค่า; `location_id` 0/82; `floor_x/floor_y` 82/82 (ผังอาคาร) |
| ระดับความสำคัญ | มีแล้ว | `asset_registry.criticality` (enum A/B/C/D) — 82/82 แถวมีค่า (ทุกแถว B) |
| ใบงานค้าง | มีแล้ว (KPI "งานที่ยังเปิดอยู่") | `repair` 98 แถวที่มี `asset_id` (จาก 114 แถวทั้งหมด); status: open 87, in_progress 24, assigned 1, pending 2; downtime_minutes 0/114 แถวมีค่า >0 |
| PM ครั้งถัดไป | ไม่มี (ไม่มีฟิลด์เฉพาะ; CBM แสดงสถานะ PM ตามมิเตอร์เท่านั้น) | `pm_am` ตารางมี 0 แถวทั้งหมด (ไม่มีข้อมูล PM ใดๆ); `pm_am_plans` 0 แถว |
| ครั้งล่าสุดที่เสีย | ไม่มี (ไม่มีฟิลด์เฉพาะ; มีเพียงไทม์ไลน์ซ่อมในแท็บ history) | `repair` 98 แถวที่ผูก `asset_id`, `created_at` 114/114 มีค่า; `completed_at` 0/114; `downtime_start/end` 0/114 |
| MTBF/MTTR | ไม่มี | ไม่มีตารางเก็บค่า MTBF/MTTR โดยตรง; คำนวณได้จาก `repair` (downtime_minutes 0/114, repair_time_minutes 0/114) — ไม่มีข้อมูลจริง |
| ปุ่มแจ้งซ่อม | มีแล้ว | gating `canShow("repair/request")` (role 1,2,3,6,7,9 ได้) |
| ปุ่มทำเช็คชีท | มีแล้ว | gating `canShow("pm_am/checksheet")` (role 1,2,3,6,7 ได้) |
| ปุ่มเบิกอะไหล่ | ไม่มี (ไม่มีปุ่มบนหน้านี้) | ไม่แน่ใจว่ามีตารางเบิกอะไหล่เฉพาะ (ไม่ได้ตรวจในรอบนี้; พบ `spare_parts`/`spare_usage` แต่ไม่ได้ inspect คอลัมน์) |

### ข้อมูลหลัก
| ข้อมูลที่ต้องการ | สถานะ | ข้อมูลใน DB แล้วหรือไม่ |
|---|---|---|
| ผู้ผลิต | บางส่วน (แสดงฟิลด์แต่ค่าว่าง) | `asset_registry.manufacturer` — 0/82 แถวมีค่า |
| รุ่น | บางส่วน | `asset_registry.model` — 0/82 |
| หมายเลขเครื่อง | บางส่วน | `asset_registry.serial_number` — 0/82 |
| ปีติดตั้ง | ไม่มี (ไม่มีฟิลด์ปีติดตั้ง; มี `installation_date` แต่ไม่แสดง) | `asset_registry.installation_date` — 0/82; `commission_date` 0/82 |
| ผู้รับผิดชอบ | บางส่วน (แสดงฟิลด์แต่ resolve ไม่ได้เพราะ FK ว่าง) | `asset_registry.responsible_user_id` — 0/82; `asset_responsible_persons` — 0 แถว |
| สเปก | ไม่มี | ไม่มีตาราง/คอลัมน์ "สเปก" ที่พบ (ไม่แน่ใจว่าเก็บใน `description` หรือที่อื่น) |
| ประกัน | บางส่วน (แสดงฟิลด์แต่ค่าว่าง) | `asset_registry.warranty_expiry` — 0/82; `purchase_date` 0/82; `purchase_cost` 0/82 |

### ประวัติ/แผน/เอกสาร/อื่นๆ
| ข้อมูลที่ต้องการ | สถานะ | ข้อมูลใน DB แล้วหรือไม่ |
|---|---|---|
| ประวัติซ่อม (ไทม์ไลน์ + เวลาหยุดเครื่อง + ค่าใช้จ่าย) | บางส่วน (มีไทม์ไลน์ในแท็บ history; แต่เวลาหยุดเครื่อง/ค่าใช้จ่าย 0 แถว) | `repair` 98 แถวที่ผูก asset; `downtime_minutes` 0/114, `cost_parts` 0/114, `cost_labor` 0/114, `cost_outsource` 0/114 |
| แผน PM และผลเช็คชีท | ไม่มี (แท็บ history ดึง `pm_plans.php?asset_id=` แต่ `pm_am` 0 แถว) | `pm_am` 0 แถว, `pm_am_plans` 0 แถว, `pm_am_checklist_results` 0 แถว |
| BOM/อะไหล่และประวัติการเบิก | บางส่วน (BOM แสดงในแท็บ relationship แต่ `machine_bom` 0 แถว) | `machine_bom` 0 แถว; `asset_components` 0 แถว; `component_replacements` ไม่ได้ inspect (ไม่แน่ใจจำนวน) |
| เอกสาร/คู่มือ/SOP/LOTO | ไม่มี (ไม่แสดงบนหน้านี้; มีตาราง) | `controlled_documents` 0 แถว (asset_id 0/0); `knowledge_document_ref` 0 แถว; `permit_loto_points` 0 แถว; `work_permits` 0 แถว |
| หล่อลื่น | ไม่มี (ไม่แสดงบนหน้านี้) | `lubrication_points` 21 แถว (แต่ `asset_id` 0/21 แถว — ไม่ผูกกับเครื่อง); `lubrication_logs` 0 แถว |
| สอบเทียบ | ไม่มี (หน้าเรียก `calibration.php` แต่ไม่แสดงผลบนหน้านี้) | `calibration` 0 แถว; `calibration_instruments` 0 แถว |
| IoT/มิเตอร์ | บางส่วน (บันทึกค่ามิเตอร์ + ประวัติแสดง; แต่ `asset_meters` 0 แถว และ `iot_devices` 0 แถว) | `asset_meters` 0 แถว; `asset_measurements` 0 แถว; `iot_devices` 0 แถว; `iot_readings` 0 แถว |
| ความน่าเชื่อถือและวงจรชีวิต | ไม่มี (ไม่แสดง; มีตาราง) | `asset_lifecycle_history` 0 แถว; `asset_condition_snapshots` 0 แถว; `asset_criticality` 0 แถว; `asset_overhauls` 0 แถว; `asset_registry.lifecycle_status` 82/82 (ทุกแถว operating), `criticality_score` 0/82 |
| ประวัติการเปลี่ยนแปลง/ECR | ไม่มี (ไม่แสดง; มีตาราง) | `engineering_changes` 0 แถว |
| หมายเหตุของช่าง | บางส่วน (repair.notes มีข้อความ "นำเข้าจากใบแจ้งซ่อม..." แต่ไม่แสดงบนหน้า detail) | `repair.notes` 114/114? ไม่แน่ใจจำนวนที่ไม่ว่าง; ตัวอย่าง 1 แถวมี notes; `failure_report` 2/114 แถว |

---

## 3. ลำดับเนื้อหาบนมือถือ (390px) และสิทธิ์จริงตาม API

### 3.1 ลำดับเนื้อหาจากบนลงล่าง (default tab = "overview")
หน้าใช้ `isNarrow` (max-width 1024px) และ Grid 1 คอลัมน์เมื่อความกว้าง < ~400px ดังนั้นบน 390px ทุก Grid จะเป็น 1 คอลัมน์ (เรียงบนลงล่าง)

1. PageHeader (ชื่อ/รหัส/คำอธิบาย)
2. Quick actions card (ปุ่มแนวนอน อาจ wrap)
3. KPI strip (4 การ์ด เรียง 1 คอลัมน์)
4. แท็บ bar: overview / history / relationship (default overview)
5. (overview) การ์ดรูปภาพ/QR + badge สถานะ/ความสำคัญ
6. (overview) การ์ดข้อมูลพื้นฐาน (13 ฟิลด์)
7. (overview) การ์ดข้อมูลเพิ่มเติม (บาร์โค้ด/คู่มือ/แก้ไข sur place/เวลา)
8. (overview) การ์ดผังอาคาร/พอร์ต (floor_x/floor_y + ปุ่มเปิดผัง)
9. (overview) การ์ดบันทึกค่ามิเตอร์ (ฟอร์ม + ประวัติ)
10. (overview) การ์ด CBM/PM meter
11. (overview) การ์ดความรู้ที่เกี่ยวข้อง
- แท็บ "history": ไทม์ไลน์เหตุการณ์ (ต้องกดแท็บ)
- แท็บ "relationship": BOM, ผู้รับผิดชอบ, อะไหล่ในสต็อก (ต้องกดแท็บ)

### 3.2 สิทธิ์จริงตาม API (ไม่ใช่แค่ UI)
API ที่หน้าเรียกส่วนใหญ่ใช้ `requireLogin()` เท่านั้น ไม่มีการกรองตาม role บนฝั่ง server (ยกเว้น `inspections.php` ที่ requireRole สำหรับการสร้าง/จัดการ template; GET อ่านได้ทุก role). ดังนั้น **ข้อมูลที่ดึงมาแสดงได้เท่ากันสำหรับทุก role ที่ login ได้**; ความแตกต่างอยู่ที่ปุ่ม (UI gating ด้วย `canShow` ตาม `menu_permissions`)

สิทธิ์ปุ่มสำคัญ (จาก `menu_permissions` จริง):

| menu_key | ได้ (role id) | ไม่ได้ |
|---|---|---|
| asset_registry (ปุ่มแก้ไข/หน้า) | 1 Admin, 2 Manager, 3 Operate, 6 Asst.Manager, 7 Foreman, 8 Officer, 10 Officer-Read | 5 Viewer, 9 User |
| repair/request (ปุ่มสร้างงานซ่อม/แจ้งซ่อมด่วน) | 1,2,3,6,7,9 | 5,8,10 |
| pm_am/checksheet (ปุ่มทำเช็คชีท PM) | 1,2,3,6,7 | 5,8,9,10 |

สรุปตาม role ที่ผู้ใช้ถาม (User/Operate/Foreman/Manager):

- **User (role 9)**: ไม่เห็นหน้า asset_registry (menu denied) → เข้าหน้าไม่ได้ตามเมนู; แต่ API `asset_registry.php` ไม่บล็อก role → ถ้ารู้ URL ยังดึงข้อมูลได้ (API ไม่ filter role). ปุ่ม repair/request ได้, pm_am/checksheet ไม่ได้
- **Operate (role 3)**: เห็นหน้า + แก้ไขได้ + สร้างงานซ่อม + ทำเช็คชีท PM
- **Foreman (role 7)**: เห็นหน้า + แก้ไข + สร้างงานซ่อม + ทำเช็คชีท PM
- **Manager (role 2)**: เห็นหน้า + แก้ไข + สร้างงานซ่อม + ทำเช็คชีท PM

ข้อมูลที่ทุก role (ที่ login ได้) เห็นเหมือนกัน: ทุกฟิลด์จาก `asset_registry`, ประวัติซ่อม (`repair`), PM (`pm_am`), BOM (`machine_bom`), มิเตอร์ (`asset_measurements`/`asset_meters`), ผังอาคาร (`facility_layout`), ความรู้ (knowledge). API ไม่กรองตาม role และไม่กรองตาม asset ownership.

---

## 4. สรุปท้ายไฟล์

### 4.1 ข้อมูลที่มีในฐานข้อมูลแล้วแต่หน้ายังไม่แสดง (ทำได้ทันที)
- `asset_registry.installation_date`, `commission_date`, `purchase_cost`, `installation_cost`, `expected_life_months` (0/82 populated แต่มีคอลัมน์) — ยังไม่แสดง (หน้าไม่มีฟิลด์ปีติดตั้ง/ต้นทุน)
- `asset_registry.lifecycle_status` (82/82 = operating) + `lifecycle_status_changed_at/reason` — วงจรชีวิตไม่แสดง
- `asset_registry.criticality_score`, `criticality_reviewed_at`, `next_criticality_review_date` — ความสำคัญเชิงคะแนนไม่แสดง
- `asset_registry.parent_asset_id` — ความสัมพันธ์ parent/child ไม่แสดง
- `asset_registry.barcode`, `qr_token` — บาร์โค้ด/QR token ไม่แสดง (มีแค่ qr_code_path)
- `repair.downtime_start/end/minutes`, `cost_parts/labor/outsource`, `completed_at`, `diagnosis`, `resolution`, `root_cause`, `failure_report`, `notes` — ประวัติซ่อมมีข้อมูลบางส่วนแต่หน้าไม่แสดงเวลาหยุดเครื่อง/ค่าใช้จ่าย/ผลการวินิจฉัย
- `lubrication_points` (21 แถว) — ไม่ผูก asset_id (0/21) และหน้าไม่แสดง
- `controlled_documents`, `engineering_changes`, `asset_lifecycle_history`, `asset_condition_snapshots`, `asset_criticality`, `asset_overhauls`, `asset_components`, `asset_relationships`, `asset_measurements`, `iot_devices` — มีตารางแต่ข้อมูล 0 แถว (ยังไม่ได้กรอก)
- `repair.notes` (ข้อมูลนำเข้า) — ไม่แสดงบนหน้า detail

### 4.2 ข้อมูลที่ต้องมีหน้ากรอกเพิ่ม
- ข้อมูลหลักของเครื่อง (ผู้ผลิต, รุ่น, หมายเลขเครื่อง, หมวดหมู่, แผนก, ตำแหน่ง, วันที่ซื้อ, ประกัน, ผู้รับผิดชอบ) — คอลัมน์มีแต่ข้อมูล 0/82 (placeholder import)
- BOM/อะไหล่ (`machine_bom` 0 แถว) — ต้องมีหน้าเพิ่ม BOM
- แผน PM (`pm_am`/`pm_am_plans` 0 แถว) — ต้องมีหน้าสร้างแผน PM
- สอบเทียบ (`calibration`/`calibration_instruments` 0 แถว) — ต้องมีหน้าจัดการสอบเทียบ
- ตรวจรับ/inspection (`inspection_schedules` 0 แถว) — ต้องมีหน้าจัดตารางตรวจ
- หล่อลื่น (`lubrication_points` มี 21 แต่ไม่ผูก asset; `lubrication_logs` 0) — ต้องมีหน้าผูกจุดหล่อลื่นกับเครื่อง + บันทึก
- IoT/มิเตอร์ (`asset_meters` 0, `iot_devices` 0) — ต้องมีหน้าลงทะเบียนมิเตอร์/อุปกรณ์
- เอกสาร/คู่มือ/SOP/LOTO (`controlled_documents` 0, `work_permits` 0, `permit_loto_points` 0) — ต้องมีหน้าอัปโหลด/ผูกเอกสาร
- ECR (`engineering_changes` 0) — ต้องมีหน้าสร้าง ECR
- วงจรชีวิต/ความน่าเชื่อถือ (`asset_lifecycle_history` 0, `asset_criticality` 0, `asset_overhauls` 0) — ต้องมีหน้าบันทึก
- หมายเหตุของช่าง — ต้องมีช่องกรอกบนหน้า detail (หรือในใบงานซ่อม)

### 4.3 ข้อมูลที่ไม่มีตาราง
- MTBF/MTTR — ไม่มีตารางเก็บค่า; คำนวณจาก `repair` ได้แต่ข้อมูล downtime/repair_time ว่าง (0/114)
- "สเปก" (specification) — ไม่พบตาราง/คอลัมน์ที่เก็บสเปกเครื่อง (ไม่แน่ใจว่าเก็บใน `description` หรือที่อื่น)
- "ปีติดตั้ง" เป็นฟิลด์แยก — ไม่มีคอลัมน์ year; มี `installation_date` (date) แต่ populated 0/82
- ความพร้อมใช้งาน (Availability 98.5%) — ค่าคงที่ในโค้ด ไม่ได้คำนวณจากข้อมูลจริง
- ปุ่ม "เบิกอะไหล่" — ไม่มีบนหน้านี้ (ไม่แน่ใจว่ามีเมนู spare_parts/requisition แยก)

---

*หมายเหตุ: จำนวนแถว "0/82" หมายถึง 0 แถวจาก 82 แถวใน `asset_registry` มีค่าในคอลัมน์นั้น (ข้อมูลส่วนใหญ่เป็น placeholder import). ค่าที่ "ไม่แน่ใจ" ระบุไว้ชัดเจน.*
