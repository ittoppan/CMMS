# PWA UX/UI Design Spec — CMMS-TOPPAN

> แนวทางออกแบบ UX/UI สำหรับ PWA ทุกหน้า (251 routes) — โหมด Calm Enterprise, Light + Dark
> อ้างอิง: `docs/DESIGN.md`, `docs/EN/DESIGN-GUIDELINE.md`, `docs/FRONTEND_REDESIGN_PLAN.md`, `docs/CMMS_UI_REDESIGN_PLAN.md`
> สถานะ design-audit: PASS 0 FAIL / 0 WARN (strict)

---

## 1. Design Principles (Calm Enterprise)

1. **Hierarchy ชัด** — จุดสำคัญสุดใหญ่/เด่น/มีพื้นที่ว่าง มากกว่าเน้นสีหรือ density
2. **ประกอบง่าย** — ส่วนมากทำจาก card + section heading + control bar + table/badge; ลด custom widget ที่ไม่จำเป็น
3. **น้อยคือเยอะ** — KPI card น้อยแต่ชัด, alert ใช้เมื่อต้องกระทำจริง, อื่นๆ secondary/collapse ได้
4. **ภาษาสีเดียว** — brand สำหรับจุดดำเนินการสำคัญ, neutral สำหรับโครงสร้าง, status color สำหรับสถานะเท่านั้น
5. **Spacing rhythm เดียว** — 8/12/16/24 px
6. **Mobile-first** — ทุกหน้าต้องใช้งานได้บนมือถือ/แท็บเล็ต (โรงงาน, สวมถุงมือ)
7. **Accessible by default** — WCAG 2.1 AA, touch target ≥ 48px, contrast ≥ 4.5:1

---

## 2. Design Tokens

### 2.1 Color (CSS variables)
| Role | Light | Dark | Token |
|---|---|---|---|
| Brand primary | `#0068B5` (TOPPAN blue) | `#3B9AE8` | `--cmms-brand` |
| Neutral bg | `#F8FAFC` | `#0F172A` | `--cmms-bg` |
| Surface | `#FFFFFF` | `#1E293B` | `--cmms-surface` |
| Text primary | `#0F172A` | `#F1F5F9` | `--cmms-text` |
| Text muted | `#64748B` | `#94A3B8` | `--cmms-text-muted` |
| Border | `#E2E8F0` | `#334155` | `--cmms-border` |
| Success | `#16A34A` | `#4ADE80` | `--cmms-success` |
| Warning | `#D97706` | `#FBBF24` | `--cmms-warning` |
| Danger | `#DC2626` | `#F87171` | `--cmms-danger` |
| Info | `#2563EB` | `#60A5FA` | `--cmms-info` |

### 2.2 Typography
- Font family: `Inter` (UI), `Barlow` (KPI value), `Noto Sans Thai` (TH)
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36
- Line height: 1.4 (body), 1.2 (heading)
- KPI value ใช้ `Barlow` + `font-variant-numeric: tabular-nums`

### 2.3 Spacing
- Base unit 4px: `4 / 8 / 12 / 16 / 24 / 32 / 48`
- Card padding: 16px (mobile) / 24px (desktop)
- Section gap: 24px
- Form field gap: 12px

### 2.4 Radius & Shadow
- Radius: 6px (input), 8px (card), 12px (modal), 999px (pill)
- Shadow: `0 1px 2px rgba(0,0,0,.05)` (card), `0 4px 12px rgba(0,0,0,.1)` (modal)

---

## 3. Layout Patterns

### 3.1 App Shell
- **Desktop**: Sidebar (collapsible, accordion groups) + Topbar (search Ctrl+K, theme toggle, notifications) + Content
- **Mobile**: App bar (top) + Content + Bottom nav (max 5 buttons, role-based)
- **Tablet**: Sidebar collapsed (icon-only) + content

### 3.2 PageShell (ทุกหน้า dashboard)
```tsx
<PageShell
  eyebrow="MODULE · SECTION"
  title="หัวข้อหน้า"
  description="คำอธิบายสั้น"
  actions={<Button>...</Button>}
>
  ...
</PageShell>
```
- Eyebrow: uppercase, muted, 11px
- Title: 24px bold
- Description: 14px muted, max 2 lines

### 3.3 Card
- `.card` หรือ `<Card>` — white surface, border, radius 8px
- Header: title + action button (right)
- Body: padding 16/24
- Footer: actions (right-aligned)

### 3.4 Table (`.data-table.cmms-stack-table`)
- Desktop: striped rows, sticky header
- Mobile: stack (แต่ละ cell แสดงเป็น label: value)
- ต้องมี `data-label` ทุก td
- Empty state: `.cmms-empty-state-cell`

### 3.5 Form
- Section: `.form-section` (title + fields)
- Field: label (14px) + input + helper/error (12px)
- Inline validation: touched-on-blur + submit-attempted
- Required legend: `.form-required-legend`
- Checkbox/radio: `.form-checkbox` / `.form-radio`

### 3.6 Modal
- `.cmms-modal-*` + `CMMS_UI.openModal/closeModal`
- Focus trap + ESC + restore focus
- Size: sm (400), md (560), lg (720), xl (960)

### 3.7 Banner/Alert
- `.cmms-banner` 4 variants: info/success/warning/danger
- Toast: slide-in + icon + title + progress bar + auto-dismiss

### 3.8 KPI Card
- `.cmms-kpi-card` + `.cmms-kpi-value` (Barlow)
- Layout: icon (left) + value (large) + label (muted) + trend (optional)

### 3.9 Empty State
- `.cmms-empty-state` (centered icon + title + description + CTA)
- `.cmms-empty-state-cell` (ใน table)

### 3.10 Loading
- `.cmms-skeleton` (shimmer) สำหรับ content
- `.cmms-spinner` สำหรับ action (button loading)

---

## 4. Responsive Rules

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 640px | Single column, bottom nav, stack table, card full-width |
| Tablet | 640–1024px | 2 columns, sidebar collapsed |
| Desktop | > 1024px | Sidebar expanded, multi-column, data table |

- Touch target ≥ 48px (Button hit-area pseudo-element)
- Input ≥ 16px (กัน iOS auto-zoom)
- Viewport เปิด pinch-zoom (WCAG 1.4.4)
- Content column cap 560px สำหรับ phone-first flows (LIFF, scan, repair request)

---

## 5. Dark/Light Mode

- Toggle ใน topbar (desktop + mobile app bar)
- เคารพ system preference (`prefers-color-scheme`)
- Script ป้องกัน FOUC ใน `<head>`
- ทุกสีใช้ CSS variable (ห้าม hardcode hex ใน component)
- ทดสอบ contrast ≥ 4.5:1 ทั้งสองโหมด

---

## 6. Navigation Patterns

### 6.1 Sidebar (Desktop)
- Groups (accordion) จำสถานะใน localStorage
- ครั้งแรกยุบอัตโนมัติยกเว้นกลุ่มที่เปิดอยู่
- Quick Search (Ctrl/Cmd+K) กรองเมนูแบบสด + คีย์บอร์ด

### 6.2 Bottom Nav (Mobile)
- Max 5 buttons, role-based (`bottom_nav_config`)
- ใช้ catalog `src/bottom_nav_catalog.php` (13 menu keys)
- Resolver `resolveBottomNavKeys()` (DB → fallback defaults)

### 6.3 Command Palette
- Ctrl/Cmd+K → ค้นหาเมนูแบบสด จัดลำดับตามสิทธิ์
- คีย์บอร์ด ↑↓/↵/ESC

---

## 7. Per-Module Page Templates

### 7.1 Dashboard
- KPI row (4 cards) + Section (chart) + Activity feed
- Range picker + filter bar
- Drill-down ไปยังหน้า detail

### 7.2 Listing Page
- PageShell → Filter bar (search + filters + chips) → Table → Pagination
- Empty state + loading skeleton
- Bulk actions (optional)

### 7.3 Create/Edit Form
- PageShell → Form sections → Action bar (save/cancel)
- Inline validation, dirty state warning
- Success → toast + redirect

### 7.4 Detail/View Page
- PageShell → Header (title + status badge + actions) → Tabs (info/history/attachments) → Content

### 7.5 Settings Page
- PageShell → Tabs/sections → Form fields → Save button (sticky bottom on mobile)

### 7.6 Standalone/Mobile (LIFF, scan)
- Full-screen, no sidebar
- Hero (brand color) + form card
- Large touch targets, thumb-reachable

### 7.7 Report Page
- PageShell → Filter bar → Chart/table → Export (CSV/XLSX/PDF)
- Print styles (A4)

---

## 8. Interaction Patterns

### 8.1 Toast
- Types: success/info/warning/error
- Auto-dismiss 4s (configurable)
- Position: top-right (desktop), top-center (mobile)

### 8.2 Confirmation
- Modal (danger variant) สำหรับ delete/irreversible
- Inline confirm สำหรับ minor actions

### 8.3 Loading
- Skeleton สำหรับ page load
- Spinner สำหรับ button action
- Optimistic update ที่เป็นไปได้

### 8.4 Error
- Error boundary + retry + Error ID
- 404/403 pages

### 8.5 Offline
- IndexedDB queue + sync center
- Offline indicator (top bar)
- Optimistic lock (409) + retry

---

## 9. Accessibility (a11y)

- `label for=` / `id=` / `aria-required` ครบในทุก form field
- Focus-visible ring (2px brand)
- Skip-to-content link
- Keyboard navigation: Tab/Enter/Space/Arrow/Esc
- Screen reader: `aria-live` สำหรับ toast, `aria-label` สำหรับ icon button
- Color ไม่ใช่ตัวบ่งชี้สถานะเดียว (ใช้ icon + text)

---

## 10. Motion

- Transition: 150ms ease-out (default)
- Page fade-in: 200ms
- Toast slide-in: 250ms
- Respect `prefers-reduced-motion` (ปิด animation ทั้งหมด)
- ไม่มี animation ที่กวนสมาธิ (parallax, auto-play video ยกเว้น login)

---

## 11. Component Inventory

| Component | Path | ใช้ที่ |
|---|---|---|
| Button | `components/ui/button.tsx` | ทุกหน้า |
| Card | `components/ui/card.tsx` | ทุกหน้า |
| Input | `components/ui/input.tsx` | ฟอร์ม |
| Badge | `components/ui/badge.tsx` | สถานะ |
| Table | `components/ui/table.tsx` | listing |
| AndonBadge | `components/AndonBadge.tsx` | สถานะ CMMS |
| PageShell | `components/PageShell.tsx` | ทุกหน้า dashboard |
| ToastProvider | `components/ToastProvider.tsx` | global |
| CommandPalette | `components/CommandPalette.tsx` | global |
| LiffBridge | `components/LiffBridge.tsx` | LIFF pages |

---

## 12. Per-Page Checklist (สำหรับ sweep)

สำหรับแต่ละหน้า ตรวจ:
- [ ] ใช้ `PageShell` (dashboard) หรือ standalone layout (mobile)
- [ ] Eyebrow ถูกต้อง (หรือ exempt)
- [ ] ไม่มี banned hex / gradient (ยกเว้นที่อนุญาต)
- [ ] Emoji เฉพาะที่อนุญาต
- [ ] สถานะใช้ `.cmms-status` / `AndonBadge`
- [ ] KPI ใช้ `.cmms-kpi-value` (Barlow)
- [ ] Table มี `data-label` ทุก td
- [ ] Empty state ใช้ `.cmms-empty-state`
- [ ] Loading ใช้ `.cmms-skeleton`
- [ ] Form มี inline validation
- [ ] Touch target ≥ 48px
- [ ] Dark mode ทำงาน
- [ ] `design-audit.py --strict` PASS

---

## 13. Implementation Phases

| Phase | ขอบเขต | สถานะ |
|---|---|---|
| 0 | Foundation (tokens, ui primitives, globals.css) | ✅ Done |
| 1 | PageShell sweep 52 pages | ✅ Done |
| 2 | Table stack + data-label 37 tables | ✅ Done |
| 3 | Card canonical 78+72 conversions | ✅ Done |
| 4 | Form components + validation | ✅ Done |
| 5 | Banner/alert 134 conversions | ✅ Done |
| 6 | Semantic color utilities 1,600 tokens | ✅ Done |
| 7 | a11y (label/id/aria) 221 fields | ✅ Done |
| 8 | AndonBadge shared | ✅ Done |
| 9 | Touch targets ≥ 48px | ✅ Done |
| 10 | Inline validation migrate | ✅ Done |
| 11 | Sweep ที่เหลือ (remaining pages) | 🔄 In progress |

---

## 14. Design Audit

รัน `python scripts/design-audit.py --strict` — ต้องได้ **0 FAIL / 0 WARN** ก่อน merge

Checks: gradient, banned hex, emoji, eyebrow, hex hardcode, andon, kpi

---

*เอกสารนี้เป็น living document — อัปเดตเมื่อมีการเปลี่ยน design decision*
