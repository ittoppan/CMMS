# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- **Frontend:** Next.js 16 (React 19, TypeScript) app in `frontend/` — the primary user-facing product (dev on port 3001; `npm run verify` = typecheck + build)
- **Backend:** PHP 8.x REST API (PDO, JSON), versioned under `public/api/v1/*.php`, auth at `public/api/auth/login.php`; CSRF enforced on every mutating endpoint (`src/csrf.php`)
- **Design system:** Astryx Design System (`astryx-main/`) + `design-system/` tokens, Tailwind CSS v4, documented in root `DESIGN.md` and `frontend/DESIGN.md`
- **Frontend libraries:** Radix UI primitives, TanStack Query/Table, React Hook Form + Zod, Recharts, ZXing QR scanning, cmdk, next-themes, sonner, vaul, Sentry, Playwright e2e (Tailwind v4, lucide-react)
- **PWA:** standalone app shell with manifest (`public/manifest.json`), offline caching, local work-order queue for field sync-later

## Users

Primary: Maintenance technicians in manufacturing facilities — field technicians performing repairs, inspections, and preventive-maintenance tasks on factory equipment. They work on-site, often in noisy/dirty environments, on mobile devices or tablets, and must keep working when connectivity drops.

Secondary: Planners, maintenance engineers, and plant/facility managers who schedule and dispatch work, run reliability analysis (RCA, predictive, calibration), approve change and cost actions, and measure OEE/MTTR/MTBF. Admin and data-governance roles manage users, permissions, standards, and audit records.

## Product Purpose

A CMMS (Computerized Maintenance Management System) for TOPPAN and its industrial parks, purpose-built for manufacturing. Technicians receive, execute, and close work orders offline-first on the floor; planners and engineers manage reliability, predictive signals, inspections, calibration, and change; managers control cost, approvals, KPIs, and governance. Success = reduced unplanned downtime, faster work-order completion, and audit-ready maintenance records feeding management reporting.

## Positioning

An enterprise maintenance platform whose center of gravity is still the technician on the floor. Differentiation comes from the closed loop: a QR-scanned field action (offline-capable) captures the work, which then flows through inspection, failure/RCA, predictive and IoT condition monitoring, approval, and Sage 300 ERP costing — one PWA, not a desktop port and not a dashboard-only tool. Field usability in harsh conditions remains the signature; the reliability-and-cost loop is what the platform is now.

## Operating Context

- Factory floor fieldwork: noise, gloves, poor lighting, intermittent WiFi/cellular; the app must remain usable when the uplink drops
- Shift-based work with handoffs between technicians across shifts
- Asset hierarchy: plant → line → machine → component
- Work order types: corrective, preventive, predictive, inspection
- Reliability engineering workflow: failure analysis, RCA, overhauls, asset criticality and lifecycle, calibration program
- Management cadence: monthly/weekly reporting on OEE, MTTR, MTBF, cost, spare optimization
- IoT/SCADA condition data (ingest, alarms, condition monitoring) feeding predictive maintenance
- Integration built: Sage 300 ERP (purchase-order / spare sourcing via SagePO service)
- Regulatory: ISO 55001 asset management, safety compliance logs

## Capabilities and Constraints

- **Must preserve**: Astryx Design System components + Tailwind CSS utility classes; PHP 8 JSON API under `public/api/v1/`; the Next.js app in `frontend/` as the primary surface; PWA manifest and offline behavior; CSRF on all mutating endpoints; Thai-first UI with English fallback
- **Technical constraints**: PHP 8.x + MySQL/MariaDB backend only (no Node backend; the Next.js app is frontend/SSR); service worker for offline; IndexedDB local work-order queue; Sentry instrumentation in the frontend
- **Built capabilities** (evidence in code): work orders (corrective/PM/inspection), asset registry, hierarchy, components, criticality, lifecycle, reliability, measurements, overhauls; inspections and checklist templates; calibration management/tracking; spare parts inventory and spare optimization; cost/budget and thresholds; approval workflows; dispatch; contractor management; safety and shutdown/planning; RCA and failure analysis; engineering change; document control; knowledge base; custom forms builder and custom pages; IoT ingest, alarms, and condition monitoring; predictive maintenance (PredictiveService); AI Copilot; analytics, dashboards, KPIs, reports; notifications (email + web push); audit logs and data governance; roles and permissions; multi-plant / multi-department planning; equipment borrowing; Excel import/export; Sage 300 PO sync
- **Terminology**: "Work Order" (WO), "Preventive Maintenance" (PM), "Asset", "Spare Part", "Technician", "Plant/Line/Machine", "RCA", "Calibration", "IoT condition monitoring", OEE/MTTR/MTBF

## Brand Commitments

- Name: **CMMS-TOPPAN Enterprise Maintenance Suite** (short name **CMMS-TPT**) — from `public/manifest.json`
- PWA identity: `lang: th`, theme and background color `#0D4785`, standalone display, portrait orientation
- Logo/icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/assets/icon-192.svg`, `public/assets/icon-512.svg`, `frontend/public/logo.png`
- Voice: Technical, concise, instructional — Thai primary, English secondary
- No marketing fluff; every word serves a maintenance task

## Evidence on Hand

- `DESIGN.md` (repo root) documents the incumbent Astryx + Tailwind design system; `frontend/DESIGN.md` also exists
- Working PWA manifest at `public/manifest.json`
- PHP REST API under `public/api/v1/` covering work orders, assets/registry, inspections, calibration, spares, approvals, IoT, analytics, document control, engineering change, contractor, safety, shutdown, forms, and more
- Backend services in `src/services/` (Predictive, RCA, Dispatch, SagePO, AI Copilot, Data Governance, Audit Trail, Web Push, Notification Center, Inventory Optimization, Approval)
- Component library and tokens in `astryx-main/`, `design-system/`, `css/astryx-theme-*.css`
- Database schema in `database/` (migrations, seeders)
- Playwright e2e suite in `frontend/tests/`; visual regression goldens in `visual-baseline/`
- Real media under `public/uploads/` (assets, avatars, inspections, repair, spares placeholders)
- No user testimonials, case studies, or marketing assets on hand — future work must not fabricate these

## Product Principles

1. **Offline-first, sync-later** — The technician never waits for network; every field action works disconnected
2. **Thumb-targeted, glove-friendly** — Touch targets ≥48px, high contrast, minimal text input
3. **Scan don't type** — QR/barcode/NFC for asset ID, part numbers, technician badge
4. **One screen, one job** — No multi-step wizards on mobile; each screen completes a single atomic action
5. **Audit trail by default** — Every state change logs who, when, what, where — no extra clicks

## Accessibility & Inclusion

- WCAG 2.1 AA compliance required
- Thai language: proper font sizing for Thai glyphs, line height ≥1.6, touch targets account for Thai character density
- High contrast mode for bright factory lighting
- Screen reader support for work order forms and checklists
- Reduced motion option for vestibular sensitivity