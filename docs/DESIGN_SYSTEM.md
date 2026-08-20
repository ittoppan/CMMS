# Design System — CMMS-TOPPAN (STEP 1: Full Project Audit)

> วันที่: 2026-08-20 · ใช้กับ `frontend/` ทั้งหมด · สถานะ: **ฉบับร่าง — รออนุมัติ**
> เอกสารคู่: [UX_UI_AUDIT.md](./UX_UI_AUDIT.md) · [UI_MIGRATION_PLAN.md](./UI_MIGRATION_PLAN.md)

---

## 1. หลักการออกแบบ (Design Principles)

1. **Enterprise, ไม่ใช่ marketing** — เน้นความชัดเจน/ประสิทธิภาพการทำงาน มากกว่าความสวยงามฉูดฉาด
2. **ห้าม gradient/glassmorphism เกินจำเป็น** — ใช้ gradient เฉพาะจุดสำคัญ (splash, hero) เท่าที่มีอยู่แล้ว
3. **ห้าม card ซ้อน card** — 1 card = 1 กลุ่มข้อมูล; ใช้ divider/grouping แทนการซ้อน
4. **ห้าม emoji เป็น icon หลัก** — icon = Lucide เท่านั้น; emoji ใช้ใน content/notification text ได้
5. **Animation น้อยและมีความหมาย** — transition 120–300ms; เคารพ `prefers-reduced-motion`
6. **Design tokens เท่านั้น** — ห้าม hard-code สี/ขนาด/ระยะใน component (audit พบ 451 hex + 2,011 inline style ต้องล้าง)
7. **Mobile-first สำหรับ Technician, Desktop-first สำหรับ Admin** — 2 persona 2 layout
8. **ทุก state ครบ** — loading/skeleton, empty, error, no-result, offline, permission denied
9. **Accessibility เป็นค่าเริ่มต้น** — contrast ≥4.5:1, touch target ≥44px, keyboard navigable, zoom ได้
10. **Dark mode: light/dark/system** — เปิดใช้งานด้วย token จริง (ปัจจุบันปิดตาย)

---

## 2. Brand Tokens (จาก `globals.css` + `design-system/tokens.json` — ใช้ต่อยอด ไม่สร้างใหม่)

### 2.1 สีหลัก (TOPPAN Blue — remap จาก Tailwind indigo/purple)
| Token | ค่า | ใช้กับ |
|---|---|---|
| `--color-primary-100` | `#E6F0FA` | bg อ่อนของ primary |
| `--color-primary-500` | `#0068B5` | primary action, active nav, themeColor |
| `--color-primary-700` | `#00508C` | hover |
| `--color-primary-800` | `#193264` | deep navy (splash, footer) |
| `--color-primary-900` | `#12244A` | navy dark |
| `--tp-deep-navy` | `#193264` | brand |
| `--tp-navy-dark` | `#0B1F4B` | sidebar text strong, splash |
| `--tp-red-accent` | `#FF2A00` | brand accent (ใช้อย่างจำกัด) |

### 2.2 สี Semantic (ต้องใช้ผ่าน token เสมอ)
| Token | ค่า | ใช้กับ |
|---|---|---|
| `--color-success` | `#10B981` | สำเร็จ, andon green |
| `--color-warning` | `#F59E0B` | เตือน, andon amber |
| `--color-danger` | `#EF4444` | ผิดพลาด, andon red, overdue |
| `--color-info` | `#0068B5` | ข้อมูล |
| LINE green | `#06C755` | เฉพาะ branding LINE |

### 2.3 สี Neutral (จาก `:root` ปัจจุบัน)
| Token | ค่า | ใช้กับ |
|---|---|---|
| `--color-bg` | `#F5F7FA` | พื้นหลัง app |
| `--color-surface` | `#FFFFFF` | card, sidebar |
| `--color-muted` | `#EEF1F6` | hover, chip bg |
| `--color-text` | `#22262E` | ข้อความหลัก |
| `--color-text-secondary` | `#475569` | ข้อความรอง |
| `--color-text-muted` | `#9AA4B8` | ข้อความจาง/placeholder |
| `--color-border` | `#E4E8EE` | border, divider |

> **Dark mode:** ทุก token ข้างต้นต้องมีคู่ `dark:` (เช่น `--color-bg-dark: #0F172A`, surface `#1E293B` ฯลฯ) — กำหนดใน Phase 0

### 2.4 ระยะ (Spacing) — scale 4px
`2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120` (มีใน `tokens.json` แล้ว) — ใช้ `--spacing-*` หรือ Tailwind utilities เท่านั้น

### 2.5 Radius & Shadow
| Token | ค่า |
|---|---|
| radius-sm | 6px (input, chip) |
| radius-md | 10px (button, card) |
| radius-lg | 14px (dialog, sheet) |
| radius-xl | 18px (hero, splash) |
| shadow-0..3 | ระดับ 0–3 (ใช้เท่าที่จำเป็น) |

### 2.6 Typography
| ฟอนต์ | ใช้กับ |
|---|---|
| **Noto Sans Thai** | หลัก (UI ทั้งหมด) |
| Sarabun | สำรอง/เอกสาร |
| Roboto / Inter | ตัวเลข, ภาษาอังกฤษ |
| Barlow Condensed | factory/industrial accent (มีอยู่แล้ว) |

ขนาด: `12 / 14 / 16 / 18 / 20 / 24 / 30 / 36` — ห้าม `text-[Npx]` ตามอำเภอใจ (audit พบ 2 จุด)

---

## 3. Component Spec (มาตรฐานใหม่)

> ทุก component ใช้ tokens + `cva` variants + `clsx`/`tailwind-merge`; ใช้ shadcn/ui (Radix) เป็นฐานเฉพาะที่จำเป็น

| Component | Spec |
|---|---|
| **Button** | variants: primary/secondary/outline/ghost/danger; sizes sm/md/lg (md = 40px height); icon + label; disabled state; focus-visible ring |
| **Input / Select / Textarea** | label เสมอ (ไม่ใช่ placeholder อย่างเดียว); error text + `aria-invalid`; height 40px; focus ring `--color-primary-500` |
| **Card** | 1 layer; padding 16–24; header (title + action) / body / footer; **ห้ามซ้อน card** |
| **Table** | TanStack Table เป็นฐาน; sticky header; sort/filter/pagination; mobile → card list (ใช้ `CardTableLabels` ต่อยอด); `scope` + caption |
| **Dialog / Sheet** | Radix Dialog; mobile = bottom sheet; focus trap; ESC ปิด; backdrop เป็น `<button>` (a11y) |
| **Toast** | `aria-live="polite"`; icon Lucide (CheckCircle/AlertTriangle/Info/XCircle); auto-dismiss + manual close |
| **EmptyState** | icon + title + description + action (ถ้ามี) — ใช้ตัวเดียวทั้งระบบ |
| **Skeleton** | shimmer 120ms; `aria-busy`; ใช้แทน Spinner ใน list/detail |
| **Badge / Chip** | status colors จาก semantic tokens; text + optional dot |
| **Tabs** | Radix Tabs; ใช้ในหน้า detail (spare_parts มี TabList อยู่แล้ว — standardize) |
| **Form** | react-hook-form + zod schema; `FormField` wrapper (label + error); submit disabled ขณะ pending; offline-aware (enqueue) |
| **AndonLamp** | คงเดิม (ใช้ได้ดี) — green/amber/red จาก semantic tokens |

---

## 4. Layout Spec

### 4.1 Desktop (Admin/Supervisor/Engineer/Management)
```
┌────────────┬──────────────────────────────┐
│ SideNav    │ TopNav (breadcrumb, bell,    │
│ 260px      │ TH/EN, user, logout)         │
│ (collapse  ├──────────────────────────────┤
│ → 68px)    │ Content (max-width 1440,     │
│            │ padding 24)                  │
└────────────┴──────────────────────────────┘
```
- SideNav: 260px, collapse 68px, จำ state (localStorage), resizable 200–340 (มีอยู่แล้ว — เก็บ)
- TopNav: 56px
- Content: max-width 1440px, padding 24px (mobile 16px)

### 4.2 Mobile (Technician — ใช้มือเดียว)
```
┌──────────────────────────┐
│ App bar (hamburger, logo,│
│ title, แจ้งซ่อม badge)    │
├──────────────────────────┤
│ Content (padding 16)     │
├──────────────────────────┤
│ Bottom Nav: Home | Jobs  │
│ | Scan | Report | Profile│
└──────────────────────────┘
```
- Bottom nav: role-based (มีอยู่แล้ว) + active state + safe-area inset + queue badge
- Touch target ≥44px; ฟอร์มยาวจัด section + sticky action bar (มีใน repair form แล้ว — standardize)

### 4.3 Breakpoints
| Range | Layout |
|---|---|
| < 640px | mobile (bottom nav) |
| 640–1023px | tablet (bottom nav + wider content) |
| ≥ 1024px | desktop (side + top nav) |

---

## 5. Responsive Rules
- ทุกตารางต้องมี mobile fallback (card list) — ใช้ `CardTableLabels` เป็น base
- ฟอร์ม: 1 column บน mobile, 2 column บน desktop (grid `grid-cols-1 md:grid-cols-2`)
- รูป/PDF preview: `max-w-full` เสมอ
- ทดสอบทุก breakpoint: mobile/tablet/laptop/desktop/wide

---

## 6. Dark Mode Rules (เปิดใน Phase 0)
- ใช้ `next-themes` (light/dark/system) — จำค่าใน localStorage
- ทุกสีผ่าน CSS variables คู่ light/dark — **ห้าม hard-code ใน dark**
- `color-scheme` เปลี่ยนตาม theme
- ตรวจ contrast ทุก semantic pair
- ล้าง `dark:` class ค้าง 62 จุดให้ตรงกับ token จริง

---

## 7. Mobile Rules (Technician persona)
- 1 มือ: ปุ่มหลักอยู่ช่วงล่าง/กลางจอ; back ถึงได้เสมอ
- QR scan + camera: ใช้ native (มี `/scan` อยู่แล้ว — เก็บ)
- Offline: ทุกฟอร์มที่ใช้กลางโรงงานต้อง offline queue + auto-sync + indicator
- ฟอนต์ ≥16px ใน input (กัน iOS zoom)
- safe-area: `env(safe-area-inset-bottom)` สำหรับ bottom nav

---

## 8. PWA Rules
- manifest: เก็บของเดิม (ตรวจแล้วถูกต้อง) — อัปเดตเมื่อตัด route ซ้ำ
- SW: เก็บกลยุทธ์เดิม (network-first API, SWR assets, offline routes) — เพิ่ม route ใหม่ตาม module ที่ทำ offline
- ทุกหน้า offline-capable ต้องมี: offline indicator + queue count + auto-flush เมื่อ online
- Push: opt-in ชัดเจน (ไม่ auto prompt หลัง 8s — เปลี่ยนเป็น user action)

---

## 9. Icon Rules (Lucide)
- icon หลักทั้งหมด = `lucide-react` — แทน heroicons + emoji ใน UI
- ขนาด: 16 (inline), 20 (button), 24 (empty state/hero)
- `aria-hidden="true"` + `strokeWidth={1.75}` (ค่าเริ่มต้นของระบบ)
- ห้าม emoji ในปุ่ม/icon slot; ใช้ได้ในข้อความแจ้งเตือน/empty state description

---

## 10. Accessibility Rules (บังคับ)
- `<html lang="th">` + `dir="ltr"`
- viewport: เปิด zoom (`userScalable` default, `maximumScale` ไม่จำกัด)
- ทุก interactive ต้องเป็น `<button>`/`<a>` จริง + focus-visible ring
- ทุก icon-only ต้องมี `aria-label`
- ทุก form field มี `<label>` + error เชื่อม `aria-describedby`
- ทุกตารางมี `caption`/`scope`; ทุก dialog มี focus trap + ESC
- Toast/status เปลี่ยนต้อง announce (`aria-live`)
- Contrast ≥4.5:1 (text), ≥3:1 (large/UI)
- เคารพ `prefers-reduced-motion`

---

## 11. Migration Rules (บังคับทุก module)
1. ห้าม hard-code สี/ขนาด — ใช้ tokens เท่านั้น
2. ห้าม inline `style` ใหม่ — ใช้ class/tokens (ล้างของเก่าใน module ที่ทำ)
3. ทุกหน้า: loading skeleton + empty + error + no-result + offline + permission denied
4. หลังแก้ module: `npm run build` + lint + type check + ตรวจ route/API/responsive/console/network
5. commit + push + แจ้ง Telegram (`telegramAdminAlert` ครบ args)
6. ไม่แตะ Business Logic/DB/API/Auth/Permission — UI เท่านั้น