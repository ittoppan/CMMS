# PHASE D — TEST RESULTS

## TypeScript
- `tsc --noEmit`: PASS

## Production build
- `NEXT_DIST_DIR=.next-verify npm run build`: PASS

## axe-core
- Wallboard dev (390px + desktop): 0 violations
- baseline-level1.spec.ts: 6/6 PASS

## design-audit
- PASS (0 FAIL, 2 WARN hex in `/dashboard/my`)

## Playwright / E2E
- D1 click count spec (real User): 4 clicks, submit success
- Roles tested: User (e2e_user)

## Lighthouse (authenticated mobile)
- Perf: 70–79
- Accessibility: 96–100
- Best Practices: 93–96
- TBT: 780ms
- LCP: 2.5s

## Limitations
- Chrome debug profile session required for authenticated Lighthouse.
- Service worker cache affects results.
- User role lacks permission to spare/MTBF endpoints (403).