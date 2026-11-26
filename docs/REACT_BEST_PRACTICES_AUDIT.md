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

### MEDIUM — Rendering / Re-render
- `outline-none` without `focus-visible` replacement: 38 instances in source (mostly inputs with `focus:ring-*`). ✅ Migrated `focus:` → `focus-visible:` across 29 files (outline-none, border-, shadow-, ring) via script.
- `content-visibility` for long lists: not applied. Recommend for tables/lists >50 rows (needs profiling).

### LOW — JavaScript Performance
- Not audited (low impact).

## Changes Applied
- `frontend/app/(dashboard)/editor/builder/page.tsx`: GrapesBuilder → dynamic import (ssr: false).

## Recommendations (future work)
1. Migrate `outline-none` → `focus-visible:ring-*` across input components (a11y + perf)
2. Apply `content-visibility: auto` to large table/list containers
3. Audit dashboard/reports data fetching for waterfalls
4. Run bundle analyzer (`next build --analyze`) to confirm GrapesBuilder chunk split
