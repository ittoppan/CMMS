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
High-await files reviewed (excluding tests). Most `await` calls are inside event handlers (submit, upload, loadParts) where sequential dependencies are legitimate (csrf → fetch). `Promise.all` is used in 52 places already. No obvious render-time sequential fetch chains found in spot checks. Recommend deeper review of:
- `app/(dashboard)/repair/view/page.tsx` (29 awaits)
- `app/(dashboard)/spare_parts/stock_take/page.tsx` (24)
- `app/(dashboard)/asset_registry/view/page.tsx` (23)
- `app/(dashboard)/onboarding/page.tsx` (24)

## Content-visibility (rendering-)
- Utility class `.cmms-cv-auto` added (opt-in). Apply to list/table containers with >50 rows.
- No auto-application to avoid layout shift (needs `contain-intrinsic-size` tuning per container).

### LOW — JavaScript Performance
- Not audited (low impact).

## Changes Applied
- `frontend/app/(dashboard)/editor/builder/page.tsx`: GrapesBuilder → dynamic import (ssr: false).

## Recommendations (future work)
1. Migrate `outline-none` → `focus-visible:ring-*` across input components (a11y + perf)
2. Apply `content-visibility: auto` to large table/list containers
3. Audit dashboard/reports data fetching for waterfalls
4. Run bundle analyzer (`next build --analyze`) to confirm GrapesBuilder chunk split
