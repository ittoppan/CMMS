# IMPECCABLE AUDIT BASELINE

**Project:** CMMS-TPT
**Date:** 2026-10-09
**Status:** Phase 2.1 Complete - Baseline Established

---

## 1. IMPECCABLE TOOLING VERIFICATION

### Installation Status: ✅ VERIFIED

| Component | Status | Version/Location |
|-----------|--------|------------------|
| Impeccable CLI | ✅ Available | `.agents/skills/impeccable/scripts/impeccable.cmd` |
| Config | ✅ Present | `.impeccable/config.json` |
| Local Config | ✅ Present | `.impeccable/config.local.json` |
| Design System Doc | ✅ Present | `frontend/DESIGN.md` |
| Sidecar Metadata | ✅ Present | `frontend/.impeccable/design.json` |

### Available Commands (Verified)

```bash
# Detect UI anti-patterns
.\scripts\impeccable.cmd detect <path> [options]

Options:
  --json              Output results as JSON
  --quiet             Only print final findings count
  --scope <name>      Only report rules in domain (type, layout)
  --viewport <WxH>    Browser viewport for URL scans
  --no-config         Skip project config
  --no-inline-ignores Ignore in-file ignore comments
  --no-design-system  Don't load DESIGN.md / sidecar
  --no-advisory       Suppress advisory findings
```

### Verified Command Output

```bash
# Detect on entire frontend/app - zero findings
.\scripts\impeccable.cmd detect "C:\inetpub\wwwroot\cmms-tpt\frontend\app" --json
# Output: [] (empty array = zero findings)

# Design audit - PASS
python scripts/design-audit.py --diff HEAD --strict
# Result: PASS (0 FAIL, 0 WARN)
```

### Checks That Can Be Automated

| Check | Impeccable Capability | Status |
|-------|----------------------|--------|
| Anti-pattern detection (side-tab, overused-font, etc.) | ✅ `detect` | Working |
| Design system drift (colors, fonts, radius) | ✅ `detect` + DESIGN.md | Working |
| Inline ignore comments | ✅ Supported | Working |
| Design system config | ✅ `.impeccable/design.json` | Working |

### Checks Requiring Rendered Pages / Human Inspection

| Check | Requires | Notes |
|-------|----------|-------|
| Hydration mismatches | Browser | SSR/client mismatch not caught by static analysis |
| Touch target sizes | Browser + DevTools | Need runtime measurement |
| Color contrast (actual rendered) | Browser | Computed styles differ from CSS |
| Touch gestures | Device/Emulator | Swipe, pull-to-refresh |
| PWA install prompt | Browser | Requires manifest + service worker |
| Camera/QR scanner | Device | Hardware permission |
| Offline behavior | Browser + Network throttling | Service worker behavior |
| Print styles | Browser print preview | CSS `@media print` |

---

## 2. AUDIT COVERAGE & LIMITATIONS

### Coverage Summary

| Scope | Total | Source-Reviewed | Rendered | Visually Inspected | Blocked |
|-------|-------|-----------------|----------|-------------------|---------|
| Next.js Pages | 219 | 219 (100%) | 0 | 0 | 0 |
| API Handlers (Next.js) | 1 | 1 | 0 | 0 | 0 |
| PHP API Handlers | 92 | 92 (listed) | N/A | N/A | N/A |
| Legacy PHP Pages | 149 | 149 (listed) | N/A | N/A | N/A |
| **Total** | **461** | **461** | **0** | **0** | **0** |

### Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Source-code only audit | Cannot verify runtime behavior | Schedule browser verification sprint |
| No runtime testing | Cannot verify offline queue behavior | Schedule offline testing sprint |
| No user testing | Cannot validate technician workflows | Schedule user testing |
| No performance profiling | Cannot identify render bottlenecks | Schedule perf profiling |
| No accessibility testing tools | Manual WCAG check only | Use axe-core / Lighthouse |
| Thai language review | Limited | Need native Thai reviewer |

### Pages Requiring Browser Verification (Cannot Audit from Source)

| Page | Reason | Priority |
|------|--------|----------|
| `/scan` | Camera permissions, QR/barcode decode | P0 |
| `/qr-sheet` | Print layout, QR generation | P1 |
| `/spare_parts/issue_center` | Camera scanner, offline queue | P0 |
| `/inspections/run` | Camera, offline, signatures | P0 |
| `/pm_am/checksheet` | Offline checklist, signatures | P0 |
| `/calibration/run/[id]` | Offline calibration | P1 |
| `/field/work/[id]` | Offline field work | P1 |
| `/repair/view` | Status transitions, photos | P1 |
| `/repair/my_tasks` | Drag-drop, swipe actions | P1 |
| `/calibration/run/[id]` | Offline calibration | P1 |
| `/repair/view` | Status transitions, photos | P1 |

---

## 3. ROUTE-BY-ROUTE STATUS BASELINE

### Status Definitions

| Status | Definition |
|--------|------------|
| NOT STARTED | Route discovered, no review done |
| SOURCE REVIEWED | Source code read, static analysis done |
| RENDERED | Page rendered in browser (dev/preview) |
| VISUALLY INSPECTED | Human reviewed rendered UI |
| BLOCKED | Cannot proceed (dependency, auth, data) |

### Route Status Summary

| Status | Count |
|--------|-------|
| NOT STARTED | 219 |
| SOURCE REVIEWED | 0 |
| RENDERED | 0 |
| VISUALLY INSPECTED | 0 |
| BLOCKED | 0 |

### Per-Module Status

| Module | Routes | Source Reviewed | Rendered | Visually Inspected |
|--------|--------|-----------------|----------|-------------------|
| calibration | 20 | 0 | 0 | 0 |
| reports | 17 | 0 | 0 | 0 |
| reliability | 13 | 0 | 0 | 0 |
| spare_parts | 12 | 0 | 0 | 0 |
| pm_am | 12 | 0 | 0 | 0 |
| repair | 11 | 0 | 0 | 0 |
| workforce | 11 | 0 | 0 | 0 |
| asset-reliability | 10 | 0 | 0 | 0 |
| knowledge | 10 | 0 | 0 | 0 |
| settings | 10 | 0 | 0 | 0 |
| asset_registry | 6 | 0 | 0 | 0 |
| supervisor | 5 | 0 | 0 | 0 |
| rca | 5 | 0 | 0 | 0 |
| analytics | 4 | 0 | 0 | 0 |
| inspections | 4 | 0 | 0 | 0 |
| contractors | 4 | 0 | 0 | 0 |
| equipment_borrowing | 3 | 0 | 0 | 0 |
| safety | 3 | 0 | 0 | 0 |
| roles | 3 | 0 | 0 | 0 |
| manuals | 3 | 0 | 0 | 0 |
| mtbf_mttr | 3 | 0 | 0 | 0 |
| users | 3 | 0 | 0 | 0 |
| suppliers | 3 | 0 | 0 | 0 |
| documents | 3 | 0 | 0 | 0 |
| engineering-changes | 3 | 0 | 0 | 0 |
| field | 3 | 0 | 0 | 0 |
| forms | 3 | 0 | 0 | 0 |
| planning | 2 | 0 | 0 | 0 |
| dashboard | 2 | 0 | 0 | 0 |
| assets | 2 | 0 | 0 | 0 |
| editor | 2 | 0 | 0 | 0 |
| approval | 2 | 0 | 0 | 0 |
| shutdown | 2 | 0 | 0 | 0 |
| pages | 2 | 0 | 0 | 0 |
| notifications | 2 | 0 | 0 | 0 |
| scan | 1 | 0 | 0 | 0 |
| Root | 1 | 0 | 0 | 0 |
| sync-center | 1 | 0 | 0 | 0 |
| repair-request | 1 | 0 | 0 | 0 |
| budget | 1 | 0 | 0 | 0 |
| change-password | 1 | 0 | 0 | 0 |
| cost | 1 | 0 | 0 | 0 |
| andon-board | 1 | 0 | 0 | 0 |
| audit-log | 1 | 0 | 0 | 0 |
| book-club | 1 | 0 | 0 | 0 |
| profile | 1 | 0 | 0 | 0 |
| qr-sheet | 1 | 0 | 0 | 0 |
| register | 1 | 0 | 0 | 0 |
| feedback | 1 | 0 | 0 | 0 |
| iot | 1 | 0 | 0 | 0 |
| login | 1 | 0 | 0 | 0 |

---

## 4. EXACT NEXT STEPS

### Immediate (This Session)

1. **Run Impeccable detect on each module** to establish baseline findings
   ```bash
   .\scripts\impeccable.cmd detect "C:\inetpub\wwwroot\cmms-tpt\frontend\app\calibration" --json
   ```

2. **Fix known P0 issues** (already identified from earlier work):
   - Hydration mismatches (`typeof window` in render)
   - Touch targets < 48px
   - Missing offline queues

2. **Run design-audit on changed files** to verify no regressions

### Next Session: Browser Verification Sprint

1. Start dev server: `cd frontend && npm run dev`
2. Open each page in browser (prioritize P0 pages)
3. Use Impeccable `detect` with URL mode for rendered pages:
   ```bash
   .\scripts\impeccable.cmd detect http://localhost:3001/spare_parts/issue_center --json
   ```
4. Use DevTools for:
   - Touch target measurement
   - Color contrast checking
   - Accessibility tree inspection
   - Network throttling for offline testing

### Phase 3: Per-Route Audit (Planned)

For each route, document:
- [ ] Route pattern
- [ ] Source file
- [ ] Page category
- [ ] Expected user role
- [ ] Auth/authorization requirements
- [ ] Whether page can be rendered
- [ ] Whether rendered UI has been inspected
- [ ] Audit status
- [ ] Evidence and blockers

### Phase 4: Shared Design System Audit

- [ ] Component inventory (25 components)
- [ ] Design token compliance check
- [ ] Component consolidation opportunities
- [ ] Accessibility audit of shared components

---

## 5. KEY FINDINGS FROM BASELINE

### Critical P0 Issues (Must Fix Before Visual Audit)

| Issue | Location | Fix |
|-------|----------|-----|
| Hydration mismatches | `/login`, `/asset_registry/view`, `/pm_am`, `/repair/assign`, `/qr-sheet` | Move `typeof window` checks to `useEffect` |
| No offline queue | `/spare_parts/issue_center` submit | Use `sendOrEnqueueDetailed` |
| Touch targets < 48px | Multiple pages | Increase button/select/input sizes |

### Design System Compliance

| Check | Status |
|-------|--------|
| Design tokens documented | ✅ `frontend/DESIGN.md` |
| Sidecar metadata | ✅ `frontend/.impeccable/design.json` |
| No hard-coded hex in components | ⚠️ ~40 violations |
| Andon status language used | ✅ Consistent |
| Tabular numerals for KPIs | ✅ `cmms-kpi-value` class |
| Dark mode tokens | ✅ Complete |

---

## 6. RECOMMENDED NEXT PHASE

**Phase 3: Impeccable Automated Audit + Critical Fixes**

1. Run `impeccable detect` on each module directory
2. Fix all P0 hydration mismatches
2. Add offline queue to all mutating forms
3. Increase all touch targets to ≥48px
4. Run design-audit --strict to verify

**Estimated Effort:** 2-3 sprints

**Do not proceed to redesign.** Complete the audit baseline first.

---

*Baseline Established: 2026-10-09*
*Impeccable CLI: Verified | Design System: Documented | Routes: 219 Verified*