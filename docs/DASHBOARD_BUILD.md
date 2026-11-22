# DASHBOARD_BUILD — สร้าง Dashboard Portal และ Dashboard ทั้งหมด

อัปเดตล่าสุด: Phase 1 ทำเสร็จ (Portal + ย้าย wallboard). รายการที่ยังไม่ done ทำต่อได้จากไฟล์นี้

## ข้อสรุปการสำรวจ (Phase 0)

- docs/DASHBOARD_GAP.md: ไม่มี → ใช้รายการใน prompt เป็นหลัก
- dashboard-registry.ts: ไม่มีเดิม → สร้างใหม่ใน Phase 1
- docs/UI_MIGRATION.md / docs/ROLE_MENUS.md: อ่านเพื่อทำความเข้าใจ (ไม่แก้)
- src/menu_catalog.php: มี key 'dashboard' อยู่แล้ว; เปลี่ยนป้ายเป็น "ศูนย์รวม Dashboard"
- route-perms.ts: derive จาก sidebar-nav.tsx จุดเดียว; /dashboard/wallboard ยังไม่มี exact map (fail-open ตามพฤติกรรมเดิม)
- หน้าตัวอย่าง /repair/page.tsx: ใช้ PageShell + components กลาง

### ผลกระทบจากการย้าย /dashboard (Phase 1)
- /dashboard/page.tsx เดิม = wallboard ใหญ่ → ย้ายไป /dashboard/wallboard/page.tsx (copy ไม่แก้ logic)
- Playwright smoke.spec.ts "auth guard: unauthenticated /dashboard redirects to /login" ยังใช้ได้ (Portal อยู่ใต้ (dashboard) layout)
- visual.spec.ts DASH_ROUTES มี [dashboard,/dashboard] ยังใช้ได้ (Portal render <main> ผ่าน PageShell)
- sidebar-nav.tsx: ไม่แก้ (perm key 'dashboard' คงเดิม; ป้ายเมนูเปลี่ยนผ่าน i18n/menu_catalog)
- menu_permissions rows: ไม่แตะ (key 'dashboard' คงเดิม)
- หน้าแรกหลัง login: ไม่เปลี่ยน

## ตารางรายการ

| # | ชื่อ | เฟส | สถานะ | ไฟล์ที่สร้าง/แก้ | หมายเหตุ |
|---|------|-----|-------|-------------------|----------|
| 1 | สำรวจ (Phase 0) | 0 | done | docs/DASHBOARD_BUILD.md | สร้างไฟล์นี้ |
| 2 | ย้าย wallboard → /dashboard/wallboard | 1 | done | frontend/app/(dashboard)/dashboard/wallboard/page.tsx | copy ไม่แก้ logic |
| 3 | dashboard-registry.ts | 1 | done | frontend/lib/dashboard-registry.ts | 26 รายการ |
| 4 | /dashboard Portal | 1 | done | frontend/app/(dashboard)/dashboard/page.tsx | PageShell+HubGrid+ค้นหา+ใช้บ่อย+TV |
| 5 | เปลี่ยนป้ายเมนู 'dashboard' | 1 | done | frontend/lib/i18n.ts, src/menu_catalog.php | perm key คงเดิม |
| 6 | Maintenance Overview (wallboard) | 1 | done | (ย้ายแล้ว) | registered ready |
| 7 | Work Order Control | 1 | done | (มีอยู่แล้ว /supervisor) | registered ready |
| 8 | Backlog & Aging | 2 | todo | - | สร้างใหม่: ตาราง+API+ฟอร์ม+dashboard |
| 9 | SLA & Escalation Control | 2 | done | (มีอยู่แล้ว /reports/sla) | registered ready |
| 10 | Shift Handover | 2 | todo | - | สร้างใหม่: ตาราง+API+ฟอร์ม+dashboard |
| 11 | PM Compliance & Planned vs Unplanned | 3 | partial | (มีอยู่แล้ว /pm_am) | เสริมเฉพาะส่วนที่ขาด |
| 12 | Breakdown & Downtime | 3 | done | (มีอยู่แล้ว /reports/downtime) | registered ready |
| 13 | Maintenance Calendar | 3 | done | (มีอยู่แล้ว /planning/calendar) | registered ready |
| 14 | Maintenance Planning | 3 | done | (มีอยู่แล้ว /planning) | registered ready |
| 15 | Inspection & Condition Monitoring | 3 | done | (มีอยู่แล้ว /iot/condition) | registered ready |
| 16 | Shutdown & Turnaround | 3 | done | (มีอยู่แล้ว /shutdown) | registered ready |
| 17 | Equipment Health | 3 | done | (มีอยู่แล้ว /asset-reliability) | registered ready |
| 18 | Reliability Engineering | 3 | done | (มีอยู่แล้ว /reliability) | registered ready |
| 19 | Top 10 / Bad Actors | 3 | done | (มีอยู่แล้ว /reliability/bad-actors) | registered ready |
| 20 | Calibration Management | 3 | done | (มีอยู่แล้ว /calibration/dashboard) | registered ready |
| 21 | Root Cause Analysis | 3 | done | (มีอยู่แล้ว /rca) | registered ready |
| 22 | Asset Lifecycle & Warranty | 3 | done | (มีอยู่แล้ว /asset-reliability/lifecycle) | registered ready |
| 23 | Spare Parts & Inventory | 4 | done | (มีอยู่แล้ว /spare_parts/overview) | registered ready |
| 24 | Maintenance Cost | 4 | done | (มีอยู่แล้ว /cost) | registered ready |
| 25 | Employee & Technician | 4 | done | (มีอยู่แล้ว /workforce) | registered ready |
| 26 | Contractor & Vendor | 4 | done | (มีอยู่แล้ว /contractors) | registered ready |
| 27 | Procurement & Purchasing | 4 | done | (มีอยู่แล้ว /spare_parts/sage_po) | registered ready |
| 28 | Technical Document & Knowledge | 4 | done | (มีอยู่แล้ว /knowledge) | registered ready |
| 29 | Safety & Compliance | 4 | done | (มีอยู่แล้ว /safety/work_permit) | registered ready |
| 30 | Data Quality & System Adoption | 4 | todo | - | สร้างใหม่: ใช้หน้า data-quality เดิมเป็นฐาน |
| 31 | Integration & System Health | 4 | done | (มีอยู่แล้ว /settings/health) | registered ready |
| 32 | Production Impact & OEE | 5 | todo | - | สร้างใหม่ |
| 33 | Lubrication Management | 5 | todo | - | สร้างใหม่ |
| 34 | Utility & Energy | 5 | todo | - | สร้างใหม่ |
| 35 | Facility Management | 5 | todo | - | สร้างใหม่ |
| 36 | Predictive & AI Maintenance Intelligence | 5 | todo | - | สร้างใหม่: แสดงผลเมื่อข้อมูลถึงเกณฑ์ขั้นต่ำเท่านั้น |

## รายการที่ตัดสินใจเองโดยไม่มั่นใจ
- Portal ใช้ PageShell (ไม่ใช้ PageHeader ซ้อน) เพราะ PageShell มี title อยู่แล้ว
- planned cards แสดงเฉพาะผู้ที่ canShow('dashboard') (proxy สำหรับ Admin) — ยังไม่ผูก role ละเอียด
- /dashboard/wallboard ไม่เพิ่มใน menu_catalog/sidebar (เข้าถึงผ่าน Portal card) เพื่อไม่เปลี่ยนเมนูเดิม

## ข้อมูลที่ยังต้องมีคนกรอกก่อน dashboard จะมีความหมาย
- Backlog & Aging, Shift Handover, Data Quality, Production Impact, Lubrication, Utility & Energy, Facility, Predictive AI: ต้องสร้างตาราง+ฟอร์มก่อน

## สถานะรวม
- done: 26, partial: 1, todo: 9, skipped: 0
