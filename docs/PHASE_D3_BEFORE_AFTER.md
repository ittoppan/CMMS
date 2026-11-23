# PHASE D3 — Before / After (Work Order Control)

> ทุกตัวเลข "After" มาจากการวัดจริงในรอบ D3.5/D3.6 (Playwright + axe, build จาก HEAD, viewport 1440/768/390)
> "Before" มาจาก audit เดิม (`PHASE_D3_UX_AUDIT.md`) + การวัดก่อนแก้ในรอบเดียวกัน (baseline ที่วัดได้จริง)

## 1. `/supervisor` (Work Order Control)

| หัวข้อ | Before | After |
|---|---|---|
| เวลาอัปเดตล่าสุด | ไม่มี | แสดง "อัปเดตเมื่อ HH:MM:SS · วันที่" ใต้อธิบายหน้า |
| KPI | ตัวเลขลอย ไม่บอกว่าคลิกได้ | `KpiStrip` กดเพื่อกรอง/ไปคิวที่กรองแล้ว (มี active state) |
| งานที่ต้องติดตาม | กระจายอยู่ในตาราง | "ศูนย์ติดตาม" แยก 4 กลุ่ม: เกินกำหนด / ความสำคัญสูง / รออะไหล่ / รอมอบหมาย |
| กราฟแนวโน้ม | โหลดพร้อมหน้า (หนัก) | lazy + skeleton + error state (`WorkOrderTrendChart`) |
| สถานะว่าง/ไม่มีสิทธิ์ | จอว่าง | skeleton, empty state, การ์ด "ไม่มีสิทธิ์" พร้อมปุ่มกลับ Dashboard |
| axe (1440) | Serious 2 (`color-contrast` 4 node, `label-content-name-mismatch` 3 node) | **0 Critical / 0 Serious** |
| overflow 1440/768/390 | — (ไม่ได้วัด) | 1440/1440, 768/768, 390/390 |

## 2. `/supervisor/queue` (Work Queue)

| หัวข้อ | Before | After |
|---|---|---|
| การกรอง | ทุก keystroke ยิง query | debounce 350ms |
| ปริมาณ | โหลดทั้งหมด | 50 แถว/หน้า + แสดงยอดรวม (105 ในข้อมูลจริง) |
| ตัวกรอง | สถานะ/ความสำคัญ | + ตัวกรองช่างผู้รับผิดชอบ (แสดงเมื่อ `can.plan`) |
| มือถือ/แท็บเล็ต | ตารางกว้าง **1,110px** → เลื่อนแนวนอนในกรอบที่ 768 | การ์ด (2 คอลัมน์ที่ 390) ใช้ถึง <1024px, ตาราง ≥1024px |
| สถานะ | ป้ายสีคนละชุดกับหน้า detail | `StatusChip` ชุดเดียว |
| สถานะโหลด/ว่าง/ผิดพลาด | ไม่ครบ | skeleton, empty, read-only, error + ปุ่มลองใหม่ |
| axe (12 เคส) | Serious 1 (`color-contrast` จาก muted token) | **0 Critical / 0 Serious** |
| overflow | 768: table 1,110px | 0 offender ทุก viewport |

## 3. `/repair/view` (Work Order Detail)

| หัวข้อ | Before | After |
|---|---|---|
| สรุปหัวใบงาน | การ์ดหลายชั้น ต้องเลื่อนอ่าน | บล็อกสรุป compact `gap-2` (เลขงาน/สถานะ/เครื่องจักร/ผู้แจ้ง/ช่าง/กำหนดเสร็จ) |
| ความเร่งด่วน | ต้องคำนวณเองจากวันที่ | ป้าย aging 6 สถานะ (เกินกำหนด/ครบวันนี้/ใกล้ครบ/เหลือ N วัน/ค้างมา/ปิดภายใน) |
| SLA | ไม่มีช่อง "กำหนดเสร็จ" ในสรุป | ช่อง "กำหนดเสร็จ (SLA)" + จุดสีตาม aging |
| วันที่ | หลายรูปแบบ | `fmtDT()` รูปแบบเดียวทั้งหน้า |
| ตารางอะไหล่ (ขอ / ใบเบิก) | ตารางเดียว กว้าง ล้นบนมือถือ | ตารางที่ ≥768px + การ์ดที่ <768px (2 ตาราง) |
| ปุ่มหลัก | กระจาย | `primaryAction` = พิมพ์เอกสารปิดซ่อม, ที่เหลือ secondary |
| สีสถานะในเอกสารปิดงาน | เขียว #16A34A บนพื้นอ่อน = 3.14:1, แดง = 4.41:1 | `#15803D` / `#B91C1C` / `#475569` → ผ่าน AA |
| axe (12 เคส) | Serious 1 (contrast 6 node) | **0 Critical / 0 Serious** |
| overflow | — | 0 offender ทุก viewport |

## 4. ระดับระบบ (ได้ฟรีจากการแก้ token)

| รายการ | Before | After |
|---|---|---|
| `--color-text-muted` บนพื้นหน้า | 4.43:1 (ตก AA) | ~4.8:1 |
| ชื่อ accessible ของปุ่ม header (⌘K / แจ้งเตือน / ภาษา) | ไม่มีข้อความที่มองเห็น | มี (axe `label-content-name-mismatch` = 0) |
| `tsc --noEmit` | ผ่าน | ผ่าน |
| production build | ผ่าน | ผ่าน (249/249 pages) |

## 5. ข้อจำกัดของหลักฐานชุดนี้

- ไม่มีภาพหน้าจอ before/after — หลักฐานเป็นตัวเลขที่วัดจาก DOM (scrollWidth/clientWidth, จำนวน node ที่ axe ฟลาก, จำนวนแถว/การ์ด)
- Before ของฝั่ง "หน้าตา" อ้างจาก audit เดิม (ไม่ได้ถ่ายภาพก่อนแก้ไว้)
- ไม่ได้วัด Lighthouse ใหม่ในรอบนี้ (baseline เดิมอยู่ใน `MASTER_BASELINE.md`)
- โหมดมืดยังไม่วัด contrast
