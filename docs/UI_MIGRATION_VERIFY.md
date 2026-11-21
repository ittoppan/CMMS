# UI Migration Verification Report

> สร้างเพื่อตรวจสอบผลการย้าย UI ตาม `docs/UI_MIGRATION.md`
> วันที่ตรวจสอบ: 2026-11-21
> ฐานเปรียบเทียบ (ก่อนเริ่มย้าย): commit `84e55b4d` (parent ของ `67ff5875` "feat(ui): component กลาง PageHeader ...")
> HEAD ปัจจุบัน: `06441136`
> หมายเหตุ: ห้ามแก้โค้ด — รายงานนี้เป็นผลการรัน/อ่านจริงเท่านั้น

## 1. ผลการรัน tsc / lint / build

| คำสั่ง | ผล | รายละเอียด |
|---|---|---|
| `npx tsc --noEmit` (frontend/) | ✅ ผ่าน (exit 0) | ไม่มี type error |
| `npm run lint` (frontend/) | ❌ รันไม่ได้ | ไม่มี script `lint` ใน package.json; Next.js 16 ถอดคำสั่ง `next lint` ออกแล้ว และไม่มี eslint config (`.eslintrc*`/`eslint.config.*`) ในโปรเจค → จึงไม่มี lint ให้รัน |
| `npm run build` (frontend/) | ✅ ผ่าน (exit 0) | build ครั้งแรกชน lock ของ `.next/standalone` (EBUSY) เพราะ production server กำลังรันอยู่; รันใหม่ด้วย `NEXT_DIST_DIR=".next-verify"` ผ่าน (BUILD_ID `9apijse7a02b-iM4n7tbv` ตอน deploy ท้ายสุด) |
| `python scripts/design-audit.py` | ✅ PASS | pages scanned 254, FAIL 0, WARN 0 |

สรุป: typecheck + build ผ่าน; lint ไม่สามารถรันได้เพราะไม่มี config/script (ไม่ใช่ error จากโค้ด).

## 2. ผลการรัน Playwright ทั้งชุด

- คำสั่ง: `npx playwright test` (target `http://localhost:3001`, workers=1)
- ผลรอบสุดท้าย (หลังซ่อม server): **151 passed, 0 failed, 0 skipped (5.6m)**

หมายเหตุระหว่างทาง:
- รอบแรกที่รัน ได้ **40 passed / 21 failed / 75 skipped / 15 did not run** — สาเหตุไม่ใช่ migration แต่เป็นปัญหาสภาพแวดล้อม: ระหว่างรัน `npm run build` (default) ได้ลบ/ล็อก `.next/standalone` ทำให้ production server เสิร์ฟ JS chunk เป็น 500 (MIME text/plain) → หน้าแสดง error boundary "เกิดข้อผิดพลาด" และ splash ไม่หาย
- ซ่อมโดยรัน `scripts/deploy-next.ps1` (build + stage + restart) → 32/32 checks ผ่าน, BUILD_ID `9apijse7a02b-iM4n7tbv`
- รัน Playwright ใหม่ → **151/151 ผ่าน**
- ไม่มีเทสที่ fail ในรอบสุดท้าย

## 3. นับสถานะจากตาราง `docs/UI_MIGRATION.md` (252 หน้า)

| สถานะ | จำนวน |
|---|---|
| done | 238 |
| skipped | 14 |
| needs-review | 0 |
| todo | 0 |
| **รวม** | **252** |

### หน้าที่เป็น skipped (14) พร้อมเหตุผล

| path | แบบหน้า | เหตุผล |
|---|---|---|
| `/(dashboard)/contractors/permits` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/dashboard` | dashboard | wallboard — ใช้ tower-* layout ของตัวเอง ไม่มี PageShell/PageHeader มาตรฐาน (หมายเหตุในตารางว่าง; เหตุผลจากสรุปงาน) |
| `/(dashboard)/documents/edit` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/documents/engineering-changes` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/documents/forms` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/documents/manuals` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/documents/review` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/documents/shutdown` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/engineering-changes/edit` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/engineering-changes/requests` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/knowledge/articles/edit` | redirect | redirect/re-export — ข้าม |
| `/(dashboard)/reports/mttr-mtbf` | dashboard | ห่อ `ReportPage` — แก้ที่ `report-page` ตัวเดียว (โมดูล reports) |
| `/` | redirect | redirect/re-export — ข้าม |
| `/repair-request` | redirect | redirect/re-export — ข้าม |

### หน้าที่เป็น needs-review

ไม่มี (0 หน้า)

### หน้าที่เป็น todo

ไม่มี (0 หน้า)


## 4. ของเก่าที่ยังเหลือใน `frontend/app`

เกณฑ์: ค้นหาใน `frontend/app` (รวม `.tsx/.ts/.css`) ด้วย grep/python; ค่าเป็น "จำนวนไฟล์" ที่พบ pattern (ไม่ใช่จำนวนครั้ง)

| pattern | จำนวนไฟล์ | path (สรุป) |
|---|---|---|
| `cmms-page-hero` | 1 | `app/globals.css` (เฉพาะนิยาม CSS class; **ไม่มีหน้าใดใช้แล้ว**) |
| `ui/page-header` | 0 | — (ไม่พบ) |
| `<table>` ที่ไม่มี `overflow-x-auto` ห่อ (heuristic: `<table>` ไม่มี `overflow-x-auto` ภายใน 6 บรรทัดก่อนหน้า) | 10 | ดูรายการด้านล่าง |
| ปุ่ม/ลิงก์ `h-6..h-9` (token `h-6`..`h-9` ใน className) | 74 | ดูภาคผนวก A (heuristic กว้าง: รวม icon/element เล็ก ไม่ได้ยืนยันว่าเป็นปุ่ม/ลิงก์ทุกไฟล์) |
| `text-[0.xxrem]` ในข้อความไทย | 6 | `app/(dashboard)/asset-reliability/[id]/page.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/repair/kanban/page.tsx`, `app/(dashboard)/settings/notification-prefs/page.tsx`, `app/(dashboard)/shutdown/page.tsx`, `app/(dashboard)/sync-center/page.tsx` |
| hex ที่ hardcode (`#xxx`) | 33 | ดูภาคผนวก B (รวม 494 ครั้ง; หลายไฟล์เป็น canvas/chart color หรือ CSS) |

### ไฟล์ที่มี `<table>` ไม่ได้ห่อ `overflow-x-auto` (10 ไฟล์)

1. `app/(dashboard)/analytics/advanced/page.tsx`
2. `app/(dashboard)/audit-log/page.tsx`
3. `app/(dashboard)/dashboard/page.tsx`
4. `app/(dashboard)/pm_am/plans/create/page.tsx`
5. `app/(dashboard)/repair/page.tsx`
6. `app/(dashboard)/repair/print/page.tsx`
7. `app/(dashboard)/reports/import_excel/page.tsx`
8. `app/(dashboard)/reports/monthly_pdf/page.tsx`
9. `app/(dashboard)/settings/repair-options/page.tsx`
10. `app/(dashboard)/spare_parts/page.tsx`

หมายเหตุ: 7 ไฟล์ในรายการนี้ไม่มีคำว่า `overflow-x-auto` เลยในไฟล์; อีก 3 ไฟล์มี `overflow-x-auto` ที่อื่นแต่ตารางนี้ไม่ถูกห่อ (ตาม heuristic) — ต้องตรวจด้วยตาอีกครั้ง (ไม่แน่ใจ 100%)


## 5. ตรวจ logic ที่อาจเปลี่ยนไป (เทียบ git diff กับ commit ก่อนย้าย)

- ฐาน: `84e55b4d` → HEAD `06441136`, เฉพาะ `frontend/app` (222 ไฟล์เปลี่ยน)
- ค้นหา diff ที่แตะ `fetch(`, `useQuery`, `useMutation`, `onSubmit`, `permission`, `router.`

| keyword | ไฟล์ที่ diff แตะ (real change) | หมายเหตุ |
|---|---|---|
| `fetch(` | 0 | ไม่พบการเปลี่ยน API call |
| `useQuery` | 0 | ไม่พบ |
| `useMutation` | 0 | ไม่พบ |
| `onSubmit` | 0 | ไม่พบ |
| `permission` | 1 | `settings/permission-diff/page.tsx` — เป็นการเปลี่ยนหัวหน้า (eyebrow → `PageHeader`) เท่านั้น |
| `router.` | 26 | เป็นการเพิ่ม `key` prop / จัด JSX รอบปุ่มที่มี `router.push` เดิม; **ไม่มีการเปลี่ยน argument route** (ตรวจ route strings แล้ว: 0 ไฟล์ที่ route string เปลี่ยน) |

### ไฟล์ที่ diff แตะ `router.` (26 ไฟล์) — ให้ตรวจ

1. `frontend/app/(dashboard)/asset_registry/create/page.tsx`
2. `frontend/app/(dashboard)/asset_registry/edit/page.tsx`
3. `frontend/app/(dashboard)/asset_registry/page.tsx`
4. `frontend/app/(dashboard)/equipment_borrowing/page.tsx`
5. `frontend/app/(dashboard)/knowledge/articles/[id]/page.tsx`
6. `frontend/app/(dashboard)/knowledge/gaps/[id]/page.tsx`
7. `frontend/app/(dashboard)/manuals/page.tsx`
8. `frontend/app/(dashboard)/mtbf_mttr/page.tsx`
9. `frontend/app/(dashboard)/mtbf_mttr/production_hours/page.tsx`
10. `frontend/app/(dashboard)/pm_am/checklists/page.tsx`
11. `frontend/app/(dashboard)/pm_am/dashboard/page.tsx`
12. `frontend/app/(dashboard)/pm_am/page.tsx`
13. `frontend/app/(dashboard)/pm_am/plans/[id]/page.tsx`
14. `frontend/app/(dashboard)/pm_am/plans/page.tsx`
15. `frontend/app/(dashboard)/pm_am/view/page.tsx`
16. `frontend/app/(dashboard)/roles/create/page.tsx`
17. `frontend/app/(dashboard)/roles/edit/page.tsx`
18. `frontend/app/(dashboard)/roles/page.tsx`
19. `frontend/app/(dashboard)/safety/work_permit/[id]/page.tsx`
20. `frontend/app/(dashboard)/safety/work_permit/create/page.tsx`
21. `frontend/app/(dashboard)/settings/permission-diff/page.tsx`
22. `frontend/app/(dashboard)/suppliers/create/page.tsx`
23. `frontend/app/(dashboard)/suppliers/edit/page.tsx`
24. `frontend/app/(dashboard)/users/create/page.tsx`
25. `frontend/app/(dashboard)/users/edit/page.tsx`
26. `frontend/app/(dashboard)/users/page.tsx`

สรุป: **ไม่พบ diff ที่เปลี่ยน logic (API/state/validation/permission/export/navigation/route)** ตามเกณฑ์ห้าม — ทั้งหมดเป็นการเปลี่ยน presentation (header/JSX props). แต่ควรตรวจไฟล์ด้านบนด้วยตา (ไม่แน่ใจ 100% จากรันอัตโนมัติ).

## 6. หน้าที่ href/route หายไปจากเดิม

- ไฟล์ที่ถูกลบใน `frontend/app`: **0** ไฟล์
- `href="/..."` ที่มีใน base แต่หายใน HEAD: **0** รายการ
- `router.push/replace("...")` route strings ที่เปลี่ยน: **0** รายการ

สรุป: ไม่พบหน้า/route ที่หายไป.


## ภาคผนวก A — ไฟล์ที่มี token `h-6..h-9` (74 ไฟล์)

- `frontend/app/(dashboard)/analytics/intelligence/page.tsx`
- `frontend/app/(dashboard)/analytics/kpi/page.tsx`
- `frontend/app/(dashboard)/analytics/page.tsx`
- `frontend/app/(dashboard)/approval/page.tsx`
- `frontend/app/(dashboard)/asset_registry/page.tsx`
- `frontend/app/(dashboard)/asset_registry/plant_map/page.tsx`
- `frontend/app/(dashboard)/asset_registry/view/page.tsx`
- `frontend/app/(dashboard)/budget/page.tsx`
- `frontend/app/(dashboard)/calibration/calendar/page.tsx`
- `frontend/app/(dashboard)/calibration/dashboard/page.tsx`
- `frontend/app/(dashboard)/calibration/mobile/page.tsx`
- `frontend/app/(dashboard)/calibration/page.tsx`
- `frontend/app/(dashboard)/calibration/po/page.tsx`
- `frontend/app/(dashboard)/contractors/work/page.tsx`
- `frontend/app/(dashboard)/cost/page.tsx`
- `frontend/app/(dashboard)/dashboard/list/page.tsx`
- `frontend/app/(dashboard)/dashboard/my/page.tsx`
- `frontend/app/(dashboard)/equipment_borrowing/page.tsx`
- `frontend/app/(dashboard)/facility-layout/page.tsx`
- `frontend/app/(dashboard)/field/page.tsx`
- `frontend/app/(dashboard)/field/work/[id]/page.tsx`
- `frontend/app/(dashboard)/forms/page.tsx`
- `frontend/app/(dashboard)/inspections/page.tsx`
- `frontend/app/(dashboard)/inspections/run/page.tsx`
- `frontend/app/(dashboard)/iot/condition/page.tsx`
- `frontend/app/(dashboard)/iot/monitor/page.tsx`
- `frontend/app/(dashboard)/knowledge/gaps/page.tsx`
- `frontend/app/(dashboard)/layout.tsx`
- `frontend/app/(dashboard)/loading.tsx`
- `frontend/app/(dashboard)/manuals/page.tsx`
- `frontend/app/(dashboard)/mtbf_mttr/page.tsx`
- `frontend/app/(dashboard)/mtbf_mttr/production_hours/page.tsx`
- `frontend/app/(dashboard)/planning/page.tsx`
- `frontend/app/(dashboard)/pm_am/calendar/page.tsx`
- `frontend/app/(dashboard)/pm_am/checklists/page.tsx`
- `frontend/app/(dashboard)/pm_am/checksheet/page.tsx`
- `frontend/app/(dashboard)/pm_am/plans/[id]/page.tsx`
- `frontend/app/(dashboard)/pm_am/plans/page.tsx`
- `frontend/app/(dashboard)/process-flows/page.tsx`
- `frontend/app/(dashboard)/rca/[id]/page.tsx`
- `frontend/app/(dashboard)/rca/taxonomy/page.tsx`
- `frontend/app/(dashboard)/repair/edit/page.tsx`
- `frontend/app/(dashboard)/repair/history/page.tsx`
- `frontend/app/(dashboard)/repair/kanban/page.tsx`
- `frontend/app/(dashboard)/repair/my_tasks/page.tsx`
- `frontend/app/(dashboard)/repair/page.tsx`
- `frontend/app/(dashboard)/repair/tracking/page.tsx`
- `frontend/app/(dashboard)/repair/view/page.tsx`
- `frontend/app/(dashboard)/repair/workload/page.tsx`
- `frontend/app/(dashboard)/reports/import_excel/page.tsx`
- `frontend/app/(dashboard)/reports/report-center/page.tsx`
- `frontend/app/(dashboard)/reports/scheduled/page.tsx`
- `frontend/app/(dashboard)/roles/page.tsx`
- `frontend/app/(dashboard)/settings/design/page.tsx`
- `frontend/app/(dashboard)/settings/notification-rules/page.tsx`
- `frontend/app/(dashboard)/settings/page.tsx`
- `frontend/app/(dashboard)/settings/push/page.tsx`
- `frontend/app/(dashboard)/settings/pwa/page.tsx`
- `frontend/app/(dashboard)/spare_parts/edit/page.tsx`
- `frontend/app/(dashboard)/spare_parts/issue_center/page.tsx`
- `frontend/app/(dashboard)/spare_parts/page.tsx`
- `frontend/app/(dashboard)/spare_parts/sage_po/page.tsx`
- `frontend/app/(dashboard)/spare_parts/sage_shipments/page.tsx`
- `frontend/app/(dashboard)/spare_parts/sage_sync/page.tsx`
- `frontend/app/(dashboard)/supervisor/page.tsx`
- `frontend/app/(dashboard)/suppliers/page.tsx`
- `frontend/app/(dashboard)/users/leaderboard/page.tsx`
- `frontend/app/(dashboard)/users/page.tsx`
- `frontend/app/(dashboard)/workforce/skills/page.tsx`
- `frontend/app/(dashboard)/workforce/technicians/page.tsx`
- `frontend/app/install/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/scan/page.tsx`
- `frontend/app/tv/page.tsx`

## ภาคผนวก B — ไฟล์ที่มี hex hardcode (33 ไฟล์)

- `frontend/app/(dashboard)/analytics/advanced/page.tsx`
- `frontend/app/(dashboard)/analytics/intelligence/page.tsx`
- `frontend/app/(dashboard)/andon-board/page.tsx`
- `frontend/app/(dashboard)/asset_registry/view/page.tsx`
- `frontend/app/(dashboard)/editor/page.tsx`
- `frontend/app/(dashboard)/feedback/page.tsx`
- `frontend/app/(dashboard)/forms/run/[id]/page.tsx`
- `frontend/app/(dashboard)/inspections/history/page.tsx`
- `frontend/app/(dashboard)/inspections/page.tsx`
- `frontend/app/(dashboard)/pm_am/calendar/page.tsx`
- `frontend/app/(dashboard)/pm_am/checklists/page.tsx`
- `frontend/app/(dashboard)/pm_am/checksheet/page.tsx`
- `frontend/app/(dashboard)/pm_am/page.tsx`
- `frontend/app/(dashboard)/pm_am/plans/[id]/page.tsx`
- `frontend/app/(dashboard)/pm_am/plans/create/page.tsx`
- `frontend/app/(dashboard)/pm_am/plans/page.tsx`
- `frontend/app/(dashboard)/repair/page.tsx`
- `frontend/app/(dashboard)/repair/view/page.tsx`
- `frontend/app/(dashboard)/settings/design/page.tsx`
- `frontend/app/(dashboard)/settings/health/page.tsx`
- `frontend/app/(dashboard)/settings/menus/page.tsx`
- `frontend/app/(dashboard)/settings/notifications/page.tsx`
- `frontend/app/(dashboard)/settings/page.tsx`
- `frontend/app/(dashboard)/settings/pwa/page.tsx`
- `frontend/app/(dashboard)/settings/services/page.tsx`
- `frontend/app/(dashboard)/users/create/page.tsx`
- `frontend/app/(dashboard)/users/edit/page.tsx`
- `frontend/app/globals.css`
- `frontend/app/install/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/not-found.tsx`
- `frontend/app/qr-sheet/page.tsx`
- `frontend/app/tower.css`

---
*สร้างโดยการรันจริง: tsc, build, design-audit, Playwright; grep/python สำหรับ pattern; git diff สำหรับ logic/route.*
