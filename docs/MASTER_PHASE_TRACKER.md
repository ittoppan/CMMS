# MASTER PHASE TRACKER — CMMS-TPT

> อัปเดตล่าสุด: 2026-11-23 · เจ้าของโครงการต้องอนุมัติก่อน Deploy
> สถานะ: NOT STARTED · IN PROGRESS · BLOCKED · PASS · FAIL · COMPLETE
> **COMPLETE = โค้ดเสร็จ + ทดสอบผ่าน + acceptance ผ่าน** (ไม่ใช่แค่เขียนโค้ด)

## 0. สรุปภาพรวม

| Phase | ชื่อ | สถานะ | หลักฐาน / หมายเหตุ |
|---|---|---|---|
| 0 | System Discovery & Baseline | **COMPLETE** | `MASTER_SYSTEM_DISCOVERY.md`, `MASTER_MODULE_INVENTORY.md`, `MASTER_API_INVENTORY.md`, `MASTER_ROLE_PERMISSION_MATRIX.md`, `MASTER_BASELINE.md` |
| 1 | Full UX/UI Audit | **COMPLETE (consolidated)** | `MASTER_UX_AUDIT.md`, `MASTER_UI_AUDIT.md`, `MASTER_UX_PRIORITY.md` — 13 route ใหม่ยังไม่มี per-page evidence (ไปต่อ Phase 4/6) |
| 2 | Enterprise Design System | **PASS** | `DESIGN_SYSTEM.md` v3 + primitives + `COMPONENT_LIBRARY.md` + `DESIGN_TOKENS.md` (จากโค้ดจริง); ลบ `/ui-demo`, `/ui-kit` แล้ว (247/247 pages, tsc/build PASS); ค้างเก็บกวาด card-in-card/tile ในหน้าที่ยังไม่ย้าย |
| 3 | Global Layout & Navigation | **PASS (มี finding N1–N3)** | bottom nav 390 = 6 ปุ่ม hit 59px/padding 96px/overflow 0; keyboard PASS (skip link, Enter→main, ring 2–3px, Ctrl+K palette 130→5, Esc ปิด); role menu เทียบ API 9 บทบาท: ไม่มีเมนูที่ไม่ได้สิทธิ์ถูกแสดง ยกเว้น `/dashboard` — `docs/PHASE_3_LAYOUT_NAV_REPORT.md` |
| 4 | Dashboard & Data Visualization | IN PROGRESS | 36 modules registered (`DASHBOARD_BUILD.md` done 35/36 + wallboard), `KPI_INVENTORY.md` ครบ; **KPI validation กับ SQL จริงเสร็จ 2026-11-23** — 13 ฟิลด์ตรง, พบ K1–K8 (`PHASE_4_KPI_VALIDATION_REPORT.md`); **K1–K7 แก้แล้ว `f86634f6`**, **K8–K10 + `reports.php` แก้แล้ว `50e9e23a`** (ตัวเลขก่อน/หลังในรายงาน §9–§10); last-updated + drill-down ปิดแล้ว `b55e4046`; **TBT วัดแล้ว: 0 ms desktop / 512 ms median ที่ CPU 4× → ยังไม่ผ่านเป้าเมื่อ throttle**; ค้าง audit INSUFFICIENT DATA + ลด TBT |
| 5 | Repair Request & Employee Experience | **PASS (D1)** / IN PROGRESS | D1: 4 คลิก, tsc+build pass, e2e User pass (`PHASE_D_EXECUTION_REPORT.md`); **audit my-repairs/history/detail 2026-11-23** (`PHASE_5_MY_REPAIRS_AUDIT.md`): `/my-repairs` PASS (h1 1, overflow 0, console 0 ที่ 390px), พบ F5-1 (role ไม่มีสิทธิ์ยังยิง 2 คำขอ → console error) และ F5-2 (`/repair/view` ไม่มี `?id` → fallback `id=1`) — รออนุมัติแก้ |
| 6 | Work Order Control | **PASS (UI) — ค้าง S1/S2 รออนุมัติ** | D3.2 `023fdc6c` · D3.3 (`PHASE_D3_QUEUE_REPORT.md`) · D3.4 (`PHASE_D3_DETAIL_REPORT.md`) · D3.5/D3.6 (`PHASE_D3_RESPONSIVE_A11Y_REPORT.md`) · D3.7 (`PHASE_D3_ROLE_PERMISSION_TEST.md`) · D3.8 (`PHASE_D3_DESIGN_REPORT.md`, `PHASE_D3_BEFORE_AFTER.md`, `PHASE_D3_TEST_RESULTS.md`); tsc/build PASS, axe 0 Critical/0 Serious 12 เคส, overflow 0 ทุก viewport |
| 7 | Maintenance & PM | **BLOCKED** | `pm_am`=3 แถว แต่ทั้งหมดเป็น `E2E-SEED` (seed จาก e2e) → ตรวจ workflow/PM compliance ด้วยข้อมูลผลิตจริงไม่ได้; ยังไม่มีคำสั่งสร้างข้อมูลทดแทน |
| 8 | Asset, Inventory & Spare Parts | IN PROGRESS | Asset detail redesign + permission hardening (commit `b7f0c6e4`); spare list ยังไม่มี server-side pagination |
| 9 | Reports, Analytics & Export | IN PROGRESS | audit filter↔export parity เสร็จ 2026-11-23 (`PHASE_9_REPORTS_EXPORT_REPORT.md`): พบ E1 (หน้า export ไม่ใช้ filter + ยิง `/api/v1/index.php` ไม่มี scope/audit) และ E2 (export ตัดที่ 50 แถว) → แก้แล้ว; parity 9 resource MATCH (work-orders 50→105, assets 50→82), E2E ดาวน์โหลด CSV/XLSX ผ่าน, tsc+build ผ่าน; **P9-4 (monthly PDF) audit เสร็จ** (`PHASE_9_P9_4_MONTHLY_PDF_AUDIT.md`): ตัด raw dump `/api/v1/index.php` + hardcode `user=1` ออก, yearCost คำนวณจาก analytics_monthly, tsc+build ผ่าน — ค้าง P9-4a/b/c + P9-1/P9-2/P9-3; **รออนุมัติการแตะ `rpt_page_params()` (backend, gated ด้วย export flag)** |
| 10 | Technician & Mobile | IN PROGRESS | audit 2026-11-23: responsive 6 pages × 3 viewports PASS (overflow 0, h1 1, console 0); touch targets >=44 PASS; PWA manifest valid + SW registered; offline routes declared; push/Lighthouse BLOCKED on HTTPS — `docs/PHASE_10_TECHNICIAN_MOBILE_REPORT.md` |
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

- Tasks: [x] `DESIGN_SYSTEM.md` v3, [x] primitives (PageHeader/KpiStrip/…), [x] tokens ใน `globals.css` (`--cmms-*`), [x] `DESIGN_TOKENS.md` (ค่าจริง + กฏคู่สี AA + ข้อจำกัด dark mode ที่ยังไม่มีในสไตล์ชีต), [x] `COMPONENT_LIBRARY.md` (layout/primitives/ตาราง/โดเมนซ่อม + สิ่งที่ห้ามทำ), [x] ลบ `/ui-demo`,`/ui-kit` — [x] ตรวจ card-in-card/tile มาตรฐานเดียว (`PHASE_2_CARD_SURFACE_AUDIT.md` — วัด DOM จริง 20 หน้า: card-in-card 0/7, surface นอกมาตรฐาน 2 แบบใน 6 ไฟล์ = C2-1/C2-2)
- Files: `frontend/components/layout/*`, `frontend/components/ui/*`, `frontend/components/supervisor/*`, `docs/DESIGN_SYSTEM.md`, `docs/DESIGN_TOKENS.md`, `docs/COMPONENT_LIBRARY.md`
- Tests: `npx tsc --noEmit` PASS + `NEXT_DIST_DIR=.next-verify npm run build` PASS (247/247 pages หลังลบ 2 route)
- Known issues: U4, U7, U8 (badge/colour/tile ไม่ตรงกันในหน้าที่ยังไม่ย้าย); dark theme ใน `DESIGN_SYSTEM.md` §2.2 ยังไม่มีใน `globals.css`; C2-1 (`components/ui/table.tsx` สร้าง surface เองแทน `<Card>`) · C2-2 (5 ไฟล์ใช้ `rounded-xl border border-border bg-card p-4` ซ้ำ)
- Approval: ไม่ต้อง

## 4. Phase 3 — Global Layout & Navigation

- Tasks: [x] layout/sidebar shell, [x] PageHeader/DetailHeader, [x] breadcrumb, [x] avatar, [x] notification bell, [x] command palette, [x] ตรวจ role menu vs สิทธิ์จริง 9 บทบาท (ไม่พบเมนูที่ไม่มีสิทธิ์ ยกเว้น `/dashboard`), [x] mobile nav 390 (6 ปุ่ม role-based, hit 59px, padding 96px, overflow 0), [x] keyboard nav (skip link, focus ring, palette เปิด/ปิด/ค้นหา)
- Tests: Playwright 2026-11-23 — `docs/PHASE_3_LAYOUT_NAV_REPORT.md`
- Known issues: **N1** `/dashboard` แสดงใน role 3/7/9 ขณะที่สิทธิ์ `dashboard=0` (รอตัดสินใจว่าหมายถึงหน้าแรกหรือโมดูล); **N2** เมนูแวบเห็นทั้งหมดก่อนสิทธิ์โหลดเสร็จ (`useMenuPermission.canShowAll=true`); **N3** `menu_permissions.php` ไม่มี `?user=` → 403; H6, H7 เดิม
- Approval: ไม่ต้อง (ห้ามเปลี่ยน route/URL)

## 5. Phase 4 — Dashboard & Data Visualization

> 2026-11-23: KPI validation เสร็จ — ดู §4/§5 ด้านล่างและ `docs/PHASE_4_KPI_VALIDATION_REPORT.md`

- Tasks: [x] 36 modules + registry, [x] KPI inventory (สูตร/แหล่ง/refresh/validation), [x] ChartTip/Legend กลาง, [x] wallboard loading/error state, [x] validate KPI กับ SQL จริงทีละตัว (dashboard/wallboard/supervisor, 5 ช่วงเวลา, role 2/3/4) — `PHASE_4_KPI_VALIDATION_REPORT.md` + `PHASE_4_KPI_RAW.json`, [x] แก้ K1–K7 ตามอนุมัติเจ้าของระบบ — `f86634f6`, [x] K8–K10 + `reports.php:246` — `50e9e23a`, [x] last-updated + filter/range + drill-down — `b55e4046` (`PHASE_4_UI_ACCEPTANCE.md`), [x] INSUFFICIENT DATA ตรวจ 12 หน้า (`PHASE_4_INSUFFICIENT_DATA_AUDIT.md` — 5/12 แสดง empty state ถูกต้อง, 7/12 ติดสิทธิ์ Viewer; แก้ชื่อตารางต้นทาง 5 จุดใน `KPI_INVENTORY.md`), [ ] TBT <300ms — วัดแล้ว 0 ms (desktop) / 512 ms median (CPU 4×) ต้องลด
- Tests: KPI validation 2026-11-23 14:06 (+07) บน DB `cmms_tpt` (repair 105 / pm_am 3 / mtbf_mttr 18) — 13 ฟิลด์ตรงสูตร, ค่าดิบใน `PHASE_4_KPI_RAW.json`
- Known issues — **K1–K7 แก้แล้ว** (`f86634f6`, ตัวเลขก่อน/หลังใน `PHASE_4_KPI_VALIDATION_REPORT.md` §9): K1 critical_active กับ critical_open ใช้ `kpi_critical_statuses()` ชุดเดียว (0/1 → 1/1); K2 PM `due_total` ผูกช่วง + `unrecorded` + `on_time_pct` null เมื่อตัดสินไม่ได้; K2c `pm_compliance_pct` null เมื่อ `total_schedules`=0 (0 → —); K3 MTBF/MTTR รายเดือน = `SUM/SUM` (พ.ย. 459 → 691, มิ.ย. 598 → 1,802); K4 ตัวกรองมีผลกับ MTTR/MTBF/SLA/response (แผนก 10 → null); K5 `pending` เป็น active + โดนัท = `open_wo` (103 → 105); K6 การ์ด Completed = `pending_verification` (0 → 6); K7 แยกป้าย "เกิน SLA" กับ "Overdue (เกณฑ์ค้างเกิน 7 วัน)"
- Known issues — **K8–K10 + `reports.php:246` แก้แล้ว** (`50e9e23a`, รายงาน §10): K8 ระบุช่วงของ KPI กับ trend บนจอ; K9 `planned_end_at` เข้า `kpi_is_overdue()` (0 ใบกระทบ, overdue ยัง 74); K10 ตัด MTTR fallback (MTTR เท่าเดิม 2.5/2.5/4.0/2.33 ตรง SQL); K3c Report Center MTBF ล่าสุด 459 → 691 ชม.
- Known issues — **คงเหลือ**: ข้อมูล PM (3 แถว) และ MTBF/MTTR (18 แถว) เป็น seed จาก e2e → ตัวเลขถูกตามสูตรแต่ยังไม่ใช่ภาพการผลิตจริง (Phase 7 BLOCKED); C2, H4, M6
- Known issues — **TBT ลองแยก lazy chart แล้วไม่สำเร็จ** (2026-11-23, §4.2): แยก Recharts เป็น dynamic chunk → TBT 481/334/418 ms (baseline 367–375) และ `charts_rendered = 0` เพราะ `IdleChart` gate ด้วย IntersectionObserver → กราฟไม่เคยอยู่ใน blocking window; ย้อนกลับแล้ว (tsc+build ผ่าน) คอขวดจริงคือ hydration 878 โหนด/10 panel
- Known issues — **TBT lazy chart** (§4.5): แยก Recharts เป็น chunk (ไม่มี stagger — วัด 5+5 รอบแล้ว stagger ไม่ผ่าน, median 1,052 vs 1,024) → TBT median **1,024 ms**, long task สูงสุด 360 ms, กราฟ 5/5; เป้า <300 ms ยังไม่ผ่าน → ข้อเสนอ 3 ทางใน `docs/PHASE_4_TBT_OPTIONS.md` รออนุมัติ
- Known issues — **TBT** (`b55e4046`, `PHASE_4_UI_ACCEPTANCE.md` §4.1): production build = **0 ms** desktop; CPU 4× = **367/375/372 ms** ในหน้าต่าง FCP→+5s (median 372) โดย **long task ก่อน load = 0 ms** → คอขวดคือ hydration + เรนเดอร์กราฟชุดแรก ~360 ms (อีก ~90–110 ms มาจากข้อมูลรองที่ defer อยู่แล้ว); ยังไม่ได้ throttle network
- Approval: ไม่ต้อง (ห้ามเปลี่ยนสูตร KPI)

## 6. Phase 5 — Repair Request & Employee Experience

- Tasks: [x] D1 ลดคลิกเหลือ 4 (ไม่ลบ required/validation/double-submit), [x] mobile 390, [x] e2e User, [x] ตรวจ my-repairs/history/detail (`PHASE_5_MY_REPAIRS_AUDIT.md` — ตรวจได้เฉพาะเส้นทาง 403 สำหรับ history/detail), [x] notification ตาม workflow (ตรวจของเดิม) (`PHASE_5_NOTIFICATION_AUDIT.md` — ครอบ 4 เหตุการณ์ / ขาด 6 สถานะ)
- Known issues: F5-1 (LOW, console error 2 รายการเมื่อ role ไม่มีสิทธิ์เปิด `/repair/history`) · F5-2 (MEDIUM, `/repair/view` ไม่มี `?id` → fallback `id=1` ที่ `page.tsx:346`) · N5-1 (MEDIUM, 6 สถานะปลายทางไม่มีแจ้งเตือน) · N5-2 (LOW, แจ้งเฉพาะสมาชิกที่เพิ่มใหม่) · N5-3 (LOW, `notification_logs.template` ไม่ถูกบันทึก) — ทั้งหมดต้องอนุมัติก่อนแก้ เพราะแตะพฤติกรรม/logic
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
  - [x] D3.7 role E2E (User/Operate/Foreman) — 9 เคส: User/Operate ถูกบล็อกที่ UI, Foreman ใช้งานเต็ม; พบ S1 (API GET ไม่ตรวจสิทธิ์) + S2 (ข้อความ 403 ของ sub-resource) — `PHASE_D3_ROLE_PERMISSION_TEST.md`
  - [x] D3.8 docs ครบ 4 ไฟล์: `PHASE_D3_DESIGN_REPORT.md`, `PHASE_D3_BEFORE_AFTER.md`, `PHASE_D3_ROLE_PERMISSION_TEST.md`, `PHASE_D3_TEST_RESULTS.md` (perf/Lighthouse ใหม่ยังไม่วัด — ระบุใน TEST_RESULTS §5)
- Known issues: บัญชี `e2e_*` ทั้ง 10 ตัว `is_active=1` แล้ว → D3.5/D3.6 วัดด้วยเบราว์เซอร์จริงได้; filter department/date ต้องอนุมัติแก้ API; D3.7 role E2E ยังไม่ทำ; โหมดมืดยังไม่วัด contrast
- Known issues (D3.4): `aging` คำนวณตอน render (ไม่ tick ข้ามวัน); ตารางผลค้นหา Sage ยัง `overflow-x-auto`; `statusLabel`/`statusLabels` เป็น dead code รอเก็บกวาด Phase 2
- Known issues (D3.7 — ต้องอนุมัติก่อนแก้): **S1 HIGH** `GET supervisor.php` ทั้ง 8 action เรียกแค่ `requireLogin()` → role 3/9 อ่าน `kpis`/`queue` ผ่าน API ตรงได้ (ยืนยันด้วย `queue&limit=5` = 200, 5 แถว); **S2 MEDIUM** `ApiFetchInterceptor` ขึ้น “ไม่มีสิทธิ์ดูข้อมูลส่วนนี้” เมื่อ sub-resource 403 ทั้งที่หน้าใช้งานได้
- Files: `app/(dashboard)/supervisor/queue/page.tsx`, `components/supervisor/WorkOrderTrendChart.tsx`, `app/(dashboard)/repair/view/page.tsx`
- Approval: ไม่ต้องสำหรับ UI; **ต้องอนุมัติ** ถ้าจะแก้ `supervisor.php`

## 8. Phase 7 — Maintenance & PM — **BLOCKED**

- เหตุผล: `pm_am` = 0 แถว, ไม่มี PM schedule/checklist ที่ผูกกับ asset จริง → ตรวจไม่ได้ตามกติกา "ห้ามสร้างข้อมูลปลอม"
- ต้องขอ: (ก) ข้อมูล PM จริงชุดทดสอบใน DB แยก หรือ (ข) อนุมัติสร้างข้อมูลทดสอบใน environment ที่ไม่ใช่ Production
- Tasks ที่ทำได้ก่อน: audit UI/โครงสร้างหน้า PM (ยังไม่เริ่ม)

## 9. Phase 8 — Asset, Inventory & Spare Parts

- Tasks: [x] asset detail redesign + BOM permission + QR minimal + tests (`b7f0c6e4`), [x] asset stats API, [x] audit ทุกหน้า asset (28 หน้า = 20 calibration + 8 asset_registry — `PHASE_8_ASSET_PAGE_AUDIT.md`: นับ route จริง 28, เปิดจริง 25 หน้าได้ 403 gate, `/calibration/run` = dynamic 404 ถูกต้อง; หัวหน้า PageHeader 27/28 + ฝ่าฝืน 0 `cmms-page-hero`; visual ยังตรวจไม่ได้ — ต้องมีบัญชีที่มีสิทธิ์), [x] spare pagination (**PASS ระดับโค็ด — ทำแล้ว ไม่ต้องอนุมัติ**: `spare_parts/page.tsx:100` PAGE_SIZE=15 + `?limit&page` → server คืน `total` จาก WHERE เดียวกัน; 1,870 แถว = 125 หน้า; UI ยังไม่วัด — role 5 `spare_parts`=0 → 403 by design), [x] traceability asset→WO (**BLOCKED by design**: โค็ดครบ `view/page.tsx:596` → `repair.php:132` กรอง `a.code`, timeline `href=/repair/view?id=`; role 5 `repair`=0 → 403 ทุก GET, anonymous 401; ข้อมูลจริง `A-BM06` = 7 ใบ — ยังไม่เห็น timeline จริง)
- Known issues: M4, IMP-1, IMP-2 (upload limit mismatch) · A8-1 (MEDIUM, `calibration/mobile` สร้างหัวหน้าเอง `<p class=cmms-eyebrow>`+`<h1>` แทน PageHeader, `page.tsx:107-108`) · A8-2 (LOW, หน้า 403 gate ตอบ HTTP 200) · A8-3 (LOW, asset timeline เรียก `repair.php?asset_code=` โดยไม่ใส่ limit → `$limit=0` คืนทั้งหมด; ปัจจุบันมากสุด 7 ใบ)
- Approval: ต้องอนุมัติถ้าเปลี่ยน contract ของ list (query params)

## 10. Phase 9 — Reports, Analytics & Export

- Tasks: [x] audit filter↔export parity (**PASS** — `PHASE_9_EXPORT_FILE_AUDIT.md` §4.6: `table.total` = แถวใน CSV ครบ 26/26 ชุด, ผลต่าง 50 vs 105 = pagination ไม่ใช่การตัดข้อมูล; `range_start/end` ต้องค์ `range=custom`), [x] permission ก่อน export (`PHASE_9_EXPORT_FILE_AUDIT.md` §4.5 — cost/technicians 403 ที่ `rpt_dispatch`, pm 200; R9-5 MEDIUM), [ ] progress/loading (**ยังไม่ได้ตรวจ** — `PHASE_9_EXPORT_FILE_AUDIT.md` §4.8: ซอร์สมี `busy`+`disabled` แต่ไม่เคยเห็นทำงานจริง; เจอ R9-9 build `:3001` เก่ากว่าซอร์ส + R9-10 คลิกแล้วไม่เกิดอะไร), [x] filename+date+เงื่อนไข (**FAIL — รออนุมัติ**) ชื่อไฟล์ CSV/XLSX = `<resource>_<วันเวลาที่ export>.csv` ไม่มีช่วงวันที่/เงื่อนไข (R9-2); PDF มีปี-เดือน `RPT-2026-07-…`; client มี fallback ที่ใส่ range แต่ server header ทับ, [x] drill-down (`PHASE_9_EXPORT_FILE_AUDIT.md` §4.7 — work-orders/downtime คลิก `/repair/view` ได้ 200; downtime ตามเครื่องจักรไม่มี drill-down + href ขาด id, assets `type=link` แต่ `_href=null`, ปลายทางขึ้น ไม่มีสิทธิ์ สำหรับ role 5 → R9-6/R9-7/R9-8), [x] ตรวจ Excel/PDF/CSV จริง (`PHASE_9_EXPORT_FILE_AUDIT.md` — 10 ไฟล์ CSV/XLSX เปิดได้ parity ตรง DB 105/82/7/2/0 แถว, audit 10 แถว, PDF จริง 6.9 MB/1 หน้า; R9-1 MEDIUM รออนุมัติ)
- Known issues: R9-1 (MEDIUM, `/reports/monthly_pdf` ฝัง default เดือน 7/2026 ตายตัว `page.tsx:66-67` → เห็น/ส่งออกเดือนผิด) · R9-2 (LOW, ชื่อไฟล์ CSV/XLSX ไม่มีช่วงวันที่) · R9-3 (LOW, PDF ฝัง PNG ซ้ำทุกหน้า) · R9-4 (LOW, `reports.php:68-70` audit_log เป็น dead code) · R9-5 (MEDIUM, `rpt_permitted` ใช้ role id ไม่ใช่ `menu_permissions` — เปลี่ยนสิทธิ์ใน /roles ไม่มีผลกับ API, 10/12 resource ไม่มีกฎ) · R9-6 (MEDIUM, downtime `group_by=asset` ไม่มี drill-down + `_href='/reports/downtime?asset_id='` ขาด id `reports.php:1104`) · R9-7 (MEDIUM, role 5 คลิก drill-down แล้วเจอ «คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้» ทั้งที่เห็นแถวในรายงานได้) · R9-8 (LOW, assets คอลัมน์ `type=link` แต่ `_href=null`) · R9-9 (**HIGH/process**, `:3001` เสิร์ฟ build 22 พ.ย. 22:49 แต่ซอร์ส 23 พ.ย. 16:09 — hook สร้างลง `.next-verify` ไม่ใช่ `.next` → ต้อง rebuild+restart ก่อนตรวจ UI ใดๆ) · R9-10 (MEDIUM, คลิก «ส่งออก Excel» ที่ `/reports/export_excel` ไม่ยิง request/ไม่ดาวน์โหลด/ไม่มี busy state)
- Known issues เดิม: H5
- Approval: ไม่ต้อง (ห้ามเปลี่ยนข้อมูล)

## 11. Phase 10 — Technician & Mobile

- Tasks: [x] technician/field audit (6 pages), [x] responsive 390/768/1440 (overflow 0, h1 1, console 0), [x] touch target ≥44px (/field), [x] PWA manifest valid, [x] SW registers on production build, [x] offline routes + offline.html precached, [x] offline write queue (sendOrEnqueue/syncEngine) ใช้งานได้, [ ] push E2E (ต้อง HTTPS), [ ] Lighthouse PWA (ต้อง HTTPS), [ ] manual device UAT
- Evidence: `docs/PHASE_10_TECHNICIAN_MOBILE_REPORT.md`; Playwright 5/5 PASS (47.1 s) on `:3001`
- Known issues: TLS ยังไม่เปิด → push/Lighthouse ทดสอบไม่ได้; PM checksheet UX รายละเอียดรอ Phase 7 unblock
- Approval: ไม่ต้อง

## 12. Phase 11 — QA / Security / Performance / Deployment — **BLOCKED**

- Tasks ที่ทำได้ตอนนี้: [x] security audit บางส่วน (`SECURITY_FIX_REPORT`, `SETTINGS_AUDIT`, `ASSET_DETAIL_REPORT`, `API_SECURITY_AUDIT`), [ ] regression เต็ม, [x] axe เริ่มแล้ว (8 หน้า × WCAG 2.1 AA — `PHASE_11_AXE_AUDIT.md`: 37 node / 3 rule, A11-1/A11-2 HIGH contrast 1.07/1.04 = อ่านไม่ออก, A11-5 CRITICAL `aria-controls` ชี้ target ที่ไม่มีที่ `/notifications`; อีก 6 หน้า 403 + Lighthouse ยังไม่ได้รัน; มือถือ 390×844 5 หน้า overflowX=0, 13 node ต้นเหตุเดิม; dark mode = N/A by design `Providers.tsx:11` forced light), [ ] Lighthouse, [ ] regression เต็ม (suite 30 spec ในเครื่องนี้: 28 passed / 131 failed — ขาด fixture/บทบาท, ยังไม่สรุปว่า regression) [x] API enforcement — ตรวจ CSRF ครบ 113 endpoint (บังคับที่ `src/auth.php:92-97`), permission หลุด 10/16 endpoint (`PHASE_11_API_ENFORCEMENT_AUDIT.md`; E11-1 HIGH รออนุมัติ)
- Tasks ที่ต้องรอ: Staging, HTTPS, backup/restore drill, rollback plan, production deploy approval
- Known issues: E11-1 (HIGH, API ไม่ตรวจสิทธิ์เมนู 10 จาก 16 endpoint ที่ทดสอบ — อ่านหลุด, การเขียนยังไม่ทดสอบ) · E11-2 (MEDIUM, 25 ไฟล์ที่เขียน SQL ไม่มี `requirePerm`) · E11-3 (MEDIUM, `spare_parts.php` คืน 1,870 แถวเมื่อเรียกโดยไม่ส่ง `limit`/`page` — **มี pagination อยู่แล้ว** (Phase 8 §6) จึงเหลือแค่เรื่อง backward-compat path ที่ไม่จำกัดจำนวน) · A11-1 (HIGH contrast 1.07 chip `/reports`) · A11-2 (HIGH contrast 1.04 «ใช้บ่อย» sidebar) · A11-3/A11-4/A11-5/A11-6/A11-7 ตาม `PHASE_11_AXE_AUDIT.md`
- Blockers: ไม่มี Staging env; TLS/cert; เจ้าของระบบยังไม่อนุมัติ
- Approval: **ต้องอนุมัติเป็นลายลักษณ์อักษรก่อนทุก deployment**

## 13. ลำดับงานถัดไป (ทำต่อทันที)

1. Commit D3.2 + อัปเดต tracker (ทำงานรอบนี้)
2. ~~D3.3 Queue workspace~~ (เสร็จ `320fea69`)
3. ~~D3.4 Detail + D3.5 responsive + D3.6 axe~~ (เสร็จ: D3.5/D3.6 มีหลักฐานวัดจริง 12/12 เคส)
4. ~~D3.7 role E2E + D3.8 docs~~ (เสร็จ; Phase 6 = PASS (UI), ค้าง S1/S2 รออนุมัติ)
5. Phase 2 docs (`COMPONENT_LIBRARY.md`, `DESIGN_TOKENS.md`) + ลบ demo pages
6. Phase 4 KPI validation (เริ่มจาก dashboard/wallboard + supervisor)
7. Phase 9 audit → Phase 10 mobile
8. Phase 11 เตรียม Staging (ต้องอนุมัติ)

## 14. กติกาการอัปเดต tracker

- เปลี่ยนสถานะได้เมื่อมีหลักฐานในหัวข้อ Tests ของ phase นั้น
- ถ้างานค้างเพราะข้อมูล/อนุมัติ → `BLOCKED` + ระบุสิ่งที่ต้องการ (ห้ามเดา)
- ทุก commit ที่เกี่ยวกับ phase ให้ระบุ SHA ในช่องหลักฐาน
