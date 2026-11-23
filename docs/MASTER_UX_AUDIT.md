# MASTER UX AUDIT — CMMS-TPT

> Phase 1 · 2026-11-23 · **Consolidation** ของผล audit เดิม + ข้อค้นพบใหม่จาก Phase 0 (ไม่ได้วัดใหม่ทุกหน้า)
> แหล่งเดิม: `docs/CMMS_UI_AUDIT.md` (648 บรรทัด), `docs/IMPECCABLE_FULL_PROJECT_AUDIT.md` (653 บรรทัด), `docs/PHASE_D3_UX_AUDIT.md`, `docs/DESIGN_REPORT.md`, `docs/UI_MIGRATION.md`, `docs/API_PERMISSION_MATRIX.md`
> การจัดระดับ: **Critical** = งานหลักทำไม่ได้/ข้อมูลผิด · **High** = ต้องกี่คลิก/เข้าใจยาก/เสี่ยงสิทธิ์ · **Medium** = ไม่สะดวกแต่มีทางออก · **Low** = ความ polish

## 1. สรุปสถานะ UX ตามหลักฐาน

| ด้าน | สถานะ | หลักฐาน |
|---|---|---|
| UI migration 252 หน้า (PageHeader/DetailHeader) | ครบ (done/skipped) | `UI_MIGRATION.md` |
| Repair request flow | 4 คลิก (ผ่านเป้า) | `PHASE_D` |
| Supervisor desk | อยู่ระหว่าง redesign (D3.2) | working tree |
| Queue workspace | ยังเป็นตาราง desktop, ไม่มี mobile card | `PHASE_D3_UX_AUDIT.md` §4.2 |
| Dashboard 36 modules | มีครบ, KPI ยังไม่ trace/validate ครบ | `DASHBOARD_BUILD.md`, `KPI_INVENTORY.md` |
| PM / planning | ตรวจไม่ได้เพราะ `pm_am`=0 | `STATUS.md` |
| Reports/export | ยังไม่ตรวจ filter↔export parity | master spec §9 |
| Mobile (390) | ผ่านบางหน้า; 768/1440 ยังไม่ตรวจ | `DESIGN_BASELINE.md` §4 |
| Role-based UX | gating มี แต่ยังไม่ทดสอบครบ 3 role | `DESIGN_REPORT.md` §11 |

## 2. Critical

| # | เรื่อง | หน้า/ผลกระทบ | หลักฐาน |
|---|---|---|---|
| C1 | Work Order Queue อ่านไม่ได้บนมือถือ (ตาราง 8 คอลัมน์) | `/supervisor/queue` — Foreman ใช้งานภาคสนามไม่ได้ | D3 audit §4.2.1 |
| C2 | KPI บางตัวคำนวณจากข้อมูลที่ไม่มี (MTBF/MTTR, downtime=0, PM=0) แต่หน้าแสดงตัวเลข/ช่องว่างโดยไม่บอกเหตุ | `/mtbf_mttr`, `/asset-reliability`, `/reliability`, `/dashboard/*` | `STATUS.md` §6, `KPI_INVENTORY.md` §0.6 |
| C3 | 108/113 API ไม่ enforced ระดับ endpoint → UI อาจแสดงข้อมูลเกินสิทธิ์ | ทุก role | `API_PERMISSION_MATRIX.md` |
| C4 | 13 route ใหม่ไม่อยู่ในตาราง UI migration → ไม่มีการตรวจ header/spacing ตามกติกา | dashboard 10 หน้า + onboarding + 2 demo | Phase 0 (นับไฟล์จริง) |
| C5 | Production ล้าหลัง 18 commit → ผู้ใช้เห็นของเก่า ไม่ตรงกับสิ่งที่ทดสอบ | ทั้งระบบ | `MASTER_BASELINE.md` §7 |

## 3. High

| # | เรื่อง | หน้า | หลักฐาน |
|---|---|---|---|
| H1 | Queue: search ยิง request ทุกคีย์ (ไม่มี debounce), limit 200 hardcode, ไม่มี total/pagination | `/supervisor/queue` | D3 §4.2.3/9 |
| H2 | Queue/Overview: ไม่มี Empty/Permission/Offline state ที่บอกผู้ใช้ (มีแต่ข้อความ) | `/supervisor/*` | D3 §4.1.8-10 |
| H3 | Supervisor overview ไม่มี last-updated, priority overview, attention center, recent WO | `/supervisor` | D3 §4.1 |
| H4 | Wallboard TBT 680ms (Recharts บน main thread) → เครื่องช้าในโรงงาน | `/dashboard/wallboard` | D2 report |
| H5 | Export ยังไม่ยืนยันว่าใช้ filter เดียวกับหน้าจอ + permission | `/reports/*`, `/dashboard/*` | master spec §9 |
| H6 | Entrance หลัง login ไม่ตรงงานของแต่ละ role (User/Operate/Foreman) — ยังไม่มี role-based landing ที่ยืนยัน | `/dashboard` portal | `DESIGN_REPORT.md` §11 |
| H7 | เมนู/สิทธิ์: `menu_permissions` กว้างกว่า matrix หลายโมดูล → ผู้ใช้เห็นเมนูที่กดแล้ว 403 | sidebar | `API_PERMISSION_MATRIX.md` §ข้อควรรู้ |
| H8 | ไม่มีคู่มือ in-app/empty-state แนะนำเมื่อข้อมูลว่าง (PM, lubrication, predictive) | หน้าใหม่ 8 หน้า | `DASHBOARD_BUILD.md` |
| H9 | ไม่มีผลตรวจ responsive 768/1440 | ทุกหน้า | `DESIGN_BASELINE.md` §4 |

## 4. Medium

| # | เรื่อง | หน้า |
|---|---|---|
| M1 | Detail ใบงานยาวมาก 1,000+ บรรทัด ไม่มี compact summary/aging เด่น | `/repair/view` |
| M2 | Filter ขาด department/date range/technician (ต้องแก้ API → ต้องอนุมัติ) | `/supervisor/queue` |
| M3 | Workload/technician analytics ไม่มี drill-down ไปใบงาน | `/repair/workload`, `/workforce` |
| M4 | Spare parts list 1MB, ไม่มี server-side pagination | `/spare_parts` |
| M5 | Settings กระจายหลายหน้า (`/settings`, `/settings/notifications`, `/settings/health`) ผู้ใช้สับสน | settings |
| M6 | หน้า analytics/reports ใช้ chart หนัก ไม่ lazy | `/analytics`, `/reports/*` |
| M7 | ตารางในหน้ารายงานไม่มี saved view/filter persistence (มี `saved-views.ts` แต่ยังไม่ทั่ว) | reports |
| M8 | ไม่มี onboarding wizard ครั้งแรก | `/onboarding` (มีหน้าแล้ว) |
| M9 | Notification center: ไม่มี grouping/อ่านทั้งหมด/mark-all (ต้องตรวจของเดิมก่อน) | `/notifications` |

## 5. Low

- ไอคอน/ป้ายสถานะบางหน้าใช้คำต่างกัน (Operate vs Technician)
- ปุ่มกลับ/ breadcrumb ใน flow ยาว
- ตัวเลข hex ค้าง 2 จุดใน `/dashboard/my`
- หน้า demo `/ui-demo`, `/ui-kit` ยังอยู่ใน production route
- ไฟล์ `tmp-*` ใน repo

## 6. สิ่งที่ยัง **ไม่ได้** ตรวจ (ต้องทำ Phase ถัดไป)

1. Per-page UX audit ของ 265 route แบบลงรายละเอียด (ทำแล้วบางส่วนใน `IMPECCABLE` 252 route)
2. Click-count ของทุก flow หลัก (ทำแล้ว 3 flow)
3. Screen-reader walkthrough จริง (มีแค่ axe อัตโนมัติ)
4. Tablet/desktop responsive
5. Error/offline recovery flow (PWA queue ยังไม่ทดสอบ E2E)

## 7. Acceptance ของ Phase 1

- [x] ทุก module มีผล audit (จากเอกสารเดิม + Phase 0 inventory)
- [x] มีการจัดระดับ Critical/High/Medium/Low
- [x] มีรายการหน้า + เหตุผล + ผลกระทบ (`MASTER_UX_PRIORITY.md`)
- [ ] Per-page evidence ครบ 100% สำหรับ 13 route ใหม่ (ปิดใน Phase 4/6)
