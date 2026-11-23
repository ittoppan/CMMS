# PHASE D2 — Lighthouse Results (Wallboard)

## Measurement Protocol (Controlled)
- Build: `NEXT_DIST_DIR=.next-verify npm run build` (same production build)
- Server: `next start` on `http://localhost:3002`
- Viewport: mobile 390x844, deviceScaleFactor 3
- Auth: authenticated session cookie (verified finalUrl = Wallboard)
- Storage reset: disabled (reuse logged-in Chrome profile)
- Network: default (no throttling override beyond Lighthouse mobile)
- Runs: 3 valid authenticated runs (redirect-to-login runs excluded)

## Valid Runs
| Run | finalUrl | Perf | A11y | BP | TBT | LCP |
|---|---|---:|---:|---:|---:|---:|
| y1 | /dashboard/wallboard | 80 | 100 | 96 | 680 ms | 2.5 s |
| y2 | /dashboard/wallboard | 79 | 100 | 96 | 740 ms | 2.5 s |
| z1 | /dashboard/wallboard | 82 | 100 | 96 | 620 ms | 2.5 s |

## Median / Range
- Performance: median 80 (min 79, max 82)
- Accessibility: 100 (all runs)
- Best Practices: 96 (all runs)
- TBT: median 680 ms (min 620 ms, max 740 ms)
- LCP: 2.5 s (all runs)

## Excluded Runs
- Runs that redirected to `/login` were excluded (not counted as Wallboard results).

## Notes
- Earlier D2 baseline (before hardening): Perf 70–79, TBT 780 ms, LCP 2.5 s, A11y 96–100, BP 93–96.
- Console errors from static 404/MIME resolved by serving production build via `next start` with distDir.
- axe: 0 violations on latest valid run.
