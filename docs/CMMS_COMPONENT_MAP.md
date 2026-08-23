# CMMS-TOPPAN — Component Map

> **Companion document to `CMMS_UI_AUDIT.md`.**
> This is the **inventory of every reusable UI component** in the
> application, classified by scope (global / module / page),
> duplication, and recommended migration target.

---

## 1. How to read this document

| Column | Meaning |
|---|---|
| **Class** | The CSS class name(s) used in PHP pages |
| **Defined in** | Which CSS file (if any) contains the styling |
| **Used by** | Approximate count of PHP pages that reference it |
| **Scope** | G = Global · M = Module · P = Page · D = Duplicate |
| **Status** | ✅ Canonical · ⚠ Mixed · ❌ Undefined · 🟢 Optional / new |
| **Notes** | Free-form observation, includes current visual recipe and what it should become |

---

## 2. Global Components (used by 10+ pages)

### 2.1 Layout / Shell

| Class | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.flex.h-screen.overflow-hidden` (root) | `header.php` | All | G | ✅ | Stable |
| `<aside id="sidebar">` | `sidebar.php` | All | G | ✅ | Stable, 5 collapsible groups, accent-active highlight |
| `.menu-group` / `.menu-group-toggle` | sidebar.php + `ui-polish.css` | All | G | ✅ | Accordion + localStorage persistence |
| `<header class="desktop-topbar">` | `header.php` | All ≥ 1024 px | G | ✅ | Sticky, contains search trigger, theme toggle, lang switcher, user menu |
| `<header class="mobile-app-bar">` (+ `-inner`, `-btn`, `-logo`, `-title`, `-lang`, `-theme`) | `mobile-shell.css` | All < 1024 px | G | ✅ | Native app shell, sticky, 56 px tall + safe-area |
| `<nav class="hp-mobile-bottom-nav">` (+ `.hp-mobile-nav-item`) | `mobile-shell.css` + `footer.php` | All < 1024 px | G | ✅ | Role-driven, persisted in DB |
| `#quick-search-modal` (Ctrl/Cmd+K) | `ui-polish.css` + `cmms-ui-engine.js` | All (JS) | G | ✅ | Indexes the sidebar at runtime, has dark-mode aware overlay |
| `#toast-container` + `.cmms-toast` | `ui-polish.css` + `cmms-ui-engine.js` | All (JS) | G | ✅ | Slide-in toast, progress timer, max 5 at once |

### 2.2 Page header (heading + actions)

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border mb-6">` + `<h1 class="text-2xl font-semibold text-primary tracking-tight">` | ~80 | G | ⚠ | "Good" recipe, but not yet adopted everywhere |
| `<div class="flex items-center justify-between flex-wrap gap-2">` + `<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">` | ~30 | G | ❌ | Raw slate — must migrate to `text-primary` |
| `.cmms-section` + custom h1 | `pm_am/calendar.php` | M | ⚠ | Uses `cmms-section` but custom H1 |
| `<div class="space-y-6">` + `<div class="cmms-section ...">` | several settings pages | M | ⚠ | Same |
| `<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">` (banner card) + H1 inside | `spare_parts/index.php`, `iot/monitor.php` | M | ⚠ | Looks like a card, not a header — confusing |
| **Target**: single `.cmms-page-header` (h1 + description + actions, optional breadcrumbs) | **Target: all 149** | G | 🟢 | To be created |

### 2.3 Card

| Recipe | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.card` (daisy-compat) | `daisy-compat.css` | ~30 | G | ⚠ | `bg-background-card`, `border`, `radius-container`, `shadow-low` |
| `.cmms-card` (ui-polish) | `ui-polish.css` | ~10 | G | ⚠ | Same visual + hover accent |
| `.bg-white.border-slate-200.rounded-xl.shadow-sm` (raw) | inline | ~60 | G | ❌ | No dark mode, no token |
| `.bg-white/80.dark\:bg-slate-800/80.backdrop-blur-xl` (glassmorphism) | inline | dashboard only | P | 🟢 | Intentional KPI tile style |
| **Target**: single `.card` with optional `.card-elevated` (more shadow) and `.card-stat` (KPI gradient) | **Target: all** | G | 🟢 | Merge `.card` + `.cmms-card` |

### 2.4 Data table

| Recipe | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.table-wrap` + `.data-table` (mobile-shell) | `mobile-shell.css` | ~30 | G | ⚠ | Uppercase header, hover, zebra via `ui-polish` |
| `class="min-w-full divide-y divide-slate-200"` (raw Tailwind) | inline | ~15 | G | ❌ | No hover, no zebra, no dark mode |
| `.table-shadcn` (daisy-compat) | `daisy-compat.css` | ~3 | G | 🟢 | Almost unused — keep as an alternative, or remove |
| **Target**: single `.data-table` with `.cmms-stack-table` opt-in for mobile stacking (already exists, not adopted) | **Target: all listings** | G | 🟢 | Already 80% there |

### 2.5 Pagination

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `src/components/pagination.php` (`renderPagination()`) — limit selector + prev/next + page numbers | ~10 pages | G | ✅ | Beautiful, reusable, but underused |
| Hand-rolled pagination in `repair/index.php` | 1 | M | ⚠ | Slightly different visual; should adopt the shared component |
| **Target**: ensure all listings use `renderPagination()` | **Target: ~20** | G | 🟢 | |

### 2.6 Form sections / labels / inputs / buttons (the BROKEN family)

| Class | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.form-section` | **NOWHERE** | ~15 (incl. `repair/create.php` × 41 hits) | G | ❌🔴 | Falls back to browser default — invisible bug |
| `.form-section-title` | **NOWHERE** | ~15 | G | ❌🔴 | Same |
| `.form-grid` | **NOWHERE** | ~15 | G | ❌🔴 | Same |
| `.form-label` | **NOWHERE** | ~15 | G | ❌🔴 | Same |
| `.req` (required indicator) | **NOWHERE** | ~15 | G | ❌🔴 | Same |
| `<input>` / `<select>` / `<textarea>` (bare, no class) | — | ~50% of pages | G | ❌ | Renders with browser default style |
| `.input` / `.input-bordered` / `.select-field` | `daisy-compat.css` | ~20 | G | ⚠ | 40-px tall, radius-element, focus ring — good, just underused |
| `textarea.input` | `daisy-compat.css` | some | G | ✅ | 96-px min-height |
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-outline` / `.btn-ghost` / `.btn-sm` / `.btn-lg` | `daisy-compat.css` | All | G | ⚠ | Self-sufficient variants, but inconsistently color-overridden |
| `.btn-primary` color override (`bg-rose-600 border-rose-600`, `bg-purple-700 border-purple-700`, etc.) | inline Tailwind | many | G | ❌ | Defeats the design system — should use semantic variants |
| **Target**: define the form family (`.form-section`, `.form-section-title`, `.form-grid`, `.form-label`, `.form-hint`, `.form-error`, `.form-actions`, `.req`, `.form-checkbox`, `.form-radio`, `.textarea-field`) and add semantic button variants (`.btn-danger`, `.btn-success`) | **Target: all forms** | G | 🟢 | **Step 0 of the migration — highest impact** |

### 2.7 Status / priority badges

| Class | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.badge` (base, gray) | `daisy-compat.css` | every page with status | G | ✅ | Pill, radius-full, gap-1.5 |
| `.badge-success` / `.badge-active` | `daisy-compat.css` | some | G | ⚠ | Two names for the same color |
| `.badge-info` | `daisy-compat.css` | some | G | ⚠ | One name, multiple underlying colors |
| `.badge-warning` | `daisy-compat.css` | some | G | ⚠ | |
| `.badge-error` / `.badge-destructive` | `daisy-compat.css` | some | G | ⚠ | Two names for the same color |
| `.badge-secondary` / `.badge-default` | `daisy-compat.css` | some | G | ⚠ | Same |
| `.badge-inactive` | `daisy-compat.css` | some | G | ✅ | Good |
| `.badge-in_progress` | `mobile-shell.css` | repair pages | M | ⚠ | Underscore in name (inconsistent with other kebab-case) |
| `.badge-open` / `.badge-critical` / `.badge-low` / `.badge-medium` / `.badge-high` | inline in pages | M | ❌ | Defined locally in PHP — should move to CSS |
| `class="badge bg-indigo-100 text-indigo-800"` / `bg-blue-100 text-blue-800` / `bg-green-100 text-green-800` / etc. (raw Tailwind) | inline | ~30 | G | ❌ | **The biggest color-drift problem** |
| **Target**: one canonical `.badge.status-{key}` (9 repair statuses + 4 PM statuses + 2 asset statuses + 2 spare statuses) and `.badge.priority-{key}` (4 priorities) with a documented palette mapped to the Astryx color family | **Target: every page** | G | 🟢 | **Step 7 of the migration** |

### 2.8 Filter bar / Search

| Class | Defined in | Used by | Scope | Status | Notes |
|---|---|---|---|---|---|
| `.filter-bar` (mobile-shell) | `mobile-shell.css` | some | G | ⚠ | Has `:focus-within` accent |
| `<div class="bg-white p-4 rounded-xl border-slate-200 shadow-sm">` (raw) | inline | ~10 | G | ❌ | No focus accent, no dark mode |
| `.search-input-wrap` / `.search-icon` (mobile-shell) | `mobile-shell.css` | some | G | ✅ | |
| `<input class="input input-bordered">` (daisy-compat) | inline | some | G | ⚠ | OK but inconsistent |
| `src/components/search_form.php` | PHP partial | `asset_registry/index.php` | M | 🟢 | Reusable, but only used in 1 place |
| **Target**: one `.cmms-filter-bar` with built-in clear-all + chips for active filters + `.cmms-search-input` | **Target: all listings** | G | 🟢 | Step 5 of the migration |

### 2.9 Modal

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `<div id="..." class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm ...">` + `<div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">` | ~15 | G | ⚠ | Inconsistent close mechanisms |
| `<div class="fixed inset-0 z-50 bg-overlay backdrop-blur-xs">` + `<div class="bg-surface rounded-md shadow-med border border-border">` | ~10 | G | ⚠ | More semantic but not used everywhere |
| **Target**: single `.cmms-modal` with overlay, header, body, footer, close button, focus trap, ESC to close | **Target: all modals** | G | 🟢 | Step 8 of the migration |

### 2.10 Alert / Banner

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `.alert` / `.alert-success` / `.alert-info` / `.alert-warning` / `.alert-error` (daisy-compat) | some | G | ✅ | Good, just underused |
| `class="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-md text-sm mb-4"` (raw) | ~10 | G | ❌ | Reinvents the wheel |
| `class="bg-success/10 border border-success/30 text-success ..."` | ~5 | G | ❌ | Same |
| **Target**: keep `.alert`, add `.cmms-banner` (in-page info banner with icon + title + close), wire `?msg=` query → `showToast` automatically | **Target: all pages** | G | 🟢 | Step 9 of the migration |

### 2.11 Empty state

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `.empty-state` / `.empty-state-icon` / `.empty-state-title` / `.empty-state-desc` (mobile-shell) | some | G | ✅ | Has icon, title, description, action |
| `<div class="p-6 text-center text-slate-400 font-bold">✅ ไม่มี...</div>` (raw) | ~20 | G | ❌ | No icon, no structure |
| **Target**: keep `.empty-state`, add `.cmms-empty-state-illustration` variant for richer illustrations | **Target: all listings** | G | 🟢 | Step 10 |

### 2.12 Action link in table (ดู / แก้ไข / ลบ)

| Class | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `.action-link` / `.action-link-view` / `.action-link-edit` / `.action-link-delete` (mobile-shell) | some | G | ✅ | Color: blue, amber, red |
| `class="btn btn-sm text-blue-600 border-blue-200 hover:bg-blue-50"` (raw) | many | G | ⚠ | Reinvents |
| **Target**: keep `.action-link`, also accept it on `.btn.btn-sm` via attribute selector `.btn-sm[role="action"]` | **Target: all tables** | G | 🟢 | |

### 2.13 Loading / Skeleton

| Class | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| (none) | 0 | G | ❌ | No skeleton component exists — pages go blank while loading |
| **Target**: add `.cmms-skeleton` (animated pulse bar) + `.cmms-spinner` (indeterminate spinner) | **Target: all pages** | G | 🟢 | Step 10 |

### 2.14 Stat / KPI tile

| Recipe | Used by | Scope | Status | Notes |
|---|---|---|---|---|
| `<div class="bg-white/80 backdrop-blur-xl border border-white/20 shadow-lg p-5 rounded-2xl ...">` + 4 KPI cards (dashboard) | 1 | P | 🟢 | Beautiful, intentional — keep |
| `<div class="cmms-stat-card">` + `.cmms-stat-label` / `.cmms-stat-value` / `.cmms-stat-hint` (ui-polish) | a few | G | ✅ | Underused |
| **Target**: use `.cmms-stat-card` everywhere, keep the dashboard's gradient variant as a special case | **Target: dashboards** | G | 🟢 | Step 11 |

---

## 3. Module-level Components

### 3.1 Repair (16 pages, the largest module)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Status pipeline (8 statuses) | `index.php`, `tracking.php`, `view.php`, `kanban.php`, `my_tasks.php`, dashboard | 🔴 High priority | Inconsistent badge colors across pages |
| Work-order number format (`EN-{YYMM}-{NNN}`) | all repair pages + dashboard | ✅ | Generated by `formatWorkOrderNo()` in `layout.php` |
| Status-transition buttons (รับทราบ / เริ่มงาน / รออะไหล่ / เสร็จ / มอบหมาย) | `index.php`, `view.php` | ⚠ | Hard-coded per status with raw Tailwind colors |
| Kanban columns | `kanban.php` | 🟢 | Page-specific, fine as-is |
| Repair request form (LINE LIFF) | `request.php` | 🔴 | Uses inline Tailwind CDN + custom glassmorphism — needs to migrate onto the shared form components |
| Checksheet / F-EN-03 form | `create.php` (22 KB), `edit.php` (32 KB), `view.php` (28 KB) | 🔴 | Long forms, will benefit massively from `.form-section` |
| Shift handover | `shift_handover.php` | 🟢 | Page-specific |
| SLA control | `sla_control.php` | 🟢 | Page-specific |
| AI Copilot | `copilot.php` | 🟢 | Page-specific |

### 3.2 PM/AM (11 pages)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Calendar grid | `calendar.php` | 🟢 | Page-specific, complex |
| Checksheet document | `checksheet.php` (27 KB) | 🟠 | Long checklist execution, needs standardization |
| Checklist templates | `checklist_templates.php`, `checklist_items.php` | 🟢 | Page-specific |
| Batch schedule wizard | `batch_schedule.php` | 🟢 | Page-specific |
| PM stats chips (4 frequency types) | `index.php`, `calendar.php` | ⚠ | Inconsistent: `bg-green-100` vs `bg-blue-100` vs `.cmms-card p-4` |

### 3.3 Spare parts (11 pages)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Stock table | `index.php` (large, with Sage 300 column) | 🔴 | Uses raw Tailwind `min-w-full divide-y divide-slate-200` — must migrate to `.data-table` |
| Sage 300 sync wizard | `sage_sync.php` (22 KB) | 🟠 | Step-by-step, needs the new card + stepper components |
| Issue center (counter + queue) | `issue_center.php` (27 KB) | 🟠 | Counter form + queue table, needs form + table standardization |
| Sage PO selector | `sage_po.php` | 🟢 | Page-specific |
| Reorder list | `reorder.php` | 🟢 | Page-specific |
| Barcode scan | `scan.php` | 🟢 | Page-specific |
| Optimisation report | `optimization.php` | 🟢 | Page-specific |
| Reservations | `reservations.php` | 🟢 | Page-specific |

### 3.4 Asset registry (14 pages)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Asset list | `index.php` | 🔴 | Uses `search_form.php` + raw Tailwind table — minor fixes needed |
| Asset form (F-EN-01) | `create.php` (12 KB), `edit.php` (14 KB) | 🔴 | Long forms, need `.form-section` |
| BOM tree | `bom_tree.php` (7 KB) | 🟢 | Page-specific |
| OEE dashboard | `oee_dashboard.php` (10 KB) | 🟠 | Charts + KPI tiles — standardize tiles |
| Cost dashboard | `cost_dashboard.php` (8 KB) | 🟠 | Same |
| Asset analytics 360 | `asset_analytics.php` (16 KB) | 🟠 | Many cards — standardize |
| Plant map | `plant_map.php` (7 KB) | 🟢 | Page-specific |
| Criticality matrix | `criticality.php` (5 KB) | 🟢 | Page-specific |
| History | `history.php` (8 KB) | 🟠 | Standardize table |
| QR batch + sticker | `qr_batch.php` (3 KB), `qr_sticker.php` (4 KB) | 🟢 | Print-focused, fine |
| Delete | `delete.php` | 🟢 | Trivial |

### 3.5 Calibration (9 pages)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Calibration list | `index.php` (10 KB) | 🟠 | Standardize table |
| Calibration form | `create.php` (9 KB), `edit.php` (10 KB) | 🔴 | Need `.form-section` |
| Calendar | `calendar.php` (5 KB) | 🟢 | Page-specific |
| History | `history.php` (9 KB) | 🟠 | Standardize |
| Mark complete | `mark_complete.php` | 🟢 | Trivial |
| PO | `po.php` (11 KB) | 🟠 | Standardize |
| Points | `points.php` (12 KB) | 🟠 | Standardize |
| Delete | `delete.php` | 🟢 | Trivial |

### 3.6 Users / Roles / Permissions (7 + 4 pages)

| Component | Used by | Status | Notes |
|---|---|---|---|
| User list | `users/index.php` | 🟠 | Standardize table |
| User form | `users/create.php` (6 KB), `edit.php` (10 KB) | 🔴 | Need `.form-section` |
| Role / permission matrix | `users/roles.php` (28 KB) | 🟠 | Complex grid, standardize row + header |
| Skills | `users/skills.php` (5 KB) | 🟠 | Standardize |
| Leaderboard | `users/leaderboard.php` (7 KB) | 🟠 | Standardize |
| Role CRUD | `roles/index.php`, `create.php`, `edit.php`, `delete.php` | 🟠 | Standardize |

### 3.7 Settings (42 pages — the biggest module)

| Component | Used by | Status | Notes |
|---|---|---|---|
| Settings hub (9 categories × N sub-items) | `settings/index.php` (17 KB) | 🟠 | Standardize the hub card grid |
| Branding uploader | `settings/branding.php` (44 KB) | 🔴 | Largest page in app, mostly raw Tailwind |
| Notification center | `settings/notification_center.php` (22 KB) | 🟠 | Tabs + cards |
| Smart rules config | `settings/smart_rules_config.php` (13 KB) | 🟠 | Forms + tables |
| Sage 300 config | `settings/sage300_config.php` (14 KB) | 🟠 | Forms |
| Line config | `settings/line_config.php` (12 KB) | 🟠 | Forms |
| Line rich menu | `settings/line_richmenu.php` (8 KB) | 🟠 | Forms + preview |
| Module switches | `settings/module_switches.php` (12 KB) | 🟠 | Toggles + cards |
| Executive dashboard config | `settings/executive_dashboard.php` (9 KB) | 🟠 | Drag-and-drop widget config |
| Health | `settings/health.php` (15 KB) | 🟠 | Status cards |
| Data governance | `settings/data_governance.php` (4 KB) | 🟠 | Standardize |
| Audit trail | `settings/audit_trail.php` (5 KB) | 🟠 | Table |
| Version control | `settings/version_control.php` (5 KB) | 🟠 | Table |
| Security | `settings/security.php` (5 KB) | 🟠 | Forms |
| User permissions | `settings/user_permissions.php` (9 KB) | 🟠 | Matrix |
| Flex form builder | `settings/flex_builder.php` (26 KB) | 🟢 | Out of scope (GrapesJS-driven) |
| UI showcase | `settings/ui_showcase.php` (9 KB) | 🟢 | Internal demo page |
| Spare config / repair config / pm config / calibration config | 4 small config pages | 🟠 | Standardize |
| Repair codes, failure codes, repair types, repair tags, rejection reasons, borrowing reasons, locations, work zones, departments, plants, holidays, spare part groups, spare part units | 13 master-data CRUD pages | 🟠 | Standardize the shared list+form pattern |
| Email notifications, ISO forms, organizational chart, checklist templates | 4 misc settings | 🟠 | Standardize |

### 3.8 Analytics (7 pages)

| Page | Status | Notes |
|---|---|---|
| `bi_warehouse.php` (4 KB) | 🟠 | Cards + charts |
| `cost_breakdown.php` (5 KB) | 🟠 | |
| `esg_carbon.php` (6 KB) | 🟠 | |
| `oee.php` (6 KB) | 🟠 | |
| `predictive.php` (4 KB) | 🟠 | |
| `rca.php` (11 KB) | 🟠 | 5-Why & Fishbone diagram |
| `tco.php` (5 KB) | 🟠 | |

All analytics pages use Chart.js (`chart.min.js`, 205 KB) with hand-rolled canvas wrappers — they are visually consistent with each other, just need to align with the global card + heading standards.

### 3.9 Other modules

| Module | Pages | Status | Notes |
|---|---|---|---|
| IoT | `iot/monitor.php` (5 KB) | 🟠 | Sensor cards |
| QR | `qr/scanner.php` (6 KB) | 🟢 | Page-specific (camera-based) |
| Safety | `safety/work_permit.php` (12 KB) | 🟠 | LOTO permit form |
| Approval | `approval/center.php` (14 KB) | 🟠 | Approval queue + filters |
| Notifications | `notifications/center.php` (7 KB) | 🟠 | List + filters |
| MTBF/MTTR | 4 pages | 🟠 | CRUD |
| Equipment borrowing | 4 pages | 🟠 | CRUD |
| Manuals | 7 pages | 🟠 | CRUD + KB + chatbot |
| Suppliers | 5 pages | 🟠 | CRUD + rating |
| Reports | 3 pages | 🟢 | Export-only |
| Equipment_borrowing | 4 pages | 🟠 | CRUD |
| Mtbf_mttr | 4 pages | 🟠 | CRUD |

---

## 4. Page-specific Components (intentionally unique)

These are kept as-is because they serve a single page and don't have
duplicates:

| Page | Component | Notes |
|---|---|---|
| `/` (dashboard) | 8-card gradient pipeline + tab navigation (operational / tactical / executive) | Brand-level KPI showcase |
| `pages/repair/kanban.php` | Kanban board (5 columns, drag-drop) | Power-user view |
| `pages/repair/shift_handover.php` | Shift handover card | Operational |
| `pages/repair/sla_control.php` | SLA timer | Operational |
| `pages/repair/copilot.php` | AI assistant | AI feature |
| `pages/pm_am/calendar.php` | Calendar grid | Calendar |
| `pages/pm_am/checksheet.php` | Checksheet document | Long checklist execution |
| `pages/pm_am/batch_schedule.php` | Batch schedule wizard | Wizard |
| `pages/asset_registry/bom_tree.php` | BOM tree | Hierarchical |
| `pages/asset_registry/plant_map.php` | Plant map | Visual |
| `pages/asset_registry/criticality.php` | Criticality matrix | A/B/C classification |
| `pages/asset_registry/oee_dashboard.php` | OEE dashboard | KPI dashboard |
| `pages/asset_registry/cost_dashboard.php` | Cost dashboard | KPI dashboard |
| `pages/asset_registry/asset_analytics.php` | Analytics 360 | KPI dashboard |
| `pages/calibration/calendar.php` | Calibration calendar | Calendar |
| `pages/calibration/points.php` | Measurement points | Hierarchical |
| `pages/calibration/po.php` | Calibration PO | Workflow |
| `pages/spare_parts/scan.php` | Barcode scanner | Camera-based |
| `pages/spare_parts/sage_sync.php` | Sage 300 sync wizard | Wizard |
| `pages/spare_parts/sage_po.php` | Sage PO selector | Wizard |
| `pages/spare_parts/issue_center.php` | Issue counter + queue | Workflow |
| `pages/spare_parts/reorder.php` | Reorder list | Operational |
| `pages/spare_parts/optimization.php` | Optimization report | AI report |
| `pages/spare_parts/reservations.php` | Reservations | Operational |
| `pages/qr/scanner.php` | QR scanner | Camera-based |
| `pages/iot/monitor.php` | IoT monitor | Real-time |
| `pages/safety/work_permit.php` | LOTO permit | Workflow |
| `pages/approval/center.php` | Approval queue | Workflow |
| `pages/notifications/center.php` | Notification list | Operational |
| `pages/manuals/quickstart.php` | Quickstart guide | Content |
| `pages/manuals/knowledge_base.php` | KB | Content |
| `pages/manuals/sop_chatbot.php` | SOP chatbot | AI feature |
| `pages/reports/export.php`, `export_excel.php`, `monthly_pdf.php` | Report exports | Export only |
| `pages/settings/branding.php` | Branding uploader + live preview | Admin |
| `pages/settings/flex_builder.php` | GrapesJS form builder | Builder (out of scope) |
| `pages/settings/notification_center.php` | Notification config | Admin |
| `pages/settings/line_richmenu.php` | LINE rich menu builder | Admin |
| `pages/settings/sage300_config.php` | Sage 300 connection | Admin |
| `pages/settings/smart_rules_config.php` | Smart rules | Admin |
| `pages/settings/module_switches.php` | Feature switches | Admin |
| `pages/settings/audit_trail.php` | Audit log | Admin |
| `pages/settings/version_control.php` | Document versions | Admin |
| `pages/settings/data_governance.php` | Data governance | Admin |
| `pages/settings/health.php` | System health | Admin |
| `pages/settings/security.php` | Security | Admin |
| `pages/settings/user_permissions.php` | Permission matrix | Admin |
| `pages/settings/executive_dashboard.php` | Dashboard widget config | Admin |
| `pages/settings/ui_showcase.php` | UI showcase (internal) | Demo |
| `pages/settings/checklist_templates.php` | Checklist templates | Admin |
| `pages/settings/iso_forms.php` | ISO forms | Content |
| `pages/settings/organizational_chart.php` | Org chart | Visual |
| `pages/users/roles.php` | Role / permission matrix | Admin |
| `pages/users/skills.php` | Skills matrix | Admin |
| `pages/users/leaderboard.php` | Leaderboard | Gamification |
| `pages/analytics/bi_warehouse.php` | BI warehouse | Reports |
| `pages/analytics/cost_breakdown.php` | Cost breakdown | Reports |
| `pages/analytics/esg_carbon.php` | ESG carbon | Reports |
| `pages/analytics/oee.php` | OEE | Reports |
| `pages/analytics/predictive.php` | Predictive | Reports |
| `pages/analytics/rca.php` | RCA (5-Why + Fishbone) | Reports |
| `pages/analytics/tco.php` | TCO | Reports |
| `pages/suppliers/supplier_rating.php` | Supplier rating | Reports |
| `pages/mtbf_mttr/...` | MTBF/MTTR CRUD | Master data |
| `pages/equipment_borrowing/...` | Equipment borrowing CRUD | Master data |

---

## 5. Component Migration Targets (the canonical "v2" set)

After the migration, **every page should use these classes exclusively**
for the listed purpose. Any deviation is a bug.

### 5.1 Layout
- `.cmms-page-header` — title + description + breadcrumbs + actions
- `.cmms-section` — a scrollable group inside a page
- `.card` (single canonical) — container for grouped content
- `.card-elevated` — more shadow, used for "feature" cards
- `.card-stat` — KPI tile (with optional gradient)

### 5.2 Tables
- `.data-table` — the only data table style
- `.cmms-stack-table` — opt-in for mobile card stacking (use `data-label` on `<td>`)
- `renderPagination()` from `src/components/pagination.php`

### 5.3 Forms
- `.form-section` — visual group with title + body
- `.form-section-title` — group title
- `.form-grid` — auto-fit grid for form fields
- `.form-label` — field label
- `.form-hint` — helper text below the input
- `.form-error` — error message
- `.req` — required-field indicator (asterisk)
- `.form-actions` — sticky action bar at the bottom
- `.input` / `.select-field` / `.textarea-field` — all inputs
- `.form-checkbox` / `.form-radio` — checkboxes & radios
- `.btn` + variants (see below)

### 5.4 Buttons
- `.btn` (base)
- `.btn-primary` — main action
- `.btn-secondary` — alternative action
- `.btn-ghost` — tertiary action
- `.btn-danger` — destructive (delete, reject)
- `.btn-success` — confirmation (approve, complete)
- `.btn-outline` — secondary outline
- `.btn-link` — link-styled
- `.btn-sm` / `.btn-lg` / `.btn-icon` — sizes
- All variants respect `disabled` and have a focus ring

### 5.5 Status & Priority
- `.badge` (base)
- `.badge.status-{key}` for: `open`, `acknowledged`, `in_progress`, `waiting_parts`, `waiting_approval`, `resolved`, `closed`, `cancelled`, `rejected` (repair) + `pending`, `in_progress`, `completed`, `overdue` (PM) + `active`, `inactive`, `under_repair`, `disposed` (asset) + `in_stock`, `low_stock` (spare)
- `.badge.priority-{key}` for: `low`, `medium`, `high`, `critical`

### 5.6 Feedback
- `.alert` / `.alert-{success|info|warning|error}` (kept from daisy-compat)
- `.cmms-banner` — in-page info banner with icon + close
- `.cmms-toast` (already in place, just use it more)
- `.cmms-empty-state` — for "no data" scenarios
- `.cmms-skeleton` / `.cmms-spinner` — loading

### 5.7 Filters & Search
- `.cmms-filter-bar` — wraps a filter form, includes `:focus-within` accent
- `.cmms-search-input` — wraps `<input>` + icon
- `.cmms-filter-chip` — active-filter chip with ✕ to remove
- `.cmms-filter-clear` — clear-all button

### 5.8 Modals
- `.cmms-modal` — overlay
- `.cmms-modal-panel` — panel
- `.cmms-modal-header` / `-body` / `-footer`
- Focus trap + ESC to close (via `cmms-ui-engine.js`)

### 5.9 Navigation
- `.cmms-breadcrumb` — breadcrumb (new)
- `.cmms-action-bar` (already exists) — sticky bottom bar on mobile
- `.cmms-fab` (already exists) — floating action button

---

## 6. Component Status Summary

| Bucket | Count | Status |
|---|---|---|
| Already-canonical global components | ~12 | ✅ |
| Components that need standardization (mixed recipes) | ~18 | ⚠ |
| Components that are broken / undefined (`.form-section` family) | 6 | ❌🔴 |
| Components that exist but are unused (`.tabs-shadcn-*`, `.cmms-stack-table`) | ~5 | 🟢 |
| Page-specific components (intentionally unique) | ~50 | 🟢 |
| **Total unique components** | **~90** | — |

**Of these, ~24 need active work** (⚠ and ❌). The rest are either
already canonical, intentionally unique, or already exist as a
`v2` alternative waiting to be adopted.
