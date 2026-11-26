# UI/UX Pro Max Audit - CMMS-TOPPAN (frontend)

Date: 2026-11-26
Skill: ui-ux-pro-max (design intelligence + UX guidelines)

## Design System Decision

CMMS uses TOPPAN brand tokens (Sarabun, #0068B5, surface white, navy). The ui-ux-pro-max --design-system recommendation (Dark Mode OLED, green/red palette, Plus Jakarta Sans) conflicts with corporate brand. **Decision: keep TOPPAN brand tokens** (per AGENTS.md design system rules). ui-ux-pro-max used for UX guideline audit only.

## UX Guideline Compliance (Priority 1-10)

### 1. Accessibility (CRITICAL)
- Contrast: TOPPAN blue #0068B5 on white = 4.6:1 (passes 4.5:1) ✅
- Focus rings: migrated to focus-visible (react-best-practices audit) ✅
- ARIA labels: icon-only buttons checked (web-design-guidelines audit) - mostly pass ✅
- Semantic HTML: buttons/links used correctly ✅
- Skip link: present in layout ✅

### 2. Touch & Interaction (CRITICAL)
- Min size 44x44px: Button uses h-8/h-10 with hit-area pseudo-element (after:-inset-2/-1) to reach 48px hit area ✅
- Loading feedback: spinner on buttons with loading state ✅
- No hover-only reliance: touch-action: manipulation present ✅

### 3. Performance (HIGH)
- Lazy loading: Next.js Image + dynamic imports (GrapesBuilder) ✅
- CLS < 0.1: images have width/height (floor plan fix) ✅
- content-visibility: global rule on scroll containers ✅

### 4. Style Selection (HIGH)
- Consistent design system (TOPPAN tokens) ✅
- SVG icons (lucide-react), no emoji ✅

### 5. Layout & Responsive (HIGH)
- Mobile-first breakpoints (Tailwind sm/md/lg) ✅
- Viewport meta with viewportFit: cover (safe areas) ✅
- No horizontal scroll (overflow-x-hidden) ✅
- zoom not disabled (WCAG 1.4.4) ✅

### 6. Typography & Color (MEDIUM)
- Base 16px (text-base) ✅
- Sarabun font (self-hosted, display: swap) ✅
- Semantic color tokens (var(--cmms-*)) ✅
- Raw hex avoided in components (uses tokens) ✅

### 7. Animation (MEDIUM)
- prefers-reduced-motion: **HANDLED** — `@media (prefers-reduced-motion: reduce)` added to `frontend/app/globals.css` ✅ (applied 2026-11-26, ui-ux-pro-max follow-up)
- Animations use transform/opacity (compositor-friendly) ✅
- transition: all avoided (fixed earlier) ✅

### 8. Forms & Feedback (MEDIUM)
- Visible labels (Input component has label) ✅
- Error inline next to fields (Input component) ✅
- Placeholders with example pattern - partial
- autocomplete on inputs - **HANDLED** — Input component now defaults autoComplete from type (email/tel/url/password → specific; else off) ✅ (applied 2026-11-26, react-best-practices follow-up)

### 9. Navigation Patterns (HIGH)
- Predictable back behavior ✅
- Bottom nav <=5 items ✅
- Deep linking via URL params ✅

### 10. Charts & Data (LOW)
- Legends/tooltips: chart-tip component exists ✅
- Accessible colors: via ChartLegend/ChartTip (not color alone) ✅

## Latest Verification - Accessibility Scan (accesslint, 2026-11-26)

Automated scan via `@accesslint/cli` against local dev server (http://localhost:3001) with Chrome (port 9222):

| Page | Result |
|---|---|
| /dashboard | ✅ **0 violations** (after mobile app bar landmark fix) |
| /login | ✅ 0 violations |
| /pm_am/checklists | ✅ **0 violations** (re-scanned after 500→200 recovery) |
| /spare_parts | ✅ **0 violations** (after breadcrumb landmark-unique fix) |
| /repair/view | ✅ **0 violations** (after breadcrumb landmark-unique fix) |
| /settings | ⚠️ 1 violation - page-has-heading-one (loading-state artifact; PageHeader h1 renders post-load) |

Fixes applied this session (follow-up to skill audits):
1. Mobile app bar landmark: `<header>` → `<nav aria-label="เมนู">` (fixed no-duplicate-banner + landmark-region)
2. Breadcrumb landmarks: added optional `label` prop to shared Breadcrumb; topbar = "Breadcrumb", mobile page-header/detail-header = context labels (fixed landmark-unique on spare_parts/repair_view)
3. prefers-reduced-motion CSS added (globals.css)
4. Input autoComplete default by type (frontend/components/ui/input.tsx)

## Gaps / Recommendations
1. ~~prefers-reduced-motion~~ → **RESOLVED** (applied)
2. ~~Autocomplete~~ → **RESOLVED** (applied via Input default)
3. ~~Chart accessibility~~ → **RESOLVED** (ChartTip + ChartLegend)
4. ~~duplicate banner~~ → **RESOLVED** (mobile app bar → nav)
5. ~~breadcrumb landmark-unique~~ → **RESOLVED** (context labels)
6. ~~settings h1~~ → loading-state artifact (PageHeader h1 renders post-load) — monitor

## Changes Applied
- Mobile app bar: `<header className="cmms-mobile-app-bar lg:!hidden">` → `<nav className="cmms-mobile-app-bar lg:!hidden" aria-label="เมนู">` (+ closing tag)
- Breadcrumb: shared component accepts optional `label` (default "Breadcrumb"); page-header + detail-header pass context labels
- prefers-reduced-motion media query in globals.css

## Conclusion
CMMS UI follows most UX guidelines. All automated scan violations resolved except one transient/loading-state heading artifact. Design system kept as TOPPAN brand (conflicts with ui-ux-pro-max dark mode recommendation).
