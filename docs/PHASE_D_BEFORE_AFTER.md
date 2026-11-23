# PHASE D — BEFORE / AFTER

## D1 Repair Request
- Before: ~10 clicks to submit repair request
- After: 4 clicks (machine, status, job type, submit)
- Validation and required fields retained
- Mobile 390px supported

## D2 Wallboard
- Before (baseline report): Lighthouse mobile perf 59, a11y 95, bp 96, TBT 120ms (stale; re-measured)
- After:
  - Data loading split: critical first, secondary deferred
  - axe: 0 violations
  - PWA close button touch target >= 24px
- Lighthouse after (authenticated):
  - Perf 70–79
  - A11y 96–100
  - BP 93–96

## Accessibility
- kpi-strip scrollable region tabIndex fixed
- Profile button aria-label added
- Scan FAB landmark added
- SLA card "ปกติ" text color changed to #93c5fd for contrast