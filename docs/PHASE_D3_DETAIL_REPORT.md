# PHASE D3.4 — WORK ORDER DETAIL (`/repair/view`) REDESIGN REPORT

> Phase: D3.4 (Phase 6 — Work Order Control)
> Scope: `frontend/app/(dashboard)/repair/view/page.tsx` เท่านั้น
> Rule: ไม่แก้ DB schema / API contract / business logic / auth / authorization / route
> Date: 2026-11-23

---

## 1. Scope ที่ทำจริง

| งาน | สถานะ |
|---|---|
| Compact summary (สถานะ + ความเร่งด่วน + aging + กำหนดเสร็จ อยู่บล็อกเดียว) | DONE |
| Aging เด่นชัด (เกินกำหนด / ใกล้ครบกำหนด / เหลือเวลา / ค้างมา / ปิดงานภายใน N วัน) | DONE |
| มือถือ: หัวหน้าเพจ, summary, ตารางอะไหล่ 2 ตาราง | DONE |
| เปลี่ยน API / query / permission / route / สูตร KPI | **ไม่ทำ (ไม่แตะ)** |
| ทดสอบด้วยเบราว์เซอร์ 1440/768/390 + axe | ยังไม่ทำ → D3.5/D3.6 (ต้องมี session login) |

---

## 2. Before (สภาพเดิม — หลักฐานจาก source ก่อนแก้)

ไฟล์เดิม 1,494 บรรทัด, commit ก่อนหน้า `320fea69`:

| จุด | สภาพเดิม | ผลต่อผู้ใช้ |
|---|---|---|
| หัวใบงาน (CardHeader) | แสดงชื่อสถานะเป็น **ตัวอักษรเทาเล็ก ๆ** (`statusLabel(wo.status)`) ไม่มีสี ไม่มีสัญญาณเกินกำหนด | มองไม่เห็นว่าสถานะคืออะไรเมื่อสแกนเร็ว |
| Aging | **ไม่มีเลย** — ไม่อ่าน `sla_due_at` / `estimated_completion_date` ทั้งที่ API ส่งมาแล้ว (`SELECT r.*`) | ไม่รู้ว่างานนี้เกินกำหนดกี่วัน ต้องไปเปิดหน้าคิวเอง |
| วันที่แจ้ง / วันที่ปิด | แสดง string ดิบจาก DB (`2026-11-19 08:41:00`) | อ่านยากบนมือถือ |
| ข้อเท็จจริง 8 ช่อง | `gap-x-4 gap-y-3`, padding `p-2.5` | กินพื้นที่แนวตั้งบน 390px |
| ตาราง "อะไหล่ที่ผู้แจ้งร้องขอ" | `overflow-x-auto` + ตาราง 4 คอลัมน์ | บนมือถือต้อง scroll แนวนอน |
| ตาราง "อะไหล่ที่ใช้ซ่อม (ใบเบิก)" | `overflow-x-auto` + ตาราง 7 คอลัมน์ (มี input จำนวน) | บนมือถือต้อง scroll แนวนอนเพื่อแก้จำนวน/ลบ |
| หัวเพจบนมือถือ | ปุ่มทั้ง 3 ถูกส่งผ่าน `actions` → `DetailHeader` ย่อเป็นเมนู `⋯` **อย่างเดียว** ไม่มีปุ่มหลัก | ปุ่ม "พิมพ์เอกสารปิดซ่อม" หายไปจากจอ 390px |
| ขนาดตัวอักษรหัวใบงาน | `text-2xl` ทุกจอ | เบียดกับ AndonLamp บนจอแคบ |

---

## 3. After (สิ่งที่แก้ — 228 insertions / 23 deletions)

### 3.1 Compact summary (CardHeader เดียว)

- เปลี่ยน label เทา → `<StatusChip status={wo.status} overdue={aging.overdueDays > 0} />` (component เดียวกับ `/supervisor/queue`) → สถานะมีสี + แดงอัตโนมัติเมื่อเกินกำหนด
- เพิ่ม **ป้าย aging** ตัวหนา สีตามระดับ ถัดจาก Badge ความเร่งด่วน:

| เงื่อนไข | ข้อความ | สี (token) |
|---|---|---|
| งานจบแล้ว | `ปิดงานภายใน N วัน` (created → completed) | `--cmms-success-light/dark` |
| เลยกำหนดเสร็จ | `เกินกำหนด N วัน` | `--cmms-danger-light/dark` |
| ไม่มีกำหนดเสร็จ + เปิดเกิน 7 วัน | `ค้างเกินกำหนด N วัน` | `--cmms-danger-light/dark` |
| เหลือ ≤ 2 วัน | `ใกล้ครบกำหนด N วัน` | `--cmms-warning-light/dark` |
| เหลือ > 2 วัน | `เหลืออีก N วัน` | `--cmms-info-light` |
| ยังไม่ตั้งกำหนดเสร็จ | `ค้างมา N วัน` | `--cmms-bg-muted` / `--cmms-text-secondary` |

- เพิ่มบรรทัด `กำหนดเสร็จ <วันเวลา>` (แสดงเมื่อมี due) — เฉพาะจอ ≥ sm เพื่อไม่ให้แถวบนมือถือแน่น
- Typography มือถือ: เลขใบงาน `text-xl md:text-2xl`, ชื่องาน `text-sm md:text-base`, เครื่องจักร `text-xs md:text-sm`

### 3.2 ข้อเท็จจริงของใบงาน (definition list)

- เพิ่มช่อง **กำหนดเสร็จ (SLA)** พร้อมจุดสี (แดง = เกินกำหนด, เขียว = ยังอยู่ในกำหนด, เทา = ไม่มี)
- วันที่แจ้ง / วันที่ปิด ผ่าน `fmtDT()` → `YYYY-MM-DD HH:mm`
- Downtime ใส่ตัวคั่นหลักพัน (`toLocaleString()`)
- `gap-2` + `px-2.5 py-2` → กระชับขึ้นทั้ง 390/768/1440 โดยยัง 2 คอลัมน์บนมือถือและ 4 คอลัมน์บน ≥ md

### 3.3 มือถือ — ตาราง → การ์ด

| ส่วน | เดสก์ท็อป (≥ md) | มือถือ (< md) |
|---|---|---|
| อะไหล่ที่ผู้แจ้งร้องขอ | ตารางเดิม (ไม่เปลี่ยน) | การ์ด: ชื่อ/รหัส/จำนวน + ปุ่ม "เบิกเลย" เต็มความกว้าง |
| อะไหล่ที่ใช้ซ่อม (ใบเบิก) | ตารางเดิม 7 คอลัมน์ | การ์ด: ชื่อ/รหัส/มูลค่ารวม, input จำนวน + ราคา/หน่วย, ปุ่มลบ, badge สถานะเบิก + เลขเอกสาร Sage |

- ตัวตารางถูกห่อด้วย `hidden … md:block`; การ์ดใช้ `md:hidden` → ไม่มีข้อมูลซ้ำบนจอเดียว
- handler เดิมทั้งหมด (`addSagePart`, `updateQty`, `removePart`) ถูกเรียกใช้ซ้ำ ไม่มีการเขียน logic ใหม่
- input จำนวนบนการ์ดมี `id`/`<Label htmlFor>` ไม่ซ้ำกัน (`m-qty-<rowId>`) และคง `disabled` เมื่อ `issued_qty > 0`

### 3.4 หัวเพจ (DetailHeader)

- ย้ายปุ่ม "พิมพ์เอกสารปิดซ่อม" จาก `actions` → `primaryAction` → `DetailHeader` แสดงเป็นปุ่มหลักเต็มความกว้างบนมือถือ และยังเรียงเป็นปุ่มสุดท้ายบนเดสก์ท็อป (ลำดับ กลับ → PDF → พิมพ์ เหมือนเดิม)

---

## 4. Aging — นิยามที่ใช้ (ต้องตรงกับ KPI)

คัดลอกกติกาจาก `src/helpers/kpi.php` (ไม่ได้แก้ไฟล์ PHP):

```php
// kpi_done_statuses(): closed, cancelled, rejected, verified, done, skipped
// kpi_is_overdue(): due = sla_due_at → estimated_completion_date; due < now = overdue
//                   ไม่มี due + สถานะ open/acknowledged/assigned/accepted/approved/pending_approval
//                   + อายุ > 7 วัน = overdue
// kpi_overdue_days(): ceil((now - due)/86400) หรือ ceil(อายุ/86400) ตามกรณี
```

ฟังก์ชัน `woAging()` ในหน้า detail ใช้ลำดับฟิลด์และสูตรวันเดียวกับข้างบน โดยอ่านฟิลด์ที่ API ส่งอยู่แล้ว (`r.*` → `sla_due_at`, `estimated_completion_date`) — **ไม่มีการเรียก API เพิ่ม และไม่เขียนค่ากลับ**

**ความต่างที่ตั้งใจ (แสดงผลเท่านั้น):** ชุด "งานจบ" ฝั่งจอเพิ่ม `completed` และ `resolved` (ฝั่ง `kpi_done_statuses()` ไม่มีสองตัวนี้) เพื่อไม่ให้ใบงานที่ปิดแล้วขึ้นคำว่า "เกินกำหนด" — ไม่กระทบตัวเลข KPI/คิว เพราะคิวงานกรองสถานะปิดออกอยู่แล้ว

---

## 5. Verification (รันจริง 2026-11-23)

| คำสั่ง | ผล |
|---|---|
| `cd frontend && npx tsc --noEmit` | **PASS — exit 0** (ไม่มี output) |
| `cd frontend && NEXT_DIST_DIR=.next-verify npm run build` | **PASS — exit 0** · `✓ Compiled successfully in 18.8s` · `✓ Generating static pages using 14 workers (249/249) in 2.2s` · route `○ /repair/view` ถูก build |
| `git diff --stat` | `page.tsx | 251 ++++---` (228 insertions, 23 deletions) — ไฟล์ 1,494 → 1,699 บรรทัด |

ไม่ได้ build ทับ `.next` ที่ production ใช้ (`NEXT_DIST_DIR=.next-verify`)

---

## 6. ยังไม่ได้ตรวจ (ต้องมีสิ่งที่ยังไม่มี)

| รายการ | เหตุผล | ไปที่ |
|---|---|---|
| ภาพจริง 1440 / 768 / 390 (overflow แนวนอน) | ต้อง login session จริงเพื่อให้ได้ข้อมูลใบงาน (126 ใบงานใน DB แต่หน้า detail ต้องผ่าน auth) | D3.5 |
| axe 0 Critical/Serious | ต้องรันบนหน้าจริงที่มีข้อมูล | D3.6 |
| Role E2E (User 9 / Operate 3 / Foreman 7) | บัญชี `e2e_*` ทั้ง 9 ตัว `is_active=0` | D3.7 (blocked) |
| ตัวเลข aging ตรงกับ `/supervisor/queue` ของใบงานเดียวกัน | ต้องเทียบกับ API จริงที่มี session | D3.7/D3.8 |

> หมายเหตุ: การเปลี่ยนครั้งนี้ไม่แตะ endpoint, payload, permission, route หรือสูตร KPI จึงไม่ต้องอนุมัติเจ้าของระบบ — แต่ยัง **ไม่ commit ขึ้น production / ไม่ push / ไม่ deploy**

---

## 7. Known Issues / ข้อจำกัด

1. `statusLabel()` และ `statusLabels` ในไฟล์นี้ไม่มีผู้เรียกแล้วหลังเปลี่ยนไปใช้ `StatusChip` — ปล่อยไว้เป็น dead code รอบเดียวกับงานเก็บกวาด Phase 2 (ไม่ลบเพื่อลดความเสี่ยงในรอบนี้)
2. ตารางผลค้นหา Sage 300 (`sage_items.php`) ยังคง `overflow-x-auto` (ผลชั่วคราวของการค้นหา, 5 คอลัมน์) — ถ้าต้องการการ์ดบนมือถือด้วยให้ทำในรอบถัดไป
3. `aging` คำนวณจาก `Date.now()` ตอน render (เหมือน `isRepairOverdue()` ใน `lib/repair-status.ts`) — ถ้าหน้าเปิดค้างข้ามวัน ตัวเลขจะอัปเดตเมื่อ component render ใหม่เท่านั้น (มี interval 30 วิอยู่แล้วสำหรับ banner offline แต่ไม่ได้ setState ให้ aging)
4. หน้า detail ยังเป็นไฟล์ใหญ่ (1,699 บรรทัด) — การแยกเป็น sub-component อยู่นอก scope D3.4 (จะทำให้ diff ตรวจยาก)

---

## 8. ไฟล์ที่เปลี่ยน

- `frontend/app/(dashboard)/repair/view/page.tsx`
- `docs/PHASE_D3_DETAIL_REPORT.md` (ไฟล์นี้)
- `docs/MASTER_PHASE_TRACKER.md` (อัปเดตสถานะ D3.4)
