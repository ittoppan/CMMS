# MASTER PHASE TRACKER — CMMS-TPT

> อัปเดตล่าสุด: 2026-11-23 · เจ้าของโครงการต้องอนุมัติก่อน Deploy
> สถานะ: NOT STARTED · IN PROGRESS · BLOCKED · PASS · FAIL · COMPLETE
> **COMPLETE = โค้ดเสร็จ + ทดสอบผ่าน + acceptance ผ่าน** (ไม่ใช่แค่เขียนโค้ด)

## 0. สรุปภาพรวม

| Phase | ชื่อ | สถานะ | หลักฐาน / หมายเหตุ |
|---|---|---|---|
| 0 | System Discovery & Baseline | **COMPLETE** | `MASTER_SYSTEM_DISCOVERY.md`, `MASTER_MODULE_INVENTORY.md`, `MASTER_API_INVENTORY.md`, `MASTER_ROLE_PERMISSION_MATRIX.md`, `MASTER_BASELINE.md` |
| 1 | Full UX/UI Audit | **COMPLETE (consolidated)** | `MASTER_UX_AUDIT.md`, `MASTER_UI_AUDIT.md`, `MASTER_UX_PRIORITY.md` — 13 route ใหม่ยังไม่มี per-page evidence (ไปต่อ Phase 4/6) |
| 2 | Enterprise Design System | IN PROGRESS | `docs/DESIGN_SYSTEM.md` v3 + primitives มีแล้ว; **ขาด** `COMPONENT_LIBRARY.md`, `DESIGN_TOKENS.md`; demo pages ยังอยู่ |
| 3 | Global Layout & Navigation | IN PROGRESS | PageShell/PageHeader/DetailHeader, Breadcrumb, EmployeeAvatar, NotificationCenter (commit `114f0dba`, `d7a12f6a`, `3f2d792b`); ยังไม่ตรวจ role menu/mobile nav/global search ครบ |
| 4 | Dashboard & Data Visualization | IN PROGRESS | 36 modules registered (`DASHBOARD_BUILD.md` done 35/36 + wallboard), `KPI_INVENTORY.md` ครบ; ค้าง KPI validation, drill-down, last-updated, TBT |
| 5 | Repair Request & Employee Experience | **PASS (D1)** / IN PROGRESS | D1: 4 คลิก, tsc+build pass, e2e User pass (`PHASE_D_EXECUTION_REPORT.md`) — เหลือ my-repairs/history polish |
| 6 | Work Order Control | IN PROGRESS | D3.0–D3.1 audit done; D3.2 commit `023fdc6c` (tsc PASS); D3.3 queue redesign + tsc/build PASS (`docs/PHASE_D3_QUEUE_REPORT.md`); **D3.4 detail (compact summary + aging + mobile) เสร็จ + tsc/build PASS** (`docs/PHASE_D3_DETAIL_REPORT.md`); **D3.5 responsive + D3.6 axe PASS** (`docs/PHASE_D3_RESPONSIVE_A11Y_REPORT.md`); เหลือ D3.7 role E2E + D3.8 docs |
| 7 | Maintenance & PM | **BLOCKED** | `pm_am`=0 แถว → ตรวจ workflow/PM compliance ด้วยข้อมูลจริงไม่ได้; ไม่มีคำสั่งสร้างข้อมูลทดแทน |
| 8 | Asset, Inventory & Spare Parts | IN PROGRESS | Asset detail redesign + permission hardening (commit `b7f0c6e4`); spare list ยังไม่มี server-side pagination |
| 9 | Reports, Analytics & Export | NOT STARTED | ต้องเริ่มด้วย audit filter↔export parity |
| 10 | Technician & Mobile | NOT STARTED | มี baseline 390 อย่างเดียว; 768/1440, offline/PWA ยังไม่ทดสอบ |
| 11 | QA / Security / Performance / Deployment | **BLOCKED** | ไม่มี Staging, HTTPS/TLS ยังไม่เปิด, ต้องอนุมัติเจ้าของระบบก่อน deploy; audit บางส่วนมีแล้ว (security/settings/asset) |

## 1. Phase 0 — System Discovery & Baseline

- Scope: ตรวจ repo/route/API/DB/role/notification/PWA/tests/baseline
- Tasks: [x] โครงสร้าง, [x] 265 routes, [x] 113 APIs, [x] 104 components, [x] roles/permissions, [x] notification, [x] PWA, [x] test inventory, [x] baseline รวม
- Files: `docs/MASTER_*.md` (5 ไฟล์)
- Tests: `tsc --noEmit` PASS (2026-11-23, working tree มี D3.2)
- Known issues: 13 route ไม่อยู่ใน UI_MIGRATION table; 16 API ไม่อยู่ในเมทริกซ์; production ล้า 18 commit
- Approval: ไม่ต้อง

## 2. Phase 1 — Full UX/UI Audit

- Tasks: [x] รวม audit เดิม, [x] จัดระดับ C/H/M/L, [x] ลำดับความสำคัญ, [x] ระบุหน้าที่ต้องแก้
- Files: `MASTER_UX_AUDIT.md`, `MASTER_UI_AUDIT.md`, `MASTER_UX_PRIORITY.md`
- Known issues: per-page สำหรับ 13 route ใหม่ยังไม่มี; การวัด 768/1440 ยังไม่มี
- Approval: ไม่ต้อง

## 3. Phase 2 — Enterprise Design System

- Tasks: [x] `DESIGN_SYSTEM.md` v3 (มีอยู่), [x] primitives (PageHeader/KpiStrip/…), [x] tokens ใน `globals.css` (`--cmms-*`), [ ] `DESIGN_TOKENS.md`, [ ] `COMPONENT_LIBRARY.md`, [ ] ลบ `/ui-demo`,`/ui-kit`, [ ] ตรวจ card-in-card/tile มาตรฐานเดียว
- Files (ที่มี): `frontend/components/layout/*`, `frontend/components/ui/*`, `docs/DESIGN_SYSTEM.md`
- Known issues: U4, U7, U8 (badge/colour/tile ไม่ตรงกัน)
- Approval: ไม่ต้อง

## 4. Phase 3 — Global Layout & Navigation

- Tasks: [x] layout/sidebar shell, [x] PageHeader/DetailHeader, [x] breadcrumb, [x] avatar, [x] notification bell, [x] command palette (global search เมนู), [ ] ตรวจ role menu vs `menu_permissions` ครบทุก role, [ ] mobile nav ที่ 390 (bottom nav 5 ปุ่ม), [ ] keyboard nav ผ่าน axe/manual
- Known issues: H6, H7
- Approval: ไม่ต้อง (ห้ามเปลี่ยน route/URL)

## 5. Phase 4 — Dashboard & Data Visualization

- Tasks: [x] 36 modules + registry, [x] KPI inventory (สูตร/แหล่ง/refresh/validation), [x] ChartTip/Legend กลาง, [x] wallboard loading/error state, [ ] validate KPI กับ SQL จริงทีละตัว, [ ] last-updated + filter/range + drill-down, [ ] INSUFFICIENT DATA ทุก KPI, [ ] TBT <300ms
- Known issues: C2, H4, M6
- Approval: ไม่ต้อง (ห้ามเปลี่ยนสูตร KPI)

## 6. Phase 5 — Repair Request & Employee Experience

- Tasks: [x] D1 ลดคลิกเหลือ 4 (ไม่ลบ required/validation/double-submit), [x] mobile 390, [x] e2e User, [ ] ตรวจ my-repairs/history/detail, [ ] notification ตาม workflow (ตรวจของเดิม)
- Known issues: none blocking
- Approval: ไม่ต้อง

## 7. Phase 6 — Work Order Control (งานปัจจุบัน)

- Scope: `/supervisor`, `/supervisor/queue`, `/repair/view`, assignment/priority/status/overdue/history, role test
- Tasks:
  - [x] D3.0 inspection + D3.1 audit (`PHASE_D3_UX_AUDIT.md`)
  - [x] D3.2 supervisor overview (timestamp, priority, attention center, trend lazy, recent WO, empty/skeleton/no-permission) — commit `023fdc6c`
  - [x] D3.2 `tsc --noEmit` PASS (2026-11-23)
  - [x] commit D3.2 + อัปเดต tracker
  - [x] D3.3 queue: mobile card view, debounce 350ms, pagination 50/หน้า + total, assignee filter, skeleton/empty/read-only/error-retry states — `PHASE_D3_QUEUE_REPORT.md`
  - [x] D3.3 `tsc --noEmit` PASS + production build (`.next-verify`) PASS
  - [x] D3.4 detail: StatusChip เตือนเกินกำหนด, ป้าย aging (เกินกำหนด/ใกล้ครบ/เหลือ/ค้างมา/ปิดภายใน N วัน), ช่องกำหนดเสร็จ (SLA), ตารางอะไหล่ 2 ตาราง → การ์ดบนมือถือ, primaryAction บนหัวเพจ — `PHASE_D3_DETAIL_REPORT.md`
  - [x] D3.4 `tsc --noEmit` PASS + production build (`.next-verify`, 249/249 pages, route `○ /repair/view`) PASS
  - [x] D3.5 responsive 1440/768/390 — 12/12 เคส ไม่มี horizontal overflow (Playwright, `.next-verify` :3003, `e2e_manager`)
  - [x] D3.6 axe — 0 Critical / 0 Serious ทั้ง 12 เคส (wcag2a/2aa/21a/21aa); แก้ muted token + closure-document colours + 3 aria-label + queue breakpoint `lg` — `PHASE_D3_RESPONSIVE_A11Y_REPORT.md`
  - [ ] D3.7 role E2E (User/Operate/Foreman)
  - [ ] D3.8 perf + regression + docs (DESIGN_REPORT/BEFORE_AFTER/ROLE_PERMISSION_TEST/TEST_RESULTS)
- Known issues: บัญชี `e2e_*` ทั้ง 10 ตัว `is_active=1` แล้ว → D3.5/D3.6 วัดด้วยเบราว์เซอร์จริงได้; filter department/date ต้องอนุมัติแก้ API; D3.7 role E2E ยังไม่ทำ; โหมดมืดยังไม่วัด contrast
- Known issues (D3.4): `aging` คำนวณตอน render (ไม่ tick ข้ามวัน); ตารางผลค้นหา Sage ยัง `overflow-x-auto`; `statusLabel`/`statusLabels` เป็น dead code รอเก็บกวาด Phase 2
- Files: `app/(dashboard)/supervisor/queue/page.tsx`, `components/supervisor/WorkOrderTrendChart.tsx`, `app/(dashboard)/repair/view/page.tsx`
- Approval: ไม่ต้องสำหรับ UI; **ต้องอนุมัติ** ถ้าจะแก้ `supervisor.php`

## 8. Phase 7 — Maintenance & PM — **BLOCKED**

- เหตุผล: `pm_am` = 0 แถว, ไม่มี PM schedule/checklist ที่ผูกกับ asset จริง → ตรวจไม่ได้ตามกติกา "ห้ามสร้างข้อมูลปลอม"
- ต้องขอ: (ก) ข้อมูล PM จริงชุดทดสอบใน DB แยก หรือ (ข) อนุมัติสร้างข้อมูลทดสอบใน environment ที่ไม่ใช่ Production
- Tasks ที่ทำได้ก่อน: audit UI/โครงสร้างหน้า PM (ยังไม่เริ่ม)

## 9. Phase 8 — Asset, Inventory & Spare Parts

- Tasks: [x] asset detail redesign + BOM permission + QR minimal + tests (`b7f0c6e4`), [x] asset stats API, [ ] audit ทุกหน้า asset (20 หน้า calibration + 8 asset_registry), [ ] spare pagination, [ ] traceability asset→WO
- Known issues: M4, IMP-1, IMP-2 (upload limit mismatch)
- Approval: ต้องอนุมัติถ้าเปลี่ยน contract ของ list (query params)

## 10. Phase 9 — Reports, Analytics & Export

- Tasks: [ ] audit filter↔export parity, [ ] permission ก่อน export, [ ] progress/loading, [ ] filename+date+เงื่อนไข, [ ] drill-down, [ ] ตรวจ Excel/PDF/CSV จริง
- Known issues: H5
- Approval: ไม่ต้อง (ห้ามเปลี่ยนข้อมูล)

## 11. Phase 10 — Technician & Mobile

- Tasks: [ ] technician dashboard audit, [ ] my jobs/field 390+768, [ ] checksheet บนแท็บเล็ต (UX-1), [ ] PWA installability + SW + offline fallback, [ ] push ทดสอบ (ต้อง HTTPS), [ ] touch target ≥44px
- Known issues: TLS ยังไม่เปิด → push ทดสอบไม่ได้
- Approval: ไม่ต้อง

## 12. Phase 11 — QA / Security / Performance / Deployment — **BLOCKED**

- Tasks ที่ทำได้ตอนนี้: [x] security audit บางส่วน (`SECURITY_FIX_REPORT`, `SETTINGS_AUDIT`, `ASSET_DETAIL_REPORT`, `API_SECURITY_AUDIT`), [ ] regression เต็ม, [ ] axe/lighthouse ครบ, [ ] API enforcement
- Tasks ที่ต้องรอ: Staging, HTTPS, backup/restore drill, rollback plan, production deploy approval
- Blockers: ไม่มี Staging env; TLS/cert; เจ้าของระบบยังไม่อนุมัติ
- Approval: **ต้องอนุมัติเป็นลายลักษณ์อักษรก่อนทุก deployment**

## 13. ลำดับงานถัดไป (ทำต่อทันที)

1. Commit D3.2 + อัปเดต tracker (ทำงานรอบนี้)
2. ~~D3.3 Queue workspace~~ (เสร็จ `320fea69`)
3. ~~D3.4 Detail + D3.5 responsive + D3.6 axe~~ (เสร็จ: D3.5/D3.6 มีหลักฐานวัดจริง 12/12 เคส)
4. D3.7 role E2E (User/Operate/Foreman) + D3.8 docs
5. Phase 2 docs (`COMPONENT_LIBRARY.md`, `DESIGN_TOKENS.md`) + ลบ demo pages
6. Phase 4 KPI validation (เริ่มจาก dashboard/wallboard + supervisor)
7. Phase 9 audit → Phase 10 mobile
8. Phase 11 เตรียม Staging (ต้องอนุมัติ)

## 14. กติกาการอัปเดต tracker

- เปลี่ยนสถานะได้เมื่อมีหลักฐานในหัวข้อ Tests ของ phase นั้น
- ถ้างานค้างเพราะข้อมูล/อนุมัติ → `BLOCKED` + ระบุสิ่งที่ต้องการ (ห้ามเดา)
- ทุก commit ที่เกี่ยวกับ phase ให้ระบุ SHA ในช่องหลักฐาน
