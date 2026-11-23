# PHASE D3 — WORK ORDER CONTROL UX/UI AUDIT

> Phase: D3.0 — Inspect Existing Supervisor and Queue
> Scope: /supervisor, /supervisor/queue, /dashboard, Work Order Detail (/repair/view), related components
> Rule: No code changes in this step. No Deploy / No Push.
> Date: 2026-11-23 (audit pass)

---

## 1. Inspected Files

### Frontend (Next.js canonical UI)
- `frontend/app/(dashboard)/supervisor/page.tsx` — Supervisor overview (desk)
- `frontend/app/(dashboard)/supervisor/queue/page.tsx` — Work order queue workspace
- `frontend/app/(dashboard)/supervisor/review/page.tsx` — Review maintenance requests
- `frontend/app/(dashboard)/supervisor/plan/page.tsx` — Plan & assign
- `frontend/app/(dashboard)/supervisor/verify/page.tsx` — Verify/close/reopen
- `frontend/app/(dashboard)/dashboard/page.tsx` — Dashboard portal (hub)
- `frontend/app/(dashboard)/repair/view/page.tsx` — Work order detail (large)
- `frontend/lib/supervisor.ts` — API helpers + types
- `frontend/components/supervisor/StatusChip.tsx` — Status/Priority chips + fmt helpers
- `frontend/components/supervisor/WorkActions.tsx` — Assign/Pause/Resume/Verify/Close/Reopen dialogs
- `frontend/components/layout/*` — PageHeader, DetailHeader, hub-grid, kpi-strip
- `frontend/lib/i18n.ts` — hero text, menu labels

### Backend (PHP REST API)
- `public/api/v1/supervisor.php` — Supervisor + Planner workflow API (GET/POST/PUT)
- `src/helpers/kpi.php` — Central KPI engine (shared formula)
- `src/helpers/roles.php` — canReviewRequest / canPlanWork / canVerifyWork / canSupervisor / isTechnician
- `src/helpers/ui_permissions.php`, `src/helpers/api_permissions.php`

### Tests
- `frontend/tests/e2e/baseline-level1.spec.ts` — includes `/supervisor`
- `frontend/tests/e2e/planning.spec.ts` — supervisor review link assertions
- `frontend/tests/e2e/phase6-matrix.spec.ts`, `phase6-perm.spec.ts`, `phase7-read.spec.ts`

---

## 2. Existing Page Inventory

### 2.1 `/supervisor` (Supervisor Desk)
- Client component, loads `getKpis()` only.
- Renders 8 count cards (requests_open, pending_approval, unassigned, assigned, active, pending_verification, verified, overdue) as clickable Links with color tones.
- Renders top_overdue list (if any) with StatusChip + PriorityChip + overdue days badge.
- Renders 5 KPI cards: MTTR, MTBF, avg response minutes, SLA compliance %, PM compliance %.
- Renders 4 shortcut cards gated by `can` flags (queue, review, plan, verify).
- Uses PageHeader + ModuleGuide. No search/filter on this page (search/filter live on queue). No trend chart on this page (trend exists in kpi.php but not surfaced here). No priority overview. No recent work orders list. No explicit last-updated timestamp.

### 2.2 `/supervisor/queue`
- Bucket tabs (11 groups: all, new_requests, pending_review, pending_approval, unassigned, assigned, active, waiting, verification, verified, overdue) with counts.
- Filters: search (code/title/asset/assignee), priority select. No department, technician, date range, overdue toggle filter beyond the overdue bucket. (API supports asset_id/assignee_id but UI does not expose.)
- Table view only (desktop table with horizontal scroll). No compact list / mobile card view.
- Row actions gated by `can.plan` / `can.verify`: View, Assign, Pause/Resume, Plan/Edit, Verify, Close, Reopen. Request rows link to review.
- Bulk assign (checkbox + bulk bar) gated by can.plan.
- Loading/empty/error states present (text only). No No-Permission / offline state.

### 2.3 `/dashboard`
- Dashboard portal (hub grid) listing dashboards by group with search, frequent items. Permission-gated via useMenuPermission. Not a work-order control surface per se; included in scope as entry point. Links to supervisor via registry item "work-order-control".

### 2.4 Work Order Detail `/repair/view?id=`
- Very large single file (offline snapshot, attachments, sage parts, PDF export, team, timeline).
- DetailHeader + Card sections: summary dl grid, team, parts, attachments, activity timeline, failure/RCA, rating.
- Already uses DetailHeader (consistent with migration rules). Ordering largely matches requested 10-point order but mixed.

### 2.5 Related components
- `StatusChip.tsx`: StatusChip, PriorityChip, fmtDT, fmtDate, andonOf. Uses Badge variants.
- `WorkActions.tsx`: dialogs for assign/pause/resume/verify/close/reopen. All use mutateSupervisor (PUT CSRF).
- `AndonLamp`, `ModuleGuide`, `PageHeader`, `DetailHeader`, `Card`, `Alert`, `Button`, `Input`, `Select`, `Checkbox`, `Dialog`.

---

## 3. Data / API Surface (unchanged, must preserve)

### `supervisor.php` GET
- `action=kpis` → KpisResponse (counts, mttr_hours, mtbf_hours, avg_response_minutes, sla_compliance_pct, pm_compliance_pct, top_overdue[5], can)
- `action=queue` → QueueResponse (items, total, offset, limit, buckets, can). Query params: group, search, priority, asset_id, assignee_id, sort, order, limit, offset.
- `action=requests` / `workorders` / `schedule` / `technicians` / `pause_log` / `request_log`

### `supervisor.php` PUT (CSRF required)
- approve_request, reject_request, cancel_request, save_plan, assign, bulk_assign, reschedule, pause, resume, complete, verify, close, reopen — each role-gated.

### KPI engine `kpi.php`
- `kpi_core_metrics()` returns counts including: requests_open, pending_approval, unassigned, assigned, active, pending_verification, verified, critical_active, completed_today, waiting_parts, waiting_external, overdue, open_wo, overdue_wo.
- Also mttr_hours, mtbf_hours, avg_response_minutes, sla_compliance_pct, pm_compliance_pct, downtime_minutes, cost_*, material_cost, critical_asset_downtime_minutes, total_wo_created, wo_completed_in_range, wo_completion_rate, breakdown_count, breakdown_rate.
- `kpi_alerts()` returns critical_open, overdue_open, overdue_items, pm_overdue, pm_due_today, waiting_parts, waiting_external, sla_at_risk, sla_risk_hours, sla_by_priority.
- `kpi_trend()` returns daily series: created, completed, downtime_hours (max 62 days).
- `kpi_top_overdue()` returns top overdue list.

### Permission model (roles.php)
- canReviewRequest = roles 1,2,6
- canPlanWork = roles 1,2,6,7
- canVerifyWork = roles 1,2,6,7
- canSupervisor = 1,2,6,7 (approx)
- isTechnician = role 3
- Operator (role 4) sees only own created WOs (kpi_scope); User (role 5) read-only manager layout.

---

## 4. UX Audit Findings (D3.1)

### 4.1 Supervisor overview (/supervisor)
Issues:
1. No explicit "last updated" timestamp or auto-refresh indicator (only manual refresh button).
2. Count cards use color tones but no icons / visual grouping; 8 cards in 2–4 col grid — acceptable but lacks hierarchy.
3. KPI cards (MTTR/MTBF/etc.) are separate block below; no grouping into "Performance" vs "Workload".
4. No Priority overview (Critical/High/Medium/Low) despite data available (critical_active count; priority in queue items).
5. No Work Order Attention Center grouping (overdue, high priority, waiting parts, pending assignment, pending approval) — only a flat top_overdue list.
6. No trend chart on overview despite kpi_trend API existing (not called from this page).
7. No recent work orders list on overview.
8. No Empty State messaging when no overdue / no data (top_overdue block simply hidden).
9. No Loading skeleton (uses "…" text). No Error retry affordance beyond Alert.
10. No No-Permission state; relies on can flags to hide shortcuts but counts still load.

### 4.2 Work Order Queue (/supervisor/queue)
Issues:
1. Table-only; horizontal scroll on mobile (overflow-x-auto). No mobile card/list view.
2. No department / technician / date range / overdue toggle filters (API supports asset_id/assignee_id; department not in API).
3. Search is client-side debounce? Actually reloads on every keystroke via useEffect (re-fetches entire queue). Potential duplicate/expensive calls.
4. No Empty State illustration / guidance; just text.
5. No Loading skeleton.
6. Priority filter uses values critical/high/medium/normal/low; API stores 'normal' and 'medium' both? Need verify. Current UI includes both 'medium' and 'normal' options.
7. Row actions: many small buttons in a flex-wrap; can be visually noisy. No clear primary action hierarchy.
8. No aging column beyond overdue days badge.
9. No pagination UI (limit 200 hardcoded); total shown? Not displayed.
10. No No-Permission state for users without can.plan/can.verify (they see read-only table but no explanation).

### 4.3 Work Order Detail (/repair/view)
Issues:
1. Monolithic 1000+ line file; hard to maintain but functionally complete.
2. Layout order roughly matches but sections are dense; "Parts/Materials" and "Attachments" interleaved with sage search.
3. No explicit "Work Order Summary" compact header block separate from status card? Status card serves as summary.
4. Aging/overdue indicator not prominently shown in summary.
5. Mobile: grids collapse but many sections; long scroll.

### 4.4 Cross-cutting
- Design system: uses CSS vars (--cmms-*), Tailwind, shadcn/ui components. Wallboard D2 introduced content-visibility, optimizePackageImports, No-Permission state. Supervisor pages should reuse same patterns.
- Permission gating: queue uses can from API response (can.plan etc.), not a separate my_permissions call. Consistent with backend role checks. OK.
- Accessibility: chips use Badge; buttons have aria-label on checkboxes. Need axe verification.
- Performance: queue fetches all items (limit 200) and filters client-side by group; acceptable. Recharts not used here. No heavy charts on supervisor overview (opportunity to add trend chart = Recharts bundle). Need lazy-load if adding charts.
- Responsive: table horizontal scroll violates "no horizontal overflow at 390px" for important data? The requirement says mobile must read key info without horizontal scroll. Table with 8 columns will overflow. Need mobile card view.

---

## 5. KPI Counts Available (from kpi_core_metrics)

| Key | Meaning |
|---|---|
| requests_open | New maintenance requests (open) |
| pending_approval | WO pending approval / approved but unassigned |
| unassigned | Open/acknowledged WO with no assignee |
| assigned | Assigned/accepted WO |
| active | In progress / paused / waiting |
| pending_verification | Completed/pending verification/resolved |
| verified | Verified/closed |
| critical_active | Critical priority active WO |
| completed_today | Completed today |
| waiting_parts | Waiting parts |
| waiting_external | Waiting external |
| overdue | Overdue WO |
| open_wo | Open WO (not done) |
| overdue_wo | Overdue WO (alias) |

KPI performance: mttr_hours, mtbf_hours, avg_response_minutes, sla_compliance_pct, pm_compliance_pct, downtime_minutes, cost_total, material_cost, wo_completion_rate, breakdown_rate.

Alerts (kpi_alerts): critical_open, overdue_open, overdue_items, pm_overdue, pm_due_today, waiting_parts, waiting_external, sla_at_risk, sla_risk_hours, sla_by_priority.

Trend (kpi_trend): daily created/completed/downtime_hours, max 62 days.

---

## 6. Permission Matrix (supervisor)

| Role | canReviewRequest | canPlanWork | canVerifyWork | isTechnician | Scope |
|---|---|---|---|---|---|
| Admin (1) | yes | yes | yes | no | all |
| Manager (2) | yes | yes | yes | no | all |
| ASST Manager (6) | yes | yes | yes | no | all |
| Foreman (7) | no | yes | yes | no | all |
| Technician (3) | no | no | no | yes | assigned WO only |
| Operator (4) | no | no | no | no | own created WO only |
| Viewer (5) | no | no | no | no | read-only (manager layout) |

Note: supervisor.php can flags returned to frontend; backend enforces requireRole on PUT. Must not add permissions.

---

## 7. Design System Reference (reuse, do not create new)
- Corporate Navy / White / Teal; CSS vars --cmms-primary, --cmms-success, --cmms-warning, --cmms-danger, --cmms-text-*, --cmms-bg-*.
- Components: PageHeader, DetailHeader, Card, Badge, Button, Input, Select, Checkbox, Dialog, Alert, ModuleGuide, StatusChip, PriorityChip, AndonLamp.
- Wallboard D2 patterns to reuse: content-visibility on panels, optimizePackageImports (next.config), No-Permission state, IdleChart (IntersectionObserver), animation off on Recharts.
- Icons: lucide-react only. No emoji icons.

---

## 8. Identified Gaps vs D3 Requirements

| Requirement | Current State | Gap |
|---|---|---|
| Supervisor overview KPI groups (Total Open, New Requests, In Progress, Waiting Parts, Overdue, Completed) | Count cards exist but labels differ (requests_open, active, pending_verification, verified, overdue) | Relabel/regroup only; no formula change |
| Click KPI to drill down | Count cards already Link to queue/review/verify | OK; ensure all |
| Priority overview (Critical/High/Medium/Low) | Not present | Add using queue items aggregation (client) or counts |
| Attention Center (Overdue, High Priority, Waiting Parts, Pending Assignment, Pending Approval) | Only top_overdue list | Add grouped lists |
| Trend (created/completed/open) | Not on overview; kpi_trend exists | Add chart (lazy) |
| Recent Work Orders | Not on overview | Add list (from queue or kpi) |
| Last updated timestamp | Not shown | Add |
| Queue: search WO/Machine/Description | Partial (code/title/asset/assignee) | Description not searched (API doesn't search description) — cannot add without API change; keep as-is or note |
| Queue: Status/Priority/Department/Technician/Date Range/Overdue filters | Status via buckets, priority filter exists; department not in API; technician via assignee_id but no UI; date range not in API; overdue via bucket | Expose assignee filter; department/date range require API change → STOP & report if needed |
| Queue: Table/Compact/Mobile views | Table only | Add mobile card view |
| Queue: row actions by permission | Present | Keep |
| Detail: 10-point order | Mostly present | Minor reorder/polish |
| Role-based UX | can flags + backend enforcement | Verify with 3 roles |
| Responsive 1440/768/390 | Table overflows on mobile | Add mobile card view |
| UX states (Loading/Empty/Error/No Permission/Offline) | Loading text + empty text + error alert | Add skeletons, No-Permission, offline (detail already has offline) |
| Accessibility | Not yet measured | Run axe |
| Performance | No duplicate API on overview (single getKpis); queue refetches on search keystroke | Debounce search; memoize |

---

## 9. Constraints Acknowledged
- No DB schema, API contract, business logic, KPI formula, auth/authz changes.
- No mock data; empty states use N/A or meaningful status.
- No deploy/push.
- D1 repair request flow must remain ≤4 clicks.
- Test with real roles: User, Operate, Foreman.

---

## 10. Next Steps (D3.1+)
1. Create git checkpoint (done: `checkpoint/pre-d3`).
2. D3.1 UX/UI audit report finalized (this doc).
3. D3.2 Supervisor overview redesign (add timestamp, priority overview, attention center, trend chart lazy, recent WOs, empty states, skeletons).
4. D3.3 Queue redesign (mobile card view, assignee filter, overdue toggle, total count, pagination, debounce, no-permission state).
5. D3.4 Detail UX polish (ordering, overdue prominence, mobile).
6. D3.5 Responsive verification 1440/768/390.
7. D3.6 Accessibility (axe).
8. D3.7 Role-based E2E (User/Operate/Foreman).
9. D3.8 Performance + regression tests.
10. Produce remaining docs: PHASE_D3_DESIGN_REPORT.md, PHASE_D3_BEFORE_AFTER.md, PHASE_D3_ROLE_PERMISSION_TEST.md, PHASE_D3_TEST_RESULTS.md.

---

## 11. Open Questions / Blockers
- Queue "Department Filter" and "Date Range" are not supported by `supervisor.php` queue action (no department_id/date params). Implementing them requires API changes → requires user approval before proceeding (strict preservation rules).
- Queue search does not include description in backend (searches code/title/asset_code/asset_name/assignee_name). Adding description search requires API change.
- Trend chart on overview would introduce Recharts bundle to /supervisor; must lazy-load to avoid TBT regression (lesson from D2). Plan to code-split chart into separate client component.
- Priority overview: API has `critical_active` count but not high/medium/low counts. Can aggregate from queue items (client) without API change. Acceptable.
- Recent work orders: can reuse queue items (first N by created_at) without extra API call. Acceptable.