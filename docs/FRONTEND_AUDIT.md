# CMMS-TOPPAN — Next.js Frontend Audit (Fresh, Read-Only)

> **Scope:** `frontend/` only (the Next.js app). Written fresh for the
> Astryx → shadcn/ui migration planning.
>
> **Context correction (verified during this audit):** the existing docs
> `CMMS_UI_AUDIT.md`, `CMMS_COMPONENT_MAP.md`, `CMMS_UI_REDESIGN_PLAN.md`
> describe the **PHP server-rendered app in this same repo**
> (`public/pages/**/*.php`, `src/includes/*`) — not an unrelated codebase.
> Their paths/class names were verified against real files earlier, so they are
> accurate *for that app*, but they are **not** the source of truth for
> `frontend/`. This document is the source of truth for the Next.js frontend.
>
> **Second key fact:** `frontend/` is **not an abandoned prototype**.
> `next.config.ts` proxies `/api/*`, the LINE login endpoints, and `/uploads/*`
> to the PHP backend (`http://localhost:8081`). This app is a live parallel PWA
> client of the same backend. A frontend-only Astryx→shadcn/ui swap therefore
> does not touch PHP/API/DB at all — that constraint holds naturally.

---

## 1. Executive Summary

| Question | Answer |
|---|---|
| Framework | Next.js **16.2.10**, React **19.2.4**, **App Router** (root `app/` directory) |
| UI library today | **Astryx Design System** `@astryxdesign/core@^0.1.9` (+ `theme-neutral`, `cli`); renders via **StyleX** atomic classes |
| Tailwind | **v4** already installed and fully wired (`@tailwindcss/postcss`; CSS-first `@theme` in `globals.css`; no `tailwind.config.*` exists or is needed) |
| shadcn/ui readiness | High — `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-table` already in deps. **No Radix packages yet**, no `components.json` (shadcn CLI not initialized) |
| Scale of Astryx coupling | **65 files** reference Astryx: 56 pages under `app/(dashboard)`, 6 shared components, 3 dead demo pages in `src/app/` |
| Parallel UI kit | `components/ui/*` — **18 hand-rolled shadcn-style components** (cva + `cn()` + `--cmms-*` vars; zero Astryx, zero Radix) already imported by **38 pages** (~42% adoption) |
| CSS architecture | Single `app/globals.css` (**2,628 lines / 113.5 KB**) mixing Astryx CSS imports, TOPPAN brand tokens, a large hand-rolled `cmms-*` layer, and a heavy override layer fighting Astryx (**189 `!important`**, **75 `[class*="…"]` attribute-selector rules**, **118 `.astryx-*` hook references**, **9 hard-coded StyleX `.x######` overrides**) |
| Package manager | **npm** (`package-lock.json`; no yarn/pnpm lockfiles) |
| Verdict | Swap is very feasible: (a) Tailwind v4 is already the utility backbone, (b) a token-driven `--cmms-*` semantic layer exists, (c) a shadcn-shaped local kit is ~40% adopted. The real work is replacing Astryx **layout/shell/table/dialog/form** primitives across 56 pages and unwinding the override CSS. |

---

## 2. Tech Stack

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js `^16.2.10` (App Router, Turbopack, `output: "standalone"`) | `package.json`, `next.config.ts` |
| Runtime UI | React `^19.2.4` / react-dom `^19.2.4` | `package.json` |
| Styling engine | Tailwind CSS **v4** via `@tailwindcss/postcss` (CSS-first config; no JS config file anywhere in `frontend/`) | `postcss.config.mjs`, `app/globals.css` |
| Design system (outgoing) | `@astryxdesign/core ^0.1.9`, `@astryxdesign/theme-neutral ^0.1.9`, `@astryxdesign/cli ^0.1.9` (npm script `"astryx"`); both core packages listed in `next.config.ts` `transpilePackages` | `package.json`, `next.config.ts` |
| Atomic CSS engine | `@stylexjs/stylex ^0.19.0` — Astryx emits `.x######` StyleX classes at runtime | `package.json`, override rules in `globals.css` |
| Incoming kit (shadcn-shaped) | `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `tailwind-merge ^3.6.0`, `lucide-react ^1.33.0` | `components/ui/button.tsx`, `lib/cn.ts` |
| Icons | Both `@heroicons/react ^2.2.0` (shell/menus) **and** `lucide-react` (ui-kit guideline) | `(dashboard)/layout.tsx`, ui components |
| Data fetching | `@tanstack/react-query ^5.x` (`QueryClient` in `components/Providers.tsx`) + fetch wrapper `lib/api.ts` | `Providers.tsx` |
| Tables | Astryx `Table` today; `@tanstack/react-table ^9.1.2` already a dependency | page imports, `package.json` |
| Forms | Astryx inputs today; `react-hook-form ^7.85` + `zod ^4.4` + `@hookform/resolvers ^5.9` already deps | `package.json` |
| Theming | `next-themes ^0.4.6` (`attribute="class"`) + custom DB-driven `ThemeProvider` writing CSS variables at runtime | `Providers.tsx`, `ThemeProvider.tsx` |
| Charts | `recharts ^3.10.0` | `package.json` |
| Backend API | Unchanged PHP (Sage 300 / MySQL) behind Next rewrites: `/api/:path*` → `http://localhost:8081/api/:path*` | `next.config.ts rewrites()` |
| Auth flow | PHP session endpoints proxied (`/login.php`, `/logout.php`, `/line_login.php`, `/line_callback.php`, `/bind_line.php`); client guard in `(dashboard)/layout.tsx`; one Next route handler `app/api/login/route.ts` | `next.config.ts`, layouts |
| PWA / offline | `manifest.webmanifest`, `PwaRegister`, `SplashScreen`, offline queue (`lib/offlineQueue.ts`, `lib/offline-store.ts`, `lib/queue-migration.ts`) | root layout, `lib/*` |
| Codegen tooling | `scaffold.js`, `_templates/` (page scaffolding); `fix_cards.js`, `fix_closing.js` one-off scripts | repo files |

---

## 3. Page Inventory

**Total: 91 `page.tsx` routes**, plus 1 API route (`app/api/login/route.ts`),
root `app/layout.tsx`, and `(dashboard)/layout.tsx` + `error.tsx` +
`loading.tsx` + `not-found.tsx`.

### 3.1 Inside the `(dashboard)` route group — 83 pages, 26 modules

| Module | Pages | Routes |
|---|---|---|
| repair | **10** | `/repair`, `/repair/create`, `/repair/edit`, `/repair/view`, `/repair/tracking`, `/repair/my_tasks`, `/repair/history`, `/repair/kanban`, `/repair/workload`, `/repair/assign` |
| spare_parts | **8** | `/spare_parts`, `…/create`, `…/edit`, `…/issue_center`, `…/sage_po`, `…/sage_sync`, `…/optimization`, `…/stock_take` |
| settings | **7** | `/settings`, `…/design`, `…/notifications`, `…/repair-options`, `…/services`, `…/menus`, `…/pwa` |
| pm_am | **6** | `/pm_am`, `…/create`, `…/edit`, `…/calendar`, `…/checksheet`, `…/batch_schedule` |
| asset_registry | **5** | `/asset_registry`, `…/create`, `…/edit`, `…/bom_tree`, `…/criticality` |
| calibration | 3 | `/calibration`, `…/create`, `…/edit` |
| equipment_borrowing | 3 | `/equipment_borrowing`, `…/create`, `…/edit` |
| forms | 3 | `/forms`, `…/designer`, `…/run/[id]` |
| inspections | 3 | `/inspections`, `…/run`, `…/templates` |
| manuals | 3 | `/manuals`, `…/create`, `…/edit` |
| mtbf_mttr | 3 | `/mtbf_mttr`, `…/create`, `…/edit` |
| reports | 3 | `/reports`, `…/monthly_pdf`, `…/export_excel` |
| roles | 3 | `/roles`, `…/create`, `…/edit` |
| suppliers | 3 | `/suppliers`, `…/create`, `…/edit` |
| users | 3 | `/users`, `…/create`, `…/edit` |
| analytics | 2 | `/analytics`, `/analytics/kpi` |
| approval | 2 | `/approval`, `/approval/center` |
| assets | 2 | `/assets`, `/assets/create` |
| editor | 2 | `/editor`, `/editor/builder` |
| notifications | 2 | `/notifications`, `/notifications/history` |
| pages (CMS) | 2 | `/pages`, `/pages/[slug]` |
| andon-board | 1 | `/andon-board` |
| dashboard | 1 | `/dashboard` |
| iot | 1 | `/iot/monitor` |
| profile | 1 | `/profile` |
| safety | 1 | `/safety/work_permit` |
| **Subtotal** | **83** | |

### 3.2 Outside the group (public / LIFF / auth shell) — 8 pages

| Route | Purpose |
|---|---|
| `/` (`app/page.tsx`) | entry/redirect |
| `/login` | login (PHP session via proxy) |
| `/register` | user registration |
| `/change-password` | forced first-login password change |
| `/scan` | barcode/QR scanner |
| `/qr-sheet` | QR sheet lookup |
| `/repair/request` | LIFF repair request form |
| `/repair-request` | standalone LIFF request variant |

### 3.3 Dead/demo code

`frontend/src/app/` holds 3 Astryx demo pages copied from the UIKit examples
(`shell-side-nav/page.tsx`, `settings-sidebar/page.tsx`, `editor/page.tsx`;
files carry Meta copyright headers). With root `app/` present these are **not
routed**. One loose string reference to them exists in
`app/(dashboard)/settings/design/page.tsx` — verify and clean up during
migration. These 3 files account for the "src\app" entries in the Astryx file
counts below.

---

## 4. Astryx Component Inventory

Import style: deep ESM paths — `import { X } from "@astryxdesign/core/X"`.
Counts are **import-line occurrences** across `app/`, `components/`, `lib/`,
`src/`. **65 files** reference Astryx in total:

| Location | Files |
|---|---|
| `app/(dashboard)/**` pages | 56 |
| shared components (`MenuSection`, `ThemeSettingsPanel`, `ImageUploadField`, `EmailNotifySettings`, `AnimatedDialog`, `LayoutDndEditor`) | 6 |
| dead demos in `src/app/**` | 3 |

### 4.1 Hard dependencies by usage volume (imports that must be replaced)

| Astryx module | Import lines | Group | shadcn/ui replacement target |
|---|---|---|---|
| `Text`, `Heading` | 59 | typography | Tailwind classes; no component needed |
| `Layout`, `LayoutContent`; `Stack`/`VStack`/`HStack` | 57 + 5 | layout/shell | **Biggest gap**: shadcn has no layout primitives → flex/grid utilities or a tiny local wrapper |
| `Card` | 52 | cards | `components/ui/card.tsx` ✅ exists |
| `TextInput` | 41 | forms | `components/ui/input.tsx` ✅ exists |
| `Selector` (dropdown select) | 31 | forms | `components/ui/select.tsx` ✅ exists (hand-rolled → re-base on Radix) |
| `Grid` | 27 | layout | Tailwind grid utilities |
| `Table` + `proportional`/`pixel` + `useTablePagination` + `TableColumn` type | 24 | tables | TanStack Table (dep present) + `components/ui/table.tsx` ✅ |
| `Spinner` | 19 | feedback | `components/ui/spinner.tsx` ✅ |
| `Banner` | 19 | feedback | `components/ui/alert.tsx` ✅ |
| `TextArea` | 15 | forms | `components/ui/textarea.tsx` ✅ |
| `Toolbar` | 14 | layout | flex pattern or small local component |
| `Button` | 12 | buttons | `components/ui/button.tsx` ✅ (cva-based) |
| `Breadcrumbs`, `BreadcrumbItem` | 12 | nav | new breadcrumb component |
| `Icon`, `NavIcon`, `IconButton` | 12+2+1 | buttons/nav | lucide-react directly + local icon-button |
| `Field`, `FormLayout` | 11 + 11 | forms | shadcn Form pattern (RHF + zod — deps ready) |
| `Dialog` (+ `DialogHeader`) | 11 | modals | Radix-based dialog (re-base existing hand-rolled one) |
| `Switch` | 9 | forms | `components/ui/switch.tsx` ✅ (re-base on Radix) |
| `Badge` | 7 | badges | `components/ui/badge.tsx` ✅ |
| `EmptyState` | 7 | feedback | `components/ui/empty-state.tsx` ✅ |
| `Divider` | 6 | layout | separator (Radix) or `<hr>` utility |
| `hooks` (`useMediaQuery`) | 5 | hooks | small local `useMediaQuery` |
| `DateInput` | 5 | forms | shadcn calendar+popover (needs a date-picker decision) |
| `Avatar` | 4 | misc | shadcn avatar or current img chip |
| `TabList`, `Tab` | 4 | tabs | `components/ui/tabs.tsx` ✅ (re-base on Radix) |
| `List`, `Link`, `FileInput`, `StatusDot`, `Center`, `Section` | 3–2 each | misc | trivial replacements |
| `AppShell` | 2 | layout/shell | **Critical path**: replace with local shell + shadcn Sidebar recipe |
| `SideNav`, `SideNavItem`, `SideNavSection`, `SideNavHeading` | 3 | layout/shell | custom perm-driven nav (shadcn Sidebar as base) |
| `TopNav`, `TopNavHeading` | 1 | layout/shell | local topbar component |
| `SegmentedControl`, `MoreMenu`, `Pagination`, `CheckboxInput` | 1 each | misc | toggle-group / dropdown-menu / pagination / checkbox |

### 4.2 Visual-only couplings (no import — break silently)

All in CSS/DOM, mostly `app/globals.css`:

- **75 attribute-selector override rules** targeting Astryx StyleX output:
  `[class*="Button_primary"]`, `[class*="Card_card"]`, `[class*="Table_table"]`,
  `[class*="TableRow_row"]`, `[class*="Badge_badge"]`, `[class*="SideNav_sideNav"]`,
  `[class*="TopNav_topNav"]`, `[class*="Dialog_dialog"]`, `[class*="TextInput_input"]`,
  `[class*="Selector_trigger"]`, `[class*="TextArea_textarea"]`,
  `[class*="ProgressBar_*"]`, `[class*="LayoutContent"]`, `[data-astryx-card]`, …
- **118 references** to semantic `.astryx-*` hooks: `.astryx-app-shell`,
  `.astryx-layout-panel/-content`, `.astryx-top-nav`, `.astryx-side-nav*`,
  `.astryx-stack`, `.astryx-text`, `.astryx-field`, `.astryx-table-scroll-wrapper`, …
- **9 hard-coded StyleX atomic overrides** (`.x78zum5`, `.x6s0dn4`,
  `.x1txdalj`, …) patching the SideNav heading internals — extremely brittle.
- `components/CardTableLabels.tsx` injects `data-label` into **Astryx** tables at
  runtime (powers the mobile card-table view).
- `(dashboard)/layout.tsx` mobile hamburger programmatically clicks Astryx's
  hidden `button[aria-label="Open navigation"]`.
- Print/reduced-motion blocks target `[class*="SideNav"]`, `[class*="TopNav"]`,
  `[class*="AppShell"]`.

These die naturally once Astryx is removed, but the behaviors they force
(sidebar theme, table zebra/hover, input focus rings, mobile stacking) must be
rebuilt against the replacement components.

---

## 5. CSS Architecture Findings

**Single global stylesheet:** `app/globals.css` — 2,628 lines, 113.5 KB.
Other style inputs: `design-system/tokens.css` (repo root, 50 lines) and an
inline splash `<style>` block in `app/layout.tsx`.

Declared layer order:

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
```

Import order in `globals.css`:

1. Google Fonts (Inter, Roboto, Noto Sans Thai, Barlow Condensed)
2. `../../design-system/tokens.css` → `--tp-*` TOPPAN brand tokens
3. Tailwind v4: `theme.css` (layer theme), `preflight.css` (layer base),
   `utilities.css` (layer utilities)
4. `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css`,
   `@astryxdesign/theme-neutral/theme.css`, `@astryxdesign/core/tailwind-theme.css`
5. `@custom-variant dark` bound to the `.dark` class (next-themes)
6. `@theme` block: indigo/purple utilities remapped to TOPPAN Blue; semantic
   colors exposed as Tailwind utilities (`bg-primary`, `text-ink`, `border-line`,
   `bg-surface`, …) — all aliased to `--cmms-*` variables

Token tiers:

| Tier | Prefixes | Defined in | Consumed by |
|---|---|---|---|
| Brand constants | `--tp-*` | `design-system/tokens.css` | globals.css |
| Astryx-compatible tokens | `--color-*` | theme-neutral package + manual `:root`/`.dark` re-declaration in globals.css | Astryx components, overrides |
| App semantic tokens | `--cmms-*` (419 occurrences) | globals.css `:root` + `.dark` | `components/ui/*`, Tailwind `@theme`, hand-rolled classes |

**Answer to "is there a separate hand-rolled cmms-* layer?"** — Yes,
fully hand-rolled and independent of Astryx. The production HTML classes you
saw are all from this layer (plus inline styles):

- `cmms-skeleton` — shimmer skeleton (`globals.css`), used by
  `(dashboard)/loading.tsx` and `components/ui/skeleton.tsx`
- `cmms-mobile-app-bar` / `cmms-mobile-bottom-nav` / `cmms-mobile-nav-*` —
  native app shell below 1024 px that **replaces** Astryx TopNav/SideNav on
  mobile (Astryx's own topnav is force-hidden via CSS)
- `cmms-splash*` — inline `<style>` + DOM in `app/layout.tsx`
- Also: `cmms-ui-table`, `cmms-kpi-card`, `cmms-page-hero` (+ per-module
  `data-hero` gradient themes set by `ThemeProvider`), `cmms-toast*`,
  `cmms-palette*` (Ctrl+K), dialog open/close animations on native `<dialog>`
  (+ `cmms-close-work-modal` mobile bottom-sheet), login page styles, LIFF /
  standalone mobile styles, Andon lamp/board styles, offline/bind banners.

**Override tax quantified** (what makes removal messy today):

| Metric | Count |
|---|---|
| `!important` declarations | 189 |
| `[class*="…"]` attribute-selector rules | 75 |
| `.astryx-*` semantic hook references | 118 |
| hard-coded `.x######` StyleX overrides | 9 |
| `globals.css` total | 2,628 lines / 113.5 KB |

---

## 6. Custom hooks / providers / utilities coupled to Astryx

| File | Coupling | shadcn-era plan |
|---|---|---|
| `components/ThemeProvider.tsx` (266 lines) | Applies DB-driven presets by writing inline vars on `<html>` using **Astryx token names** (`--color-accent`, `--color-background-body`, `--color-background-surface/card`, …) plus `--cmms-*`; listens to `cmms-theme-preview`; sets `data-hero` per route; toggles `html.cmms-no-anim`; re-applies on dark switch | Keep concept; rewrite to write only `--cmms-*` (or shadcn token names); remove Astryx var writes |
| `components/AnimatedDialog.tsx` | Wraps **Astryx `Dialog`** to add exit animation (`cmms-dialog-closing` class, delayed unmount) | Re-base on Radix Dialog (native exit-animation support) |
| `components/CardTableLabels.tsx` | Injects `data-label` into **Astryx Table** DOM for mobile card view | Retarget to new table component |
| `(dashboard)/layout.tsx` shell | Hard imports of `AppShell`, `Layout`, `SideNav*`, `TopNav*`, `Stack`, `Text`, `Badge`, `Icon`, `IconButton`, `NavIcon`; hamburger clicks Astryx's hidden `"Open navigation"` button | Full shell rebuild (shadcn Sidebar + local topbar); keep perm logic |
| `components/SideNavSearch*.tsx`, `SideNavScrollControls.tsx`, `MenuSection.tsx`, `CommandPalette.tsx` | Built around Astryx SideNav DOM/CSS hooks | Port to new sidebar primitives; palette is self-contained (keep) |
| `components/ToastProvider.tsx` | Self-contained (`cmms-toast` CSS) — **not** Astryx-coupled | Keep as-is (or swap for sonner later; optional) |
| `components/ThemeModeToggle.tsx` | Uses next-themes only | Keep |
| `lib/useMenuPermission.ts` | API-driven permissions (feeds nav visibility & role bottom-nav) — not UI-lib-coupled | Keep untouched |
| `lib/i18n.ts`, `i18n-liff.ts` | Custom dictionary i18n (`t()`, `useLang`) — not UI-lib-coupled | Keep untouched |
| `lib/cn.ts` | Standard clsx + tailwind-merge | Keep (this is what shadcn uses) |

Not coupled (no migration work): `LiffBridge`, `PwaRegister`, `SplashScreen`,
offline queue libs, `react-query` provider, auth guard fetch logic.

---

## 7. Tailwind readiness check (question 5)

**Tailwind is fully configured and usable app-wide already.**

- Tailwind **v4** with `@tailwindcss/postcss` in `postcss.config.mjs`
- No `tailwind.config.ts/js` exists — correct for v4: content detection is
  automatic, config lives in CSS (`@theme` in `globals.css`)
- Utilities are actively used across the codebase (the entire `components/ui/*`
  kit is utility-based; layouts mix Astryx props with utility classes such as
  `text-[0.8rem]`, `bg-[var(--cmms-bg-muted)]`)
- `@custom-variant dark` is bound so all `dark:` variants work with next-themes'
  `.dark` class strategy
- Semantic color utilities (`bg-primary`, `text-danger`, `border-line`, …)
  already resolve through `@theme` → `--cmms-*` aliases

Nothing needs installing for Tailwind itself; a future shadcn init only adds
`components.json` + Radix deps + `tw-animate-css`-style keyframes.

---

## 8. Migration Risks & Considerations (Astryx → shadcn/ui)

1. **Two kits coexist mid-flight.** 38 pages use `components/ui/*`, 56 use
   Astryx directly. Both define Button/Card/Badge/Dialog/Table/Table-like
   names. Plan an explicit cutover per module; never edit both kits' same-name
   components simultaneously without an alias strategy.
2. **No Radix yet.** Existing `dialog/select/tabs/switch` ui files are
   hand-rolled (package.json has zero `@radix-ui/*`). Initializing shadcn will
   add Radix deps — behavior differences (focus trap, portal, ESC handling)
   must be regression-tested against current native-`<dialog>` flows.
3. **Dialog/exit-animation pattern.** `AnimatedDialog` + `dialog[open]` +
   `cmms-dialog-closing` CSS + mobile bottom-sheet (`.cmms-close-work-modal`,
   drag handle, safe-area footer) is tuned to native `<dialog>`. Radix Dialog
   animates via `data-state` — this CSS block needs a full port.
4. **Table API surface.** ~24 import lines use Astryx `Table` with column
   config helpers (`proportional()`, `pixel()`), `useTablePagination`, and the
   `TableColumn` type. Map onto TanStack Table (already a dep) + a thin local
   wrapper preserving `data-label` card-stacking behavior.
5. **Layout primitives gap.** `VStack/HStack/Layout/LayoutContent/Grid/Center/
   Section/Stack` appear in ~60+ files. shadcn has no equivalent — decide:
   tiny local wrappers (fastest mechanical swap) vs. rewriting to raw flex/grid
   utilities (cleanest, biggest diff).
6. **Shell is the critical path.** `AppShell` owns viewport geometry, resizable/
   collapsible SideNav, mobile drawer, and the `<1024px` swap to
   `cmms-mobile-app-bar/bottom-nav`. Rebuild once, centrally, in
   `(dashboard)/layout.tsx`; keep `useMenuPermission` driving items.
7. **ThemeProvider writes Astryx token names at runtime** (`--color-accent`,
   …). If those names vanish, DB-driven presets silently stop working. Decide
   the target token contract first (recommend keeping `--cmms-*` as the single
   source and aliasing shadcn's `--primary/--background/...` to them in
   `@theme`).
8. **Dark-mode duplication.** Light values live in `:root`, dark overrides in
   `.dark`, while the Astryx packages also ship their own light/dark values.
   After removal, consolidate into one place or risk regressions.
9. **Override CSS unwind.** 189 `!important`s and 75 attribute-selectors exist
   to fight Astryx. Delete them *per component cutover*, not upfront, or pages
    still on Astryx lose styling.
10. **StyleX residue.** `@stylexjs/stylex` is a direct dependency; verify no
    app code calls it directly (none found in app/components/lib/src — it comes
    via Astryx). Removing Astryx removes the `.x######` class stream and the
    need for `transpilePackages` entries.
11. **package.json cleanup (later phase).** Remove `@astryxdesign/*` deps, the
    `"astryx"` script, `transpilePackages`, and decide on dual icon libraries
    (heroicons in shell vs lucide in kit). Out of scope for read-only audit.
12. **Dead demos.** `frontend/src/app/**` (3 Meta-headered demo pages) should
    be deleted during migration after checking the one reference in
    `settings/design/page.tsx`.
13. **Unrelated heavy deps** (jquery, grapesjs, formBuilder, jspdf,
    html2canvas, qrcode) are unaffected by the UI swap but bloat the bundle;
    note for a separate cleanup.
14. **Do not apply the PHP audit docs here.** Their steps (e.g. Step 0 CSS in
    `public/css/ui-polish.css`) belong to the server-rendered app. Keep the two
    migrations strictly separated.

---

## 9. Audit Method (reproducible)

- Config reads: `package.json`, `next.config.ts`, `postcss.config.mjs`,
  `tsconfig.json`, `app/layout.tsx`, `app/(dashboard)/layout.tsx`,
  `components/Providers.tsx`, `components/ThemeProvider.tsx`,
  `components/ui/button.tsx`, `components/AnimatedDialog.tsx`,
  `src/app/shell-side-nav/page.tsx`, `design-system/tokens.css`
- Route census: recursive `page.tsx` / `route.ts` / special-file scan under
  `frontend/app`
- Dependency census: regex scans for `@astryxdesign` (65 files),
  `@astryxdesign/core/<Module>` import-line aggregation,
  `@/components/ui/<name>` aggregation, `@stylexjs/stylex` (0 direct uses)
- CSS metrics: counted `!important`, `[class*=]`, `.astryx-*`, `.x######`,
  `--cmms-*` occurrences in `app/globals.css`

*No files were modified during this audit except the creation of this document.*

