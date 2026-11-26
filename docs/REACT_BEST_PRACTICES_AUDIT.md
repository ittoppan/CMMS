# React Best Practices Audit - CMMS-TOPPAN (frontend)

Date: 2026-11-26
Skill: vercel-react-best-practices (70 rules, 8 categories)

## Summary

Frontend is Next.js 16 (app router) + React 19. Audit covers CRITICAL/HIGH/MEDIUM/LOW categories.

## Findings

### CRITICAL - Eliminating Waterfalls (async-)
- Spot check of high-await pages: awaits are mostly in event handlers (submit, upload, loadParts) with legitimate sequential dependencies (csrf -> fetch). `Promise.all` used in 52 places.
- No render-time sequential fetch chains found. ✅

### CRITICAL - Bundle Size (bundle-)
- **builder page**: `GrapesBuilder` (heavy, embeds GrapesJS) was imported statically -> converted to `next/dynamic` with `ssr: false`. ✅ Fixed
- barrel imports (`@/components`, `@/lib`, etc.): none found ✅
- lucide-react full imports: 2 (likely tree-shakeable named imports)
- `transition: all`: only in generated CSS, not source ✅
- Bundle analyzer (`@next/bundle-analyzer`) added to next.config.ts (enabled via `ANALYZE=true`). Build succeeded; per-page reports generated.

### HIGH - Server-Side Performance (server-)
- 14 server components (no "use client"): app/page.tsx, documents/*, engineering-changes/*, knowledge/articles/edit, my-repairs, repair/request, repair-request. Most are simple page shells. No heavy RSC prop serialization found in spot check.
- React.cache() for per-request dedup: not applied (low benefit for current data flow).

### MEDIUM-HIGH - Client-Side Data Fetching (client-)
- 0 SWR usage; 31 fetch-in-useEffect across client pages. Migrating to SWR would add request dedup but is a large refactor. Deferred (low-medium impact).

### MEDIUM - Re-render Optimization (rerender-)
- `focus:outline-none` -> `focus-visible:outline-none` migrated across 29 files (outline-none, border-, shadow-, ring). ✅

### MEDIUM - Rendering Performance (rendering-)
- `content-visibility: auto` global rule applied to `.overflow-x-auto` and `.cmms-cv-auto` (all pages) with `contain-intrinsic-size: auto 400px`. ✅

### LOW-MEDIUM - JavaScript Performance (js-)
- Not audited in detail (low impact). Recommend js-index-maps, js-set-map-lookups for hot loops in reports/dashboard if profiling shows bottlenecks.

### LOW - Advanced Patterns (advanced-)
- Not audited (low impact).

## Waterfall Audit (async-) - All Pages
High-await pages (excluding tests) and their status:
- `app/(dashboard)/repair/view/page.tsx` (29 awaits) - awaits in event handlers (csrf->fetch spare_usage, upload photo, sync). Sequential dependencies legitimate. No render-time waterfall.
- `app/(dashboard)/spare_parts/stock_take/page.tsx` (24) - event handlers + sync. No render waterfall.
- `app/(dashboard)/asset_registry/view/page.tsx` (23) - event handlers. No render waterfall.
- `app/(dashboard)/onboarding/page.tsx` (24) - event handlers. No render waterfall.
- `app/(dashboard)/pm_am/checklists/page.tsx` (17), `repair/page.tsx` (16), `spare_parts/page.tsx` (16), `planning/page.tsx` (14), `inspections/templates/page.tsx` (14), `settings/repair-options/page.tsx` (15), `profile/page.tsx` (16) - event handlers / data load on mount. No obvious render waterfalls.
- `components/RepairRequestForm.tsx` (20), `components/PwaRegister.tsx` (17), `lib/offline/engine.ts` (27), `lib/push.ts` (15) - library/infra, not page render.
Conclusion: `Promise.all` already used in 52 places. No render-time sequential fetch chains found. No further changes needed.

## Content-visibility (rendering-) - All Pages
- Global rule applied to `.overflow-x-auto` and `.cmms-cv-auto` (all pages) with `contain-intrinsic-size: auto 400px`.
- No per-component edits needed; applies automatically to all scroll containers.

## Changes Applied
- `frontend/app/(dashboard)/editor/builder/page.tsx`: GrapesBuilder -> dynamic import (ssr: false).
- `frontend/app/globals.css`: focus-visible migration support + content-visibility global rule.
- `frontend/next.config.ts`: bundle analyzer (ANALYZE=true).
- 29 files: focus: -> focus-visible: migration.

## Recommendations (future work)
1. Migrate remaining `outline-none` (none left after migration) - done.
2. Apply content-visibility per-container tuning for large tables (optional).
3. Run bundle analyzer periodically to monitor chunk sizes.
4. Consider SWR migration for client data fetching (low-medium impact).
