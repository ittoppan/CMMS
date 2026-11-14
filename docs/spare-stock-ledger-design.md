# ออกแบบ “ประวัติเคลื่อนไหวสต็อกอะไหล่” (Stock Movement Ledger) + การกระทบยอด Sage 300 — Proposal (ไม่รัน migration)

สถานะ: **เอกสารออกแบบ + migration proposal** (`database/migration_20261114_spare_stock_ledger_proposal.sql`)
ข้อจำกัดตามคำสั่งงาน: **ห้ามรัน migration / ห้ามแก้ DB จริง / ห้ามแก้ API ในรอบนี้** — ต้องอนุมัติและยืนยันคอลัมน์จริงก่อน

## 1) เป้าหมายและขอบเขต

- มี **ประวัติการเคลื่อนไหวสต็อกที่ตรวจสอบย้อนกลับได้** ต่อรายการอะไหล่: รับเข้า (receipt), เบิก/จ่าย (withdrawal/issue), คืน (return), ตัดจำหน่าย (scrap), ปรับปรุงจากนับสต็อก (adjustment)
- ทุกการเปลี่ยน `spare_parts.stock_qty` ต้องมี **movement ต้นทาง 1 รายการ** (หรือเป็นผลจากการกระทบยอด Sage ที่บันทึกไว้) — ไม่มี “การแก้ตัวเลขลอย ๆ”
- กระทบยอดกับ **Sage 300 I/C** ได้รายงวด: อธิบายได้ว่าส่วนต่างระหว่างยอด CMMS กับยอด Sage มาจากอะไร
- เป็นฐานให้ EOQ / สต็อกค้าง / อัตราการใช้จริง ใช้ “ข้อมูลจริง” ไม่ใช่การประมาณ

ไม่อยู่ในขอบเขต: การออกแบบบัญชีต้นทุนเชิงลึก (FIFO layer/GL posting), การเขียน ODBC connector ใหม่, การแก้ API/UI (แยกงานถัดไป)

## 2) สถานะปัจจุบัน (As-Is) — จากโค้ดจริงในรีโป

### 2.1 ตารางที่มีอยู่แล้ว
- `spare_parts` (`database/schema.sql:91`): `stock_qty`, `min_stock`, `max_stock`, `unit_price`, `location`, `unit`, `created_at`, `updated_at` (+ คอลัมน์เสริมที่โค้ดใช้: `reserved_qty`, `last_movement_at`, `sage_item_no`, `sage_category`, `sage_sync_status`, `last_synced_at`, `image_url`)
- `spare_part_transactions` (`database/migration_20260723.sql:308`) — **ledger เดิมมีอยู่แล้ว**:
  `type ENUM('receipt','return','scrap','withdrawal','adjustment')`, `quantity`, `unit_price`, `reference_type`, `reference_no`, `notes`, `created_by`, `created_at`
- Phase 33 (`scripts/archive/apply_phase33_spare_optimization.php:404-419`) เสนอเพิ่มคอลัมน์ให้ ledger:
  `qty_before`, `qty_after`, `warehouse_id`, `movement_date`, `balance_source ENUM('sage_sync','stock_take','wo_usage','pm_usage','issue','return','adjustment')`, `confirmed_by_sage`, `client_action_id` + index `(spare_part_id, created_at)`, `(balance_source)`, `(movement_date)` + unique `client_action_id` + FK `warehouse_id → spare_warehouses.id`
  → **ยังไม่ได้ยืนยันว่า script นี้ถูกรันในสภาพแวดล้อมจริงหรือไม่** (งานนี้ไม่แตะ DB) ต้องตรวจก่อนด้วยข้อ 9.1
- ตารางประกอบที่มีอยู่: `spare_warehouses`, `spare_part_approvals`, `spare_part_reservations`, `stock_take` + `stock_take_items`, `repair_spare_parts`, `pm_am_spare_parts`

### 2.2 จุดที่ “ตัด/รับสต็อก” ในโค้ดวันนี้ (สำคัญ)
| path | ไฟล์ | พฤติกรรม |
|---|---|---|
| ใช้ในใบซ่อม (WO) | `src/helpers/work_order.php:41` | `UPDATE spare_parts SET stock_qty = ?` — **ไม่เขียน ledger**, ไม่มี idempotency key, ไม่ล็อกแถว |
| อนุมัติใบเบิก | `src/services/ApprovalService.php:146` | `UPDATE spare_parts SET stock_qty = stock_qty - ?` — **ไม่เขียน ledger** |
| นับสต็อก (ปิดรอบ) | `public/api/v1/stock_take.php:131-137` | `UPDATE spare_parts sp JOIN stock_take_items sti ... SET sp.stock_qty = sti.counted_qty` — **ไม่เขียน ledger**, ไม่เก็บ `qty_before` (รู้แค่ `system_qty` ใน `stock_take_items`) |
| ledger writer | `src/helpers/spare_optimization.php:421-557` `spO_recordMovement()` | เขียน ledger + snapshot `qty_before/qty_after` + dedupe ด้วย `client_action_id` + `SELECT` stock แล้ว update กลับ — **ถูกเรียกจากเทสต์เท่านั้น** (`scripts/test_spare_optimization.php`) |

ผลที่ตามมา (ยืนยันได้จากโค้ด): ประวัติเคลื่อนไหวในระบบจริงแทบว่าง, `analytics_advanced.php:20` ระบุตาราง `spare_part_transactions` ยังไม่มีข้อมูล, และ `src/helpers/spare_optimization.php:25-28` ระบุว่า EOQ/สต็อกค้างยังไม่มีข้อมูลจริงให้คำนวณ → ต้องรายงานเป็น N/A

### 2.3 ช่องว่างเชิงออกแบบ (จะปิดในฉบับนี้)
1. ไม่มี **สถานะเอกสาร** (`posted/voided`) — แก้ผิดต้องไป UPDATE ทับ ไม่มีร่องรอย
2. ไม่มี **เอกสารหัวใบ** สำหรับใบเบิก/ใบรับหลายบรรทัด (ตอนนี้มีแต่ `reference_no` เป็นข้อความอิสระ)
3. ไม่มี **snapshot หน่วยนับ (UoM)** ตอนบันทึก — เปลี่ยนหน่วยภายหลังแล้วย้อนอ่านผิดความหมาย
4. ไม่มี **รหัสเหตุผล** มาตรฐานสำหรับปรับปรุง/ตัดจำหน่าย (free text)
5. ไม่มี **ตารางกระทบยอด Sage** — sync ทับ `stock_qty` ตรง ๆ ทำให้ยอดหายโดยไม่มีคำอธิบาย
6. **ไม่มี single writer ในทางปฏิบัติ** — 3 path เขียนสต็อกแยกกัน (ข้อ 2.2)
7. ไม่มี **concurrency guard** — `spO_recordMovement()` อ่าน-แล้ว-เขียนโดยไม่ล็อกแถว (`FOR UPDATE`) เสี่ยง lost update เมื่อมีคนเบิกพร้อมกัน

## 3) หลักการออกแบบ (To-Be)

1. **Single writer**: ทุกการเปลี่ยนสต็อกผ่าน `spO_recordMovement()` เท่านั้น (หรือ helper ที่ห่อมัน) — ห้าม `UPDATE spare_parts SET stock_qty` จากที่อื่น
2. **Append-only**: ledger ห้าม UPDATE/DELETE; แก้ไข = บันทึก **reversal** (`voided` + `reverses_id`) แล้วออกรายการใหม่
3. **Balance snapshot**: ทุกแถวเก็บ `qty_before`/`qty_after` เพื่อพิสูจน์ว่า “ยอดเดินต่อเนื่อง” (audit chain) และคำนวณ delta ได้แม้ `type` กำกวม
4. **Sage = system of record ของจำนวนคงเหลือ**: CMMS ledger ทำหน้าที่ *อธิบาย* ส่วนต่าง ไม่ใช่แทนที่ Sage — sync ต้องบันทึกส่วนต่างเป็น movement ประเภทปรับปรุง/กระทบยอด (ไม่ใช่เขียนทับเงียบ ๆ)
5. **ห้ามสต็อกติดลบโดยค่าเริ่มต้น** (409) เว้นแต่ผู้มีสิทธิ์เลือก `allow_negative` พร้อมเหตุผล ซึ่งจะถูกบันทึกในแถว
6. **ตัวเลขที่คำนวณไม่ได้ → N/A**: ถ้า ledger เริ่มใช้ไม่ครบงวด ให้รายงาน “ไม่พอข้อมูล” ไม่ประมาณแทน

## 4) โครงสร้างข้อมูลที่เสนอ (additive ทั้งหมด)

### 4.1 `spare_part_transactions` — ขยาย ledger เดิม (ไม่สร้าง ledger ใหม่)
| คอลัมน์ (เสนอ) | ชนิด | หมายเหตุ |
|---|---|---|
| `status` | ENUM('posted','voided') DEFAULT 'posted' | posted = มีผลกับยอด, voided = ถูกกลับรายการ |
| `reverses_id` | INT UNSIGNED NULL | ชี้แถวที่ถูกกลับ (self FK) — ใช้คู่กับ `status` |
| `voided_at`, `voided_by`, `void_reason` | DATETIME/INT/VARCHAR NULL | ร่องรอยการกลับรายการ |
| `doc_id` | INT UNSIGNED NULL | FK → `spare_movement_documents.id` (หัวใบ) |
| `uom` | VARCHAR(30) NULL | snapshot หน่วยนับ ณ เวลาบันทึก |
| `reason_code` | VARCHAR(40) NULL | FK เชิงตรรกะ → `spare_movement_reasons.code` |
| `source_module` | ENUM(...) NULL | ละเอียดกว่า `balance_source`: `work_order`,`pm_am`,`issue_request`,`stock_take`,`sage_sync`,`manual` |
| `qty_signed` | DECIMAL(12,3) GENERATED STORED | `CASE type WHEN 'receipt' THEN +qty ... END` — ใช้ SUM กระทบยอด (MySQL 5.7+/MariaDB 10.2+; ถ้าเวอร์ชันต่ำกว่าให้ตัดออกและคำนวณใน query) |
| `posted_at` | DATETIME NULL | เวลาที่มีผลทางบัญชี (แยกจาก `created_at`) |
| index | `(spare_part_id, movement_date, status)`, `(doc_id)`, `(status, type)` | เร่งรายงานกระทบยอด/ประวัติ |

> หมายเหตุ: ถ้า Phase 33 ยังไม่ถูกรัน คอลัมน์ `qty_before/qty_after/warehouse_id/movement_date/balance_source/confirmed_by_sage/client_action_id` ต้องถูกเพิ่มก่อน (อยู่ใน proposal ชุดเดียวกัน แบบ commented เพื่อบังคับให้ตรวจก่อน)

### 4.2 `spare_movement_documents` — หัวใบ (ใหม่)
ใช้เมื่อ 1 ธุรกรรมมีหลายบรรทัด (ใบเบิกหลายรายการ, ใบรับจาก PO, ใบปรับปรุงจากการนับ)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | PK | |
| `doc_type` | ENUM('receipt','issue','return','scrap','adjustment','reconcile') | |
| `doc_no` | VARCHAR(50) UNIQUE | เลขเอกสาร CMMS เช่น `ISS-20261114-001` |
| `doc_date` | DATE | วันที่เอกสาร (ใช้เป็น cut-off) |
| `status` | ENUM('draft','posted','voided') DEFAULT 'draft' | |
| `warehouse_id` | INT UNSIGNED NULL | คลังต้นทาง/ปลายทาง |
| `repair_id`, `pm_am_id`, `approval_id` | INT UNSIGNED NULL | แหล่งที่มา (ใบซ่อม/PM/อนุมัติ) |
| `sage_doc_no` | VARCHAR(100) NULL | เลขเอกสาร Sage ที่อ้างอิง (ถ้ามี) |
| `note` | VARCHAR(500) NULL | |
| `created_by`, `posted_by`, `posted_at`, `created_at`, `updated_at` | audit | |

### 4.3 `spare_movement_reasons` — รหัสเหตุผล (ใหม่)
`code` (unique), `name`, `applies_to` (`receipt|issue|return|scrap|adjustment`), `is_active`, `requires_note`
ใช้บังคับให้ “ปรับปรุง/ตัดจำหน่าย” ต้องมีเหตุผลมาตรฐาน (ไม่ใช่ข้อความอิสระที่สรุปไม่ได้)

### 4.4 `sage_stock_reconciliation` + `sage_stock_reconciliation_items` (ใหม่)
เก็บ “ภาพนิ่ง” ของการกระทบยอดแต่ละรอบ เพื่อให้ตัวเลขที่รายงานย้อนหลังไม่เปลี่ยน

`sage_stock_reconciliation`: `id`, `period_start`, `period_end`, `cutoff_at`, `status ENUM('draft','confirmed')`, `total_parts`, `matched_parts`, `variance_parts`, `variance_value`, `created_by`, `created_at`, `confirmed_by`, `confirmed_at`, `note`

`sage_stock_reconciliation_items`: `id`, `reconciliation_id`, `spare_part_id`, `uom`, `opening_qty`, `ledger_in`, `ledger_out`, `ledger_adjust`, `expected_qty`, `sage_qty`, `variance_qty`, `variance_value`, `variance_class` (`timing|uom|missing_doc|unposted|valuation|opening|other`), `note`

## 5) กติกาทิศทาง (Sign convention) และหน่วยนับ

| type | ผลต่อ `stock_qty` | ต้องมี | หมายเหตุ |
|---|---|---|---|
| `receipt` | +`quantity` | `doc_id` หรือ `reference_no` | รับจากผู้ขาย/โอนเข้า |
| `return` | +`quantity` | เหตุผล/ผู้อ้างอิง | คืนจากใบซ่อม/ผู้เบิก |
| `withdrawal` | −`quantity` | `reason_code` (ถ้าเป็นเบิกใช้งาน) | เบิกจ่าย |
| `scrap` | −`quantity` | `reason_code` + หมายเหตุ | ตัดจำหน่าย/ชำรุด |
| `adjustment` | ตั้ง `qty_after` ตรง ๆ | `reason_code` + `qty_after` | จากนับสต็อก/กระทบยอด Sage |

- `quantity` เก็บเป็น **ค่าบวกเสมอ** (abs) — ทิศทางมาจาก `type`/`qty_after` ตามที่ `spO_rowDelta()` ใช้อยู่แล้ว
- `qty_signed` (ถ้าเปิดใช้) เป็นตัวเดียวที่ใช้ SUM ในรายงาน เพื่อไม่ให้ตีความผิด
- `uom` snapshot ต้องเท่ากับ `spare_parts.unit` ณ เวลาบันทึก; ถ้าแปลงหน่วย ให้เก็บ `uom` ต้นทาง + ค่าแปลงใน `notes`/คอลัมน์เสริม — **ห้ามเปลี่ยนหน่วยย้อนหลังในแถวที่ posted แล้ว**

## 6) วงจรชีวิต (Lifecycle)

```
draft (ถ้ามีหัวใบ) → posted (มีผลกับยอด; ห้ามแก้) → voided (สร้าง reversal row)
```
- Void = เพิ่มแถวใหม่ `type` เดิม, `quantity` เท่าเดิม, สถานะ `posted`, และแถวเดิมถูกตั้ง `status='voided'` + `reverses_id` ชี้กัน — **ไม่ลบข้อมูล**
- `posted` ทุกแถวต้องมี `created_by`; ถ้าเป็นการกลับรายการจากระบบ ให้ `created_by = NULL` และ `source_module` ระบุชัด
- การแก้ใบเบิกที่ยัง `draft` = ลบ/แก้ได้; ที่ `posted` แล้ว = void + ออกใหม่ (สร้างเอกสารใหม่เสมอ เพื่อไม่ให้เลขเอกสารซ้ำความหมาย)

## 7) ความถูกต้องเชิงเทคนิคที่ต้องบังคับในโค้ด (ตอน implement)

1. ทุก write อยู่ใน DB transaction เดียว และ `SELECT stock_qty FROM spare_parts WHERE id = ? FOR UPDATE` ก่อนคำนวณ `qty_after`
2. `client_action_id` (unique) ใช้เป็น idempotency key ของทุก path ที่อาจ retry (offline/PWA/double-click)
3. ตรวจ `qty_after < 0` → 409 พร้อมข้อความบอกยอดก่อน/หลัง (เว้นแต่ `allow_negative` + `reason_code` ที่อนุญาต)
4. `stock_qty` = **cache ที่ derive จาก ledger**; เขียนได้เฉพาะใน writer เดียวกัน (พร้อม `last_movement_at`)
5. `reserved_qty` ยังคง derive จาก `spare_part_reservations` (มี `spO_recomputeReservedQty()` อยู่แล้ว) — ห้ามปนกับการตัดสต็อกจริง
6. รายงาน “คงเหลือใช้ได้” = `stock_qty − reserved_qty` (นิยามนี้ต้องยืนยันกับผู้ใช้ธุรกิจ — ข้อ 10)

## 8) ผลกระทบต่อการกระทบยอด Sage 300 (หัวใจของงานนี้)

### 8.1 หลักการ
- **Sage 300 I/C คือแหล่งความจริงของจำนวนคงเหลือ** (ICILOC ต่อ location); CMMS เก็บ ledger เพื่ออธิบาย “ทำไมเปลี่ยน”
- `sage_sync.php` วันนี้ overwrite `stock_qty` ตามค่าที่ดึงมา → ต้องเปลี่ยนเป็น: คำนวณ `delta = sage_qty − cmms_qty` แล้ว **บันทึก movement** (`type='adjustment'`, `balance_source='sage_sync'`, `reason_code='SAGE_RECONCILE'`, `reference_no = <เลขเอกสาร Sage ถ้ามี>`, `confirmed_by_sage=1`) ก่อน/พร้อมอัปเดตยอด — เพื่อไม่ให้ยอดหายแบบไร้ร่องรอย
- ถ้า sync เป็นการ “ยืนยันยอดตามปกติ” และไม่มี delta → ไม่ต้องเขียนแถว (ไม่สร้าง noise)

### 8.2 สูตรกระทบยอดรายงวด (ต่อ 1 รายการ)
```
opening_qty   = qty_after ของ movement ล่าสุดก่อน period_start (หรือ 0 ถ้าเริ่มใช้ ledger กลางงวด)
expected_qty  = opening_qty + Σ receipt + Σ return − Σ withdrawal − Σ scrap + Σ adjustment(ledger)
sage_qty      = ยอดคงเหลือจาก Sage ณ cutoff
variance_qty  = sage_qty − expected_qty
```
- `variance_value = variance_qty × unit_price` (ใช้วันที่ cut-off)
- เกณฑ์ผ่าน/ไม่ผ่าน: `|variance_qty| ≤ tolerance` (เสนอ default 0 หน่วยสำหรับรายการนับได้ และให้ธุรกิจตั้ง tolerance ต่อกลุ่ม ถ้าต้องการ)

### 8.3 การจำแนกส่วนต่าง (`variance_class`)
| ชั้น | ความหมาย | ตัวอย่าง/การจัดการ |
|---|---|---|
| `timing` | CMMS บันทึกแล้ว แต่ Sage ยังไม่ post เอกสารในงวด | ตรวจเลขเอกสาร, เลื่อน cut-off, ไม่ต้องแก้ยอด |
| `unposted` | CMMS ยังไม่ได้บันทึก (ของออกจริงแล้ว) | ออกใบเบิกย้อนหลังพร้อมวันที่จริง (ห้ามแก้วันที่ให้ดูสวย) |
| `missing_doc` | มีของใน Sage แต่ไม่มีเอกสาร CMMS | เปิดใบรับ/ปรับปรุงพร้อมเหตุผล `IMPORT_MISSING` |
| `uom` | หน่วยนับไม่ตรง (ชิ้น/กล่อง/เมตร) | แก้ mapping หน่วย + ตรวจ `unit` ของ master |
| `valuation` | จำนวนตรงแต่ราคาต่าง | กระทบมูลค่า ไม่แตะจำนวน (รายงานแยก) |
| `opening` | ยอดยกมาผิด/ไม่เคยตั้งต้น | ตั้ง opening balance ใหม่พร้อมอนุมัติ (ห้ามเงียบ) |
| `other` | ต้องสอบสวน | ต้องมีหมายเหตุ |

### 8.4 กติกาความปลอดภัยของการปรับยอด
- ปรับได้เฉพาะผู้มีสิทธิ์ + ต้องมี `reason_code` และ `note`
- ผลต่างมูลค่ารวมเกิน threshold ของงวด → ต้องอนุมัติก่อน `confirmed`
- ทุกการปรับต้องผูก `reconciliation_id` เพื่อตอบได้ว่า “ปรับเพราะรอบกระทบยอดไหน”

### 8.5 รายงาน/ตัวชี้วัดที่ใช้ได้ทันทีเมื่อมี ledger
- ประวัติเคลื่อนไหวต่อรายการ (รับ/เบิก/ปรับ) พร้อมผู้ทำ + เอกสารอ้างอิง
- อัตราการใช้จริงต่อเดือน (จาก `withdrawal`) → ป้อน EOQ/ROP แทนการประมาณ
- `parts reconciled %`, `variance value`, `% movements ที่มีเอกสารอ้างอิง` (ใช้เป็น KPI คุณภาพข้อมูล)

## 9) แผนดำเนินการ (ยังไม่รันอะไรในรอบนี้)

### 9.1 ก่อนอนุมัติ — ตรวจสภาพจริง (read-only)
```sql
SHOW COLUMNS FROM spare_part_transactions;      -- ยืนยันคอลัมน์ Phase 33
SHOW COLUMNS FROM spare_parts;                  -- reserved_qty/last_movement_at/sage_*
SHOW TABLES LIKE 'spare_warehouses';
SELECT COUNT(*) FROM spare_part_transactions;   -- ต้องรู้ว่าเริ่มจาก 0 หรือมีของเก่า
SELECT COUNT(*) FROM spare_parts WHERE stock_qty < 0;
```

### 9.2 เฟสติดตั้ง
- **P0** — อนุมัติ schema + เพิ่มคอลัมน์/ตาราง (ตาม proposal) + seed `spare_movement_reasons` + ตั้ง opening balance ต่อรายการ ณ วันเริ่มใช้
- **P1** — รวม writer: WO usage (`work_order.php`), อนุมัติเบิก (`ApprovalService.php`), stock take, issue request → เรียก `spO_recordMovement()` พร้อม `client_action_id` + `FOR UPDATE`
- **P2** — UI: หน้าประวัติต่อรายการ (จาก ledger), ใบเบิก/ใบรับหลายบรรทัดผ่าน `spare_movement_documents`
- **P3** — Sage reconciliation: เปลี่ยน `sage_sync.php` ให้บันทึก delta, ทำรายงานกระทบยอดรายเดือน + หน้าอนุมัติปรับยอด
- **P4** — Analytics: เปิด EOQ/ROP/สต็อกค้างจาก ledger จริง และเลิกใช้ค่าประมาณ

### 9.3 Backfill (ความจริงที่ต้องยอมรับ)
- **ไม่สามารถ** backfill movement ย้อนหลังให้ครบได้ (ไม่มีข้อมูลว่าใครเบิกเมื่อไร)
- ทำได้แค่ **opening balance** 1 แถวต่อรายการ ณ วันเริ่มใช้ (`type='adjustment'`, `reason_code='OPENING_BALANCE'`, `qty_after = stock_qty` ปัจจุบัน, `qty_before = 0`, หมายเหตุ “ยอดยกมาตาม Sage ณ วันที่...”)
- รายงานใดที่ต้องใช้ประวัติก่อนวันเริ่มใช้ → ต้องแสดง N/A พร้อมระบุวันเริ่มต้นข้อมูล

## 10) ประเด็นที่ต้องให้เจ้าของธุรกิจตัดสิน (Open decisions)

1. `on-hand` ที่ใช้ตัดสิน “หมด/ใกล้หมด” = `stock_qty` หรือ `stock_qty − reserved_qty`?
2. คลัง (warehouse) หลายแห่ง: จะเริ่มใช้ `warehouse_id` จริงจังเมื่องใด และ Sage มี location ตรงกับ `spare_warehouses.code` แล้วหรือยัง?
3. ต้นทุน: ใช้ `unit_price` ล่าสุด (moving average แบบง่าย) หรือต้อง FIFO layer (จะเพิ่มความซับซ้อนมาก)
4. Tolerance ของการกระทบยอด: 0 หน่วยทุกกรณี หรือมีข้อยกเว้นตามกลุ่มอะไหล่?
5. ใครมีสิทธิ์ “อนุมัติปรับยอด” และวงเงินเท่าไร (ผูกกับ `spare_part_approvals` เดิมหรือทำใหม่)?
6. นโยบายสต็อกติดลบ: อนุญาตเฉพาะงานฉุกเฉิน (WO) หรือห้ามเด็ดขาด?

## 11) ชุดทดสอบที่ต้องผ่านก่อนถือว่า “ใช้งานได้” (ตอน implement)

1. รับเข้า 10 → `stock_qty` 20, ledger มี 1 แถว `qty_before=10`, `qty_after=20`
2. เบิกเกินยอด → 409 และไม่มีแถวถูกเขียน
3. `client_action_id` ซ้ำ → คืน `duplicate=true`, ledger ไม่เพิ่ม, ยอดไม่เปลี่ยน
4. เบิกพร้อมกัน 2 request (จำลอง concurrency) → ยอดสุดท้าย = ผลรวมที่ถูกต้อง (พิสูจน์ `FOR UPDATE`)
5. void ใบเบิก → มียอดกลับคืน + แถวเดิม `status='voided'` + `reverses_id` ชี้ถูก
6. stock take พบไม่ตรง → 1 แถว `adjustment` ที่ `qty_after` = ยอดนับจริง พร้อม `reason_code`
7. sync Sage ที่มี delta → มีแถว `balance_source='sage_sync'` และยอด CMMS = ยอด Sage
8. sync Sage ที่ไม่มี delta → ไม่มีแถวใหม่
9. กระทบยอด: `opening + Σin − Σout ± Σadj = sage_qty` ผ่านทุกกรณีทดสอบ
10. รายงาน EOQ: เมื่อ ledger ว่าง → N/A (ไม่ใช่ 0)

## 12) ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | การลดความเสี่ยง |
|---|---|---|
| เปลี่ยน path ตัดสต็อกพร้อมกันหลายจุด | ยอดเพี้ยนชั่วคราวระหว่าง deploy | ทำ P1 ทีละ path + feature flag setting + ทดสอบซ้ำ |
| Phase 33 ไม่ได้ถูก run ในบาง environment | writer พังเพราะคอลัมน์ไม่มี | pre-flight `SHOW COLUMNS` + migration แบบตรวจก่อน |
| ข้อมูลเก่าไม่มีประวัติ | รายงานย้อนหลังผิดความหมาย | opening balance + แสดงวันเริ่มต้นข้อมูลชัดเจน |
| sync Sage ทับยอดถี่ | ledger บวมด้วย adjustment ถี่ | เขียนเฉพาะเมื่อ delta ≠ 0 + รวมเป็นรายงวดได้ |
| หน่วยนับเปลี่ยนย้อนหลัง | ยอดกระทบยอดเพี้ยน | snapshot `uom` + ห้ามแก้ย้อนหลัง |
| ผู้ใช้แก้ตัวเลขใน DB ตรง ๆ | ledger ขาดตอน | จำกัดสิทธิ์ DB + รายงาน “chain broken” (qty_before ≠ qty_after แถวก่อน) |

## 13) สิ่งที่ทำ/ไม่ทำในรอบนี้

- **ทำ**: เอกสารออกแบบนี้ + `database/migration_20261114_spare_stock_ledger_proposal.sql` (proposal, ยังไม่รัน)
- **ไม่ทำ**: ไม่รัน migration, ไม่แก้ DB/env/secrets/settings, ไม่แก้ API/UI, ไม่ตรวจข้อมูลจริงในฐานข้อมูล (ต้องขออนุมัติ/เข้าถึงสภาพแวดล้อมจริงก่อน)
