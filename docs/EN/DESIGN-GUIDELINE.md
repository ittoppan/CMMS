# คู่มือดีไซน์ระบบ CMMS-TOPPAN (Design Guideline)

> **แหล่งอ้างอิงหลัก:** `design-system/tokens.json` + `design-system/tokens.css`
> (สกัดจากเว็บ https://www.holdings.toppan.com/en/ + ภาษาไฟสัญญาณ Andon)
> **เวอร์ชัน:** v1.0 — ปรับปรุง 2026-08

---

## 1. หลักคิด (Design Language)

ระบบนี้ใช้ภาษาดีไซน์ 2 ชั้นรวมกัน:

1. **โทนแบรนด์ TOPPAN** — น้ำเงินแบรนด์ `#0068B5` + Navy เข้ม `#193264` พื้นหลังสะอาดเรียบ
2. **ภาษาไฟสัญญาณ Andon** — หลอดไฟเขียว/เหลือง/แดง ที่ช่างโรงงานรู้จักจากเสาไฟบนหัวเครื่องจักร
   (แนวคิดจาก Toyota Production System — เหมาะกับงานซ่อมบำรุงโดยตรง)

**เป้าหมายสูงสุด:** ผู้ใช้กวาดตาทีเดียวรู้สถานะโดยไม่ต้องอ่านตัวหนังสือ

> 🚦 **ไฟเขียว = พร้อมใช้งาน/เสร็จสิ้น · ไฟเหลือง = ต้องดูแล/ค้างอยู่ · ไฟแดง = หยุดทำงาน/เกินกำหนด/หมดสต็อก · ไฟเทา = ไม่มีสถานะ (ข้อมูลทั่วไป)**

---

## 2. สี (Color)

อ้างอิงจาก `design-system/tokens.css` — ค่าที่ใช้จริงในระบบอยู่ที่ `frontend/app/globals.css :root`

### 2.1 สีแบรนด์ (Brand)

| Token | ค่า | ใช้ที่ |
|---|---|---|
| `--tp-toppan-blue` / `--color-accent` | `#0068B5` | ปุ่มหลัก, ลิงก์, element หลัก |
| `--tp-deep-navy` / `--cmms-bg-sidebar` | `#193264` | Sidebar, แถบ Andon board |
| `--tp-navy-dark` | `#0B1F4B` | จุดเข้มสุดของ gradient login |
| `--tp-blue-hover` | `#00469B` | hover ของปุ่มหลัก |
| `--tp-blue-light` | `#007AC8` | ระดับรอง |
| `--tp-blue-bright` | `#0093FF` | ปลาย gradient / highlight |
| `--tp-red-accent` | `#FF2A00` | จุดเน้นพิเศษ (ใช้พริ้วๆ) |

### 2.2 สีความหมาย (Semantic / Andon)

| Token | ค่า | ความหมาย |
|---|---|---|
| `--tp-success` | `#10B981` | เสร็จสิ้น / พร้อมใช้งาน / ปกติ |
| `--tp-warning` | `#F59E0B` | ต้องดูแล / ค้างอยู่ / ใกล้หมด |
| `--tp-danger` | `#EF4444` | หยุด / เกินกำหนด / หมด / ตีกลับ |

### 2.3 พื้นผิว & ตัวอักษร (Surface / Text)

| Token | ค่า | ใช้ที่ |
|---|---|---|
| `--tp-surface-white` | `#FFFFFF` | การ์ด, พื้นหลังหลัก |
| `--tp-surface-gray-lightest` | `#F8F8F8` | พื้นหลังหน้า (ระบบใช้ `#F5F7FA`) |
| `--tp-surface-gray-light` | `#F2F2F2` | พื้นรอง |
| `--tp-surface-gray` | `#E5E5E5` | border อ่อน |
| `--tp-surface-gray-mid` | `#D6D6D6` | border |
| `--tp-text-primary` | `#323232` | ตัวอักษรหลัก (ระบบใช้ `#22262E`) |
| `--tp-text-dark` | `#222222` | ตัวอักษรเข้ม |

### 2.4 ข้อห้ามสี

- **ห้าม** เขียนสี hex แบบ hardcode ในหน้า (`#0068B5` ต้องใช้ผ่าน token `var(--color-accent)` / `var(--cmms-*)`)
- **ห้าม** ใช้สีที่ไม่อยู่ใน palette (เช่น ม่วง/ชมพู/เทอร์ควอยซ์ ที่ไม่ใช่ semantic)
- ถ้าต้องการเพิ่มสี → เพิ่ม token ใน `design-system/tokens.css` + `globals.css :root` ก่อน แล้วอ้างอิง

---

## 3. ฟอนต์ (Typography)

| บทบาท | ฟอนต์ | ใช้ที่ |
|---|---|---|
| **Body (ละติน)** | **Roboto** | ตัวอักษรทั่วไป (ตรงกับเว็บ TOPPAN) |
| **Body (ไทย)** | **Noto Sans Thai** | ตัวอักษรภาษาไทย — กันอ่านยาก |
| **ตัวเลข/ป้าย** | **Barlow Condensed** (500-700) | KPI ตัวเลขใหญ่, ตัวนับ, eyebrow, ป้ายสถานะ |

### 3.1 ระดับตัวอักษรมาตรฐาน

| ระดับ | วิธีใช้ |
|---|---|
| **Eyebrow** (ป้ายเล็กบนหัว) | `.cmms-eyebrow` — Barlow 600, uppercase, letter-spacing `0.16em`, 0.72rem — ขึ้นต้นหัวทุกหน้า เช่น `WORK ORDER BOARD · CMMS-TOPPAN` |
| **Heading** | Roboto/Noto 700 ตามลำดับของ astryx (`Heading level={1..5}`) |
| **ตัวเลข KPI** | `.cmms-kpi-value` — Barlow 700, 2.15rem, tabular-nums |
| **Body** | Roboto/Noto 400-500 ขนาดปกติ |

### 3.2 ข้อห้ามฟอนต์

- **ห้าม** ใช้ฟอนต์อื่นนอกจาก 3 ตัวข้างบน (ไม่ใช้ Google Fonts เพิ่มโดยไม่จำเป็น)
- ตัวเลขที่ต้องเทียบกัน (ตาราง/สถิติ) ควรใช้ Barlow + `tabular-nums` เสมอ

---

## 4. ภาษา Andon (สัญญาณไฟ)

### 4.1 ส่วนประกอบมาตรฐาน (ใช้ component/CSS ที่มีอยู่)

| Component / Class | ใช้ทำอะไร |
|---|---|
| `AndonLamp` (`frontend/components/AndonLamp.tsx`) | เสาไฟ 3 หลอด (แดง/เหลือง/เขียว) — หลอดที่ติดเรืองแสง, แดงกระพริบ, เคารพ `prefers-reduced-motion` — ใช้ size `sm/md/lg` |
| `.cmms-status` + `.cmms-status-dot` | จุดหลอดไฟ + label (ใช้ในตาราง/รายการ) — class: `ok / warn / down / idle` |
| `.cmms-andon-board` | แผง navy เข้มพร้อม scanlines (บอร์ดสถานะโรงงาน) |
| `.cmms-andon-chip` | chip บนพื้นเข้ม (พร้อมใช้งาน/ต้องดูแล/หยุด) |
| `.cmms-count-pill` | ตัวนับแบบ Barlow บนพื้นขาว |

### 4.2 การแมปสถานะ → ไฟ (ตามหน้าที่ใช้จริง)

| โดเมน | เขียว (ok) | เหลือง (warn) | แดง (down) | เทา (idle) |
|---|---|---|---|---|
| **งานซ่อม** | เสร็จสิ้น/ปิดงาน | กำลังซ่อม, รออะไหล่, รอดำเนินการ | เกินกำหนด, ตีกลับ | — |
| **PM/AM** | เสร็จสิ้น | กำลังทำ | เลยกำหนด | รอทำ (scheduled) |
| **อะไหล่** | สต็อกปกติ | ใกล้หมด (≤ min) | หมดสต็อก | — |
| **Kanban คอลัมน์** | เสร็จสมบูรณ์ | รอดำเนินการ, กำลังซ่อม | รออะไหล่/ประเมิน | — |
| **เครื่องจักร** | ปกติ | เตือน | หยุดทำงาน | — |

### 4.3 ข้อห้าม Andon

- **ห้าม** ใช้สีแดงกับข้อมูลที่ไม่ใช่วิกฤตจริง (แดงต้อง "กระพริบ" เสมอ = เกินกำหนด/หยุด/หมด)
- ถ้าต้องแสดงสถานะในตาราง → ใช้ `.cmms-status` (ไม่ใช้ Badge สีเฉยๆ)
- ไฟเดียวแสดงสถานะเดียว — ไม่มี "ไฟเหลือง+เขียวพร้อมกัน"

---

## 5. Spacing / Radius / Shadow

### 5.1 Spacing scale (จากเว็บ TOPPAN)

`2, 3, 4, 5, 8, 10, 12, 16, 18, 19, 20, 24, 30, 32, 34, 40, 60, 70, 80, 120 px`

ระบบใช้ `--cmms-*` tokens: `--cmms-radius-sm: 6px / --cmms-radius: 10px / --cmms-radius-lg: 14px / --cmms-radius-xl: 18px`

### 5.2 หลักการ

- การ์ด/ปุ่มมีมุมโค้งปานกลาง (10-14px) — สไตล์ TOPPAN เรียบ ไม่มีเงาหนัก
- ระยะห่างระหว่าง section = 24-32px (`gap={6..8}`), ระหว่างรายการ = 8-16px
- **ห้าม** ใช้ drop shadow ใหญ่ๆ (เว็บ TOPPAN เป็น flat design)

---

## 6. รูปแบบ Component มาตรฐาน

### 6.1 หัวหน้าเพจ (Page Header)

ทุกหน้าใหม่ต้องมี: **eyebrow + Heading level 2 + subtitle** (ดูตัวอย่าง /repair, /pm_am/calendar)

```
<Text className="cmms-eyebrow">WORK ORDER BOARD · CMMS-TOPPAN</Text>
<Heading level={2}>ชื่อหน้า</Heading>
<Text color="secondary">คำอธิบายสั้นๆ</Text>
```

### 6.2 การ์ด KPI (`.cmms-kpi-card`)

- การ์ดขาว + แถบ accent 3px ด้านซ้าย + `AndonLamp` ข้าง label + ตัวเลข Barlow ใหญ่
- ห้ามใช้การ์ด gradient พาสเทลหลายสี (blue-50/rose-50...) — ใช้สีขาว + ไฟเดียว

### 6.3 ปุ่ม (Buttons)

- ปุ่มหลัก = `#0068B5` ตัวขาว / ปุ่มรอง = โครงขอบ / ปุ่ม ghost = เงียบสุด
- **ชื่อ action ต้องเหมือนเดิมทั้ง flow** (ปุ่ม "บันทึก" → toast "บันทึกแล้ว")
- ใช้คำกริยา active voice: "สร้างใบสั่งงาน" ไม่ใช่ "Submit"

### 6.4 สถานะว่าง / error

- Empty state = คำเชิญให้ลงมือ (เช่น "ยังไม่มีแผน PM — สร้างแผนแรกได้เลย")
- Error = บอกว่าอะไรพัง + แก้ยังไง ไม่ใช่คำขอโทษกำกวม

---

## 7. ข้อห้ามรวม (Do / Don't)

| ✅ ทำ | ❌ ห้าม |
|---|---|
| ใช้ token จาก `design-system/tokens.css` เสมอ | เขียนสี hex hardcode ในหน้า |
| ใช้ `AndonLamp`/`.cmms-status` สำหรับสถานะ | ใช้ emoji แทนสถานะหรือตกแต่งหัวข้อ/ปุ่ม/placeholder |
| ใส่ eyebrow ทุกหัวหน้า | หัวหน้าเพจแบบไม่มี eyebrow |
| ตัวเลขสถิติใช้ Barlow | ตัวเลขตารางฟอนต์ไม่เท่ากัน |
| ภาษาไทยใช้ Noto Sans Thai เสมอ | ฟอนต์ Google อื่นๆ ที่ไม่จำเป็น |
| ไฟแดงต้องเป็นเรื่องวิกฤตจริง | ใช้แดงกับข้อมูลทั่วไป |

---

## 8. วิธีนำไปใช้กับหน้าใหม่

1. อ่าน `design-system/tokens.css` (สี/ฟอนต์/spacing)
2. ตรวจ checklist:
   - [ ] ใช้ `var(--color-accent)`/`var(--cmms-*)` แทนสี hardcode?
   - [ ] มี eyebrow + Heading + subtitle?
   - [ ] สถานะใช้ `AndonLamp` หรือ `.cmms-status`?
   - [ ] ตัวเลข KPI ใช้ `.cmms-kpi-value`?
   - [ ] ไม่มี emoji ตกแต่ง?
   - [ ] empty state บอกให้ลงมือ?
3. ทดสอบใน preview (หน้า + มือถือ + keyboard focus + reduced-motion)

---

*เอกสารนี้เป็นแหล่งเดียวของความจริง (single source of truth) สำหรับดีไซน์ — ถ้าเห็นหน้าไหนไม่ตรง guideline ให้แก้ตามเอกสารนี้ แล้วอัปเดต guideline ถ้ามีการตัดสินใจใหม่*
