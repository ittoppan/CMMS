# UI Audit — หน้า `frontend/app/**/page.tsx`

> อ่านไฟล์จริงทั้งหมด **252 หน้า** (`frontend/app/**/page.tsx`) เมื่อ 2026-11-20 · งานนี้ **อ่านอย่างเดียว ไม่แก้โค้ด**
> วิธีวัด: อ่าน source แล้วนับ import/markup ด้วยสคริปต์ (regex) — ตัวเลขทุกช่องมาจากไฟล์จริง ไม่ได้ประมาณ

## สรุป

| แบบหน้า | จำนวน | PageShell | ใช้ ui kit | ใช้ markup เองล้วน |
|---|---|---|---|---|
| list | 99 | 64 (65%) | 97 (98%) | 2 |
| dashboard | 32 | 10 (31%) | 20 (63%) | 12 |
| form | 48 | 26 (54%) | 46 (96%) | 2 |
| detail | 21 | 10 (48%) | 21 (100%) | 0 |
| hub | 24 | 14 (58%) | 23 (96%) | 1 |
| settings | 16 | 15 (94%) | 15 (94%) | 1 |
| redirect / alias (ไม่อยู่ใน 6 แบบ) | 12 | 0 | 0 | 12 |
| **รวม** | **252** | **139 (55%)** | **222 (88%)** | **30** |

- `PageShell` ใช้จริง 139 หน้า แต่มี **60 หน้า** ที่ทำหัวหน้าเองด้วย CSS class `cmms-page-hero` และ **13 หน้า** ใช้ `components/ui/page-header` → หัวหน้ามี 3 แบบขนานกัน
- 12 หน้าเป็น redirect stub (`redirect()` บรรทัดเดียว) หรือ re-export หน้าแม่
- 11 หน้าในโมดูล reports เป็น wrapper ของ `components/reports/report-page` (เนื้อหาจริงอยู่ที่เดียว)

## 1) ตารางจัดกลุ่มทุกหน้า

`component กลาง` = จำนวน import จาก `@/components/ui/*` ในไฟล์นั้น (0 = เขียน markup เองล้วน)

| path | แบบหน้า | PageShell | component กลาง |
|---|---|---|---|
| `/(dashboard)/alert-center` | hub | ✓ | ui ×1 |
| `/(dashboard)/analytics/advanced` | dashboard | — | ui ×6 |
| `/(dashboard)/analytics/esg_carbon` | dashboard | ✓ | ui ×3 |
| `/(dashboard)/analytics/intelligence` | dashboard | — | ui ×6 |
| `/(dashboard)/analytics/kpi` | dashboard | — | ui ×7 |
| `/(dashboard)/analytics` | hub | — | ui ×4 |
| `/(dashboard)/analytics/tco` | list | ✓ | ui ×5 |
| `/(dashboard)/andon-board` | hub | — | ui ×2 |
| `/(dashboard)/approval/center` | list | — | markup เอง |
| `/(dashboard)/approval` | list | ✓ | ui ×7 |
| `/(dashboard)/asset-reliability/[id]` | detail | ✓ | ui ×12 |
| `/(dashboard)/asset-reliability/aging` | list | ✓ | ui ×6 |
| `/(dashboard)/asset-reliability/config` | form | ✓ | ui ×5 |
| `/(dashboard)/asset-reliability/critical` | list | ✓ | ui ×8 |
| `/(dashboard)/asset-reliability/data-quality` | dashboard | ✓ | ui ×7 |
| `/(dashboard)/asset-reliability/lifecycle` | list | ✓ | ui ×7 |
| `/(dashboard)/asset-reliability/overhaul` | list | ✓ | ui ×9 |
| `/(dashboard)/asset-reliability` | hub | ✓ | ui ×7 |
| `/(dashboard)/asset-reliability/replacement` | list | ✓ | ui ×7 |
| `/(dashboard)/asset-reliability/reports` | list | ✓ | ui ×8 |
| `/(dashboard)/asset_registry/bom_tree` | list | ✓ | ui ×9 |
| `/(dashboard)/asset_registry/create` | form | ✓ | ui ×6 |
| `/(dashboard)/asset_registry/criticality` | dashboard | ✓ | ui ×7 |
| `/(dashboard)/asset_registry/edit` | form | ✓ | ui ×6 |
| `/(dashboard)/asset_registry/oee` | dashboard | ✓ | ui ×4 |
| `/(dashboard)/asset_registry` | list | ✓ | ui ×9 |
| `/(dashboard)/asset_registry/plant_map` | dashboard | ✓ | ui ×4 |
| `/(dashboard)/asset_registry/view` | detail | ✓ | ui ×9 |
| `/(dashboard)/assets/create` | form | ✓ | ui ×5 |
| `/(dashboard)/assets` | list | ✓ | ui ×10 |
| `/(dashboard)/audit-log` | list | ✓ | ui ×7 |
| `/(dashboard)/budget` | dashboard | — | ui ×7 |
| `/(dashboard)/calibration/calendar` | dashboard | ✓ | ui ×3 |
| `/(dashboard)/calibration/certificates` | list | ✓ | ui ×3 |
| `/(dashboard)/calibration/config` | settings | ✓ | ui ×4 |
| `/(dashboard)/calibration/create` | form | ✓ | ui ×6 |
| `/(dashboard)/calibration/dashboard` | dashboard | ✓ | ui ×5 |
| `/(dashboard)/calibration/data-quality` | list | ✓ | ui ×4 |
| `/(dashboard)/calibration/edit` | form | ✓ | ui ×7 |
| `/(dashboard)/calibration/instruments/[id]` | detail | ✓ | ui ×7 |
| `/(dashboard)/calibration/instruments` | list | ✓ | ui ×7 |
| `/(dashboard)/calibration/mobile` | form | — | ui ×5 |
| `/(dashboard)/calibration/oot` | list | ✓ | ui ×3 |
| `/(dashboard)/calibration` | list | ✓ | ui ×6 |
| `/(dashboard)/calibration/plans` | list | ✓ | ui ×7 |
| `/(dashboard)/calibration/po` | list | ✓ | ui ×6 |
| `/(dashboard)/calibration/procedures` | list | ✓ | ui ×7 |
| `/(dashboard)/calibration/reports` | list | ✓ | ui ×5 |
| `/(dashboard)/calibration/run/[id]` | form | ✓ | ui ×7 |
| `/(dashboard)/calibration/schedule` | list | ✓ | ui ×6 |
| `/(dashboard)/calibration/standards` | list | ✓ | ui ×7 |
| `/(dashboard)/calibration/tracking` | list | ✓ | ui ×7 |
| `/(dashboard)/contractors/[id]` | detail | — | ui ×8 |
| `/(dashboard)/contractors/create` | form | — | ui ×6 |
| `/(dashboard)/contractors` | list | — | ui ×8 |
| `/(dashboard)/contractors/permits` | redirect | — | markup เอง |
| `/(dashboard)/contractors/work` | list | — | ui ×9 |
| `/(dashboard)/cost` | dashboard | — | ui ×8 |
| `/(dashboard)/dashboard/list` | list | ✓ | ui ×5 |
| `/(dashboard)/dashboard/my` | dashboard | ✓ | ui ×4 |
| `/(dashboard)/dashboard` | dashboard | — | markup เอง |
| `/(dashboard)/documents/[id]` | detail | — | ui ×10 |
| `/(dashboard)/documents/create` | form | — | ui ×7 |
| `/(dashboard)/documents/edit` | redirect | — | markup เอง |
| `/(dashboard)/documents/engineering-changes` | redirect | — | markup เอง |
| `/(dashboard)/documents/forms` | redirect | — | markup เอง |
| `/(dashboard)/documents/manuals` | redirect | — | markup เอง |
| `/(dashboard)/documents` | list | — | ui ×11 |
| `/(dashboard)/documents/review` | redirect | — | markup เอง |
| `/(dashboard)/documents/shutdown` | redirect | — | markup เอง |
| `/(dashboard)/editor/builder` | form | ✓ | ui ×1 |
| `/(dashboard)/editor` | hub | ✓ | ui ×9 |
| `/(dashboard)/engineering-changes/[id]` | detail | — | ui ×10 |
| `/(dashboard)/engineering-changes/create` | form | — | ui ×7 |
| `/(dashboard)/engineering-changes/edit` | redirect | — | markup เอง |
| `/(dashboard)/engineering-changes` | list | — | ui ×8 |
| `/(dashboard)/engineering-changes/requests` | redirect | — | markup เอง |
| `/(dashboard)/equipment_borrowing/create` | form | ✓ | ui ×7 |
| `/(dashboard)/equipment_borrowing/edit` | form | ✓ | ui ×8 |
| `/(dashboard)/equipment_borrowing` | list | ✓ | ui ×6 |
| `/(dashboard)/facility-layout` | hub | ✓ | ui ×7 |
| `/(dashboard)/feedback` | hub | ✓ | ui ×3 |
| `/(dashboard)/field` | hub | — | ui ×4 |
| `/(dashboard)/field/plan` | list | — | ui ×5 |
| `/(dashboard)/field/work/[id]` | detail | — | ui ×4 |
| `/(dashboard)/forms/designer` | form | ✓ | ui ×8 |
| `/(dashboard)/forms` | hub | ✓ | ui ×9 |
| `/(dashboard)/forms/run/[id]` | form | ✓ | ui ×4 |
| `/(dashboard)/home` | hub | ✓ | markup เอง |
| `/(dashboard)/inspections/history` | list | — | ui ×7 |
| `/(dashboard)/inspections` | hub | — | ui ×7 |
| `/(dashboard)/inspections/run` | form | — | ui ×8 |
| `/(dashboard)/inspections/templates` | list | — | ui ×9 |
| `/(dashboard)/iot/condition` | list | ✓ | ui ×9 |
| `/(dashboard)/iot/monitor` | dashboard | ✓ | ui ×6 |
| `/(dashboard)/knowledge/articles/[id]` | detail | — | ui ×10 |
| `/(dashboard)/knowledge/articles/create` | form | — | ui ×10 |
| `/(dashboard)/knowledge/articles/edit` | redirect | — | markup เอง |
| `/(dashboard)/knowledge/articles` | list | — | ui ×7 |
| `/(dashboard)/knowledge/gaps/[id]` | detail | — | ui ×8 |
| `/(dashboard)/knowledge/gaps` | list | — | ui ×6 |
| `/(dashboard)/knowledge` | hub | — | ui ×7 |
| `/(dashboard)/knowledge/reviews` | list | — | ui ×9 |
| `/(dashboard)/knowledge/search` | list | — | ui ×6 |
| `/(dashboard)/knowledge/taxonomy` | list | — | ui ×11 |
| `/(dashboard)/knowledge/usage` | list | — | ui ×7 |
| `/(dashboard)/manuals/create` | form | ✓ | ui ×7 |
| `/(dashboard)/manuals/edit` | form | ✓ | ui ×8 |
| `/(dashboard)/manuals` | list | ✓ | ui ×5 |
| `/(dashboard)/mtbf_mttr/create` | form | ✓ | ui ×6 |
| `/(dashboard)/mtbf_mttr/edit` | form | ✓ | ui ×7 |
| `/(dashboard)/mtbf_mttr` | list | ✓ | ui ×5 |
| `/(dashboard)/mtbf_mttr/production_hours/create` | form | ✓ | ui ×6 |
| `/(dashboard)/mtbf_mttr/production_hours/edit` | form | ✓ | ui ×7 |
| `/(dashboard)/mtbf_mttr/production_hours` | list | ✓ | ui ×5 |
| `/(dashboard)/notifications/history` | list | ✓ | ui ×7 |
| `/(dashboard)/notifications` | list | ✓ | ui ×9 |
| `/(dashboard)/pages/[slug]` | detail | ✓ | ui ×2 |
| `/(dashboard)/pages` | hub | ✓ | ui ×5 |
| `/(dashboard)/planning/calendar` | list | — | ui ×8 |
| `/(dashboard)/planning` | list | — | ui ×11 |
| `/(dashboard)/pm_am/batch_schedule` | form | — | ui ×8 |
| `/(dashboard)/pm_am/calendar` | dashboard | — | ui ×6 |
| `/(dashboard)/pm_am/checklists` | list | — | ui ×5 |
| `/(dashboard)/pm_am/checksheet` | form | — | ui ×8 |
| `/(dashboard)/pm_am/create` | form | — | ui ×7 |
| `/(dashboard)/pm_am/dashboard` | dashboard | — | ui ×2 |
| `/(dashboard)/pm_am/edit` | form | — | ui ×7 |
| `/(dashboard)/pm_am` | hub | — | ui ×6 |
| `/(dashboard)/pm_am/plans/[id]` | detail | — | ui ×4 |
| `/(dashboard)/pm_am/plans/create` | form | — | ui ×7 |
| `/(dashboard)/pm_am/plans` | list | — | ui ×5 |
| `/(dashboard)/pm_am/view` | detail | — | ui ×4 |
| `/(dashboard)/predictive-maintenance` | hub | ✓ | ui ×1 |
| `/(dashboard)/process-flows` | hub | ✓ | ui ×1 |
| `/(dashboard)/profile` | hub | ✓ | ui ×9 |
| `/(dashboard)/rca/[id]` | detail | — | ui ×8 |
| `/(dashboard)/rca/events` | list | — | ui ×7 |
| `/(dashboard)/rca/new` | form | — | ui ×6 |
| `/(dashboard)/rca` | dashboard | — | ui ×7 |
| `/(dashboard)/rca/taxonomy` | list | — | ui ×8 |
| `/(dashboard)/reliability/assets/[id]` | detail | ✓ | ui ×4 |
| `/(dashboard)/reliability/assets` | list | ✓ | ui ×6 |
| `/(dashboard)/reliability/bad-actors` | list | ✓ | ui ×9 |
| `/(dashboard)/reliability/config` | settings | ✓ | ui ×3 |
| `/(dashboard)/reliability/data-quality` | list | ✓ | ui ×5 |
| `/(dashboard)/reliability/failure-modes` | list | ✓ | ui ×5 |
| `/(dashboard)/reliability/growth` | list | ✓ | ui ×7 |
| `/(dashboard)/reliability` | list | ✓ | ui ×4 |
| `/(dashboard)/reliability/pm-effectiveness` | list | ✓ | ui ×5 |
| `/(dashboard)/reliability/studies/[id]` | detail | ✓ | ui ×8 |
| `/(dashboard)/reliability/studies` | list | ✓ | ui ×8 |
| `/(dashboard)/reliability/trend` | list | ✓ | ui ×5 |
| `/(dashboard)/reliability/weibull` | list | ✓ | ui ×4 |
| `/(dashboard)/repair/assign` | list | — | ui ×7 |
| `/(dashboard)/repair/create` | form | — | markup เอง |
| `/(dashboard)/repair/edit` | form | ✓ | ui ×9 |
| `/(dashboard)/repair/history` | list | — | ui ×7 |
| `/(dashboard)/repair/kanban` | list | — | ui ×6 |
| `/(dashboard)/repair/my_tasks` | list | ✓ | ui ×11 |
| `/(dashboard)/repair` | list | ✓ | ui ×9 |
| `/(dashboard)/repair/print` | detail | — | ui ×3 |
| `/(dashboard)/repair/tracking` | list | — | ui ×7 |
| `/(dashboard)/repair/view` | detail | ✓ | ui ×6 |
| `/(dashboard)/repair/workload` | dashboard | — | ui ×4 |
| `/(dashboard)/reports/assets` | dashboard | — | markup เอง |
| `/(dashboard)/reports/cost` | dashboard | — | markup เอง |
| `/(dashboard)/reports/downtime` | dashboard | — | markup เอง |
| `/(dashboard)/reports/export_excel` | form | — | ui ×4 |
| `/(dashboard)/reports/import_excel` | list | — | ui ×6 |
| `/(dashboard)/reports/inspections` | dashboard | — | markup เอง |
| `/(dashboard)/reports/monthly_pdf` | list | — | ui ×6 |
| `/(dashboard)/reports/mttr-mtbf` | dashboard | — | markup เอง |
| `/(dashboard)/reports` | hub | — | ui ×2 |
| `/(dashboard)/reports/pm` | dashboard | — | markup เอง |
| `/(dashboard)/reports/report-center` | hub | — | ui ×3 |
| `/(dashboard)/reports/requests` | dashboard | — | markup เอง |
| `/(dashboard)/reports/scheduled` | list | — | ui ×9 |
| `/(dashboard)/reports/sla` | dashboard | — | markup เอง |
| `/(dashboard)/reports/spare-parts` | dashboard | — | markup เอง |
| `/(dashboard)/reports/technicians` | dashboard | — | markup เอง |
| `/(dashboard)/reports/work-orders` | dashboard | — | markup เอง |
| `/(dashboard)/roles/create` | form | ✓ | ui ×6 |
| `/(dashboard)/roles/edit` | form | ✓ | ui ×6 |
| `/(dashboard)/roles` | list | ✓ | ui ×6 |
| `/(dashboard)/safety/work_permit/[id]` | detail | ✓ | ui ×11 |
| `/(dashboard)/safety/work_permit/create` | form | ✓ | ui ×8 |
| `/(dashboard)/safety/work_permit` | list | ✓ | ui ×8 |
| `/(dashboard)/settings/design` | settings | ✓ | ui ×4 |
| `/(dashboard)/settings/health` | settings | ✓ | ui ×4 |
| `/(dashboard)/settings/master/[entity]` | settings | ✓ | ui ×8 |
| `/(dashboard)/settings/menus` | settings | ✓ | ui ×4 |
| `/(dashboard)/settings/notification-prefs` | settings | ✓ | ui ×6 |
| `/(dashboard)/settings/notification-rules` | settings | ✓ | ui ×11 |
| `/(dashboard)/settings/notifications` | settings | ✓ | ui ×10 |
| `/(dashboard)/settings` | settings | ✓ | ui ×8 |
| `/(dashboard)/settings/permission-diff` | settings | ✓ | ui ×5 |
| `/(dashboard)/settings/push` | settings | ✓ | ui ×5 |
| `/(dashboard)/settings/pwa` | settings | ✓ | ui ×4 |
| `/(dashboard)/settings/repair-options` | settings | ✓ | ui ×9 |
| `/(dashboard)/settings/services` | settings | ✓ | ui ×4 |
| `/(dashboard)/shutdown/[id]` | detail | ✓ | ui ×7 |
| `/(dashboard)/shutdown` | list | ✓ | ui ×8 |
| `/(dashboard)/spare-reorder` | hub | ✓ | ui ×1 |
| `/(dashboard)/spare_parts/balances` | list | ✓ | ui ×7 |
| `/(dashboard)/spare_parts/create` | form | — | ui ×6 |
| `/(dashboard)/spare_parts/edit` | form | — | ui ×7 |
| `/(dashboard)/spare_parts/issue_center` | list | — | ui ×7 |
| `/(dashboard)/spare_parts/optimization` | dashboard | — | ui ×5 |
| `/(dashboard)/spare_parts/overview` | list | ✓ | ui ×3 |
| `/(dashboard)/spare_parts` | list | ✓ | ui ×11 |
| `/(dashboard)/spare_parts/reservations` | list | ✓ | ui ×5 |
| `/(dashboard)/spare_parts/returns` | list | ✓ | ui ×5 |
| `/(dashboard)/spare_parts/sage_po` | list | — | ui ×8 |
| `/(dashboard)/spare_parts/sage_shipments` | list | ✓ | ui ×9 |
| `/(dashboard)/spare_parts/sage_sync` | list | — | ui ×6 |
| `/(dashboard)/spare_parts/stock_take` | form | — | ui ×6 |
| `/(dashboard)/supervisor` | hub | — | ui ×4 |
| `/(dashboard)/supervisor/plan` | list | — | ui ×9 |
| `/(dashboard)/supervisor/queue` | list | — | ui ×7 |
| `/(dashboard)/supervisor/review` | list | — | ui ×9 |
| `/(dashboard)/supervisor/verify` | list | — | ui ×4 |
| `/(dashboard)/suppliers/create` | form | ✓ | ui ×7 |
| `/(dashboard)/suppliers/edit` | form | ✓ | ui ×7 |
| `/(dashboard)/suppliers` | list | ✓ | ui ×6 |
| `/(dashboard)/sync-center` | hub | ✓ | ui ×4 |
| `/(dashboard)/users/create` | form | ✓ | ui ×8 |
| `/(dashboard)/users/edit` | form | ✓ | ui ×8 |
| `/(dashboard)/users/leaderboard` | list | ✓ | ui ×6 |
| `/(dashboard)/users` | list | ✓ | ui ×9 |
| `/(dashboard)/workforce/capacity` | list | ✓ | ui ×5 |
| `/(dashboard)/workforce/certifications` | list | ✓ | ui ×8 |
| `/(dashboard)/workforce/conflicts` | list | ✓ | ui ×7 |
| `/(dashboard)/workforce/crews` | list | ✓ | ui ×9 |
| `/(dashboard)/workforce/mine` | dashboard | ✓ | ui ×3 |
| `/(dashboard)/workforce` | hub | ✓ | ui ×4 |
| `/(dashboard)/workforce/shifts` | list | ✓ | ui ×9 |
| `/(dashboard)/workforce/skills` | list | ✓ | ui ×9 |
| `/(dashboard)/workforce/technicians/[userId]` | detail | ✓ | ui ×8 |
| `/(dashboard)/workforce/technicians` | list | ✓ | ui ×4 |
| `/(dashboard)/workforce/training` | list | ✓ | ui ×9 |
| `/change-password` | form | — | ui ×2 |
| `/install` | form | — | ui ×4 |
| `/login` | form | — | ui ×2 |
| `/my-repairs` | list | — | markup เอง |
| `/` | redirect | — | markup เอง |
| `/qr-sheet` | detail | — | ui ×3 |
| `/register` | form | — | ui ×3 |
| `/repair-request` | redirect | — | markup เอง |
| `/repair/request` | form | — | markup เอง |
| `/scan` | hub | — | ui ×4 |
| `/tv` | settings | — | markup เอง |

## 2) วิเคราะห์รายแบบหน้า

### list (99 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 96 · `ui/input` 73 · `ui/select` 60 · `data-table-adapter` 51 · `ui/badge` 55 · `EmptyState` 28 · `ui/dialog` 28 · `PageShell` 64 |
| outlier | `(dashboard)/approval/center` (re-export `../page`, ไม่มีหัวหน้า) · `my-repairs` (standalone LIFF, ไม่มี shell) · `(dashboard)/repair/kanban` (บอร์ด ไม่ใช่ตาราง) · `(dashboard)/asset_registry/bom_tree` (tree + modal) · `(dashboard)/calibration/po` (ฟอร์มสร้าง PO inline) · `(dashboard)/field/plan` (card list) |
| pattern ซ้ำควรดึงกลาง | แถบค้นหา+ตัวกรอง (50 หน้ามีช่องค้นหา), ตาราง (51 adapter + 28 เขียน `<table>` เอง), empty/loading state, dialog ฟอร์มเพิ่ม/แก้ |

### dashboard (32 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 20 · recharts 8 · `ui/select` 9 · `PageShell` 10 · `module-guide` 11 |
| outlier | `(dashboard)/dashboard` (ใช้ CSS `tower-*` + `Panel`/`Kpi` ของตัวเอง ไม่ใช้ ui kit เลย) · `reports/{assets,cost,downtime,inspections,mttr-mtbf,pm,requests,sla,spare-parts,technicians,work-orders}` (11 หน้า delegate ให้ `components/reports/report-page`) · `(dashboard)/repair/workload` (ใช้ `ui/page-header` ไม่ใช้ PageShell) · `(dashboard)/workforce/mine` · `(dashboard)/asset_registry/plant_map` |
| pattern ซ้ำควรดึงกลาง | แถว KPI (การ์ดตัวเลข + badge + sparkline), การ์ดกราฟ + legend + tooltip, `ChartTip`/`Legend` ที่ dashboard เขียนเอง แต่ report มีของตัวเอง |

### form (48 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 43 · `ui/input` 43 · `ui/select` 33 · `ui/label` · `PageShell` 26 |
| outlier | `(dashboard)/repair/create` + `repair/request` (ห่อ `RepairRequestForm` ตัวเดียว ไม่มี header ของตัวเอง) · `login`, `register`, `install`, `change-password` (นอก dashboard shell) · `(dashboard)/calibration/mobile` (mobile-first) · `(dashboard)/forms/designer` · `(dashboard)/editor/builder` (builder UI) |
| pattern ซ้ำควรดึงกลาง | การ์ดฟอร์ม + grid 2 คอลัมน์ (`max-w-[640px]` ซ้ำ 8 หน้า), ปุ่ม บันทึก/ยกเลิก + แถบ error/success, `FormField` (label+input+error) |

### detail (21 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 21 · `ui/input` 16 · `ui/select` 13 · `<table>` 9 · `ui/dialog` 9 · `EmptyState` 9 · `PageShell` 10 · `cmms-page-hero` 8 |
| outlier | `qr-sheet` (layout พิมพ์เอง ไม่มี shell) · `(dashboard)/repair/print` · `(dashboard)/field/work/[id]` · `(dashboard)/pm_am/view` |
| pattern ซ้ำควรดึงกลาง | บล็อกข้อมูล key-value 2 คอลัมน์, timeline/ประวัติ, ปุ่ม action ด้านบน (แก้ไข/พิมพ์/ปิดงาน) |

### hub (24 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 22 · `module-guide` 12 · `ui/input` 11 · `PageShell` 14 · `cmms-page-hero` 6 |
| outlier | `scan` (standalone) · `(dashboard)/andon-board` · `(dashboard)/field` (ไม่มีหัวหน้าเลย) · `(dashboard)/supervisor` (ใช้ `ui/page-header`) · `(dashboard)/reports/report-center` |
| pattern ซ้ำควรดึงกลาง | hero + การ์ดทางเข้า (grid icon + title + desc + link) — ซ้ำเกือบทุก hub, `ModuleGuide` ท้ายหน้า |

### settings (16 หน้า)
| หัวข้อ | ผล |
|---|---|
| component ที่ใช้ร่วม | `ui/card` 15 · `PageShell` 15 · `ui/input` 10 · `ModuleGuide` 8 |
| outlier | `tv` (standalone ไม่มี shell) · `(dashboard)/settings/master/[entity]` (dynamic) |
| pattern ซ้ำควรดึงกลาง | ส่วนตั้งค่าเป็น card + switch/tabs, แถบบันทึก/รีเซ็ต, status pill บริการ |

## 3) จำนวนหน้าต่อโมดูล (เรียงมาก→น้อย)

| อันดับ | โมดูล | จำนวนหน้า |
|---|---|---|
| 1 | calibration | 20 |
| 2 | reports | 17 |
| 3 | reliability | 13 |
| 3 | settings | 13 |
| 3 | spare_parts | 13 |
| 6 | pm_am | 12 |
| 7 | knowledge | 11 |
| 7 | repair | 11 |
| 7 | workforce | 11 |
| 7 | (root — login/scan/tv/qr-sheet ฯลฯ) | 11 |
| 11 | asset-reliability | 10 |
| 12 | documents | 9 |
| 13 | asset_registry | 8 |
| 14 | analytics | 6 |
| 14 | mtbf_mttr | 6 |
| 16 | contractors | 5 |
| 16 | engineering-changes | 5 |
| 16 | rca | 5 |
| 16 | supervisor | 5 |
| 20 | inspections / users | 4 |
| 22 | dashboard / equipment_borrowing / field / forms / manuals / roles / safety / suppliers | 3 |
| 30 | approval / assets / editor / iot / notifications / pages / planning / shutdown | 2 |
| 38 | alert-center / andon-board / audit-log / budget / cost / facility-layout / feedback / home / predictive-maintenance / process-flows / profile / spare-reorder / sync-center | 1 |

รวม 50 โมดูล · 252 หน้า · โมดูลใหญ่สุด = **calibration 20 หน้า** (ส่วนใหญ่เป็น list/detail ของ instruments/plans/certificates)

## 4) ค่าที่ hardcode ซ้ำ

| ค่า | จำนวนไฟล์ที่ใช้ | ตัวอย่าง 3 ไฟล์ |
|---|---|---|
| `text-sm` | 164 | analytics/advanced, analytics/intelligence, alert-center |
| `text-xs` | 140 | alert-center, analytics/advanced, asset-reliability/aging |
| `text-2xl` | 56 | analytics, analytics/advanced, analytics/intelligence |
| `text-lg` | 26 | analytics/advanced, asset-reliability/[id], asset_registry/create |
| `text-[0.66rem]` | **0** | ไม่มีใน `app/**/page.tsx` แล้ว (เดิมมีเฉพาะใน `components/dashboard/sidebar-nav.tsx`) |
| `text-[0.85rem]` | 3 | inspections/run, pm_am/checksheet, repair/kanban |
| `text-[0.75rem]` | 2 | pm_am/checksheet, settings/notification-prefs |
| `#fff` (hex ตรง) | 16 | analytics/intelligence, andon-board, editor |
| `#ffffff` | 7 | asset_registry/view, forms/run/[id], repair |
| `#e0f2fe` | 5 | andon-board, pm_am/calendar, pm_am/checklists |
| `#f8fafc` | 4 | andon-board, editor, settings/menus |
| `#0284c7` | 4 | pm_am/calendar, pm_am/checklists, pm_am/plans/create |
| `#10b981` / `#ef4444` / `#f59e0b` | 3 each | analytics/advanced, analytics/intelligence, settings/design |
| `#0068B5` (brand) | 3 | editor, settings, settings/design |
| `space-y-6` (ระยะห่างหน้า) | 62 | analytics/advanced, analytics/intelligence, analytics |
| `gap-4` | 86 | analytics/advanced, analytics/intelligence, analytics |
| `rounded-xl` | 47 | analytics/advanced, analytics/intelligence, analytics |
| ปุ่ม/ลิงก์ `h-8` หรือ `h-9` (32–36px) | 8 | dashboard/my, facility-layout, pm_am/plans, budget, cost |
| ปุ่ม/ลิงก์ `h-6`–`h-9` (เล็กกว่า 40px) | 11 | facility-layout (14 จุด), budget (3), spare_parts (3) |

> หมายเหตุ: สี hex เกือบทั้งหมดอยู่ใน `style={{ color }}` / inline chart config ไม่ได้ผ่าน CSS variable — แก้ธีมแล้วไม่เปลี่ยนตาม

## 5) หน้าที่เสี่ยงไม่รองรับมือถือ

| ปัญหา | จำนวน | หน้า |
|---|---|---|
| `<table>` ดิบไม่มี `overflow-x-auto` | 3 | `(dashboard)/dashboard`, `(dashboard)/repair`, `(dashboard)/repair/print` |
| กำหนดความกว้างต่ำสุดแบบตายตัวแต่ไม่มี overflow | 2 | `(dashboard)/asset_registry/bom_tree` (`min-w-[320px]`), `(dashboard)/editor` (`w-[350px]`) |
| `grid-cols-≥3` ไม่มี breakpoint (`sm:/md:/lg:`) | 4 | `(dashboard)/asset_registry/criticality`, `(dashboard)/calibration/calendar`, `(dashboard)/pm_am/dashboard`, `(dashboard)/reports/monthly_pdf` |
| ปุ่ม/ลิงก์เตี้ยกว่า 40px (`h-6`–`h-9`) | 11 | `facility-layout` (14), `budget` (3), `spare_parts` (3), `cost` (2), `pm_am/plans` (2), `analytics/intelligence`, `asset_registry/plant_map`, `asset_registry/view`, `dashboard/my`, `inspections`, `register` |

หน้าที่ยังพอไปได้บนมือถือเพราะห่อ `overflow-x-auto` ไว้ (ไม่นับเป็นปัญหา): analytics/advanced, dashboard/list, rca, rca/events, safety/work_permit, settings/notifications, reports/import_excel, calibration/run/[id], knowledge/taxonomy

## ข้อจำกัด / ไม่แน่ใจ

- การจัดประเภทหน้าอิง path + marker ในไฟล์ (มี `<table>` → list, มี recharts → dashboard, `/create|/edit|/new|/run` → form, `[id]/view/print` → detail) หน้าเชิงผสมจะถูกจัดตาม marker ที่แรงกว่า เช่น report ที่มีทั้ง KPI+กราฟ+ตารางถูกจัดเป็น dashboard
- ตัวเลข "ปุ่มเล็กกว่า 40px" นับจากบรรทัดที่มีทั้ง tag ปุ่มและ class `h-6..h-9` — เป็นการประมาณจาก source ไม่ได้วัดขนาดจริงในเบราว์เซอร์
- ไม่ได้เปิดเบราว์เซอร์/ย่อหน้าจอจริง จึงยัง **ไม่ยืนยันด้วยตา** ว่าหน้าไหนล้นแนวนอนบนมือถือจริง
- หน้า `(dashboard)/asset_registry/bom_tree` และ `editor` มี width ตายตัวแต่ไม่มี overflow — ยังไม่แน่ใจว่าพ่อแม่มี scroll อยู่แล้วหรือไม่ (ต้องดู runtime)
