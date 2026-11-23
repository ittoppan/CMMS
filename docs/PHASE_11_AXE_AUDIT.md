# Phase 11 — Accessibility audit ด้วย axe-core (WCAG 2.1 A/AA)

> วันที่: 2026-11-23 · เครื่องมือ: `@axe-core/playwright` 4.14 (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
> รันบน `http://localhost:3001` (build 22 พ.ย. — ดู R9-9) ด้วย role 5 (Viewer)
> เป้าหมาย: เริ่มปิด checkbox `[ ] axe/lighthouse ครบ`

## 1. ขอบเขตที่สแกนได้จริง

| สถานะ | จำนวน | หน้า |
|---|---|---|
| สแกนสำเร็จ | **8** | `/login`, `/dashboard`, `/reports`, `/reports/export_excel`, `/reports/work-orders`, `/reports/downtime`, `/notifications`, `/profile` |
| 404 (ไม่มี route นี้) | **3** | `/spare_parts/criticality`, `/announcements`, `/help` |
| ข้ามเพราะ 403 (role 5 ไม่มีสิทธิ์) | **6** | `/settings`, `/planning`, `/pm_am`, `/supervisor`, `/knowledge`, `/documents` |

> หมายเหตุ: `spare_parts/criticality` มีใน `menu_permissions` (role 5 = granted) แต่ **ไม่มี route ใน `frontend/app`** → ลิงก์ที่ grant ไว้จะตกไป 404

## 2. ผลรวม

| rule | impact | จำนวน node | หน้า |
|---|---|---|---|
| `color-contrast` | serious | **22** | 8 หน้า (login 1, dashboard 2, reports 5, export_excel 4, work-orders 2, downtime 2, notifications 3, profile 0, 404s 3) |
| `label-content-name-mismatch` | serious | **14** | ทุกหน้าที่มี topbar (2 node/หน้า: ปุ่มค้นหา + ปุ่มสลับภาษา) |
| `aria-valid-attr-value` | **critical** | **1** | `/notifications` |

รวม **37 node** / 3 rule — ไม่มี critical อื่น, ไม่มี violation ระดับ moderate/minor

## 3. Findings (พร้อมค่าที่วัดได้)

### A11-1 (HIGH) — chip ในหน้า `/reports` อ่านไม่ออก (contrast 1.07)

```
<span class="cmms-andon-chip">ISO 9001 / ISO 55000</span>
foreground #fefefe · background #f5f6f8 · ratio 1.07 (ต้อง ≥ 4.5)
```
สาเหตุ: `.cmms-andon-chip` (`app/globals.css:2475-2486`) ออกแบบมา **สำหรับ hero พื้นเข้ม** (`color: rgba(255,255,255,.9)` + `background: rgba(255,255,255,.07)`) แต่ถูกใช้บนพื้นสว่าง → ขาวบนขาว
ทางแก้ (UI-only, รออนุมัติ): ใส่ในบริบท `.cmms-hero-on-dark` หรือเพิ่ม variant พื้นสว่าง

### A11-2 (HIGH) — หัวข้อ «ใช้บ่อย» ใน sidebar `/dashboard` contrast 1.04

```
<p class="px-2.5 pb-1 pt-1.5 text-sm font-semibold text-foreground">ใช้บ่อย</p>
foreground #18181b · background #0b1d31 · ratio 1.04
```
`text-foreground` (เข้ม) บนพื้น sidebar เข้ม → แทบมองไม่เห็น

### A11-3 (MEDIUM) — ปุ่ม «ล็อกอินด้วย LINE» contrast 2.25

```
<span>ล็อกอินด้วย LINE</span> · #ffffff on #06c755 · ratio 2.25
```

### A11-4 (MEDIUM) — เมนู active ใน sidebar contrast 4.01

```
<span class="min-w-0 flex-1 truncate">ศูนย์รวม Dashboard</span> · #ffffff on #2e7fe0 · ratio 4.01
```

### A11-5 (MEDIUM) — `/notifications` tab มี `aria-controls` ชี้ไป element ที่ไม่มี

```
aria-controls="radix-_R_1einpfl4pfjbb_-content-all"  (axe: Invalid ARIA attribute value)
```
เกิดจาก Tabs (Radix/shadcn) ที่ unmount content ของ tab ที่ไม่ active แต่ยังประกาศ `aria-controls` — ผู้ใช้ screen reader จะกระโดดไปไม่ถึงเนื้อหา

### A11-6 (LOW) — ข้อความ muted 4.36 (ต่ำกว่า 4.5 เล็กน้อย)

`--cmms-text-muted` (#64748b) บน `#f4f5f7` = 4.36 → เกิด 3 node บน `/notifications`, `/reports`, `/reports/work-orders` (ข้อความ «ข้อมูลจาก: …», badge `text-[11px]`)

### A11-7 (LOW) — accessible name ไม่ตรงกับข้อความที่เห็น (14 node)

ปุ่ม topbar 2 ตัวทุกหน้า:
- ปุ่มค้นหา: `aria-label="เปิดค้นหาทั่วทั้งแอป..."` แต่ข้างในมีข้อความ/คีย์ลัดที่ไม่อยู่ในชื่อ
- ปุ่มสลับภาษา: เห็น «TH/EN» แต่ `aria-label="Switch to English"`
(WCAG 2.5.3 Label in Name)

## 4. มือถือ 390×844 (light) — สแกนแล้ว

| หน้า | overflowX | violations | node | หมายเหตุ |
|---|---|---|---|---|
| `/dashboard` | 0 | **0** | 0 | sidebar ถูกซ่อนบนมือถือ → A11-2 ไม่เกิด |
| `/reports` | 0 | 1 | 5 | contrast (andon-chip, `text-white/80`, `text-[11px]`) |
| `/reports/export_excel` | 0 | 1 | 4 | contrast |
| `/notifications` | 0 | 2 | 4 | `aria-valid-attr-value` (critical) + contrast |
| `/profile` | 0 | **0** | 0 | — |

รวม **13 node** — เป็นต้นเหตุเดียวกับ desktop ทั้งหมด ไม่มีปัญหาใหม่เฉพาะมือถือ, ไม่มี horizontal scroll ทั้ง 5 หน้า

## 5. Dark mode — **N/A by design (ตรวจไม่ได้)**

ลอง 2 วิธี (emulateMedia `prefers-color-scheme: dark` และ `localStorage.theme=dark`) → `<html class="light">` ตลอด, body ยัง `rgb(246,248,251)`

สาเหตุ: `components/Providers.tsx:11` → *“next-themes: forced light เสมอ — ไม่เอา dark mode (ผู้ใช้ยืนยัน) เลี่ยงปุ่มสลับธีม”*

→ **ไม่ใช่บั๊ก และไม่ต้องแก้** แต่หมายความว่า “axe dark mode” เป็นข้อที่ **ทำไม่ได้** จนกว่าจะมีค่าตัดสินใจใหม่จากเจ้าของระบบ (ถ้าเปลี่ยนใจต้องเปิด forcedTheme ก่อน)

## 6. Regression suite — ยังรันไม่ผ่านในสภาพแวดล้อมนี้

รัน `npx playwright test` ด้วย config มาตรฐาน (ทั้งหมด 30 spec): **28 passed / 131 failed**
ข้อสังเกต: spec ส่วนใหญ่ต้องมี fixture/สิทธิ์หลาย role/seed ที่ยังไม่มีในเครื่องนี้ → **ยังไม่สรุปว่าเป็น regression** และ checkbox `[ ] regression เต็ม` ยังปิดไม่ได้ จนกว่าจะมี fixture ครบและบัญชีที่ต้องการ

## 7. สิ่งที่ยังไม่ได้ตรวจ

- อีก **6 หน้า**ที่ role 5 ไม่มีสิทธิ์ (403) และหน้าในโมดูลที่ถูกบล็อกทั้งหมด (repair, asset, calibration, settings, planning ฯลฯ) → ต้องใช้บัญชี role 1/2/3/6/7
- ~~โหมดมือถือ~~ (สแกนแล้ว §4) · ~~dark mode~~ (N/A by design §5)
- Lighthouse (Performance/PWA) — ยังไม่ได้ติดตั้ง/รัน; PWA ต้อง HTTPS หรือ localhost
- ค่าที่วัดได้มาจาก **build 22 พ.ย.** (R9-9) → ต้องรันซ้ำหลัง rebuild ก่อนสรุปว่าปิดได้

## 8. เพิ่มเติม 2026-11-23 — 12 หน้าที่ role 5 เข้าได้ (axe desktop 1440, build 22 พ.ย.)

สแกน `/dashboard` + 9 subpage + `wallboard` + `onboarding` ด้วย @axe-core/playwright (wcag2a + wcag2aa):

| หน้า | violations | nodes | กฎ |
|---|---|---|---|
| `/dashboard` | 1 | 2 | `color-contrast` (2) |
| `/dashboard/backlog-aging` | 0 | 0 | — |
| `/dashboard/data-quality` | 1 | 1 | `scrollable-region-focusable` |
| `/dashboard/facility` | 0 | 0 | — |
| `/dashboard/lubrication` | 0 | 0 | — |
| `/dashboard/pm-compliance` | 0 | 0 | — |
| `/dashboard/predictive-ai` | 0 | 0 | — |
| `/dashboard/production-impact` | 1 | 1 | `scrollable-region-focusable` |
| `/dashboard/shift-handover` | 0 | 0 | — |
| `/dashboard/utility-energy` | 0 | 0 | — |
| `/dashboard/wallboard` | 2 | 2 | `color-contrast` (1) + `scrollable-region-focusable` (1) |
| `/onboarding` | 0 | 0 | — |
| **รวม** | **5** | **6** | |

รวมสะสม: **20 หน้าสแกน** = **43 nodes / 5 กฎ** (เดิม 8 หน้า = 37 node/3 กฎ + รอบนี้ 6 node/2 กฎใหม่)

### Finding ใหม่

- **A11-3 (LOW) — `#cmms-main-scroll` และ `.overflow-x-auto` เป็น scrollable region ที่ไม่ focusable**
  - จุด: `/dashboard`, `/data-quality`, `/production-impact`, `/wallboard`
  - axe: `scrollable-region-focusable` — ผู้ใช้ keyboard ไม่สามารถเลื่อนกรอบที่ลื่นได้ด้วย Tab/Space
  - แก้: เพิ่ม `tabindex="0"` + `role="region"` + `aria-label` ให้ scroll container (แตะ `components/` = ต้องอนุมัติ) หรือทำให้ `<main>` เป็น scroll container เดียว
- **A11-4 (LOW) — wallboard มีข้อความ `0.6em` ที่ contrast ต่ำ**
  - จุด: `.tower-panel … .text-[0.6em].font-bold` (node 1)
  - เป็นหน้าจอ TV → ขนาดตัวอักษรเล็กมาก ผู้ใช้ห่างจออ่านไม่ได้
- **A11-5 (LOW) — sidebar quick-access label contrast ต่ำ**
  - จุด: `/dashboard` node 2 — "ใช้บ่อย" และ "ศูนย์รวม Dashboard"
  - `text-foreground` บนพื้นที่ sidebar ผ่าน audit แต่ axe จับได้ใน layout นี้

### ไม่ใช่ finding ใหม่

- `color-contrast` บน `/dashboard` (2 node) ต่อเนื่องจาก A11-1 (`.cmms-andon-chip` ขาวบนพื้นสว่าง) — แต่ node ที่จับคราวนี้เป็น sidebar ไม่ใช่ chip
- ไม่พบ `label-content-name-mismatch` บน 12 หน้าใหม่ (กฎนั้นมากจากหน้า `/notifications` ที่ role 5 ไม่เข้าได้)

### ยังไม่ได้ตรวจ (คงเดิม)

- อีก **6 หน้า**ที่ role 5 ไม่มีสิทธิ์ (403) และหน้าในโมดูลที่ต้อง role สูง
- Lighthouse Performance/PWA — PWA ต้อง HTTPS หรือ localhost; Performance รันแล้ว (`PHASE_11_LIGHTHOUSE_REPORT.md`)
- rebuild แล้วรัน axe ซ้ำ (R9-9)
