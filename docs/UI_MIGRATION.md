# UI Migration — กติกาการย้ายหน้าเข้า component กลาง

> อ้างอิง: `docs/UI_AUDIT.md` (252 หน้า) · component กลางอยู่ใน `frontend/components/layout/` และ `frontend/components/ui/`
> สถานะเริ่มต้น: redirect = skipped, หน้านอก shell = todo-last, ที่เหลือ = todo, `/(dashboard)/repair` = done (ต้นแบบ)

## (ก) กติกาการย้ายแต่ละแบบหน้า

- **list**: `PageShell > PageHeader` (1 primaryAction, ที่เหลือเป็น actions) `> KpiStrip` (ถ้ามีตัวเลขสรุป) `> ListToolbar > ตาราง`
  - ตารางต้องมี `overflow-x-auto`
  - ตัวกรองรองซ่อนใน `advancedFilters`
  - มือถือไม่แสดงปุ่ม Export เด่น
- **dashboard**: `PageShell > PageHeader > KpiStrip > การ์ดกราฟ` (ใช้ `ChartTip`/`Legend` ตัวเดียวร่วมกัน — ปัจจุบันยังอยู่ใน `dashboard/page.tsx`, ดึงเป็น component กลางในขั้น dashboard)
- **form**: `PageShell > PageHeader > FormPage/FormSection/FormActions`
- **detail**: `PageShell > DetailHeader > InfoGrid` + ส่วนประวัติ/timeline
- **hub**: `PageShell > PageHeader > HubGrid` (+ `ModuleGuide` ท้ายหน้า)
- **settings**: `PageShell > PageHeader > การ์ดตั้งค่า + แถบบันทึก/รีเซ็ต`

## (ข) กติกาเหล็ก (ห้ามละเมิด)

1. ห้ามเปลี่ยน logic: API call, query key, state, validation, permission check, export, การนำทาง
2. ห้ามเปลี่ยน route/URL และห้ามลบหน้า
3. หน้า redirect/re-export (12 หน้า) ให้ข้าม
4. หน้า `reports/*` ที่ห่อ `components/reports/report-page` ให้แก้ที่ `report-page` ตัวเดียว ไม่แก้ทีละหน้า
5. หน้านอก dashboard shell (login, register, install, change-password, scan, tv, qr-sheet, my-repairs) ข้ามไว้ ทำแยกท้ายสุด
6. หน้าที่รูปแบบพิเศษ (kanban, bom_tree, editor/builder, forms/designer, plant_map, andon-board, calendar) ให้เปลี่ยนแค่หัวหน้าและระยะห่าง ไม่รื้อเนื้อหา
7. หัวหน้าทุกหน้าต้องมาจาก `PageHeader`/`DetailHeader` เท่านั้น (เลิก `cmms-page-hero` และ `ui/page-header` ในหน้าที่ย้าย)
8. สี hex ที่ hardcode ให้เปลี่ยนเป็น token/CSS variable ถ้ามี ถ้าไม่มี token ให้ปล่อยไว้และจดในรายงาน
9. ปุ่ม/ลิงก์ที่เตี้ยกว่า 40px ให้แก้เป็น >= 40px; `<table>` ดิบต้องมี `overflow-x-auto`; grid >= 3 คอลัมน์ต้องมี breakpoint
10. ตัวอักษรเนื้อหาภาษาไทยห้ามเล็กกว่า `text-sm` (ยกเว้น badge/caption)
11. ถ้าหน้าไหนซับซ้อนจน logic กับหน้าตาพันกันแยกไม่ได้ ให้ข้ามหน้านั้น แล้วจดเหตุผลในตาราง ห้ามฝืนแก้

## (ค) เกณฑ์ตรวจหลังย้ายแต่ละหน้า (ต้องผ่านทั้งหมด)

- `npx tsc --noEmit` ผ่าน และ lint ไฟล์ที่แก้ผ่าน
- Playwright test ของโมดูลนั้น (ถ้ามี) ผ่าน
- การกระทำหลักของหน้า (ค้นหา, กรอง, บันทึก, export) ยังทำงานเท่าเดิม
- ไม่มี `<table>` ล้นหน้าจอ 390px

## (ง) ตารางความคืบหน้า (252 หน้า)

| path | แบบหน้า | สถานะ | หมายเหตุ |
|---|---|---|---|
| /(dashboard)/alert-center | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/analytics/advanced | dashboard | done |  |
| /(dashboard)/analytics/esg_carbon | dashboard | done |  |
| /(dashboard)/analytics/intelligence | dashboard | done |  |
| /(dashboard)/analytics/kpi | dashboard | done |  |
| /(dashboard)/analytics | hub | done |  |
| /(dashboard)/analytics/tco | list | done |  |
| /(dashboard)/andon-board | hub | done | special page (no standard header) |
| /(dashboard)/approval/center | list | done | re-export approval/page (2026-11-20) |
| /(dashboard)/approval | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset-reliability/[id] | detail | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/aging | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/config | form | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/critical | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/data-quality | dashboard | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/lifecycle | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/overhaul | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability | hub | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/replacement | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset-reliability/reports | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/asset_registry/bom_tree | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/criticality | dashboard | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/oee | dashboard | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/plant_map | dashboard | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/asset_registry/view | detail | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/assets/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/assets | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/audit-log | list | done | migrated (PageShell→PageHeader) |
| /(dashboard)/budget | dashboard | done |  |
| /(dashboard)/calibration/calendar | dashboard | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/certificates | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/config | settings | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/create | form | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/dashboard | dashboard | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/data-quality | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/edit | form | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/instruments/[id] | detail | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/instruments | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/mobile | form | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/oot | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/plans | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/po | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/procedures | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/reports | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/run/[id] | form | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/schedule | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/standards | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/calibration/tracking | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/contractors/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/contractors/create | form | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/contractors | list | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/contractors/permits | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/contractors/work | list | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/cost | dashboard | done |  |
| /(dashboard)/dashboard/list | list | done |  |
| /(dashboard)/dashboard/my | dashboard | done |  |
| /(dashboard)/dashboard | dashboard | skipped |  | wallboard — ใช้ tower-* layout ของตัวเอง ไม่มี PageShell/PageHeader มาตรฐาน |
| /(dashboard)/documents/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/documents/create | form | done | cmms-page-hero → PageHeader (2026-11-20) |
| /(dashboard)/documents/edit | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/documents/engineering-changes | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/documents/forms | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/documents/manuals | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/documents | list | done | cmms-page-hero → DetailHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/documents/review | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/documents/shutdown | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/editor/builder | form | done | migrated (PageShell→PageHeader) |
| /(dashboard)/editor | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/engineering-changes/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/engineering-changes/create | form | done | cmms-page-hero → PageHeader (2026-11-20) |
| /(dashboard)/engineering-changes/edit | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/engineering-changes | list | done | cmms-page-hero → DetailHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/engineering-changes/requests | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/equipment_borrowing/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/equipment_borrowing/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/equipment_borrowing | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/facility-layout | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/feedback | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/field | hub | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/field/plan | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/field/work/[id] | detail | done | ย้าย top Card → DetailHeader (2026-11-20) |
| /(dashboard)/forms/designer | form | done | PageShell → PageHeader (special: เฉพาะ header/spacing) (2026-11-20) |
| /(dashboard)/forms | hub | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/forms/run/[id] | form | done | PageShell → PageHeader (3 จุด: loading/404/main) (2026-11-20) |
| /(dashboard)/home | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/inspections/history | list | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/inspections | hub | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/inspections/run | form | done | ย้าย hero → DetailHeader (pending/offline ย้ายเป็น alert แยก) (2026-11-20) |
| /(dashboard)/inspections/templates | list | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/iot/condition | list | done |  |
| /(dashboard)/iot/monitor | dashboard | done |  |
| /(dashboard)/knowledge/articles/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/knowledge/articles/create | form | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/knowledge/articles/edit | redirect | skipped | redirect/re-export — ข้าม |
| /(dashboard)/knowledge/articles | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge/gaps/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/knowledge/gaps | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge | hub | done | cmms-page-hero → DetailHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge/reviews | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge/search | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge/taxonomy | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/knowledge/usage | list | done | cmms-page-hero → PageHeader (layoutStyle คงไว้) (2026-11-20) |
| /(dashboard)/manuals/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/manuals/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/manuals | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr/production_hours/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr/production_hours/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/mtbf_mttr/production_hours | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/notifications/history | list | done | migrated (PageShell→PageHeader) |
| /(dashboard)/notifications | list | done | migrated (PageShell→PageHeader) |
| /(dashboard)/pages/[slug] | detail | done | migrated (PageShell→PageHeader) |
| /(dashboard)/pages | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/planning/calendar | list | done | ย้าย ui/page-header → PageHeader (calendar พิเศษ: เฉพาะ header/spacing) (2026-11-20) |
| /(dashboard)/planning | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/batch_schedule | form | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/calendar | dashboard | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/checklists | list | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/checksheet | form | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/create | form | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/dashboard | dashboard | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/edit | form | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/pm_am | hub | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/pm_am/plans/[id] | detail | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/pm_am/plans/create | form | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/plans | list | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/pm_am/view | detail | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/predictive-maintenance | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/process-flows | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/profile | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/rca/[id] | detail | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/rca/events | list | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/rca/new | form | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/rca | dashboard | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/rca/taxonomy | list | done | cmms-page-hero → DetailHeader (2026-11-20) |
| /(dashboard)/reliability/assets/[id] | detail | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/assets | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/bad-actors | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/config | settings | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/data-quality | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/failure-modes | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/growth | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/pm-effectiveness | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/studies/[id] | detail | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/studies | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/trend | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/reliability/weibull | list | done | PageShell → PageHeader (2026-11-21) |
| /(dashboard)/repair/assign | list | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/repair/create | form | done | ย้าย sr-only eyebrow → PageHeader (2026-11-20) |
| /(dashboard)/repair/edit | form | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/repair/history | list | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/repair/kanban | list | done | ย้าย hero → PageHeader (kanban พิเศษ: เฉพาะ header/spacing) (2026-11-20) |
| /(dashboard)/repair/my_tasks | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/repair | list | done | ต้นแบบ (PageShell + Kpi + toolbar) — เสร็จแล้ว |
| /(dashboard)/repair/print | detail | done | ย้าย screen header → PageHeader (print document ไม่แตะ) (2026-11-20) |
| /(dashboard)/repair/tracking | list | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/repair/view | detail | done | ย้าย PageShell → DetailHeader (2026-11-20) |
| /(dashboard)/repair/workload | dashboard | done | ย้าย hero → PageHeader (2026-11-20) |
| /(dashboard)/reports/assets | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/cost | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/downtime | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/export_excel | form | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/import_excel | list | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/inspections | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/monthly_pdf | list | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/mttr-mtbf | dashboard | skipped | ห่อ ReportPage — แก้ที่ report-page ตัวเดียว (โมดูล reports) (2026-11-20) |
| /(dashboard)/reports | hub | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/pm | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/report-center | hub | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/requests | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/scheduled | list | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/sla | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/spare-parts | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/technicians | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/reports/work-orders | dashboard | done | PageHeader/DetailHeader (report-page) (2026-11-20) |
| /(dashboard)/roles/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/roles/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/roles | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/safety/work_permit/[id] | detail | done | PageShell → DetailHeader (2026-11-20) |
| /(dashboard)/safety/work_permit/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/safety/work_permit | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/settings/design | settings | done |  |
| /(dashboard)/settings/health | settings | done |  |
| /(dashboard)/settings/master/[entity] | settings | done |  |
| /(dashboard)/settings/menus | settings | done |  |
| /(dashboard)/settings/notification-prefs | settings | done |  |
| /(dashboard)/settings/notification-rules | settings | done |  |
| /(dashboard)/settings/notifications | settings | done |  |
| /(dashboard)/settings | settings | done |  |
| /(dashboard)/settings/permission-diff | settings | done |  |
| /(dashboard)/settings/push | settings | done |  |
| /(dashboard)/settings/pwa | settings | done |  |
| /(dashboard)/settings/repair-options | settings | done |  |
| /(dashboard)/settings/services | settings | done |  |
| /(dashboard)/shutdown/[id] | detail | done | migrated (PageShell→PageHeader) |
| /(dashboard)/shutdown | list | done | migrated (PageShell→PageHeader) |
| /(dashboard)/spare-reorder | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/spare_parts/balances | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts/create | form | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/edit | form | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/issue_center | list | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/optimization | dashboard | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/overview | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts/reservations | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts/returns | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts/sage_po | list | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/sage_shipments | list | done | ย้าย PageShell → PageHeader (2026-11-20) |
| /(dashboard)/spare_parts/sage_sync | list | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/spare_parts/stock_take | form | done | ย้าย hero → DetailHeader (2026-11-20) |
| /(dashboard)/supervisor | hub | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/supervisor/plan | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/supervisor/queue | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/supervisor/review | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/supervisor/verify | list | done | ย้าย ui/page-header → PageHeader (2026-11-20) |
| /(dashboard)/suppliers/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/suppliers/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/suppliers | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/sync-center | hub | done | migrated (PageShell→PageHeader) |
| /(dashboard)/users/create | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/users/edit | form | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/users/leaderboard | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/users | list | done | PageShell → PageHeader (2026-11-20) |
| /(dashboard)/workforce/capacity | list | done |  |
| /(dashboard)/workforce/certifications | list | done |  |
| /(dashboard)/workforce/conflicts | list | done |  |
| /(dashboard)/workforce/crews | list | done |  |
| /(dashboard)/workforce/mine | dashboard | done |  |
| /(dashboard)/workforce | hub | done |  |
| /(dashboard)/workforce/shifts | list | done |  |
| /(dashboard)/workforce/skills | list | done |  |
| /(dashboard)/workforce/technicians/[userId] | detail | done |  |
| /(dashboard)/workforce/technicians | list | done |  |
| /(dashboard)/workforce/training | list | done |  |
| /change-password | form | done | outside shell — auth gate (standalone); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header; PageHeader ไม่เหมาะกับ gate layout |
| /install | form | done | outside shell — public PWA install page (standalone); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| /login | form | done | outside shell — full-screen auth (standalone); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| /my-repairs | list | done | outside shell — standalone component (MyRepairs); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| / | redirect | skipped | redirect/re-export — ข้าม |
| /qr-sheet | detail | done | outside shell — print page (standalone); ลบ usePageHero ที่ไม่ได้ใช้; ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| /register | form | done | outside shell — auth gate (standalone); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| /repair-request | redirect | skipped | redirect/re-export — ข้าม |
| /repair/request | form | done | standalone (no shell) |
| /scan | hub | done | outside shell — field scan (standalone); ลบ usePageHero ที่ไม่ได้ใช้; ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |
| /tv | settings | done | outside shell — kiosk rotator (standalone); ไม่ใช้ PageShell/cmms-page-hero/ui/page-header |

## (จ) ลำดับโมดูล (ตามที่ผู้ใช้ใช้บ่อยก่อน)

1. repair (ทำเป็นต้นแบบแล้ว — `/(dashboard)/repair` = done)
2. pm_am
3. supervisor + field
4. spare_parts
5. inspections + planning
6. approval + documents + forms + manuals
7. knowledge
8. rca + mtbf_mttr + contractors + engineering-changes + safety
9. reports (แก้ที่ `report-page` ตัวเดียว)
10. users + roles + suppliers + assets + asset_registry + equipment_borrowing
11. calibration + reliability + asset-reliability + workforce + settings (ใช้ PageShell อยู่แล้ว ปรับให้เข้ากฎ)
12. dashboard (หน้าแรก), analytics, cost, budget, iot
13. หน้านอก shell

## (ฉ) รูปแบบรายงานหลังจบแต่ละโมดูล

รายงานต้องระบุ: ไฟล์ที่แก้, หน้าที่ข้าม + เหตุผล, สิ่งที่ไม่แน่ใจ, ผลเทส (tsc, lint, Playwright ถ้ามี)

## Component กลางที่มี

- `frontend/components/layout/`: `PageHeader`, `KpiStrip`, `ListToolbar`, `DetailHeader`, `InfoGrid`, `FormPage`, `FormSection`, `FormActions`, `HubGrid`, `HubCard`, primitives
- `frontend/components/ui/`: `EmptyState`, `Skeleton` (ใช้ต่อ ไม่สร้างใหม่)
- `ChartTip`/`Legend` ยังไม่ได้ดึงเป็น component กลาง — อยู่ใน `dashboard/page.tsx`, ดึงในขั้น dashboard (โมดูล 12)
- ~~Demo ชั่วคราว~~ **ลบแล้ว 2026-11-23 (Phase 2)**: `/ui-demo`, `/ui-kit` — ตัวอย่างการใช้งานจริงดู `/supervisor`, `/supervisor/queue`, `/repair/view` และ `docs/COMPONENT_LIBRARY.md`

## (ช) Accessibility: จุดที่คลิกได้ต้องเข้าถึงด้วยคีย์บอร์ด (`3ae9b10d`)

กฎ: อะไรที่ `onClick` ได้ ต้อง `Tab` ไปถึง, กด `Enter`/`Space` ได้ และเห็น focus ring (`focus-visible:outline-2 outline-offset-2 outline-[var(--cmms-border-focus)]`) — ถ้าภายในมีการ์ด/แถวที่มีปุ่มซ้อนอยู่ ให้ปุ่มจริงเป็นตัวรับ focus ไม่ใช่ใส่ `role="button"` ที่ตัวห่อ

- `settings/menus`: การ์ดพรีวิวบทบาท → ปุ่มชื่อบทบาท (`aria-pressed`) เป็นตัวรับ focus, การ์ดทั้งใบยังคลิกได้ด้วยเมาส์
- `settings/pwa`: dropzone เปลี่ยนไอคอน → `role="button"` + `tabIndex` + `aria-label` + Enter/Space เปิด file input
- `components/RepairRequestForm.tsx`: ขั้น stepper ที่ย้อนกลับได้ → `role="button"` + `tabIndex` + `aria-current="step"` + Enter/Space (ขั้นที่ยังไม่ถึงไม่ใส่ `tabIndex`); แบนเนอร์ผูกบัญชี LINE → `role="link"` + `tabIndex` + Enter/Space
- `asset_registry/bom_tree`: ชื่อชิ้นส่วนเป็นปุ่มจริงสำหรับเลือก (`aria-pressed`) เพราะแถวมีปุ่มซ้อน
- ยกเว้นโดยเจตนา: canvas คลิกวางตำแหน่ง (`facility-layout`) และจุดที่มี `onKeyDown` อยู่แล้ว (`ui/table.tsx` td ของ checkbox, `tv` `role="application"`)
- modal แบบ inline (`pm_am/checklists`, `field/work/[id]` pause+complete, `knowledge/articles/[id]` Modal, `knowledge/reviews`) ใช้ `useDialogA11y` (`frontend/lib/use-dialog-a11y.ts`): Escape ปิด, `Tab`/`Shift+Tab` วนในกล่อง, โฟกัสเข้าเมื่อเปิดและคืนให้ปุ่มที่เปิดเมื่อปิด; ตัวกล่องเป็น `role="dialog" aria-modal="true" aria-labelledby="…" tabIndex={-1}` และ backdrop เป็น `role="presentation"` (คลิกนอกกล่องยังปิดได้ แต่ไม่ใช่ทางเดียว)
- wrapper ที่เดิมแค่ `stopPropagation` (`settings/menus`) ไม่เป็น div ที่คลิกได้อีก ใช้ `data-card-ignore` แล้วให้การ์ดตรวจ `closest()` แทน — คีย์บอร์ดจึงไม่ต้อง Tab ไปที่ wrapper

## (ซ) `<img>` ต้องมี `width`/`height` กัน layout shift

กฎ: ทุก `<img>` ใส่ `width`/`height` เป็นตัวเลขจริงของกล่องที่ render — รูปที่ CSS บังคับขนาดไว้แล้วก็ยังต้องมี เพื่อไม่ให้เกิด shift ก่อน CSS โหลด; รูปที่ไหลตามความกว้าง (fluid) ให้ใส่สัดส่วนจริงของภาพ ไม่ใช่ขนาดที่เดา

- `frontend/components/ImageUploadField.tsx`: พรีวิว 96×72 (ตรงกับ `style`)
- `frontend/components/PMChecksheetDocument.tsx`: ลายเซ็น 2 ใบ 280×90 (ขนาด canvas ลายเซ็น)
- `frontend/components/RepairRequestForm.tsx`: รูปโปรไฟล์ LINE 44×44 (`.cmms-avatar`), รูปใน `.cmms-photo-thumb` 96×96 (ช่องเป็น `aspect-ratio: 1`)
- `frontend/components/WorkOrderClosureDocument.tsx`: รูปก่อน/หลังซ่อม 400×200 (กล่องสูง 200 คงที่ กว้าง fluid), ลายเซ็นผู้รับมอบงาน 280×90
- `frontend/components/ui/employee-avatar.tsx`: `width`/`height` = `size` prop (24/32/40/56/80)
- ยังขาด: floor plan 2 จุด (`facility-layout`) ต้องเก็บ `image_width`/`image_height` ตอนอัปโหลดก่อน จึงจะใส่ค่าจริงได้ (แตะ API/DB)
