# PHASE D2 — Performance Report (Wallboard)

## Scope
- Target: Wallboard authenticated mobile view.
- Constraints respected: no DB schema/API contract/business logic/auth changes; no mock KPI; no feature removal.

## Root Cause (Main Thread)
1. Recharts bundle parse/eval (~400KB chunk) executed during initial load, causing long tasks.
2. All chart panels rendered on first paint (even below the fold), increasing style/layout and React render cost.
3. Chart animations enabled, adding main-thread work.
4. Secondary data (monthly trend, plant map, spare, MTBF) loaded eagerly.
5. Spare/MTBF endpoints called unconditionally, producing 403 for User role and wasted work.

## Changes Applied
- `frontend/next.config.ts`: `experimental.optimizePackageImports` for `recharts`, `lucide-react`.
- `frontend/app/(dashboard)/dashboard/wallboard/page.tsx`:
  - Permission gating before spare/MTBF calls; No Permission UI states.
  - Deferred secondary fetch via `requestIdleCallback` (fallback `setTimeout`).
  - `IdleChart` wrapper using `IntersectionObserver` (rootMargin 0) to defer off-screen chart rendering.
  - Disabled Recharts animations (`isAnimationActive={false}`).
  - Expanded touch target in `frontend/components/PwaRegister.tsx` (min 24x24px).
- `content-visibility: auto` retained on `Panel`.

## Before / After (Authenticated Mobile, 390px)
| Metric | Before D2 | After D2 (median of 3 valid runs) |
|---|---:|---:|
| Performance | 70–79 | 80 |
| Accessibility | 96–100 | 100 |
| Best Practices | 93–96 | 96 |
| TBT | 780 ms | 680 ms |
| LCP | 2.5 s | 2.5 s |

## Remaining Gap
- TBT target <300 ms not met (680 ms median). Root cause remains Recharts bundle parse/eval on main thread. Further reduction requires code-splitting Recharts into a lazily loaded module; `next/dynamic` does not support named exports of a library, so extraction to a separate component file is the next step. No functions were removed to inflate score.

## Regression
- tsc --noEmit: PASS
- Production build (`NEXT_DIST_DIR=.next-verify npm run build`): PASS
- axe: 0 violations (latest valid run)
