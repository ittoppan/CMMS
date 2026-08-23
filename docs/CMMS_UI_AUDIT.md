# CMMS-TOPPAN — UX/UI Audit Report

> **Phase 1 — Read-only inspection of the existing application.**
> No source code was modified during this audit. The goal is to **redesign
> and standardize** the existing UX/UI while preserving all functionality.

---

## 1. Executive Summary

CMMS-TOPPAN is a fully functional, mature Computerized Maintenance
Management System used inside a real factory. It is built primarily on a
**server-rendered PHP + Tailwind + bespoke CSS** stack with a small amount
of vanilla JavaScript. The backend, database, API, authentication,
authorization, business logic, modules, and existing pages are stable and
should not be touched.

The frontend, however, is the cumulative result of **multi-year
incremental development by many authors** using **at least three
competing design dialects at the same time**:

| Dialect                       | Where it lives                                                            | Severity |
|------------------------------|---------------------------------------------------------------------------|----------|
| **Astryx design system**     | `tailwind.config.js`, `css/astryx*.css`, `src/includes/*`, `ui-polish.css` | ⚠ Mixed  |
| **Hard-coded Tailwind colors** (`bg-slate-50`, `text-slate-900`, etc.) | The bulk of `public/pages/**/*.php`                | ❌ High   |
| **Inline `style="..."` legacy** | `public/pages/repair/request.php`, scattered hotspots              | ❌ High   |
| **DaisyUI-style semantic classes** (`btn`, `card`, `badge`, `alert`, `input`) | Used in every page; only partly defined in `css/daisy-compat.css` | ⚠ Mixed  |
| **Astryx/UIKit React prototype** | `frontend/src/app/**` (not used by production pages)             | 🟢 Isolated |

The result is a working app that **looks and feels like several different
products stitched together** — gradient glassmorphism sits next to flat
slate cards, 4-px rounded pills sit next to 1.75 rem container
radiuses, "Submit" buttons come in 7 different sizes, and form labels are
sometimes bold, sometimes muted, sometimes a colored pill.

This audit inventories what is there, classifies it, and proposes a
**migration order that fixes many pages at once by fixing the shared
components first** — so the bulk of the work is in the design system,
not in 149 individual page rewrites.

---

## 2. Project Context

| Property | Value |
|---|---|
| Application name | CMMS-TOPPAN (also referred to internally as CMMS-TPT) |
| Type | Enterprise Computerized Maintenance Management System |
| Industry | Manufacturing (flexible packaging plant) |
| Operating mode | Local server, multi-user, role-based, with LINE LIFF + PWA |
| Default language | Thai (TH), with EN/JP support |
| Host platform | Windows Server / IIS (`web.config` present) |
| Database | MySQL/MariaDB (PDO, see `database/schema.sql`) |
| Source layout | `public/pages/...` for the running app, `src/...` for shared PHP, `public/api/...` for the JSON API |

---

## 3. Phase 1 — Full Project Analysis

### 3.1 Tech stack

| Layer | Technology | Evidence |
|---|---|---|
| **Backend language** | PHP (procedural + light OO) | `*.php` everywhere, `src/services/*.php` |
| **Database access** | PDO (prepared statements) | `src/config/db.php`, every API file |
| **HTTP API** | PHP pages returning JSON | `public/api/v1/*.php` (~45 files) |
| **Auth** | PHP session + CSRF + `src/auth.php` (`requireLogin`, `currentUser`) | `src/includes/layout.php`, `src/auth.php`, `src/csrf.php` |
| **Frontend pages** | Server-rendered PHP with embedded HTML/CSS/JS | `public/pages/**/*.php` (149 files) |
| **CSS engine** | **Tailwind CSS 3** compiled by `tailwindcss` CLI | `package.json`, `tailwind.config.js`, `public/css/app.css` (~212 KB) |
| **Design tokens** | **Astryx Design System** (`@astryxdesign/core`, `@astryxdesign/theme-neutral`) | `package.json`, `css/astryx*.css`, `data-astryx-theme="neutral"` in `<html>` |
| **Component layer** | Hand-rolled CSS + small JS engine | `css/daisy-compat.css`, `public/css/ui-polish.css`, `public/css/mobile-shell.css`, `public/js/cmms-ui-engine.js`, `public/js/app.js` |
| **JS architecture** | Vanilla, two IIFEs (`app.js`, `cmms-ui-engine.js`) | `public/js/app.js`, `cmms-ui-engine.js` |
| **Routing** | File-system routing (one PHP file per page) | Every `*.php` under `public/pages/...` |
| **Layout architecture** | `src/includes/layout.php` → `header.php` + `sidebar.php` + `<main>` + `footer.php` | `src/includes/*` |
| **Component architecture** | Mostly inline HTML; only **two** true PHP partials (`pagination.php`, `search_form.php`) | `src/components/*` |
| **Authentication** | Session cookie (`HttpOnly`, `SameSite=Lax`) + CSRF on all POST/PUT/DELETE | `src/includes/layout.php` |
| **Authorization** | Role-based via `menu_permissions` table + `roles` table; `requireLogin($pdo, $adminOnly)` | `src/auth.php`, `src/includes/layout.php` (bottom-nav) |
| **Database** | MySQL/MariaDB, schema in `database/schema.sql` + 23 migrations | `database/` |
| **Build system** | `npm run build:css` / `npm run watch:css` (Tailwind CLI) | `package.json` |
| **Assets** | `/public/icons/`, `/public/assets/`, `/uploads/...`, PWA `manifest.json` | `public/`, `manifest.json` |
| **PWA** | Service worker registration, app manifest, `mobile-app-bar` + `hp-mobile-bottom-nav` | `header.php`, `mobile-shell.css`, `manifest.json` |

### 3.2 Frontend framework — the truth

There is **no React/Vue/SPA** in production. The reference `frontend/`
folder is a Next.js prototype that is not wired into the running app.
The live app is classic **server-rendered PHP + Tailwind + a thin
hand-rolled CSS/JS component layer**. This is an important fact for the
redesign — every "component" in the design system will be CSS-class
based, not React-based.

### 3.3 Existing design system inventory

| File | Size | Role |
|---|---|---|
| `public/css/astryx.css` | 128 KB | Full Astryx design system (looks like compiled `@astryxdesign/core`) — has both semantic `.astryx-*` classes and the modern CSS reset + tokens |
| `public/css/astryx-reset.css` | 13 KB | CSS reset + base element styling |
| `public/css/astryx-theme-neutral.css` | 19 KB | **Source of truth for design tokens** (colors, spacing, radius, shadow, typography, duration) — defines `--color-text-primary`, `--color-border`, `--radius-container`, `--shadow-low`, etc. |
| `tailwind.config.js` | 2.4 KB | **Maps Astryx CSS variables onto Tailwind utility names** (`bg-surface`, `text-primary`, `border-border`, `bg-muted`, etc.) — this is the bridge that lets every PHP page use `bg-surface` and have it pick up the Astryx token |
| `public/css/app.css` | 212 KB | **Compiled Tailwind** (used by every page) |
| `public/css/daisy-compat.css` | 11.5 KB | **Hand-rolled compatibility layer** for the legacy DaisyUI class names (`btn`, `btn-primary`, `card`, `input`, `badge`, `alert`, `table-shadcn`, `tabs-shadcn`, `chip-btn`, `dropdown-item`) that the existing PHP pages use |
| `public/css/mobile-shell.css` | 8.9 KB | Mobile-specific rules: native app bar, bottom tab nav, form redesign below 768 px |
| `public/css/ui-polish.css` | 19 KB | The "global UX/UI polish layer" — `.cmms-card`, `.cmms-stat-card`, `.cmms-section`, `.cmms-fab`, `.cmms-action-bar`, `.cmms-stack-table`, plus focus rings, dark-mode fixes for legacy `bg-white`/`bg-slate-50`, Quick-Search modal styles, toast styles, sidebar collapse styles, print styles |
| `public/js/cmms-ui-engine.js` | 19.8 KB | Engine v4.1: theme toggle, sidebar mobile drawer, sidebar accordion groups (persisted in localStorage), Ctrl/Cmd+K quick search (built from the sidebar at runtime), toast notifications with progress bar, emergency alarm |
| `public/js/app.js` | 3.8 KB | Engine v4.0: user-profile dropdown, auto-dismiss flash alerts, `data-confirm` confirm handler, count-up animation |

So the **foundation is already in place**. The real problem is that the
existing PHP pages **don't consistently use the foundation** — many
still hand-roll styles with raw Tailwind colors, inline `style="..."`,
or `<svg>` with hardcoded strokes.

---

## 4. Phase 2 — UI Inventory (Page-by-page)

### 4.1 Module → page count

Total PHP pages: **149** (excluding API, login, root helpers).

| Module | Pages | Notes |
|---|---|---|
| `analytics/` | 7 | BI, cost breakdown, ESG, OEE, predictive, RCA, TCO |
| `approval/` | 1 | 1-Click approval center (LINE/Email) |
| `asset_registry/` | 14 | CRUD + analytics + history + BOM + criticality + OEE + plant map + QR + dashboard |
| `calibration/` | 9 | CRUD + calendar + history + points + PO + mark-complete |
| `equipment_borrowing/` | 4 | CRUD |
| `iot/` | 1 | Monitor only |
| `manuals/` | 7 | CRUD + knowledge base + quickstart + SOP chatbot |
| `mtbf_mttr/` | 4 | CRUD |
| `notifications/` | 1 | Center |
| `pm_am/` | 11 | CRUD + batch + calendar + checklist templates + checksheet + complete + view |
| `qr/` | 1 | Scanner |
| `repair/` | 16 | CRUD + tracking + kanban + view + my_tasks + print + request (mobile LIFF) + shift_handover + SLA + dispatch + assign + copilot + history |
| `reports/` | 3 | Export, Excel, monthly PDF |
| `roles/` | 4 | CRUD |
| `safety/` | 1 | Work permit (LOTO) |
| `settings/` | 42 | Every kind of admin: branding, departments, plants, locations, work zones, repair types, failure codes, repair codes, tags, PM templates, holidays, ISO forms, LINE config, smart rules, backup, security, data governance, audit trail, etc. |
| `spare_parts/` | 11 | CRUD + issue center + optimization + reorder + reservations + Sage PO + Sage sync + scan |
| `suppliers/` | 5 | CRUD + rating |
| `users/` | 7 | CRUD + roles + skills + leaderboard |
| **Total** | **149** | |

### 4.2 Per-page component checklist (sample)

For every page I recorded: layout, header pattern, table style, button
style, form style, status badges, filter bar, search, modals, charts,
empty state, mobile behavior. Below is the **canonical pattern that
emerges** — and the deviations from it.

| Component | Canonical pattern (works) | Pages that break the pattern |
|---|---|---|
| **Page header** | `flex justify-between pb-6 border-b` + `<h1 class="text-2xl font-semibold text-primary tracking-tight">` + description + action buttons | `index.php` (uses `font-bold text-slate-900`), `request.php` (uses `Kanit` font + gradient), `spare_parts/index.php` (rounded-xl white banner card) |
| **Status pipeline chips** | `class="badge {status}"` from `daisy-compat.css` | `index.php` uses 8 different gradient/glass cards (beautiful but unique); `spare_parts/index.php` uses raw `bg-indigo-600`, `bg-purple-700` pills |
| **Filter bar** | `.filter-bar` (white surface, 12-px radius, focus-within accent) | Several pages bypass `.filter-bar` and use raw `bg-white border-slate-200 rounded-xl shadow-sm` |
| **Search input** | `.search-input-wrap` + `.search-icon` + `<input>` | Several pages use `<input class="input input-bordered w-64">` instead |
| **Data table** | `.table-wrap` + `.data-table` (or `.table-shadcn`) — uppercase header, hover, zebra via ui-polish | `spare_parts/index.php` uses `min-w-full divide-y divide-slate-200` (slightly different); many others use `min-w-full` (raw Tailwind) |
| **Pagination** | `src/components/pagination.php` (`renderPagination`) — limit selector + page buttons | Some pages hand-roll pagination (`repair/index.php`) — they look different |
| **Status badges** | `badge-{open\|info\|warning\|success\|error\|in_progress\|...}` from `daisy-compat.css` | Inconsistent: some pages hand-roll `bg-green-100 text-green-800`, some use `.badge-success`, some use `.badge-active`, some use `bg-emerald-500/10 text-emerald-400` |
| **Priority badges** | `badge-{low\|medium\|high\|critical}` | `repair/edit.php` and `repair/create.php` use solid `bg-red-500 text-white` pills, others use `.badge-critical` |
| **Form sections** | `.form-section` + `.form-section-title` + `.form-grid` + `.form-label` (`.req` for required) | **These classes are NOT defined anywhere in CSS** — they silently fall back to browser defaults (this is one of the biggest latent bugs) |
| **Form inputs** | Bare `<input>` / `<select>` / `<textarea>` with no class — relies on default browser styling | Several pages add `.input` or `.input-bordered`, most don't |
| **Buttons** | `btn btn-primary` / `btn-secondary` / `btn-ghost` / `btn-sm` / `btn-lg` / `btn-outline` (daisy-compat) | Many pages also add Tailwind colors: `btn btn-primary bg-rose-600 border-rose-600`, `btn btn-primary bg-purple-700 border-purple-700`, etc. — these override the design system color per button |
| **Cards** | `.card` (daisy-compat) **or** `.cmms-card` (ui-polish) — both exist, both have very similar look | Many pages use neither, hand-roll `bg-white border-slate-200 shadow-sm rounded-xl` |
| **Action links in tables** | `.action-link.action-link-view` / `.action-link-edit` / `.action-link-delete` | Several pages use `.btn .btn-sm` + color instead |
| **Modals** | `<div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm ...">` | Inconsistent: bg overlay is `bg-slate-900/50` or `bg-overlay` or `bg-black/60`; panel is `bg-white rounded-2xl shadow-2xl` or `bg-surface rounded-md shadow-med` |
| **Empty states** | `.empty-state` (mobile-shell) + `.empty-state-icon` + `.empty-state-title` + `.empty-state-desc` | Many pages hand-roll their own `<div class="p-6 text-center text-slate-400 font-bold">` (less polished) |
| **Charts** | Chart.js (`chart.min.js`) + custom canvas wrappers | Some pages use Recharts (frontend prototype only) |
| **Notifications** | `<div class="alert alert-{success\|info\|warning\|error}">` (daisy-compat) **or** hand-rolled `bg-error/10 border border-error/30 text-error` | Two coexisting systems; no toast queue (toast is in JS only) |
| **Mobile** | `< 1024 px` → native app bar + bottom tab nav; `< 768 px` → card collapse + form full-width 48 px | Most pages don't opt in to the new patterns; many still rely on raw `lg:hidden md:flex` |

### 4.3 Pages with unique/off-system design (do-not-touch-list for migration order)

These pages have **one-of-a-kind** visual treatment. We **do not
redesign them individually** — we either retire them in favor of the
shared components, or we keep them as "intentional exceptions".

| Page | Unique treatment | Decision for migration |
|---|---|---|
| `public/index.php` (Dashboard) | 8-card gradient glass pipeline, count-up animations, Lucide icons | Keep gradient brand for KPI tiles, but standardize their inner structure (heading + value + hint + sub-label) |
| `public/pages/repair/request.php` | Standalone page using inline Tailwind CDN, Kanit font, SweetAlert2, full custom CSS, glassmorphism | Migrate onto the shared form components + `.form-section` |
| `public/pages/settings/branding.php` (43 KB) | Massive legacy page with raw Tailwind everywhere | Keep, but fix all `bg-slate-*` / `text-slate-*` to semantic tokens |
| `public/pages/settings/flex_builder.php` (26 KB) | Form builder (uses its own DOM) | Out of scope — it builds forms for other modules |
| `public/pages/settings/notification_center.php` (21 KB) | Tabbed admin tool | Standardize tabs + cards |
| `public/pages/spare_parts/sage_sync.php` (22 KB) | Wizard-style sync UI | Standardize stepper + cards |
| `public/pages/spare_parts/issue_center.php` (27 KB) | Counter + queue with approval flow | Standardize forms + tables + alerts |
| `public/pages/users/roles.php` (27 KB) | Permission matrix grid | Keep grid logic, but standardize row + header |
| `public/pages/pm_am/checksheet.php` (27 KB) | Long checklist execution | Standardize list items + sticky action bar |
| `public/pages/repair/edit.php` (32 KB) | Very long single-form page | Will be massively improved just by fixing `.form-section` |
| `public/pages/repair/request.php` (60 KB) | Public repair request form (LINE LIFF) | Will be redesigned using `.form-section`, `.cmms-card`, `.cmms-fab` |
| `public/pages/repair/create.php` (22 KB), `view.php` (28 KB) | Technician workflow | Standardize |
| `public/pages/asset_registry/*.php` (14 pages, some 13–16 KB) | Asset CRUD + analytics | Standardize |

---

## 5. Phase 3 — Component Analysis

### 5.1 Classification

#### A. Global components (used throughout the app)

| Class / pattern | Defined in | Used by | Note |
|---|---|---|---|
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-outline` / `.btn-print` / `.btn-sm` / `.btn-lg` | `daisy-compat.css` | **every page** | Variants, but inconsistently overridden with raw Tailwind colors |
| `.card` (daisy-compat) **and** `.cmms-card` (ui-polish) | both | most pages | Two near-identical components with the same name in different layers — the worst kind of duplicate |
| `.input` / `.input-bordered` / `.select-field` | `daisy-compat.css` | some pages | Often *not* used; raw `<input>` is the more common pattern |
| `.alert` / `.alert-success` / `.alert-info` / `.alert-warning` / `.alert-error` | `daisy-compat.css` | some pages | Frequently hand-rolled with raw Tailwind instead |
| `.badge` + `.badge-{info\|success\|warning\|error\|secondary\|inactive\|active\|in_progress\|critical\|open\|...}` | `daisy-compat.css` | every page that shows status | Naming is fragmented (`badge-in_progress` vs `badge-critical` vs `badge-open`) |
| `.table-wrap` + `.data-table` | `mobile-shell.css` | most listing pages | Header background color: `--color-background-muted` (= `bg-slate-50`) |
| `.table-shadcn` | `daisy-compat.css` | a few pages (notices) | A second table style that is never used in production |
| `.tabs-shadcn-list` / `.tabs-shadcn-trigger` | `daisy-compat.css` | a few pages | Almost unused |
| `.chip-btn` | `daisy-compat.css` | a few pages | Almost unused |
| `.dropdown-menu` / `.dropdown-item` / `.dropdown-divider` | inline in `header.php` + `daisy-compat.css` | only the user menu | The user menu is the only true dropdown in the app |
| `.page-header` / `.page-title` / `.page-desc` | `mobile-shell.css` | most pages | Not always used; some pages hand-roll their own |
| `.filter-bar` | `mobile-shell.css` | some pages | Frequently re-implemented with raw Tailwind instead |
| `.search-input-wrap` / `.search-icon` | `mobile-shell.css` | some pages | Frequently re-implemented |
| `.empty-state` / `.empty-state-icon` / `.empty-state-title` / `.empty-state-desc` | `mobile-shell.css` | a few pages | Many pages hand-roll their own |
| `.action-link` / `.action-link-view` / `.action-link-edit` / `.action-link-delete` | `mobile-shell.css` | tables | Some pages use `.btn` instead |
| `.row-num` / `.col-primary` | `mobile-shell.css` | tables | Minor helpers |
| `.mobile-app-bar` / `.mobile-app-bar-inner` / `.mobile-app-bar-btn` / `.mobile-app-bar-logo` / `.mobile-app-bar-title` / `.mobile-app-bar-lang` / `.mobile-app-bar-theme` | `mobile-shell.css` + `ui-polish.css` | all pages (auto via header.php) | Native app shell for < 1024 px |
| `.hp-mobile-bottom-nav` / `.hp-mobile-nav-item` | `mobile-shell.css` + `footer.php` | all pages (auto) | Role-based bottom tab nav |
| `.menu-group` / `.menu-group-toggle` (collapsible sidebar) | sidebar.php + ui-polish.css | all pages | Persistence via `cmms-ui-engine.js` |
| `.cmms-card` / `.cmms-stat-card` / `.cmms-section` / `.cmms-section-title` / `.cmms-fab` / `.cmms-action-bar` / `.cmms-stack-table` | `ui-polish.css` | a few pages | "V2" components introduced later — not yet widely adopted |
| `.cmms-toast` / `.cmms-toast-icon` / `.cmms-toast-title` / `.cmms-toast-msg` / `.cmms-toast-close` / `.cmms-toast-timer` | `ui-polish.css` + `cmms-ui-engine.js` | all pages (JS) | Toast notification system |
| `#quick-search-modal` / `.qs-panel` / `.qs-result` / `.qs-empty` / `.qs-kbd` / `.qs-arrow` | `ui-polish.css` + `cmms-ui-engine.js` | all pages (JS) | Ctrl/Cmd+K command palette |
| `.theme-icon-moon` / `.theme-icon-sun` | `ui-polish.css` | all pages | Dark mode toggle |
| Astryx tokens (CSS variables `--color-text-primary`, `--radius-container`, `--shadow-low`, etc.) | `astryx-theme-neutral.css` | all pages (via Tailwind config bridge) | The actual source of truth — must be preserved |

#### B. Module-level components (used by multiple pages in one module)

- Repair: status pipeline, action buttons per status (`รับทราบ`, `เริ่มงาน`, `รออะไหล่`, `เสร็จ`), work-order format
- PM/AM: calendar grid (custom in `calendar.php`), checksheet document
- Spare parts: Sage-300 sync wizard, issue center, QR scan
- Asset: BOM tree, criticality matrix, OEE dashboard
- Settings: tabbed control panel, branding uploader, permission matrix

#### C. Page-specific components (only one page)

- `request.php` → full custom glassmorphism form
- `kanban.php` → kanban board columns
- `flex_builder.php` → GrapesJS-like form builder
- `tracking.php` → status timeline
- `shift_handover.php` → shift handover card
- `index.php` (dashboard) → the 8-card gradient pipeline

#### D. Duplicate / inconsistent components (same purpose, different shapes)

| Purpose | Component A | Component B | Which is used? |
|---|---|---|---|
| Card | `.card` (daisy-compat) — white, radius `--radius-container`, `shadow-low` | `.cmms-card` (ui-polish) — white, radius `--radius-container`, custom shadow + hover accent | Both, interchangeably |
| Card | `.bg-white.border-slate-200.rounded-xl.shadow-sm` (raw Tailwind) | above | Many pages |
| Table | `.table-wrap .data-table` (mobile-shell) | `.min-w-full .divide-y .divide-slate-200` (raw Tailwind) | Both |
| Table | `.table-shadcn` (daisy-compat) | above | Almost never used in production |
| Search input | `.search-input-wrap` + `.search-icon` | `<input class="input input-bordered">` | Both |
| Status badge | `.badge .badge-open` | `class="badge bg-blue-100 text-blue-800"` | Both |
| Status badge | `.badge .badge-info` | `class="badge bg-indigo-100 text-indigo-800"` | Both (different colors!) |
| Action link | `.action-link.action-link-view` | `class="btn btn-sm text-blue-600 ..."` | Both |
| Form section | **`.form-section` / `.form-grid` / `.form-label` (USED 41+ times, defined NOWHERE)** | none | This is a latent bug — see § 6.1 |
| Modal | raw `bg-slate-900/50` overlay + `bg-white rounded-2xl` panel | `bg-overlay` overlay + `bg-surface` panel | Both |
| Alert | `.alert .alert-error` | raw `bg-error/10 border border-error/30` | Both |
| Empty state | `.empty-state` (mobile-shell) | raw `<div class="p-6 text-center text-slate-400">` | Both |
| Filter bar | `.filter-bar` (mobile-shell) | raw `<div class="bg-white border-slate-200 rounded-xl p-4">` | Both |
| Page header | `.page-header h1` (mobile-shell) | raw `<div class="flex flex-col sm:flex-row ...">` | Both |
| Sidebar nav item | `str_contains($cs, '/repair/')` active state via `bg-accent/10 text-accent` | none | Consistent (good!) |

---

## 6. Phase 4 — UX/UI Problems

### 6.1 Critical — visible bugs / broken UI

1. **`.form-section` / `.form-grid` / `.form-label` / `.req` are
   undefined.** The classes are referenced in 41+ places (mostly
   `repair/create.php`, `repair/edit.php`, `spare_parts/create.php`,
   etc.) but no CSS rule defines them. They fall back to **raw browser
   defaults** — full-width `<label>` text, no spacing, no required
   indicator, broken form layout. This is the single most impactful
   bug and the cheapest to fix.
2. **`.input` and `.input-bordered` are only used on some pages.** The
   other half of the app uses bare `<input>` / `<select>` with no
   styling, leading to wildly different input heights and borders.
3. **`.bg-overlay` / `bg-overlay` resolves to a color in `ui-polish`
   but to a different color in `daisy-compat` (when used as a
   semantic class on a modal).** The two systems disagree on the
   overlay alpha value.
4. **Dark mode (`html.dark`) is partial.** `ui-polish.css` patches
   `html.dark .bg-white` etc., but if a page uses `.cmms-card` with
   an inline `style="background: var(--color-surface, #ffffff)"` the
   inline color wins and dark mode is broken for that element.

### 6.2 Visual inconsistencies

| Issue | Evidence |
|---|---|
| **Border-radius drift** | Pages mix `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-container`, `radius-inner`, `radius-element`, `radius-container`, `radius-page` (1.75 rem!) in different places — there is no single rule for "what radius do I use?" |
| **Color drift** | Same logical color expressed as `bg-blue-100 text-blue-800` *or* `bg-indigo-100 text-indigo-800` *or* `bg-cyan-100 text-cyan-800` *or* `badge-info` — no single source of truth for "what does 'Info' look like?" |
| **Heading size drift** | `text-2xl font-bold text-slate-900` *or* `text-2xl font-semibold text-primary tracking-tight` *or* `text-2xl font-black text-slate-900 mt-1` — three different "page H1" recipes in the same app |
| **Button color drift** | `btn btn-primary` *or* `btn btn-primary bg-rose-600 border-rose-600` *or* `btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800` *or* `btn-primary text-xs` (no `btn` class, only the modifier — relies on daisy-compat to make `.btn-primary` self-sufficient) |
| **Shadow drift** | `shadow-sm`, `shadow-xs`, `shadow-low`, `shadow-med`, `shadow-high`, no shadow — all in the same app |
| **Spacing drift** | `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-10`, `gap-14` (literal `14px` via `style="gap:14px"`!) — no spacing scale |
| **Form-control height drift** | `<input>` has no height; `<input class="input">` is 40 px; `<input class="input input-bordered">` is the same; on mobile (< 768 px) the mobile-shell forces 48 px |
| **Card padding drift** | `p-3`, `p-4`, `p-5`, `p-6`, `p-8` all used as "the card padding" |
| **Status color drift** | "In progress" can be `bg-warning-muted text-warning` (daisy-compat) *or* `bg-amber-100 text-amber-800` (raw) *or* `bg-amber-500/20 text-amber-300` (raw with opacity) — three different color recipes for the same business state |

### 6.3 UX problems

| Issue | Severity | Where |
|---|---|---|
| **Inconsistent page header** | Medium | Every page has the same conceptual header but ~6 different visual recipes |
| **Two parallel card systems** (`.card` vs `.cmms-card`) | High | Every listing page picks one or the other at random |
| **Two parallel table systems** | High | Same |
| **Two parallel input systems** | High | Same |
| **Status colors are not predictable** — same status, different colors | High | Status badges in tables across modules |
| **No skeleton/loading state for any page** | Medium | When API calls take long, users see empty space |
| **No empty state for several pages** | Medium | Empty results show as a bare blank row |
| **No "are you sure" UX** for destructive bulk actions | Medium | `data-confirm` exists but is only used on a handful of delete links |
| **Filter bar in some pages is hidden behind a "search" button, in others it's always visible** | Low | Asset list vs repair list |
| **Search input sometimes auto-submits, sometimes requires button** | Low | Inconsistent |
| **No way to clear all filters at once** except clicking `✕` on each chip | Low | Filter chip UX |
| **Pagination button labels are Thai in some places, English in others** | Low | `« ก่อนหน้า` vs `‹` vs `Next` |
| **Toast on success is implemented in JS, but most pages use `header("Location:")` redirect with a `?msg=` flash — so the toast is never shown** | High | Almost every form POST |
| **No way to compare two items, no bulk actions, no export from the listing pages** (export is in `reports/`) | Low | Power-user gap |
| **Modal "close" mechanism** is inconsistent: close button in some, click outside in others, both in others | Low | All modals |
| **Form labels are not always associated with their inputs** (`for=` missing) | Medium | Accessibility |
| **No visible "field required" indicator** (the `.req` class exists but is unstyled) | High | All forms |
| **Long pages don't have a sticky save bar** on desktop — users scroll back to the top to submit | Medium | `repair/create.php`, `repair/edit.php` (22–32 KB long) |
| **Dark mode toggle is in two places** (mobile app bar + desktop topbar), and the icon swap can desync if a page forgets to include both | Low | All pages |

### 6.4 Responsive problems

| Issue | Severity | Notes |
|---|---|---|
| **Sidebar drawer on mobile is OK, but pages with raw Tailwind `flex flex-col` don't always stack correctly below 768 px** | Medium | Tables especially |
| **Tables overflow horizontally on phone** — there is no `.cmms-stack-table` data-label on most tables | High | `repair/index.php` table has 9 columns and is unreadable on a 360 px screen |
| **Form `form-grid` is broken on mobile** (because the class doesn't exist) | High | See 6.1 |
| **Dashboard 8-card pipeline is 4 columns on desktop, 2 on mobile — fine — but the gradient glassmorphism looks washed out in dark mode** | Low | `index.php` |
| **Modal on mobile is sometimes too tall** for the viewport and the close button is unreachable | Medium | Several modals |
| **Bottom nav covers the last form field on some create pages** | Medium | `request.php`, `spare_parts/create.php` |
| **The `<input>` 16-px-font rule on mobile (prevents iOS auto-zoom) is enforced by `mobile-shell.css` for `.input` but not for raw inputs** | High | Bare `<input>` on mobile is 13-px and triggers iOS zoom |
| **Settings pages with 9 accordion groups are usable on desktop but become a wall on mobile** | Medium | `settings/index.php` |
| **Pinch-zoom is disabled** by `<meta viewport maximum-scale=1.0>` — accessibility concern | Low | All pages |

---

## 7. Phase 5 — Information Architecture

### 7.1 Current navigation map

```
App Shell
├── Mobile App Bar ( < 1024 px ) — back, logo, title, theme, lang
├── Desktop Topbar ( ≥ 1024 px ) — search trigger, logo, theme, lang, user menu
├── Sidebar (5 collapsible groups)
│   ├── 📌 1. งานซ่อมบำรุง & การอนุมัติ
│   │   ├── แดชบอร์ดภาพรวม (/)
│   │   ├── ติดตามงานซ่อม
│   │   ├── ใบสั่งงานซ่อม (F-EN-03)
│   │   ├── ฟอร์มขอแจ้งซ่อมด่วน
│   │   ├── ศูนย์อนุมัติเอกสาร
│   │   ├── Kanban Board
│   │   └── AI ผู้ช่วยช่าง
│   ├── 📋 2. แผน PM & เครื่องจักร
│   │   ├── ปฏิทิน PM/AM
│   │   ├── ทะเบียนเครื่องจักร (F-EN-01)
│   │   └── BOM Tree ชิ้นส่วน
│   ├── 📦 3. คลังอะไหล่ & Sage 300
│   │   ├── คลังสต็อกอะไหล่
│   │   ├── เบิก-จ่าย Sage 300
│   │   ├── สแกนบาร์โค้ดอะไหล่
│   │   └── รายการสั่งซื้อ (Reorder)
│   ├── 📈 4. วิเคราะห์ & รายงาน
│   │   ├── OEE Integration
│   │   ├── Downtime / Availability
│   │   ├── ต้นทุนซ่อมต่อเครื่อง
│   │   └── RCA (5-Why & Fishbone)
│   └── ⚙️ 5. ตั้งค่าระบบ
│       └── ตั้งค่าระบบทั้งหมด
└── Mobile Bottom Tab Nav — role-driven, persisted in DB
```

### 7.2 Critical IA observations

1. **Settings is a single entry point** (`/pages/settings/`) but contains
   **42 sub-pages**. The settings hub page does group them into 9
   categories (good) but most categories are not in the sidebar — the
   user has to enter Settings and then click again.
2. **The sidebar already has 5 collapsible groups** that auto-collapse
   to one on first visit — the IA is good, but **the labels mix Thai
   and English** ("OEE Integration", "RCA (5-Why & Fishbone)") and the
   emoji prefixes (`📌`, `📋`, `📦`, `📈`, `⚙️`) are inconsistent.
3. **There is no breadcrumb system** anywhere in the app. Deep pages
   (e.g. `spare_parts/issue_center.php`) provide a single
   `← กลับ` link, not a full breadcrumb.
4. **Role-based navigation** is implemented in the bottom tab nav but
   **not in the sidebar** — every logged-in user sees the same 5
   sidebar groups. This is partly intentional (settings is always
   visible) but mostly a missed opportunity.
5. **The Quick-Search (Ctrl/Cmd+K)** indexes the sidebar — which means
   the settings sub-pages are *not* searchable from the palette. This
   is a big discoverability gap.
6. **Contextual actions** (delete, edit, assign) are only available in
   the listing pages. From the detail page (`view.php`) there is
   always a "แก้ไข" link to `edit.php`, but the **"back to list"** link
   sometimes loses the filter context (it goes to `index.php` with no
   query string).
7. **The dashboard (`/index.php`)** is the "Operational Dashboard" but
   it is **not the homepage of the sidebar** — the sidebar links to
   `/` (which is `index.php`) and to `/pages/repair/tracking.php`.
   There is no clear "what should I look at first" entry point.

### 7.3 IA recommendations (no code changes yet)

1. **Rename the sidebar groups to remove emoji prefixes** and use one
   consistent icon vocabulary. Emoji are decorative and screen-reader
   unfriendly.
2. **Add a breadcrumb component** (`<nav class="cmms-breadcrumb">`)
   wired to the current path.
3. **Add settings sub-pages to the Quick-Search index**.
4. **Make the sidebar group "ตั้งค่าระบบ" dynamically expand** with the
   9 settings sub-categories, or at least surface the top 3 most
   used.
5. **Add "View list with current filter" as the default back link** on
   detail/edit pages.
6. **Group the topbar actions** (search + theme + lang + user) into a
   consistent pattern with semantic `aria-label`s.

---

## 8. Phase 6 — Design System Analysis

### 8.1 What we already have (good!)

| Token category | Token | Value | Notes |
|---|---|---|---|
| Color | `--color-text-primary` | `#171717 / #fafafa` | Astryx neutral — already light/dark aware |
| Color | `--color-text-secondary` | `#737373 / #a3a3a3` | |
| Color | `--color-text-disabled` | `#a3a3a3 / #525252` | |
| Color | `--color-background-surface` | `#fff / #262626` | |
| Color | `--color-background-body` | `#f1f1f1 / #1b1b1b` | |
| Color | `--color-background-muted` | `#f1f1f1 / #1b1b1b` | |
| Color | `--color-border` | `#00000014 / #FFFFFF1A` | |
| Color | `--color-border-emphasized` | `#d4d4d4 / #525252` | |
| Color | `--color-success` | `#007004 / #9fe59b` | |
| Color | `--color-error` | `#a50c25 / #ffc6c1` | |
| Color | `--color-warning` | `#745b00 / #fdcf4f` | |
| Color | `--color-accent` | `#262626 / #ebebeb` | |
| Color family | red/orange/yellow/green/teal/cyan/blue/purple/pink/gray | each with `-background`, `-border`, `-icon`, `-text` variants | For status & categorical UI |
| Radius | `--radius-inner` | 6 px | inputs, small chips |
| Radius | `--radius-element` | 10 px | buttons, inputs |
| Radius | `--radius-container` | 12 px | cards, modals |
| Radius | `--radius-page` | 28 px (!) | rarely used |
| Shadow | `--shadow-low` / `--shadow-med` / `--shadow-high` | layered with OKLCH | |
| Typography | Font family | Figtree → Sarabun (Thai) | |
| Typography | Scale | 4xs → 5xl (10 sizes) | |
| Typography | Weight | normal/medium/semibold/bold | |
| Spacing | `--spacing-*` (Astryx internal) | 0.5 → 12 | |
| Duration | `--duration-fast` (125 ms), `--duration-medium` (300 ms), `--duration-slow` (700 ms) | | |

These are the **source of truth**. They are correctly mapped into
Tailwind via `tailwind.config.js` so the rest of the app *can* use
`bg-surface`, `text-primary`, `border-border`, `bg-muted`, etc.

### 8.2 What is missing or wrong

| Gap | Severity | Impact |
|---|---|---|
| **`.form-section` / `.form-grid` / `.form-label` / `.req` undefined** | 🔴 Critical | Forms look broken |
| **No single canonical `.btn-*` set with a defined color taxonomy** | 🔴 Critical | 5 different "primary" colors in the wild |
| **No canonical status badge system** (open / acknowledged / in_progress / waiting_parts / waiting_approval / resolved / closed / cancelled / rejected) | 🔴 Critical | Same status, different colors across pages |
| **No canonical priority badge system** (low / medium / high / critical) | 🟠 High | Same |
| **Two competing card systems** (`.card` vs `.cmms-card`) | 🟠 High | Cognitive overhead |
| **Two competing input systems** | 🟠 High | Same |
| **Two competing table systems** | 🟠 High | Same |
| **No "empty state" component used in 50%+ of pages** | 🟠 High | Many pages have raw `<div class="p-6 text-center text-slate-400">` |
| **No "skeleton / loading" component** | 🟡 Medium | No loading feedback |
| **No "toast" auto-firing on form submit success** (toast system exists but pages use redirect+flash) | 🟡 Medium | User feedback is inconsistent |
| **No "required" field indicator** | 🟡 Medium | Forms look complete even when they're not |
| **No "form section" pattern with title + body + actions** | 🟡 Medium | Long forms have no visual rhythm |
| **No "page header" canonical** | 🟡 Medium | 6 recipes in the wild |
| **No "filter bar" canonical** | 🟡 Medium | 2 recipes in the wild |
| **No "modal" canonical** | 🟡 Medium | 2 recipes in the wild |
| **No "tab" component** (`.tabs-shadcn-*` is defined but unused) | 🟡 Medium | Long pages roll their own |
| **No "drawer / side panel" component** | 🟢 Low | Power-user feature, not urgent |
| **No "timeline" component** (used in `tracking.php` and `view.php`) | 🟢 Low | Could be standardized later |
| **No "stat tile" canonical** (the 8-card dashboard has its own recipe) | 🟢 Low | |

### 8.3 What should be standardized (priority order)

1. **Status badges** (9 repair statuses + 4 priorities + 4 PM statuses + 2 asset statuses + 2 spare statuses) → one canonical `.badge.status-{key}` with a color from the Astryx family (red/orange/yellow/green/teal/cyan/blue/purple/gray)
2. **Form section / label / input / button set** → define `.form-section`, `.form-grid`, `.form-label`, `.form-hint`, `.form-error`, `.form-actions`, `.req`
3. **Card** → merge `.card` and `.cmms-card` into a single component with a small variant set (`.card`, `.card-elevated`, `.card-stat`)
4. **Table** → standardize on `.data-table` (mobile-shell) and add `.cmms-stack-table` opt-in for mobile
5. **Page header** → single `.cmms-page-header` with title, description, breadcrumbs, actions
6. **Filter bar** → single `.cmms-filter-bar` with built-in `data-label` for accessibility
7. **Modal** → single `.cmms-modal` with overlay, panel, header, body, footer
8. **Alert** → keep `.alert` from daisy-compat (it's good) and add a `.cmms-banner` for in-page info banners
9. **Empty state** → single `.cmms-empty-state` (already exists in ui-polish but not used widely)
10. **Toast** → keep, but document the pattern: server returns `?msg=...` → client fires `showToast('success', msg)` automatically

---

## 9. Phase 7 — Impact Analysis

| Component | Pages using it | User importance | UX impact | Visual inconsistency | Technical duplication | **Score** |
|---|---|---|---|---|---|---|
| **Status badge** | 80+ | 🔴 Critical | 🔴 High | 🔴 High | 🟠 Yes (5 recipes) | **🏆 #1** |
| **Data table** | 50+ | 🔴 Critical | 🔴 High | 🟠 High | 🟠 Yes (2 recipes) | **🥈 #2** |
| **Card** | 100+ | 🟠 High | 🟠 High | 🟠 High | 🟠 Yes (3 recipes) | **🥉 #3** |
| **Form section + input + button** | 30+ | 🔴 Critical | 🔴 High | 🔴 High | 🟠 Yes (3 recipes + 1 missing CSS) | **#4** |
| **Page header** | 149 | 🟠 High | 🟠 High | 🟠 High | 🟠 Yes (6 recipes) | **#5** |
| **Filter bar** | 30+ | 🟠 High | 🟠 Medium | 🟠 High | 🟠 Yes (2 recipes) | **#6** |
| **Modal** | 25+ | 🟡 Medium | 🟡 Medium | 🟠 High | 🟠 Yes (2 recipes) | **#7** |
| **Alert** | 40+ | 🟡 Medium | 🟠 High | 🟠 High | 🟠 Yes (2 recipes) | **#8** |
| **Empty state** | 30+ | 🟡 Medium | 🟠 High | 🟠 High | 🟠 Yes (2 recipes) | **#9** |
| **Dashboard stat tile** | 1 (the 8-card pipeline) | 🟠 High | 🟠 High | 🟡 Medium | 🟢 No (intentional) | **#10** |
| **Action link in table** | 80+ | 🟠 High | 🟡 Medium | 🟠 High | 🟠 Yes (2 recipes) | **#11** |
| **Breadcrumb** | 0 | 🟡 Medium | 🟡 Medium | 🟢 N/A | 🟢 No (doesn't exist) | **#12** |

**Top 6 are responsible for ~80% of the visual inconsistency.** Fixing
them correctly propagates improvements to 100+ pages without touching
each one.

---

## 10. Phase 8 — Recommended Redesign Strategy

### 10.1 Principles

1. **Do not redesign every page.** Fix the shared components, then
   most pages will already look better "for free".
2. **Single source of truth for each visual concept.** One `.card`,
   one `.data-table`, one `.badge`, one `.form-section`.
3. **Use the Astryx tokens everywhere** — no more `bg-slate-50`,
   `text-slate-900`, `border-slate-200`. Always `bg-surface`,
   `text-primary`, `border-border`.
4. **Dark mode is automatic** if we use semantic tokens. No more
   `html.dark .bg-white` patches.
5. **Mobile is a first-class citizen.** Every component must be
   designed for 360 px and up.
6. **Accessibility is non-negotiable.** Every form input has a `<label
   for>`, every icon button has an `aria-label`, every interactive
   element has a visible focus ring.
7. **No business logic changes.** No DB changes. No route changes.
   Only CSS class names, semantic HTML, and shared component files.

### 10.2 Migration order (12 steps)

| Step | Scope | Pages affected | Effort |
|---|---|---|---|
| **0.  Define the missing form classes** (`.form-section`, `.form-grid`, `.form-label`, `.form-hint`, `.form-error`, `.form-actions`, `.req`) — **single CSS file edit, fixes 41+ usages immediately** | All forms | All forms | 1 day |
| **1.  Standardize the page header** — one `.cmms-page-header` with title, description, breadcrumbs, actions | All 149 pages | All | 3 days |
| **2.  Standardize the data table** — pick `.data-table` as the canonical, adopt `.cmms-stack-table` for mobile stacking on every listing page | All listing pages | ~40 | 5 days |
| **3.  Standardize the card** — merge `.card` and `.cmms-card` into one component with 3 variants (`default`, `elevated`, `stat`) | All pages | ~100 | 3 days |
| **4.  Standardize the form** — full set: `.form-section`, `.form-grid`, `.form-label`, `.form-hint`, `.form-error`, `.form-actions`, `.req`, `.input`, `.select-field`, `.textarea-field`, `.form-checkbox`, `.form-radio` | All forms | ~30 | 5 days |
| **5.  Standardize the filter bar** — single `.cmms-filter-bar` with built-in clear-all | All listing pages | ~30 | 2 days |
| **6.  Standardize the button set** — one `.btn` + variants (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-outline`, `.btn-sm`, `.btn-lg`, `.btn-icon`) with one color per role | All pages | All | 3 days |
| **7.  Standardize the status system** — one `.badge.status-{key}` and one `.badge.priority-{key}` per business state, with a documented palette | All pages with status | ~80 | 4 days |
| **8.  Standardize the modal** — one `.cmms-modal` with overlay, header, body, footer, close button, focus trap | All modals | ~25 | 3 days |
| **9.  Standardize the alert / banner / toast** — keep `.alert` (good), add `.cmms-banner`, wire `?msg=` → toast automatically in the JS engine | All pages | All | 2 days |
| **10. Standardize the empty state, loading state, and error state** | All pages | All | 2 days |
| **11. Polish the dashboard** — keep the 8-card gradient pipeline but standardize its internal structure (heading, value, hint, icon position) | `index.php` | 1 | 2 days |
| **12. Mobile pass** — every page tested at 360 / 768 / 1024 / 1280 / 1920 px; `.cmms-stack-table` applied to every listing; FAB and action bar where appropriate | All pages | All | 5 days |

**Total effort:** ~40 person-days.

### 10.3 Pages that DO NOT need to be individually redesigned

These pages will inherit **all** improvements from the shared component
work and should not be touched individually in Phase 2:

- All listing pages that use the canonical `.data-table` (after step 2)
- All simple edit pages that use `.form-section` (after step 4)
- All pages that use the standard `.cmms-page-header` (after step 1)
- All pages that use `.badge.status-*` (after step 7)
- All pages that use `.card` (after step 3)
- All pages with raw Tailwind colors → automatic upgrade by replacing
  `bg-slate-50` → `bg-muted`, `text-slate-900` → `text-primary`,
  `border-slate-200` → `border-border` (a single `sed` pass + manual
  review)

**Pages that DO need individual attention (because they have unique
patterns):**

- `public/index.php` (dashboard) — keep brand gradients, standardize structure
- `public/pages/repair/request.php` (60 KB) — migrate off the inline
  Tailwind CDN onto the shared form components
- `public/pages/settings/branding.php` (43 KB) — raw Tailwind cleanup
- `public/pages/spare_parts/sage_sync.php` (22 KB) — wizard
- `public/pages/users/roles.php` (27 KB) — permission matrix
- `public/pages/repair/edit.php` (32 KB), `view.php` (28 KB),
  `create.php` (22 KB) — long forms that need the new form section
- `public/pages/pm_am/checksheet.php` (27 KB) — checklist execution
- `public/pages/settings/flex_builder.php` (26 KB) — out of scope
  (form builder, not a content page)

### 10.4 What we will NOT do

- ❌ No changes to the backend (PHP, SQL, API)
- ❌ No changes to authentication / authorization
- ❌ No changes to business logic
- ❌ No changes to the database schema
- ❌ No new framework (no React, no Vue, no Tailwind upgrade)
- ❌ No breaking changes to existing class names without aliases
- ❌ No removal of existing functionality
- ❌ No changes to the design system *philosophy* (Astryx stays the
  source of truth)

---

## 11. Open Questions for the User (before any implementation)

1. **Light theme only vs. keep dark mode?** The app already has a
   working dark mode. We assume we keep it. *If you want to drop dark
   mode, we save ~20% effort but lose a feature that is already
   polished.*
2. **Bilingual UI (TH/EN/JP)?** The header has a language switcher but
   the i18n is in `src/includes/i18n.php` and only a few pages
   actually translate. We assume we keep the current mixed
   Thai-with-English-acronyms style. *If you want full
   translation, that's a separate, much larger project.*
3. **Icon library?** Pages mix Lucide (`<i data-lucide="..."`>`) with
   raw `<svg>`. We assume we standardize on inline `<svg>` (already
   used in the sidebar, no extra dependency).
4. **Is the `request.php` (LINE LIFF) form in scope?** It is the only
   public-facing form and uses its own design language. We assume yes
   — it should be standardized.
5. **Is the `frontend/` (Next.js) prototype in scope?** It is not
   wired into the running app. We assume no — it is a separate
   project.

---

## 12. Conclusion

The application is **mature, full-featured, and on a solid design
foundation** (Astryx + Tailwind + daisy-compat + mobile-shell +
ui-polish). The visual chaos comes from **two things**:

1. **One missing CSS file** — the `.form-section` family is the
   single most impactful bug.
2. **Six competing visual dialects** coexisting on every page.

Both are **fixable in the design system layer, not in 149 individual
pages**. The migration order in § 10.2 propagates improvements to the
vast majority of pages without touching them. The remaining ~12 pages
that have unique patterns can be polished in a focused second pass.

**The redesign is achievable in ~40 person-days and will visibly
improve every single page in the application.**
