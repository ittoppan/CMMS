# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

PHP REST API (PDO, JSON) + Node.js frontend with Astryx Design System + Tailwind CSS, PWA App Shell architecture

## Users

Primary: Maintenance technicians in manufacturing facilities — field technicians performing repairs, inspections, and preventive maintenance tasks on factory equipment and machinery. They work on-site, often in noisy/dirty environments, using mobile devices or tablets.

Secondary: Facility/plant managers who plan schedules, track assets, manage work orders, and analyze maintenance KPIs.

## Product Purpose

A CMMS (Computerized Maintenance Management System) purpose-built for manufacturing environments. Enables technicians to receive, execute, and close work orders offline-first on mobile; managers to schedule preventive maintenance, track asset hierarchies, manage spare parts inventory, and measure OEE/MTTR/MTBF. Success = reduced unplanned downtime, faster work order completion, audit-ready maintenance records.

## Positioning

Offline-first PWA designed for the factory floor — not a desktop port. Technicians can scan QR codes on assets, complete checklists, log parts/time, and sync when connectivity returns. Competes on field usability in harsh conditions, not feature breadth.

## Operating Context

- Factory floor: noise, gloves, poor lighting, intermittent WiFi/cellular
- Shift-based work: handoffs between technicians across shifts
- Asset hierarchy: plant → line → machine → component
- Work order types: corrective, preventive, predictive, inspection
- Integration targets: ERP (SAP/Oracle), PLC/SCADA for condition monitoring
- Regulatory: ISO 55001 asset management, safety compliance logs

## Capabilities and Constraints

- **Must preserve**: Astryx Design System components + Tailwind CSS utility classes; PHP REST API backend (PDO, JSON); PWA App Shell with service worker offline caching; Thai language UI (primary) with English fallback
- **Technical constraints**: PHP 8.x, MySQL/MariaDB, no Node.js backend; service worker for offline; IndexedDB for local work order queue
- **Terminology**: "Work Order" (WO), "Preventive Maintenance" (PM), "Asset", "Spare Part", "Technician", "Plant/Line/Machine"
- **Undecided**: Real-time sync strategy (background sync vs manual), role-based UI variations, multi-plant dashboard

## Brand Commitments

- Name: **CMMS App** (from manifest.json)
- Logo: `public/icon-192x192.png`, `public/icon-512x512.png`, `frontend/public/logo.png`
- Theme color: `#000000` (manifest), background `#ffffff`
- Voice: Technical, concise, instructional — Thai primary, English secondary
- No marketing fluff; every word serves the technician's task

## Evidence on Hand

- DESIGN.md documents incumbent Astryx + Tailwind system
- Working PWA with service worker, offline queue, QR scanning
- PHP API endpoints: `/api/work-orders`, `/api/assets`, `/api/technicians`, `/api/parts`
- Database schema in `database/` (migrations, seeders)
- Component library in `astrix-main/` and `design-system/`
- No user testimonials, case studies, or marketing assets on hand — future work must not fabricate these

## Product Principles

1. **Offline-first, sync-later** — The technician never waits for network; every action works disconnected
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