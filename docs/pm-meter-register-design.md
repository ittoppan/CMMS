# ออกแบบ “ทะเบียนมิเตอร์” (Meter Register) สำหรับ PM/CBM — Proposal (ไม่รัน migration)

สถานะ: **เอกสารออกแบบ + migration proposal** (`database/migration_20261114_meter_register_proposal.sql`)  
ข้อจำกัดตามคำสั่งงาน: **ห้ามรัน migration / ห้ามแก้ DB จริงโดยพลการ** ต้องได้รับอนุมัติก่อนนำไปใช้

## 1) เป้าหมาย
- รองรับมิเตอร์ **น้ำ (m³)** และ **ไฟฟ้า (kWh)** และมิเตอร์อื่น (ชั่วโมง, ความดัน ฯลฯ) แบบ “ทะเบียน” ที่ชัดเจนต่อเครื่องจักร/จุดวัด
- รองรับ **หลายมิเตอร์ต่อเครื่อง** และระบุจุดติดตั้ง/หมายเลขมิเตอร์/หน่วยมาตรฐาน/แหล่งอ่านค่า
- เชื่อมแผน PM แบบ `meter_based` (CBM) กับมิเตอร์ที่ถูกต้อง ลดความคลาดเคลื่อนจากการจับคู่ด้วย `parameter/unit` แบบหลวม
- รองรับการบันทึกค่าด้วยมือ (ปัจจุบัน) และวางทางสำหรับนำเข้า/อ่านอัตโนมัติในอนาคต โดยไม่ผูกกับ vendor เฉพาะ

## 2) สถานะปัจจุบัน (As-Is)
- ค่าวัดเก็บในตาราง/โครงสร้างเดิม `asset_measurements` (ผ่าน helper `asset_reliability.php` / `src/helpers/pm_meter.php`)
- แผน/รอบ PM meter-based ใช้ฟิลด์ `meter_unit`, `meter_interval` และอ่านค่าล่าสุดด้วยการจับคู่ `parameter` หรือ `unit` กับ `meter_unit` (`pm_meter_reading`)
- จุดบันทึกค่าใน UI ที่เพิ่มในรอบนี้: หน้า asset registry view (`/asset_registry/view?id=`) บันทึกผ่าน `POST /api/v1/asset_measurements.php` (preset kWh/m³/ชั่วโมง) และแสดงประวัติล่าสุด; CBM refresh ผ่าน `pm_plans.php?asset_id=&meters=1`
- ข้อจำกัด: ไม่มีทะเบียนมิเตอร์ (serial/ตำแหน่ง/active), ไม่ผูก `pm_am_plans.meter_*` กับมิเตอร์เฉพาะ, หลายมิเตอร์ชนหน่วย/ชื่อพารามิเตอร์ได้, ยังไม่รองรับนำเข้า/อ่านอัตโนมัติอย่างเป็นระบบ

## 3) โครงสร้างข้อมูลที่เสนอ (To-Be)

### 3.1 ตาราง `asset_meters` (ทะเบียนมิเตอร์ต่อเครื่อง)
| คอลัมน์ | ชนิด (เสนอ) | หมายเหตุ |
|---|---|---|
| `id` | PK, INT/BIGINT AUTO_INCREMENT | |
| `asset_id` | FK -> assets.id | เครื่องจักรเจ้าของมิเตอร์ |
| `meter_code` | VARCHAR, UNIQUE (ต่อ asset หรือ global ตามนโยบาย) | รหัสอ้างอิงภายใน เช่น ELEC-MAIN-01 |
| `meter_type` | ENUM/VARCHAR | `electric`, `water`, `runtime_hours`, `other` |
| `name` | VARCHAR | ชื่อแสดงผล เช่น “มิเตอร์ไฟฟ้าหลัก” |
| `serial_number` | VARCHAR NULL | เลขมิเตอร์จากผู้ผลิต/การไฟฟ้า/ประปา (ถ้ามี) |
| `location_note` | VARCHAR/TEXT NULL | จุดติดตั้ง/ตู้ MDB/ท่อขาเข้า ฯลฯ |
| `unit` | VARCHAR | หน่วยมาตรฐาน เช่น `kWh`, `m³`, `ชั่วโมง` |
| `reading_mode` | VARCHAR | `manual`, `import`, `sensor` (อนาคต) |
| `multiplier` | DECIMAL | ตัวคูณ CT/ratio (default 1) |
| `rollover_value` | DECIMAL NULL | ค่ากลับศูนย์ของหน้าปัด (ถ้ามี) |
| `is_active` | TINYINT(1) | ใช้งานอยู่ |
| `installed_at`, `retired_at` | DATETIME/DATE NULL | วงจรชีวิตมิเตอร์ |
| `metadata_json` | JSON/TEXT NULL | ขยายฟิลด์โดยไม่แก้ schema บ่อย (เช่น supplier, photo ref) |
| `created_at`, `updated_at`, `created_by` | audit fields | |

ข้อควรพิจารณา: ดัชนี `(asset_id, is_active)`, `(meter_type)`, unique `(asset_id, meter_code)` หรือ unique global ตามที่ต้องการ

### 3.2 ตาราง `asset_meter_readings` (ทางเลือกเชิงโครงสร้าง)
เพื่อแยก “ค่าที่อ่านจากมิเตอร์ที่ลงทะเบียน” ออกจาก `asset_measurements` เดิมอย่างชัดเจน (แนะนำระยะกลาง):
| คอลัมน์ | หมายเหตุ |
|---|---|
| `id` PK | |
| `meter_id` FK -> asset_meters.id | ผูกทะเบียนมิเตอร์ |
| `asset_id` FK | denormalize เพื่อ query เร็ว/สิทธิ์ |
| `reading_value` DECIMAL | ค่าหน้าปัด/ค่าสะสม ณ เวลาอ่าน |
| `delta_value` DECIMAL NULL | ค่าที่ใช้ไปในช่วง (คำนวณ/นำเข้า) |
| `unit` | snapshot หน่วยตอนบันทึก |
| `read_at` DATETIME | เวลาที่อ่านจริง |
| `source` | `manual`/`import`/`api` |
| `source_ref` VARCHAR NULL | batch/file/device id |
| `notes` TEXT NULL | |
| `recorded_by`, `created_at` | audit |

**ความเข้ากันได้ย้อนหลัง:** ช่วงเปลี่ยนผ่านให้คงอ่าน `asset_measurements` ได้ และ/หรือเขียนคู่ (dual-write) หรือทำ view รวม เพื่อไม่กระทบ CBM เดิมทันที

### 3.3 การเชื่อม PM Plan (CBM)
เพิ่มความสัมพันธ์แบบชัดเจน (เลือกอย่างใดอย่างหนึ่งหรือผสมตาม migration จริง):
- เพิ่ม `meter_id` (nullable FK -> asset_meters.id) ใน `pm_am_plans` (หรือ `pm_am` ตามที่ใช้เป็น master) สำหรับแผน `meter_based`
- คง `meter_unit`/`meter_interval` ไว้เป็น snapshot/constraint และ validate ให้สอดคล้องหน่วยของมิเตอร์
- ตรรกะ `pm_meter.php` ควร prefer อ่านจาก `meter_id` ถ้ามี มิฉะนั้น fallback การจับคู่แบบเดิมเพื่อ backward compatibility

### 3.4 นำเข้า/อ่านอัตโนมัติ (อนาคต)
- Endpoint นำเข้า CSV/Excel (batch) + mapping คอลัมน์ -> meter_id/read_at/value/unit
- ตาราง `asset_meter_import_batches` (optional) เก็บผลนำเข้า/ข้อผิดพลาดรายแถว
- Hook สำหรับ sensor/IoT: รับ payload ที่ระบุ `meter_code`/`serial_number` + idempotency key, ตรวจหน่วย/ช่วงค่าผิดปกติ (anomaly guard) ก่อนบันทึก

## 4) ผลกระทบ API / UI (ต้องทำเมื่อมี schema)
- **API ใหม่/ปรับ:** CRUD `asset_meters` (list/create/update/retire), readings list/add (filter ตาม meter), import endpoint; ทุก write ต้อง CSRF + permission เดิมของ asset/PM
- **PM plan create/edit:** เลือกมิเตอร์จากทะเบียน (dropdown ตาม asset) แทน/ควบคู่การกรอก `meter_unit` อิสระ
- **PM checksheet/view:** แสดง baseline/target อ้างอิงมิเตอร์ที่ผูก, เตือนถ้ามิเตอร์ถูก retire หรือหน่วยไม่ตรง
- **Asset registry view:** แสดงทะเบียนมิเตอร์ของเครื่อง + บันทึกค่าเลือกมิเตอร์ (ไม่ใช่แค่ preset ชื่อพารามิเตอร์)
- **Dashboard/Reports:** สรุปการอ่านค่ามิเตอร์น้ำ/ไฟ, ค่าขาดหาย, แนวโน้ม (พึ่งข้อมูลจริงที่มี)

## 5) แผน migration และ rollout (เสนอ)
1. สร้างตาราง `asset_meters` (+ index/constraints) — **ไม่รันในงานนี้**
2. (ถ้าเลือก) สร้าง `asset_meter_readings` และ/หรือ batch table
3. Backfill: สร้าง meter records จากแผน/ค่าที่มีอยู่ (กติกาอนุมานจาก `meter_unit`/`parameter`) — ต้องสคริปต์ตรวจสอบก่อน
4. เพิ่ม `meter_id` nullable ในแผน PM + backfill + ค่อยบังคับในแผนใหม่
5. ปรับ `pm_meter.php` ให้รองรับทั้งโหมดเก่า/ใหม่, dual-read/write ช่วงเปลี่ยนผ่าน
6. ทดสอบกับข้อมูลจริง: หน่วยไม่ตรง, ไม่มีค่า, หลายมิเตอร์ต่อเครื่อง, สิทธิ์, ประสิทธิภาพ query

ไฟล์ migration proposal: `database/migration_20261114_meter_register_proposal.sql` (ดูตัวอย่าง DDL/หมายเหตุในไฟล์) — **ห้ามรันจนกว่าจะอนุมัติ**

## 6) ความเสี่ยง/ข้อควรระวัง
- การอนุมานมิเตอร์จากข้อมูลเดิมอาจผิด (ชื่อพารามิเตอร์ไม่สม่ำเสมอ) ต้องมีรายงานตรวจสอบก่อน backfill
- ค่ามิเตอร์แบบสะสม (kWh/m³) กับ rollover/multiplier ต้องนิยามให้ชัดก่อนคำนวณ delta
- ห้ามลบ/เปลี่ยนความหมายข้อมูลเดิมโดยไม่มีสำเนา/แผน rollback
- สิทธิ์การเห็นค่าพลังงาน/น้ำอาจต้องพิจารณาตามนโยบายองค์กร (ปัจจุบันยึด permission asset/PM เดิม)
