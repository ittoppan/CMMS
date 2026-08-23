# CMMS-TOPPAN — UI Redesign Plan & Migration Strategy

> **Companion document to `CMMS_UI_AUDIT.md` and `CMMS_COMPONENT_MAP.md`.**
> This is the **actionable plan** for the redesign. It assumes the
> audit has been approved and we are about to start implementing.
> **It does not implement anything** — it describes the work to be
> done, in which order, and what the success criteria are.

---

## 1. Goals

| Goal | Success criteria |
|---|---|
| **G1.  One canonical component per concept** | No two CSS classes perform the same job. No raw Tailwind colors used in production pages. |
| **G2.  Every page uses semantic design tokens** | `text-slate-900`, `bg-slate-50`, `border-slate-200` are banned in production. Replaced by `text-primary`, `bg-muted`, `border-border`. |
| **G3.  Forms look like forms** | The `.form-section` family is defined and used by every form page. No broken / browser-default form layouts. |
| **G4.  Status colors are predictable** | One `.badge.status-{key}` and one `.badge.priority-{key}` per business state, with a documented palette. |
| **G5.  Tables are readable on every device** | Every listing page uses `.data-table` (desktop) and opts into `.cmms-stack-table` for mobile. |
| **G6.  Dark mode is automatic** | Every component respects the dark theme. No `html.dark` patches needed. |
| **G7.  Mobile is a first-class citizen** | Every page tested at 360 / 768 / 1024 / 1280 / 1920 px. |
| **G8.  Accessibility is non-negotiable** | Every form input has `<label for>`. Every icon button has `aria-label`. Every interactive element has a visible focus ring. |
| **G9.  No business-logic changes** | No backend, DB, API, auth, or business-logic changes. Only CSS, HTML structure, and shared component files. |

---

## 2. Non-goals

To stay focused, the following are **explicitly out of scope**:

- ❌ No changes to PHP backend or business logic
- ❌ No changes to the database schema
- ❌ No changes to authentication or authorization
- ❌ No migration to React / Vue / any new framework
- ❌ No full i18n (TH/EN/JP) translation (current mixed style is kept)
- ❌ No removal of dark mode (it's already in place, keep it)
- ❌ No removal of the `frontend/` (Next.js prototype) — it's a separate project
- ❌ No changes to existing class names without leaving aliases for at
  least one release cycle (so old pages keep working while we migrate)

---

## 3. Migration Order (12 steps, 40 days)

The 12 steps are designed so that **each step is independently
shippable** and **each step improves the look of every page that uses
the touched component**. We never have a half-broken state.

### Step 0 — Fix the missing form classes  *(1 day)*

**Highest-leverage change in the entire migration.** Add the missing
form family to `public/css/ui-polish.css`:

```css
.form-section {
  background: var(--color-background-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.form-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem 1rem;
}
.form-grid > [style*="grid-column: span 2"] { grid-column: span 2; }
@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
  .form-grid > [style*="grid-column: span 2"] { grid-column: span 1; }
}
.form-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.3rem;
  letter-spacing: 0.01em;
}
.form-hint {
  display: block;
  font-size: 0.72rem;
  color: var(--color-text-disabled);
  margin-top: 0.2rem;
}
.form-error {
  display: block;
  font-size: 0.78rem;
  color: var(--color-error);
  margin-top: 0.2rem;
}
.req { color: var(--color-error); margin-left: 2px; }
.form-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
@media (max-width: 768px) {
  .form-actions { flex-direction: column; }
  .form-actions .btn { width: 100%; min-height: 48px; }
}
```

**Acceptance**: Every page that uses `.form-section` (currently
`repair/create.php`, `repair/edit.php`, `spare_parts/create.php`,
`spare_parts/edit.php`, `calibration/create.php`, `calibration/edit.php`,
`asset_registry/create.php`, `asset_registry/edit.php`, etc.) now has
a properly laid-out form. No more raw browser defaults.

**Files changed**: 1 (`public/css/ui-polish.css`).
**Pages affected**: ~15 pages immediately look better.

### Step 1 — Standardize the page header  *(3 days)*

Add `.cmms-page-header` to `ui-polish.css`:

```css
.cp-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}
@media (min-width: 640px) {
  .cp-header { flex-direction: row; align-items: flex-start; justify-content: space-between; }
}
.cp-header-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--color-text-primary);
}
.cp-header-desc {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
.cp-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.cp-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}
.cp-breadcrumb a { color: var(--color-text-secondary); text-decoration: none; }
.cp-breadcrumb a:hover { color: var(--color-text-primary); }
.cp-breadcrumb-sep { color: var(--color-text-disabled); }
.cp-breadcrumb-current { color: var(--color-text-primary); font-weight: 600; }
```

Provide a small PHP helper `src/components/page_header.php` that takes
`$title`, `$description`, `$actions` (array of links/buttons),
`$breadcrumbs` (array), `$icon` (optional emoji/svg) and prints the
canonical header.

**Migration strategy**: Don't touch existing pages yet. The CSS
classes are available; new pages use them. Old pages keep working
until we do the per-module sweep (Step 12).

**Files changed**: 1 CSS, 1 PHP helper.
**Pages affected**: 0 immediately; gradually as new pages are touched.

### Step 2 — Standardize the data table  *(5 days)*

Promote `.data-table` (already in `mobile-shell.css`) to the **only**
table style. Add a thin alias `.cmms-data-table` (same rules) for
semantic clarity.

For mobile stacking, add `data-label` to every `<td>` in every
listing page. Make `.cmms-stack-table` the default below 640 px (it
already exists in `ui-polish.css`, just not adopted).

**Acceptance criteria**:
- Every listing page uses `<table class="data-table cmms-stack-table">`
- Every `<td>` has `data-label="..."` matching its column header
- `repair/index.php` (9 columns) is readable on a 360 px phone

**Migration strategy**: Per module (repair, PM, spare, asset, etc.),
sed-replace `class="min-w-full divide-y divide-slate-200"` →
`class="data-table"`, add `data-label` attributes (manual since they
need to match the `<th>` text).

**Files changed**: ~40 listing pages.
**Effort**: 5 days.

### Step 3 — Standardize the card  *(3 days)*

Merge `.card` and `.cmms-card` into a single canonical component with
three variants:

```css
.card {
  background: var(--color-background-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  padding: 1rem;
}
.card-elevated {
  box-shadow: var(--shadow-med, 0 4px 16px rgb(0 0 0 / 0.08));
}
.card-stat {
  background: linear-gradient(135deg, var(--color-background-surface) 0%, var(--color-background-muted) 100%);
  border-radius: var(--radius-container);
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}
/* dark mode automatic via tokens */
```

Keep `.cmms-card` as an alias for one release.

**Migration strategy**: sed-replace `class="bg-white border-slate-200
rounded-xl shadow-sm"` → `class="card"`, manual cleanup of the few
that need `.card-elevated` or `.card-stat`.

**Files changed**: ~100 pages.
**Effort**: 3 days.

### Step 4 — Standardize the form  *(5 days)*

Already started in Step 0. Extend with:
- `.form-checkbox` and `.form-radio` styled to match
- `.textarea-field` to complement `.input` and `.select-field`
- `.form-required-legend` to show "ฟิลด์ที่มี * จำเป็นต้องกรอก"
- `.cmms-action-bar` (already exists, promote it) — sticky bottom
  action bar for mobile forms

**Migration strategy**: For each create/edit form, replace
`<div class="form-section">` etc. with the proper structure, add
labels with `for=`, add `aria-required="true"` on required fields, add
`.form-hint` for helper text.

**Files changed**: ~30 form pages.
**Effort**: 5 days.

### Step 5 — Standardize the filter bar  *(2 days)*

Add `.cmms-filter-bar` to `ui-polish.css`:

```css
.cmms-filter-bar {
  background: var(--color-background-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: flex-end;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cmms-filter-bar:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}
.cmms-search-input { position: relative; flex: 1; min-width: 200px; }
.cmms-search-input input { padding-left: 2.25rem; }
.cmms-search-input .icon {
  position: absolute; left: 0.75rem; top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary); pointer-events: none;
}
.cmms-filter-chip {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.2rem 0.55rem; border-radius: 999px;
  background: var(--color-accent-muted);
  color: var(--color-text-primary);
  font-size: 0.72rem; font-weight: 600;
}
.cmms-filter-chip button {
  background: transparent; border: 0; color: inherit; cursor: pointer;
  font-size: 0.85rem; line-height: 1; padding: 0 2px;
}
```

Provide a PHP helper `src/components/filter_bar.php` that wraps a
filter form and handles the active-filter chips display.

**Migration strategy**: Replace `<div class="bg-white p-4 rounded-xl
border-slate-200 ...">` with `<form class="cmms-filter-bar" method="GET">`.

**Files changed**: ~30 listing pages.
**Effort**: 2 days.

### Step 6 — Standardize the button set  *(3 days)*

Extend `daisy-compat.css`:

```css
.btn-danger {
  background-color: var(--color-error);
  border-color: var(--color-error);
  color: var(--color-on-error);
}
.btn-danger:hover { filter: brightness(0.92); }

.btn-success {
  background-color: var(--color-success);
  border-color: var(--color-success);
  color: var(--color-on-success);
}
.btn-success:hover { filter: brightness(0.92); }

.btn-link {
  background: transparent;
  border: 0;
  color: var(--color-accent);
  padding: 0.25rem 0.5rem;
  min-height: auto;
}
.btn-link:hover { text-decoration: underline; }

.btn-icon {
  padding: 0.5rem;
  min-width: 38px;
  min-height: 38px;
}
```

**Migration strategy**: Audit every page for `btn btn-primary
bg-rose-600` / `bg-purple-700` / `bg-emerald-600` / `bg-amber-600`
overrides → map to the appropriate semantic variant (`.btn-danger`,
`.btn-primary`, `.btn-success`, `.btn-warning`).

**Files changed**: ~30 pages with button overrides.
**Effort**: 3 days.

### Step 7 — Standardize the status system  *(4 days)*

The single most impactful change for **visual consistency**. Define
`.badge.status-*` and `.badge.priority-*` in `ui-polish.css` with a
documented palette.

**Repair status palette** (9 states):

| State | Background | Foreground | Border |
|---|---|---|---|
| `open` | `--color-background-blue` | `--color-text-blue` | `--color-border-blue` |
| `acknowledged` | `--color-background-indigo` | `--color-text-indigo` | `--color-border-indigo` |
| `in_progress` | `--color-background-yellow` | `--color-text-yellow` | `--color-border-yellow` |
| `waiting_parts` | `--color-background-orange` | `--color-text-orange` | `--color-border-orange` |
| `waiting_approval` | `--color-background-purple` | `--color-text-purple` | `--color-border-purple` |
| `resolved` | `--color-background-green` | `--color-text-green` | `--color-border-green` |
| `closed` | `--color-background-gray` | `--color-text-gray` | `--color-border-gray` |
| `cancelled` | `--color-background-gray` | `--color-text-disabled` | `--color-border` |
| `rejected` | `--color-background-red` | `--color-text-red` | `--color-border-red` |

**Priority palette** (4 states):

| State | Background | Foreground | Border |
|---|---|---|---|
| `low` | `--color-background-gray` | `--color-text-gray` | `--color-border-gray` |
| `medium` | `--color-background-blue` | `--color-text-blue` | `--color-border-blue` |
| `high` | `--color-background-orange` | `--color-text-orange` | `--color-border-orange` |
| `critical` | `--color-background-red` | `--color-text-red` | `--color-border-red` |

(These are exactly the Astryx color family already in tokens — no new
colors are introduced.)

```css
.badge { /* existing */
  border: 1px solid transparent; /* add border */
}
.badge.status-open,
.badge.status-acknowledged,
.badge.status-in_progress,
.badge.status-waiting_parts,
.badge.status-waiting_approval,
.badge.status-resolved,
.badge.status-closed,
.badge.status-cancelled,
.badge.status-rejected,
.badge.priority-low,
.badge.priority-medium,
.badge.priority-high,
.badge.priority-critical,
.badge.status-pending,
.badge.status-completed,
.badge.status-overdue,
.badge.status-active,
.badge.status-inactive,
.badge.status-under_repair,
.badge.status-disposed,
.badge.status-in_stock,
.badge.status-low_stock {
  background: var(--_badge-bg, var(--color-background-muted));
  color:      var(--_badge-fg, var(--color-text-primary));
  border-color: var(--_badge-bd, var(--color-border));
}
.badge.status-open          { --_badge-bg: var(--color-background-blue);   --_badge-fg: var(--color-text-blue);   --_badge-bd: var(--color-border-blue); }
.badge.status-acknowledged  { --_badge-bg: var(--color-background-indigo);  --_badge-fg: var(--color-text-indigo);  --_badge-bd: var(--color-border-indigo); }
.badge.status-in_progress   { --_badge-bg: var(--color-background-yellow);  --_badge-fg: var(--color-text-yellow);  --_badge-bd: var(--color-border-yellow); }
.badge.status-waiting_parts { --_badge-bg: var(--color-background-orange);  --_badge-fg: var(--color-text-orange);  --_badge-bd: var(--color-border-orange); }
.badge.status-waiting_approval { --_badge-bg: var(--color-background-purple); --_badge-fg: var(--color-text-purple); --_badge-bd: var(--color-border-purple); }
.badge.status-resolved      { --_badge-bg: var(--color-background-green);   --_badge-fg: var(--color-text-green);   --_badge-bd: var(--color-border-green); }
.badge.status-closed        { --_badge-bg: var(--color-background-gray);    --_badge-fg: var(--color-text-gray);    --_badge-bd: var(--color-border-gray); }
.badge.status-cancelled     { --_badge-bg: var(--color-background-gray);    --_badge-fg: var(--color-text-disabled);--_badge-bd: var(--color-border); }
.badge.status-rejected      { --_badge-bg: var(--color-background-red);     --_badge-fg: var(--color-text-red);     --_badge-bd: var(--color-border-red); }
.badge.priority-low         { --_badge-bg: var(--color-background-gray);    --_badge-fg: var(--color-text-gray);    --_badge-bd: var(--color-border-gray); }
.badge.priority-medium      { --_badge-bg: var(--color-background-blue);    --_badge-fg: var(--color-text-blue);    --_badge-bd: var(--color-border-blue); }
.badge.priority-high        { --_badge-bg: var(--color-background-orange);  --_badge-fg: var(--color-text-orange);  --_badge-bd: var(--color-border-orange); }
.badge.priority-critical    { --_badge-bg: var(--color-background-red);     --_badge-fg: var(--color-text-red);     --_badge-bd: var(--color-border-red); }
.badge.status-pending       { --_badge-bg: var(--color-background-blue);    --_badge-fg: var(--color-text-blue);    --_badge-bd: var(--color-border-blue); }
.badge.status-completed     { --_badge-bg: var(--color-background-green);   --_badge-fg: var(--color-text-green);   --_badge-bd: var(--color-border-green); }
.badge.status-overdue       { --_badge-bg: var(--color-background-red);     --_badge-fg: var(--color-text-red);     --_badge-bd: var(--color-border-red); }
.badge.status-active        { --_badge-bg: var(--color-background-green);   --_badge-fg: var(--color-text-green);   --_badge-bd: var(--color-border-green); }
.badge.status-inactive      { --_badge-bg: var(--color-background-gray);    --_badge-fg: var(--color-text-gray);    --_badge-bd: var(--color-border-gray); }
.badge.status-under_repair  { --_badge-bg: var(--color-background-yellow);  --_badge-fg: var(--color-text-yellow);  --_badge-bd: var(--color-border-yellow); }
.badge.status-disposed      { --_badge-bg: var(--color-background-gray);    --_badge-fg: var(--color-text-disabled);--_badge-bd: var(--color-border); }
.badge.status-in_stock      { --_badge-bg: var(--color-background-green);   --_badge-fg: var(--color-text-green);   --_badge-bd: var(--color-border-green); }
.badge.status-low_stock     { --_badge-bg: var(--color-background-orange);  --_badge-fg: var(--color-text-orange);  --_badge-bd: var(--color-border-orange); }
```

Provide a small PHP helper `renderStatusBadge($kind, $key, $label)` in
`src/components/badge.php` that all pages use instead of inlining
`bg-*-100 text-*-800` classes.

**Migration strategy**: For every page that has a status badge,
replace the inline Tailwind color with `<span class="badge status-open">Open</span>`.

**Files changed**: ~80 pages.
**Effort**: 4 days.

### Step 8 — Standardize the modal  *(3 days)*

Add `.cmms-modal` family:

```css
.cmms-modal-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: var(--color-overlay);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  display: none; align-items: center; justify-content: center;
  padding: 1rem;
}
.cmms-modal-backdrop.open { display: flex; }
.cmms-modal-panel {
  background: var(--color-background-popover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  box-shadow: var(--shadow-high);
  width: 100%; max-width: 480px;
  max-height: 90vh; overflow: hidden;
  display: flex; flex-direction: column;
}
.cmms-modal-panel-sm { max-width: 360px; }
.cmms-modal-panel-lg { max-width: 720px; }
.cmms-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
.cmms-modal-title { margin: 0; font-size: 0.95rem; font-weight: 700; }
.cmms-modal-close {
  background: transparent; border: 0; cursor: pointer;
  color: var(--color-text-disabled);
  font-size: 1.1rem; line-height: 1; padding: 4px;
}
.cmms-modal-body { padding: 1rem; overflow-y: auto; }
.cmms-modal-footer {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}
```

Add a tiny `CMMS_UI.openModal(id)` / `CMMS_UI.closeModal(id)` to
`cmms-ui-engine.js` with focus trap + ESC to close.

**Migration strategy**: Convert every modal trigger from inline
`onclick="document.getElementById('modal').style.display='block'"`
to `data-modal-open="modal-id"` and `data-modal-close` attributes.

**Files changed**: ~25 pages with modals.
**Effort**: 3 days.

### Step 9 — Standardize the alert / banner / toast  *(2 days)*

Keep `.alert` from daisy-compat (it's good). Add `.cmms-banner`:

```css
.cmms-banner {
  display: flex; align-items: flex-start; gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--color-background-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  line-height: 1.5;
}
.cmms-banner-icon { flex-shrink: 0; margin-top: 2px; }
.cmms-banner-content { flex: 1; min-width: 0; }
.cmms-banner-title { font-weight: 700; margin-bottom: 0.1rem; }
.cmms-banner-close {
  background: transparent; border: 0; cursor: pointer;
  color: var(--color-text-disabled); padding: 2px;
}
.cmms-banner.info    { background: var(--color-background-blue);   border-color: var(--color-border-blue);   color: var(--color-text-blue); }
.cmms-banner.success { background: var(--color-background-green);  border-color: var(--color-border-green);  color: var(--color-text-green); }
.cmms-banner.warning { background: var(--color-background-yellow); border-color: var(--color-border-yellow); color: var(--color-text-yellow); }
.cmms-banner.error   { background: var(--color-background-red);    border-color: var(--color-border-red);    color: var(--color-text-red); }
```

Wire `?msg=` and `?error=` query parameters → `showToast('success',
msg)` / `showToast('error', error)` automatically in
`cmms-ui-engine.js` (or in a small script in `header.php`).

**Migration strategy**: For every page that does
`header("Location: index.php?msg=...")`, ensure the JS picks it up.
Replace raw `bg-error/10 ...` blocks with `.cmms-banner.error`.

**Files changed**: ~40 pages + 1 JS.
**Effort**: 2 days.

### Step 10 — Standardize empty state, loading, error  *(2 days)*

Add `.cmms-skeleton` and `.cmms-spinner`:

```css
.cmms-skeleton {
  background: linear-gradient(90deg,
    var(--color-background-muted) 0%,
    var(--color-tint-hover) 50%,
    var(--color-background-muted) 100%);
  background-size: 200% 100%;
  animation: cmms-skeleton 1.2s ease-in-out infinite;
  border-radius: var(--radius-inner);
}
@keyframes cmms-skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.cmms-spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--color-border-emphasized);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: cmms-spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes cmms-spin { to { transform: rotate(360deg); } }
```

Promote `.empty-state` to `.cmms-empty-state` and make it the default
when a table has no data.

**Migration strategy**: Replace `<div class="p-6 text-center
text-slate-400">ไม่มี...</div>` with `<div class="cmms-empty-state">...</div>`.

**Files changed**: ~30 pages.
**Effort**: 2 days.

### Step 11 — Polish the dashboard  *(2 days)*

The dashboard's 8-card gradient pipeline is a **brand asset** — keep
the gradient + glassmorphism look, but standardize the internal
structure:

```html
<a href="..." class="cmms-stat-tile cmms-stat-tile-{status-key}">
  <div class="cmms-stat-tile-label">1. Open (เปิดใหม่)</div>
  <div class="cmms-stat-tile-value"><?= $statusOpen ?></div>
  <div class="cmms-stat-tile-hint">คลิกเพื่อดูรายการ</div>
</a>
```

with consistent height, padding, font sizes, and hint position.

**Files changed**: 1 (`public/index.php`).
**Effort**: 2 days.

### Step 12 — Mobile pass  *(5 days)*

For every page, test at **360 / 768 / 1024 / 1280 / 1920 px**. Fix:

- Tables: ensure `.cmms-stack-table` is applied (Step 2) with `data-label`
- Forms: ensure 48-px input height, full-width on mobile
- Cards: ensure 16-px gutter on mobile (no side borders on full-bleed)
- Modals: ensure 90vh max-height + close button reachable
- Bottom nav clearance: ensure last form field is not under the nav
- Toast position: already correct (above bottom nav)

**Files changed**: all 149 pages (visual review + small fixes).
**Effort**: 5 days.

---

## 4. Per-Module Sweep (1 week per module, parallelizable)

After Steps 0–12 are done, do a **sweep per module** to clean up the
remaining raw-Tailwind leftovers and ensure all forms/tables match the
new patterns:

| Module | Pages | Est. effort |
|---|---|---|
| Repair (16 pages) — the biggest, has the long create/edit/view | 16 | 5 days |
| Settings (42 pages) — 13 master-data CRUD + 9 admin tools | 42 | 5 days |
| Spare parts (11 pages) | 11 | 3 days |
| PM/AM (11 pages) | 11 | 3 days |
| Asset registry (14 pages) | 14 | 3 days |
| Calibration (9 pages) | 9 | 2 days |
| Users + Roles (11 pages) | 11 | 2 days |
| Analytics (7 pages) | 7 | 1 day |
| Others (IoT, QR, Safety, Approval, Notifications, Suppliers, MTBF, Manuals, Equipment, Reports) | ~30 | 3 days |
| Dashboard + `request.php` final polish | 2 | 2 days |

**Total per-module sweep**: ~29 days (parallelizable to ~10 with 3 people).

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **A long-standing page has a one-off style we miss** | Medium | Low | After migration, do a visual regression pass by comparing screenshots of all 149 pages |
| **Form layout breaks on a complex form** (e.g. `repair/create.php` with 30 fields) | Medium | Medium | Define `.form-grid` to use `auto-fit minmax(220px, 1fr)` so it naturally wraps; add explicit `grid-column: span 2` for full-width fields |
| **Dark mode reveals a hard-coded color we missed** | Medium | Medium | Final dark-mode pass on every page |
| **A status badge color conflict** (two business states with the same color) | Low | High | The 9-state palette was carefully chosen to be unique; documented in § Step 7 |
| **Thai language wrapping breaks in headings** | Low | Low | Use `word-break: keep-all` for Thai headings; verified |
| **iOS auto-zoom on input focus** (because `<input>` is < 16 px) | High | Medium | The mobile-shell already forces 16 px on `.input`; we need to make sure raw inputs get the same treatment via the universal selector `input { font-size: 16px; }` on mobile |
| **A user is logged in with a session cookie that references a class name we changed** | Low | Low | We are not changing class names — only adding new ones and standardizing existing ones |
| **Performance regression from a big new CSS file** | Low | Low | Final CSS will be < 50 KB; gzipped < 10 KB. Acceptable. |

---

## 6. Success Metrics

After the migration is complete, the following should be true:

1. **No raw Tailwind color in production** (`grep -r "text-slate-\|bg-slate-\|border-slate-" public/pages/ public/*.php` returns 0 matches, except in `request.php` which is being migrated).
2. **Every form uses `.form-section`** (`grep -L "form-section" public/pages/*/create.php public/pages/*/edit.php` returns 0 files).
3. **Every listing uses `.data-table`** (`grep -L "data-table\|table-shadcn" public/pages/*/index.php` returns 0 files).
4. **Every status badge uses `.status-*`** (`grep "bg-blue-100\|bg-green-100\|bg-red-100\|bg-amber-100" public/pages/*/` returns 0 matches).
5. **No `.form-section`, `.form-grid`, `.form-label` falls back to browser default** (visual check).
6. **Dark mode works on every page** (visual check at 360/768/1024/1920 px).
7. **Every page is usable on a 360 px phone** (visual check).

---

## 7. Out-of-scope Future Work

These are not part of this migration but are worth noting for later:

- **i18n (TH/EN/JP) full translation** — would need `__()` helpers in
  every PHP file; ~20 days of work
- **Replace the inline-Tailwind-CDN in `request.php`** with the
  compiled `app.css` (small additional effort, already covered by Step 4)
- **Move from `renderHeader()` / `renderFooter()` to a real layout
  template engine** (Twig, Plates, or just better `include`s) — ~3
  days
- **Replace the bespoke `cmms-ui-engine.js` with a small framework**
  (Alpine.js, htmx, or Stimulus) — would be a much bigger refactor
- **Storybook / component gallery** so future developers can see the
  canonical components in isolation

---

## 8. Summary

The CMMS-TOPPAN UI redesign is **achievable in ~40 person-days for
the shared components + per-module sweep** (parallelizable to ~20 days
with 2 people) and will **visibly improve every one of the 149 pages**
without touching business logic, the database, the API, or the auth
system.

The foundation is already in place (Astryx tokens, Tailwind bridge,
mobile shell, daisy-compat). The work is mostly:

1. **Define the missing form classes** (Step 0 — 1 day, single CSS
   file, fixes 15+ pages immediately).
2. **Pick one recipe per concept** and migrate the other recipes to
   match.
3. **Replace raw Tailwind colors with semantic tokens** (mechanical
   sed pass + visual review).
4. **Add the small set of missing components** (modal manager, page
   header, breadcrumb, action bar, skeleton).

The plan is **shippable in 12 small steps**, each independently
valuable.
