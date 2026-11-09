---
version: 1
colors:
  # Brand — TOPPAN
  toppan-blue: "#0068B5"
  blue-hover: "#00469B"
  blue-deep: "#00508C"
  blue-light: "#007AC8"
  blue-bright: "#0093FF"
  deep-navy: "#193264"
  navy-dark: "#0B1F4B"
  red-accent: "#FF2A00"
  line-green: "#06C755"

  # Semantic (light)
  success: "#16A34A"
  success-light: "#DCFCE7"
  success-dark: "#15803D"
  warning: "#D97706"
  warning-light: "#FEF3C7"
  warning-dark: "#B45309"
  danger: "#DC2626"
  danger-light: "#FEE2E2"
  danger-dark: "#B91C1C"
  info: "#0284C7"
  info-light: "#E0F2FE"

  # Surfaces (light)
  surface-white: "#FFFFFF"
  page: "#F6F9FC"
  page-alt: "#F6F9FC"
  muted: "#EFF3F8"
  muted-alt: "#EFF3F8"
  surface-gray: "#F2F2F2"
  skeleton: "#E4E8EE"

  # Overlays
  overlay: "#000000"

  # Lines (light)
  border: "#E6EBF2"
  border-emphasized: "#CBD5E1"
  line-soft: "#E6EBF2"
  line-mid: "#C9D2DC"
  input: "#D0D9E4"

  # Text (light)
  text-primary: "#1C2536"
  text-secondary: "#475569"
  text-muted: "#64748B"  # AA 4.76:1 — ใช้กับ muted text (เดิม #A1A1AA 2.56:1 ตก AA)
  text-disabled: "#9AA4B8"
  text-soft: "#1C2536"
  text-soft-alt: "#475569"

  # Sidebar (light)
  sidebar: "#FFFFFF"
  sidebar-hover: "#F1F5F9"
  sidebar-active: "#0057A8"

  # Light-only: dark tokens removed (system ships light-only per PRODUCT.md)

typography:
  body:
    fontFamily: "'Sarabun', -apple-system, 'Segoe UI', sans-serif"
  body-thai:
    fontFamily: "'Sarabun', -apple-system, sans-serif"
  heading:
    fontFamily: "'Sarabun', -apple-system, sans-serif"
  display:
    fontFamily: "'Sarabun', -apple-system, sans-serif"
  code:
    fontFamily: "'SF Mono', Monaco, Consolas, monospace"

rounded:
  none: 0
  xs: 2px
  sm: 4px
  sm-alt: 6px
  md: 8px
  lg: 10px
  lg-alt: 12px
  xl: 14px
  xl-alt: 16px
  xxl: 18px
  round: 20px
  full: 9999px

---

# CMMS-TOPPAN — Design System

> **บันทึกจากโค้ดจริง** (`frontend/app/globals.css`, `design-system/tokens.css`,
> `frontend/components/*`) ตาม workflow ของ impeccable `/impeccable document`
> ใช้เป็น context ให้ detector ตรวจ drift (`design-system-font`,
> `design-system-color`, `design-system-radius`)
>
> แหล่งความจริงเชิงนโยบาย: `docs/EN/DESIGN-GUIDELINE.md` (Andon) +
> `docs/DESIGN_SYSTEM.md` (UI kit) — ไฟล์นี้คือ *ค่าที่ implement จริง*

## 1. Design language

สองชั้นรวมกัน:

1. **โทนแบรนด์ TOPPAN** — น้ำเงิน `#0068B5`, navy `#193264`, พื้นผิวเรียบ
2. **ภาษาไฟสัญญาณ Andon** — หลอดเขียว/เหลือง/แดง ที่ช่างโรงงานคุ้นเคย
   (แนวคิด Toyota Production System)

เป้าหมาย: กวาดตาทีเดียวรู้สถานะโดยไม่ต้องอ่านตัวหนังสือ

## 2. Color

ดูค่าใน frontmatter ด้านบน

- **ห้าม hard-code hex** ในหน้าเพจ — ใช้ `var(--cmms-*)` / `var(--color-*)`
  (ยกเว้น: login hero gradient, `transparent 1px` grid, สีใน Andon board)
- Semantic = Andon: success=พร้อม/เสร็จ, warning=ต้องดูแล/ค้าง, danger=หยุด/เกินกำหนด
- แดงใช้กับเรื่องวิกฤตเท่านั้น

## 3. Typography

| Role | Font | ใช้ที่ |
|---|---|---|
| Body | **Sarabun** | ตัวอักษรทั่วไปทั้งระบบ (ไทย + ละติน) |
| Heading / Display | **Sarabun** | หัวข้อ, KPI, ตัวนับ, eyebrow |
| Code | SF Mono | id, โค้ด, ค่าทางเทคนิค |

- **Eyebrow:** `.cmms-eyebrow` — Sarabun 700, uppercase, letter-spacing `0.12em`
- **KPI value:** `.cmms-kpi-value` — Sarabun, tabular-nums
- ห้ามใช้ Google Fonts อื่นเพิ่มโดยไม่จำเป็น

## 4. Radius / Spacing / Shadow

- Radius: `6 / 10 / 14 / 18px` (light) และ `6 / 8 / 12 / 16px` (ชุด UI kit v3)
  — pill/avatar ใช้ `9999px`
- Spacing scale: `2,3,4,5,8,10,12,16,18,19,20,24,30,32,34,40,60,70,80,120px`
- Shadow: flat design — ใช้เงานุ่ม ไม่งดงามด้วย drop shadow ใหญ่

## 5. Andon status language

| Component / Class | ใช้ทำอะไร |
|---|---|
| `AndonLamp` | เสาไฟ 3 หลอด (แดง/เหลือง/เขียว) — size `sm/md/lg` |
| `.cmms-status` + `.cmms-status-dot` | จุดหลอดไฟ + label — `ok / warn / down / idle` |
| `.cmms-andon-board` | แผง navy + scanlines (บอร์ดสถานะโรงงาน) |
| `.cmms-andon-chip` | chip บนพื้นเข้ม |
| `.cmms-count-pill` | ตัวนับแบบ Sarabun บนพื้นขาว |

## 6. Layout / Motion

- **Page skeleton บังคับ:** Breadcrumb → Page header (eyebrow + H1 + subtitle) → Content
- หน้าใหม่ทั้งหมดใช้ `components/PageShell.tsx`
- Motion: 120–200ms, `ease-out`, respect `prefers-reduced-motion`
- Animations ต้องไม่กระตุก layout — ใช้ `transform` / `opacity`
  (`--cmms-transition-layout`), ห้าม animate `height`/`padding`

### Tables

| Variant | เมื่อไร | API |
|---|---|---|
| `table` (default) | ตารางทั่วไป บนมือถือแถวเป็นแถบการ์ด (label ข้าง · ค่าขวา) ที่ 640px | `<DataTable variant="table">` / `OsTable` (`.cmms-ui-table`) |
| `cards` | ตารางที่มือถือต้องการการ์ดอ่านง่าย: label เหนือค่า, cell หัวข้อเด่น, ปุ่มเต็มความกว้าง ที่ 767.98px | `<DataTable variant="cards">` + `meta: { cardTitle: true }` ที่คอลัมน์ "หัวการ์ด" / `<OsTable card>` (cell ต้องมี `data-label`; หัวการ์ดใช้ `className="cmms-card-title"`) |

- หัวการ์ด (`cmms-card-title`) = ตัวหนา ไม่มีป้าย label เหนือค่า และเว้นที่ให้ checkbox ลอยมุมขวาบน (`.cmms-card-table`)
- ห้ามใช้ hex ล้วนในตาราง — ใช้ `var(--cmms-*)` (ดู §8)

## 7. ข้อยกเว้นที่ตั้งใจ (intentional exceptions)

ค่าต่อไปนี้อยู่นอก palette หลัก **โดยเจตนา** — บันทึกไว้ใน
`.impeccable/design.json` (`extensions.colorMeta`) เพื่อให้ detector มองว่า
"อยู่ในระบบ" ไม่ใช่ drift:

- **Overlays** — `overlay` = ดำ (`#000000`) ใช้เป็น scrim/shadow ทุกค่า alpha
- **Hero palette** — ไล่สีเฉพาะหมวด (`data-hero`) + page-hero/LIFF/login
  (ดู `docs/EN/DESIGN-GUIDELINE.md` §6)
- **Hero accents** — radial-gradient ลายน้ำเฉพาะหน้า + login/standalone glow
- **Andon housing** — เทากลางของเสาไฟ (`andon-housing`)
- **LINE brand** — `line-green` (`#06C755`) + เฉด `#059E44` บนป้ายผูกบัญชี
- **Telegram mock** — สีจำลองแอป Telegram ในหน้า notifications preview
- **LINE Flex payload** — สีที่ส่งเป็น *ข้อมูล* ให้ LINE API (header_color/text)

## 8. Do / Don't

| ทำ | ห้าม |
|---|---|
| ใช้ token `var(--cmms-*)` | hard-code hex ในเพจ |
| `AndonLamp` / `.cmms-status` สำหรับสถานะ | `Badge` error/warning/success แทนไฟ |
| ใส่ eyebrow ทุกหัวหน้า | หัวหน้าเพจไม่มี eyebrow |
| ตัวเลขสถิติใช้ Sarabun + tabular-nums | ฟอนต์ตัวเลขไม่เท่ากัน |
| ภาษาไทยใช้ Sarabun (ทั้งระบบ) | ฟอนต์ Google อื่นที่ไม่จำเป็น |
| แดง = เรื่องวิกฤตจริง | ใช้แดงกับข้อมูลทั่วไป |
