# CMMS-TOPPAN — Design System Spec (v3 "Astryx-free")

> **Canonical reference for the UX/UI rebuild on branch `ux-redesign`.**
> Every page converted from Astryx MUST follow this spec. When a page-level
> decision isn't covered here, prefer shadcn/ui defaults and this palette.
> Technical inventory lives in `docs/FRONTEND_AUDIT.md`.

---

## 1. Principles

1. **Light-first, flat and modern.** White surfaces on a soft neutral canvas.
   No gradient/glassmorphism chrome. Gradients are allowed ONLY inside the
   page-hero KPI area if a page had one before — never on cards, buttons or
   navigation.
2. **One pattern for every page.** Breadcrumb → Page header → Content. No
   exceptions (listing, form, detail, wizard alike).
3. **Tokens over hard-coded values.** All colors/radii/shadows go through CSS
   variables (`--cmms-*` names are kept for compatibility; their VALUES follow
   this spec). Tailwind semantic utilities (`bg-primary`, `text-muted-foreground`,
   `border-border`) are preferred over arbitrary values.
4. **Dark mode is automatic.** Every component uses tokens; `.dark` overrides
   values only. Never branch on theme in JS except the existing toggles.
5. **Logic is untouchable.** Rebuilds change markup/styling only. react-query
   hooks, fetch calls, zod schemas, permission checks (`useMenuPermission`),
   i18n (`t()`), offline queue stay byte-identical wherever possible.

---

## 2. Color Tokens

Brand source of truth stays `design-system/tokens.css` (`--tp-*`).
TOPPAN Blue **#0068B5** is `--primary`.

### 2.1 Light mode (`:root`)

| Token | Value | Notes |
|---|---|---|
| `--background` / `--cmms-bg-page` | `#f4f5f7` | neutral zinc-slate canvas |
| `--foreground` / `--cmms-text-primary` | `#18181b` (zinc-900) | |
| `--card` / `--cmms-bg-card` | `#ffffff` | |
| `--card-foreground` | `#18181b` | |
| `--popover` / `--cmms-bg-popover` | `#ffffff` | |
| `--primary` / `--cmms-primary` | `#0068B5` | TOPPAN Blue |
| `--primary-hover` / `--cmms-primary-hover` | `#005fa3` | |
| `--primary-light` / `--cmms-primary-light` | `rgba(0,104,181,0.10)` | tints, selected rows |
| `--secondary` / `--cmms-bg-muted` | `#f4f4f5` (zinc-100) | secondary buttons, muted fills |
| `--muted` | `#f4f4f5` | |
| `--muted-foreground` / `--cmms-text-secondary` | `#52525b` (zinc-600) | descriptions, labels |
| `--accent` | `#eef4f9` | hover washes (blue-tinted) |
| `--accent-foreground` | `#00508c` | |
| `--destructive` / `--cmms-danger` | `#dc2626` (red-600) | |
| `--success` / `--cmms-success` | `#16a34a` (green-600) | |
| `--warning` / `--cmms-warning` | `#d97706` (amber-600) | |
| `--info` / `--cmms-info` | `#0284c7` (sky-600) | |
| light tints | `--cmms-success-light #dcfce7`, `--cmms-warning-light #fef3c7`, `--cmms-danger-light #fee2e2`, `--cmms-info-light #e0f2fe` | badge/pill backgrounds |
| dark text variants | `--cmms-success-dark #15803d`, `--cmms-warning-dark #b45309`, `--cmms-danger-dark #b91c1c` | |
| `--border` / `--cmms-border` | `#e4e4e7` (zinc-200) | |
| `--input` | `#d4d4d8` (zinc-300) | input borders |
| `--ring` / `--cmms-border-focus` | `#0068B5` | focus rings |
| `--radius` | `0.75rem` | cards `rounded-xl`; inputs/buttons derive |

Sidebar tokens (kept for existing CSS): `--cmms-bg-sidebar #ffffff`,
`--cmms-bg-sidebar-hover #f4f5f7`, `--cmms-bg-sidebar-active #0068B5`,
`--cmms-sidebar-text #52525b`, `--cmms-sidebar-text-strong #18181b`,
`--cmms-sidebar-indicator #0068B5`.

### 2.2 Dark mode (`.dark`)

| Token | Value |
|---|---|
| `--background` / `--cmms-bg-page` | `#101012` |
| `--foreground` | `#f4f4f5` |
| `--card` / popover / sidebar | `#1b1b1f` |
| `--secondary` / muted | `#27272a` (zinc-800) |
| `--muted-foreground` / `--cmms-text-secondary` | `#a1a1aa` (zinc-400) |
| `--border` | `#2e2e33` |
| `--input` | `#3f3f46` |
| `--primary` | `#3b93cf` (lightened TOPPAN Blue for contrast) |
| `--primary-hover` | `#5aa8de` |
| `--ring` | `#3b93cf` |
| status colors | lighten one step: success `#22c55e`, warning `#f59e0b`, destructive `#ef4444`, info `#38bdf8`; tints become `rgba(...,0.15)` |

Rules: shadows in dark mode are near-black and subtle; never use pure black
surfaces; borders carry structure instead of shadows.

### 2.3 Status → badge color mapping (canonical)

| Status key | Pill classes (base: `badge` = inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium) |
|---|---|
| open / pending | `bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300` |
| acknowledged | `bg-indigo-100 text-indigo-700` (+dark) |
| in_progress | `bg-amber-100 text-amber-700` (+dark) |
| waiting_parts | `bg-orange-100 text-orange-700` (+dark) |
| waiting_approval | `bg-purple-100 text-purple-700` (+dark) |
| resolved / completed / active / in_stock | `bg-green-100 text-green-700` (+dark) |
| closed / inactive / disposed | `bg-zinc-100 text-zinc-600` (+dark) |
| cancelled | `bg-zinc-100 text-zinc-400 line-through-none` (+dark, muted) |
| rejected / overdue / critical / low_stock | `bg-red-100 text-red-700` (+dark) |
| low | `bg-zinc-100 text-zinc-600`, medium `bg-blue-*`, high `bg-amber-*`, critical `bg-red-*` |

Badges are small solid-tint pills (tint background + dark readable text), no
borders, no gradients.

---

## 3. Typography

Fonts already loaded: **Inter** (Latin), **Noto Sans Thai** (Thai).
Roboto/Barlow Condensed may remain loaded but are not part of the spec;
Barlow Condensed survives only inside legacy Andon/KPI numeric displays until
those pages are revisited.

| Use | Classes |
|---|---|
| Page title (one per page, inside header) | `text-2xl font-semibold tracking-tight text-foreground` |
| Page description (one line) | `text-sm text-muted-foreground` |
| Section title (inside cards) | `text-base font-semibold text-foreground` |
| Sub-section / group label | `text-sm font-medium text-foreground` |
| Body / table cell | `text-sm text-foreground` |
| Secondary body | `text-sm text-muted-foreground` |
| Small / meta / breadcrumb | `text-xs text-muted-foreground` |
| Table column header | `text-xs font-medium uppercase tracking-wide text-muted-foreground` |

No `font-bold` on body copy; headings never use gradients; tabular numbers:
`tabular-nums` on KPI/statistic values.

---

## 4. Cards & Surfaces

```
rounded-xl border border-border bg-card shadow-sm
padding: p-5 (default) or p-6 (page-level primary card)
```

- Hover lift only where a card is clickable (`hover:shadow-md transition-shadow`).
- No glass blur, no gradient borders, no colored top-strip KPI variants — KPI
  tiles use plain cards with an icon chip (`h-10 w-10 rounded-lg bg-{tint}
  text-{color}`) top-left.
- Inner section dividers: `divide-y divide-border`.

---

## 5. Page Layout Pattern (mandatory)

Every page renders exactly this skeleton:

```tsx
<div className="mx-auto w-full max-w-6xl space-y-6">
  {/* 1) Breadcrumb */}
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem><BreadcrumbLink href="/dashboard">หน้าแรก</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbPage>ชื่อหน้า</BreadcrumbPage></BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>

  {/* 2) Header */}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">ชื่อหน้า</h1>
      <p className="text-sm text-muted-foreground">คำอธิบายหน้าในหนึ่งบรรทัด</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">{/* action buttons */}</div>
  </div>

  {/* 3) Content */}
  ...
</div>
```

- Listing pages: filter `<Card>` (form row: search input + selects + reset
  button, `gap-2`) directly above the table card.
- Form pages: one `<Card>` per logical group; each has `CardHeader`
  (`CardTitle` = section title, optional `CardDescription`) + `CardContent`
  containing the shadcn `Form` fields; required fields show a red `*`
  (`<span className="text-destructive">*</span>` after the label); submit bar
  sticks to the card footer (`flex justify-end gap-2`), primary button right.
- Detail pages: definition-list style inside cards (`dt text-sm text-muted-foreground`,
  `dd text-sm`).
- Mobile: actions wrap below the title; tables collapse via DataTable's
  built-in card stacking; bottom padding clears the fixed bottom nav
  (`pb-24 lg:pb-8`).

A shared helper `components/PageShell.tsx` (breadcrumb items, title,
description, actions) implements steps 1–2 so pages stay DRY.

---

## 6. Navigation Structure (new sidebar)

Seven top-level collapsible groups (down from 8 ad-hoc sections), each rendered
as a `Collapsible` section in the new Sidebar. Visibility continues to come
exclusively from `useMenuPermission().canShow(key)` — keys unchanged.

| # | Group | Items (permission key → route) |
|---|---|---|
| 1 | **งานซ่อมบำรุง** (Work Orders) | dashboard, repair, repair/request, repair/assign, repair/my_tasks, repair/tracking, repair/workload, repair/kanban, repair/history, approval, forms, forms/designer, manuals |
| 2 | **แผน PM & เครื่องจักร** (PM & Machines) | pm_am, pm_am/calendar, pm_am/checksheet, pm_am/create, pm_am/batch_schedule, inspections(+run, templates), asset_registry(+bom_tree, criticality), assets, qr-sheet, equipment_borrowing, calibration, mtbf_mttr |
| 3 | **คลังอะไหล่** (Spare Parts) | spare_parts, spare_parts/issue_center, spare_parts/sage_po, spare_parts/sage_sync, spare_parts/optimization, spare_parts/stock_take, suppliers |
| 4 | **วิเคราะห์ & รายงาน** (Analytics & Reports) | analytics/kpi, analytics, reports, reports/monthly_pdf, reports/export_excel, andon-board |
| 5 | **ความปลอดภัย & IoT** (Safety & IoT) | safety/work_permit, iot/monitor |
| 6 | **บุคลากร** (People) | users, roles, register |
| 7 | **ระบบ & ตั้งค่า** (System & Settings) | notifications, notifications/history, settings/notifications, settings(+menus, services, pwa, design, repair-options), editor/builder, pages |

Group headers: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
Active item: `bg-primary text-primary-foreground rounded-lg`; hover:
`hover:bg-accent`. Icons: single lucide icon per item, 18px, strokeWidth 1.75.
The deepest-match highlight rule and role-based mobile bottom-nav mapping are
preserved verbatim from the current layout.

---

## 7. Component Visual Language

### Buttons (`components/ui/button.tsx`)

| Variant | Look |
|---|---|
| primary (default) | solid `bg-primary text-white hover:bg-primary-hover`, rounded-lg, h-10 (sm h-9), font-medium |
| secondary | `border border-border bg-secondary text-foreground hover:bg-accent` |
| outline | `border border-border bg-transparent hover:bg-secondary` |
| ghost | transparent, `hover:bg-secondary` |
| destructive | solid `bg-destructive text-white hover:opacity-90` |

Sizes: `sm` 36px / `md` 40px / `lg` 48px / `icon` 40×40. Icon-only buttons
always carry `aria-label`. One primary action per view; others secondary/ghost.

### Tables

- Wrapper card: `rounded-xl border bg-card`; table itself `text-sm`.
- Header row: sticky (`sticky top-0 z-10 bg-muted/60 backdrop-blur-none`),
  uppercase small headers per §3.
- Rows: `hover:bg-primary-light/60 transition-colors`; zebra OFF.
- Numeric columns right-aligned `tabular-nums`; row action column right,
  ghost icon buttons.
- Mobile (<640px): DataTable switches to card stacking with `data-label`
  column captions (behavior inherited from CardTableLabels).

### Forms

- shadcn Form pattern: `FormField` + `FormLabel` + `FormControl` +
  `FormDescription` + `FormMessage`; grouped in cards per §5.
- Inputs: h-10, rounded-lg, `border-input`, focus ring `ring-ring/30` +
  `border-ring`. Required: red asterisk after label. Hints are
  `FormDescription` (muted), errors `FormMessage` (destructive).
- Selects: Radix Select; native-feel chevron; same height as inputs.

### Feedback

- Toasts: existing `ToastProvider` restyled to tokens (white card, colored
  icon chip, progress bar in status color).
- Empty states: centered icon-in-circle + title + description + optional CTA
  (`components/ui/empty-state.tsx`).
- Loading: skeleton blocks (`ui/skeleton.tsx`) matching final layout shapes;
  page-level `(dashboard)/loading.tsx` shows header + table skeletons.
- Dialogs: `rounded-xl p-0 overflow-hidden`, header/title/description/footer
  paddings p-5/p-6; overlay `bg-black/50`; scale-fade animation 150ms.

### Motion

- Durations 120–200ms, `ease-out`. Respect `prefers-reduced-motion` and the
  existing `html.cmms-no-anim` kill-switch. No entrance choreography stagger —
  at most a single 160ms fade/slide on page content.

### Icons

lucide-react only (heroicons remain only inside legacy files until those files
are converted). 16–20px, strokeWidth 1.75, `aria-hidden` when decorative.

---

## 8. Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Use tokens/utilities from this spec | Hard-code hex values in TSX |
| One `<h1>` per page via PageShell | Multiple hero headers per page |
| Cards for grouping content | Raw bordered divs as pseudo-cards |
| Ghost icon buttons for row actions | Colored pill buttons per row |
| `text-destructive` asterisk for required | "จำเป็น" suffix text |
| Keep data hooks untouched while restyling JSX | Refactor fetch logic "while we're here" |

---

## 9. Component Inventory Contract (Stage 1–3 outputs)

Pages may import ONLY from these (plus React/Next/lib code):

```
@/components/ui/*        button, card, badge, alert, input, textarea, select,
                         dialog(+alert-dialog), tabs, switch, checkbox, label,
                         separator, breadcrumb, avatar, dropdown-menu,
                         popover, calendar, toggle-group, pagination,
                         skeleton, spinner, empty-state, page-header,
                         form-field, table, tooltip, scroll-area, sheet,
                         command
@/components/layout/*    Stack, VStack, HStack, Grid, Center, Section
@/components/DataTable   TanStack-based table wrapper (sticky header, mobile
                         stacking, optional toolbar/pagination)
@/components/PageShell   breadcrumb + title + description + actions skeleton
@/components/AnimatedDialog  Radix dialog wrapper w/ exit animation
```

Legacy Astryx imports have no replacement shim — pages must be rewritten, not
aliased.

