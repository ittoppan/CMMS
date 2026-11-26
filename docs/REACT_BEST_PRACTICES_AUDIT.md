# React Best Practices Audit — CMMS-TOPPAN (frontend)

Date: 2026-11-26
Skill: vercel-react-best-practices (70 rules, 8 categories)

## Summary

Frontend is Next.js 16 (app router) + React 19. Audit focused on CRITICAL/HIGH impact rules (waterfalls, bundle size, server-side). MEDIUM/LOW items noted for follow-up.

## Findings

### CRITICAL — Bundle Size
- **builder page**: `GrapesBuilder` (heavy, embeds GrapesJS) was imported statically → converted to `next/dynamic` with `ssr: false`. ✅ Fixed (commit pending)
- barrel imports (`@/components`, `@/lib`, etc.): none found ✅
- lucide-react full imports: 2 (likely tree-shakeable named imports) — verify
- `transition: all`: only in generated CSS, not source ✅

### CRITICAL — Eliminating Waterfalls
- No obvious sequential `await` chains in component bodies found in spot check. Recommend deeper review of data-fetching pages (dashboard, reports).

### HIGH — Server-Side Performance
- RSC props serialization: not audited in detail (pages use client components heavily).

## Waterfall Audit (async-)
Applied global review. High-await pages (excluding tests) and their status:
- `app/(dashboard)/repair/view/page.tsx` (29 awaits) — awaits are in event handlers (csrf→fetch spare_usage, upload photo, sync). Sequential dependencies legitimate. No render-time waterfall.
- `app/(dashboard)/spare_parts/stock_take/page.tsx` (24) — event handlers + sync. No render waterfall.
- `app/(dashboard)/asset_registry/view/page.tsx` (23) — event handlers. No render waterfall.
- `app/(dashboard)/onboarding/page.tsx` (24) — event handlers. No render waterfall.
- `app/(dashboard)/pm_am/checklists/page.tsx` (17), `repair/page.tsx` (16), `spare_parts/page.tsx` (16), `planning/page.tsx` (14), `inspections/templates/page.tsx` (14), `settings/repair-options/page.tsx` (15), `profile/page.tsx` (16) — event handlers / data load on mount. No obvious render waterfalls.
- `components/RepairRequestForm.tsx` (20), `components/PwaRegister.tsx` (17), `lib/offline/engine.ts` (27), `lib/push.ts` (15) — library/infra, not page render.
Conclusion: `Promise.all` already used in 52 places. No render-time sequential fetch chains found. No further changes needed.

## Content-visibility (rendering-)
- Global rule applied to `.overflow-x-auto` and `.cmms-cv-auto` (all pages) with `contain-intrinsic-size: auto 400px`.
- No per-component edits needed; applies automatically to all scroll containers.

### LOW — JavaScript Performance
- Not audited (low impact).

## Changes Applied
- `frontend/app/(dashboard)/editor/builder/page.tsx`: GrapesBuilder → dynamic import (ssr: false).

## Recommendations (future work)
1. Migrate `outline-none` → `focus-visible:ring-*` across input components (a11y + perf)
2. Apply `content-visibility: auto` to large table/list containers
3. Audit dashboard/reports data fetching for waterfalls
4. Run bundle analyzer (`next build --analyze`) to confirm GrapesBuilder chunk split
