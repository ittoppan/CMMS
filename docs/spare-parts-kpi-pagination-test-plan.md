# แผนทดสอบและเช็กลิสต์ — หน้าอะไหล่ `/spare_parts`
ตรวจว่า **KPI / แท็บ / เพจจิเนชัน / การกรอง / การเรียง** ตรงกับฐานข้อมูลจริง

สถานะ: คู่มือทดสอบ (รันบนสภาพแวดล้อมจริง) — เอกสารนี้ **ไม่มีการแก้ DB/schema/env**; คำสั่ง SQL ด้านล่างเป็น **แบบอ่านอย่างเดียว (SELECT)** เท่านั้น

อ้างอิงการทำงานจริง:
- API: `public/api/v1/spare_parts.php` (GET)
- UI: `frontend/app/(dashboard)/spare_parts/page.tsx`
- ตารางหลัก: `spare_parts` (alias `s`) + `suppliers` (`sup.name AS supplier_name`)

## 1) นิยามที่ต้องยึด (ตรรกะเดียวกับระบบ)

**สถานะสต็อก (API และ UI ใช้สูตรเดียวกัน):**
```
out  = COALESCE(stock_qty,0) <= 0
low  = COALESCE(stock_qty,0) > 0 AND COALESCE(stock_qty,0) <= COALESCE(min_stock,0)
ok   = COALESCE(stock_qty,0) > COALESCE(min_stock,0)
```

**Base filter (ใช้คำนวณ KPI/summary และนับ "ทั้งหมดในชุดนี้"):**
- `q` (ถ้ามี): จับคู่ LIKE กับ `s.code`, `s.name`, `s.sage_item_no`, `s.category`, `s.location`
- `sage_category` (ถ้าไม่ใช่ `all`/ว่าง): เท่ากับ `s.sage_category`
- **`stock_status` (แท็บ low/out) ไม่อยู่ใน base filter ของ summary** — จงใจ เพื่อให้ KPI/ตัวเลขแท็บสะท้อนภาพรวมของชุดที่ค้นหา ไม่ใช่ภาพรวมของแท็บที่เลือก

**รายการ/เพจจิเนชันของแต่ละแท็บ:**
- แท็บ `ทั้งหมด` (`stock_status` ไม่ส่ง): กรองด้วย base filter
- แท็บ `ใกล้หมด` (`stock_status=low`): base filter + เงื่อนไข `low`
- แท็บ `หมดคลัง` (`stock_status=out`): base filter + เงื่อนไข `out`
- `total` ใน response ของแท็บ = จำนวนรายการที่ผ่านเงื่อนไขแท็บนั้น (ใช้คำนวณจำนวนหน้า)

**มูลค่าคลัง:** `COALESCE(SUM(COALESCE(stock_qty,0) * COALESCE(unit_price,0)), 0)` คำนวณจาก base filter (ทั้งคลังในชุดค้นหา)

**การเรียง (whitelist):** `newest` (ค่าเริ่มต้น `created_at DESC,id DESC`), `stock_asc`, `stock_desc`, `value_desc`, `price_desc`, `name_asc`, `updated` — ทุกแบบมี `id` เป็นตัวตัดสินรอง

**URL state (replaceState):** `tab`, `q`, `sage`, `sort`, `page` (>1) — refresh/แชร์ลิงก์ต้องได้บริบทเดิม

## 2) สิ่งที่ต้องเตรียมก่อนทดสอบ (Preconditions)

- [ ] เข้าระบบด้วยผู้ใช้ที่มีสิทธิ์ดูหน้า `/spare_parts` และเรียก `GET /api/v1/spare_parts.php`
- [ ] มีสิทธิ์อ่านฐานข้อมูล (read-only) เพื่อรัน SELECT เทียบผล
- [ ] รู้ขนาดหน้า: UI ใช้ `PAGE_SIZE = 15`
- [ ] บันทึก **เวลาที่ทดสอบ** และ **ผู้ทดสอบ** — ข้อมูลสต็อกราคาสามารถเปลี่ยนระหว่างรัน (โดยเฉพาะถ้ามีการซิงค์ Sage) จึงควรรัน UI กับ SQL ชุดเดียวกันให้ใกล้เคียงที่สุด
- [ ] ถ้าจะทดสอบความเสถียร ให้ทดสอบบนชุดข้อมูลที่ไม่มีการเบิก/รับ/ซิงค์ระหว่างรัน; มิฉะนั้นให้ยอมรับว่า delta อาจเกิดจากการเปลี่ยนจริง ไม่ใช่บั๊ก

## 3) ชุด SQL อ้างอิง (อ่านอย่างเดียว) — แทนค่าพารามิเตอร์ให้ตรงเคส

> แทน `:Q_LIKE` = `'%คำค้น%'`, `:SAGE` = `'Spare Parts'` ฯลฯ, `:LIMIT` = 15, `:OFFSET` = `(page-1)*15`
> หมายเหตุ: `LIKE` ของ MySQL/MariaDB ส่วนใหญ่ไม่แยกตัวพิมพ์ใหญ่เล็ก (ขึ้นกับ collation) — ตรงกับพฤติกรรมค้นหาโดยทั่วไป

### 3.1 Summary/KPI ของชุด Base (ตรงกับ `summary` ใน API และ KPI 4 การ์ด)
```sql
-- เคส: base filter = ทั้งหมด (ไม่มี q, sage=all)
SELECT
  COUNT(*) AS total_items,
  SUM(CASE WHEN COALESCE(s.stock_qty,0) <= 0 THEN 1 ELSE 0 END) AS out_count,
  SUM(CASE WHEN COALESCE(s.stock_qty,0) > 0
           AND COALESCE(s.stock_qty,0) <= COALESCE(s.min_stock,0) THEN 1 ELSE 0 END) AS low_count,
  SUM(CASE WHEN COALESCE(s.stock_qty,0) > COALESCE(s.min_stock,0) THEN 1 ELSE 0 END) AS ok_count,
  COALESCE(SUM(COALESCE(s.stock_qty,0) * COALESCE(s.unit_price,0)), 0) AS total_value
FROM spare_parts s
LEFT JOIN suppliers sup ON s.supplier_id = sup.id
/* WHERE (base) */;
```

**เพิ่ม base filter เมื่อทดสอบ:**
```sql
-- มี q
-- AND (s.code LIKE :Q_LIKE OR s.name LIKE :Q_LIKE OR s.sage_item_no LIKE :Q_LIKE
--      OR s.category LIKE :Q_LIKE OR s.location LIKE :Q_LIKE)

-- มี sage_category เฉพาะ (ไม่ใช่ all)
-- AND s.sage_category = :SAGE
```

### 3.2 จำนวนรายการต่อแท็บ (ตรงกับ `total` ของแต่ละแท็บ และตัวเลขบนแท็บ/เพจ)
```sql
-- แท็บ "ทั้งหมด" (stock_status ว่าง)
SELECT COUNT(*) AS total_all
FROM spare_parts s
LEFT JOIN suppliers sup ON s.supplier_id = sup.id
WHERE 1=1 /* + base filter */;

-- แท็บ "ใกล้หมด" (stock_status=low)
SELECT COUNT(*) AS total_low
FROM spare_parts s
LEFT JOIN suppliers sup ON s.supplier_id = sup.id
WHERE 1=1 /* + base filter */
  AND COALESCE(s.stock_qty,0) > 0
  AND COALESCE(s.stock_qty,0) <= COALESCE(s.min_stock,0);

-- แท็บ "หมดคลัง" (stock_status=out)
SELECT COUNT(*) AS total_out
FROM spare_parts s
LEFT JOIN suppliers sup ON s.supplier_id = sup.id
WHERE 1=1 /* + base filter */
  AND COALESCE(s.stock_qty,0) <= 0;
```
> คาดหวัง: `total_low` จาก 3.2 = `low_count` จาก 3.1 (ชุด base เดียวกัน), `total_out` = `out_count`, `total_all` = `total_items`

### 3.3 รายการตามหน้า/เรียง (ตรงกับตารางใน UI)
```sql
-- ตัวอย่าง: แท็บทั้งหมด, sort=newest (default), หน้า 1
SELECT s.id, s.code, s.name, s.sage_item_no, s.sage_category,
       COALESCE(s.stock_qty,0) AS stock_qty,
       COALESCE(s.min_stock,0) AS min_stock,
       COALESCE(s.unit_price,0) AS unit_price,
       (COALESCE(s.stock_qty,0) * COALESCE(s.unit_price,0)) AS row_value,
       s.updated_at, s.created_at
FROM spare_parts s
LEFT JOIN suppliers sup ON s.supplier_id = sup.id
WHERE 1=1 /* + base filter (+ เงื่อนไข stock_status ถ้าแท็บ low/out) */
ORDER BY s.created_at DESC, s.id DESC
LIMIT :LIMIT OFFSET :OFFSET;
```

**แมป sort → ORDER BY:**
| sort | ORDER BY |
|---|---|
| `newest` (default) | `s.created_at DESC, s.id DESC` |
| `stock_asc` | `COALESCE(s.stock_qty,0) ASC, s.id ASC` |
| `stock_desc` | `COALESCE(s.stock_qty,0) DESC, s.id ASC` |
| `value_desc` | `(COALESCE(s.stock_qty,0)*COALESCE(s.unit_price,0)) DESC, s.id ASC` |
| `price_desc` | `COALESCE(s.unit_price,0) DESC, s.id ASC` |
| `updated` | `s.updated_at DESC, s.id DESC` |
| `name_asc` | `s.name ASC, s.id ASC` |

### 3.4 ตรวจความสอดคล้องภายใน (Sanity, ควรเป็นจริงเสมอ)
```sql
-- ok + low + out ต้องเท่ากับ total_items (ภายใต้ base filter เดียวกัน)
-- total_value ต้องเท่ากับผลรวม row_value ของทุกแถวใน base filter
SELECT
  COUNT(*) AS total_items,
  SUM(CASE WHEN COALESCE(s.stock_qty,0) <= 0 THEN 1 ELSE 0 END)
  + SUM(CASE WHEN COALESCE(s.stock_qty,0) > 0 AND COALESCE(s.stock_qty,0) <= COALESCE(s.min_stock,0) THEN 1 ELSE 0 END)
  + SUM(CASE WHEN COALESCE(s.stock_qty,0) > COALESCE(s.min_stock,0) THEN 1 ELSE 0 END) AS sum_parts
FROM spare_parts s WHERE 1=1 /* + base filter */;
```

## 4) เช็กลิสต์การทดสอบ (เทียบ UI/Network ↔ DB)

ให้บันทึก: เวลา, base filter (q/sage/tab/sort/page), ค่าจาก **response JSON** (`summary`, `total`, `items.length`, id หน้าแรก/สุดท้าย) และค่าจาก **SQL** — ผลต้องตรงกัน

### A. KPI และ summary (แท็บ "ทั้งหมด", ไม่มี filter)
- [ ] การ์ด "รายการอะไหล่ทั้งหมด" = `summary.total_items` = SQL 3.1 `total_items`
- [ ] การ์ด "ใกล้หมด" = `summary.low_count` = SQL 3.1 `low_count`
- [ ] การ์ด "หมดคลัง" = `summary.out_count` = SQL 3.1 `out_count`
- [ ] การ์ด "มูลค่าคลังรวม" = `summary.total_value` = SQL 3.1 `total_value` (เทียบตัวเลขเต็ม ไม่ใช่แค่รูปแบบแสดงผล)
- [ ] `ok_count` (ถ้าตรวจใน response) + `low_count` + `out_count` = `total_items` (SQL 3.4)
- [ ] Badge หัวเพจ "N รายการในคลัง" = `summary.total_items`

### B. แท็บและตัวเลขบนแท็บ (base filter เดียวกัน)
- [ ] แท็บ "ทั้งหมด (N)" = `summary.total_items` = SQL 3.2 `total_all`
- [ ] แท็บ "ใกล้หมด (N)" = `summary.low_count` = SQL 3.2 `total_low`
- [ ] แท็บ "หมดคลัง (N)" = `summary.out_count` = SQL 3.2 `total_out`
- [ ] **กติกาสำคัญ:** เมื่อกดแท็บ "ใกล้หมด" หรือ "หมดคลัง" ตัวเลขบนแท็บและการ์ด KPI **ต้องไม่เปลี่ยน** (เพราะ summary อิง base filter ไม่ใช่แท็บ) — เปลี่ยนเฉพาะรายการและจำนวนหน้าของรายการ

### C. เพจจิเนชันและจำนวนรายการ
- [ ] `จำนวนหน้า = ceil(total ของแท็บปัจจุบัน / 15)` ตรงกับ UI (เช่น total 31 → 3 หน้า)
- [ ] หน้า 1 แสดง `min(15, total)` รายการ; หน้าสุดท้ายแสดง `total - 15*(pages-1)` รายการ (หรือ 0 แล้วต้องถอยหน้าอัตโนมัติ — ดู F)
- [ ] เปลี่ยนหน้าแล้วรายการเป็นชุดถัดไปตาม ORDER BY เดียวกัน (เทียบ `id`/ลำดับกับ SQL 3.3 หน้า 1,2,...)
- [ ] Badge ใต้หัวข้อ "รายการอะไหล่" แสดง `total` ของแท็บปัจจุบัน (เมื่อ server-paged) ไม่ใช่จำนวนในเพจ
- [ ] ไม่มีรายการซ้ำข้ามหน้า และไม่มีรายการหาย (ตรวจจาก union ของ id ทุกหน้า = ชุดผล SQL 3.2 ของแท็บนั้น)

### D. การกรอง (q / sage_category / แท็บสต็อก)
- [ ] ค้นหา `q`: รายการทุกตัวที่แสดงมีคำค้นใน `code|name|sage_item_no|category|location` อย่างน้อย 1 ฟิลด์ และ **summary/KPI/แท็บ/จำนวนหน้า** เปลี่ยนให้ตรง SQL base filter ที่ใส่ `q`
- [ ] เลือกประเภท Sage เฉพาะ: ทุกรายการมี `sage_category` ตรง; summary/KPI/แท็บอิงเฉพาะประเภทนั้น
- [ ] รวม `q + sage_category`: summary ตรง SQL ที่ใส่ทั้งคู่
- [ ] แท็บ `low`/`out`: **ทุกรายการ** ในตารางตรงนิยามสถานะ (SQL 3.3 ใส่เงื่อนไขสถานะ) และรายการสถานะอื่นไม่โผล่

### E. การเรียงลำดับ (ทดสอบอย่างน้อย 1 หน้าแรกของแต่ละแบบที่ใช้บ่อย)
- [ ] `newest`: `created_at` เรียงมาก→น้อย (เท่ากันดู `id`)
- [ ] `stock_asc` / `stock_desc`: `COALESCE(stock_qty,0)` ตรงลำดับ
- [ ] `value_desc`: `stock_qty*unit_price` มาก→น้อย
- [ ] `price_desc`: `unit_price` มาก→น้อย
- [ ] `name_asc`: ชื่อ ก→ฮ (collation ของ DB อาจมีผลกับภาษาไทย — บันทึกไว้ถ้าลำดับไม่ตรงความคาดหมายแต่ตรง SQL)
- [ ] `updated`: `updated_at` ล่าสุดก่อน
- [ ] ลำดับคงที่เมื่อรีเฟรช (เพราะมี `id` เป็นตัวตัดสินรอง)

### F. URL state / พฤติกรรมแสดงผล
- [ ] เปิดลิงก์ที่มี `?tab=low&q=...&sage=...&sort=...&page=2` → โหลดตรงแท็บ/คำค้น/ตัวกรอง/เรียง/หน้า เดียวกัน
- [ ] Refresh (F5) ยังอยู่บริบทเดิม; แชร์ลิงก์ให้คนอื่นเปิดแล้วเห็นชุดเดียวกัน (ภายใต้สิทธิ์และข้อมูลเวลาเดียวกัน)
- [ ] เปลี่ยน tab/q/sage/sort → กลับหน้า 1 และ URL อัปเดต (replaceState: กด Back ออกจากหน้า ไม่ย้อนทีละตัวกรอง — พฤติกรรมที่ตั้งใจ)
- [ ] กรณีหน้าปัจจุบันว่างแต่ยังมีข้อมูลรวม (เช่นลบรายการสุดท้ายของหน้า/ตัวกรองเปลี่ยนทำให้หน้านั้นเกิน): UI ถอยกลับหน้าให้อัตโนมัติและแสดงรายการถูกต้อง

### G. แผงสรุปคลัง (Side panel)
- [ ] ตัวเลข "รายการทั้งหมด/ใกล้หมด/หมดคลัง/มูลค่าคลังรวม" ในแผง = `summary` (ภาพรวม base filter) ไม่ใช่จำนวนในเพจ
- [ ] มีข้อความกำกับว่า "ประเภทสต็อก" นับจากรายการในหน้านี้ — และตัวเลขสัดส่วนประเภทตรงกับรายการที่เห็นในหน้านั้น

## 5) เคสขอบ (Edge cases) ที่ควรเช็คถ้ามีข้อมูล
- [ ] `stock_qty` เป็น NULL หรือ 0 หรือค่าติดลบ → นับเป็น `out` (สูตรใช้ `<= 0`)
- [ ] `min_stock` เป็น NULL/0 → รายการที่มีสต็อก > 0 จะนับเป็น `ok` (เพราะเงื่อนไข low ต้อง `qty <= min_stock`)
- [ ] `unit_price` เป็น NULL → มูลค่าแถวคิดเป็น 0
- [ ] ค้นหาที่ไม่พบข้อมูล → KPI/แท็บ/รายการ/จำนวนหน้าเป็น 0 อย่างสอดคล้อง (ไม่เหลือค่าค้างจากชุดก่อน)
- [ ] แท็บ low/out มี 0 รายการ แต่แท็บ all มีรายการ → แท็บแสดง (0) และตารางว่าง (ไม่ใช่ error)
- [ ] มีอักขระพิเศษ/ภาษาไทยในคำค้น → ผลลัพธ์สอดคล้องกับ SQL `LIKE` (สังเกต collation)

## 6) บันทึกผลการทดสอบ (เทมเพลต)

| เคส | เวลา | Base filter (q/sage) | Tab | Sort/Page | UI (summary / total / ตัวอย่าง id) | DB (3.1/3.2/3.3) | ผล | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|
| A-ทั้งหมด |  |  | all | newest/1 |  |  | PASS/FAIL |  |

## 7) เกณฑ์ผ่าน / สิ่งที่ต้องรายงาน
- **ผ่าน:** ทุกข้อ A–E ตรงกับ SQL ในช่วงเวลาใกล้เคียงกัน, F ทำงานตามที่ระบุ, เคสขอบที่ทดสอบให้ผลตามนิยาม
- **ไม่ผ่าน/ต้องตรวจเพิ่ม:** ตัวเลข UI ≠ SQL, รายการซ้ำ/หายข้ามหน้า, แท็บเปลี่ยนแล้ว KPI เปลี่ยน, URL ไม่กู้บริบท, หน้าเปล่าค้าง
- **รายงานข้อจำกัดเสมอ:** ถ้ามีการเปลี่ยนข้อมูล/Sage sync ระหว่างรัน ให้ระบุว่าอาจเป็นสาเหตุของ delta; ถ้าไม่ได้รันเคสไหน (เช่น ไม่มีข้อมูลติดลบ) ให้ระบุว่า "ไม่ได้ทดสอบ"

> คำแนะนำ: เปิด DevTools → Network ดู response ของ `/api/v1/spare_parts.php` (มี `summary`, `total`, `items`, `sort`) เพื่อเทียบกับ SQL ได้ตรงที่สุด โดยไม่ต้องเดาตัวเลขจากการเรนเดอร์
