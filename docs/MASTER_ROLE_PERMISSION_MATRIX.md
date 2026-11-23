# MASTER ROLE / PERMISSION MATRIX — CMMS-TPT

> Phase 0 · 2026-11-23 · ที่มา: `src/helpers/roles.php`, `src/helpers/api_permissions.php`, `src/helpers/permissions.php`, `docs/API_PERMISSION_MATRIX.md`, `docs/PROJECT_CONTEXT.md` §5
> **ห้ามเพิ่ม/ลดสิทธิ์** — ตารางนี้เพื่อทดสอบและป้องกัน regression เท่านั้น

## 1. Roles ในระบบ

| ID | ชื่อ | ลักษณะการใช้งาน |
|---:|---|---|
| 1 | Admin | ทุกสิทธิ์ (bypass) |
| 2 | Manager | อนุมัติ/วางแผน/ต้นทุน/รายงาน |
| 3 | Operate | ช่าง: รับงาน, PM, เบิกอะไหล่, ปิดงาน |
| 4 | Operator | เห็นเฉพาะงานที่ตัวเองแจ้ง (kpi_scope) |
| 5 | Viewer | อ่านอย่างเดียว |
| 6 | Asst.Manager | เทียบเท่า Manager เกือบทั้งหมด |
| 7 | Foreman | วางแผน/มอบหมาย/ตรวจรับงาน; อนุมัติ LOTO/PM/spare_issue; ไม่อนุมัติ repair/requisition/work_permit |
| 8 | Officer | Office: ดูแลสต็อก/Sage (view+write), เมนู users/settings/audit/document/report/dashboard |
| 9 | User | แจ้งซ่อม/ติดตามงานตัวเอง |
| 10 | Officer-Read | Officer อ่านอย่างเดียว |

## 2. Workflow permission (จาก `roles.php`)

| ฟังก์ชัน | role ที่ผ่าน | ใช้ที่ |
|---|---|---|
| `canSupervisor()` | 1,2,6,7 | Supervisor section |
| `canReviewRequest()` | 1,2,6 | อนุมัติคำขอแจ้งซ่อม |
| `canPlanWork()` | 1,2,6,7 | วางแผน/มอบหมาย/จัดตาราง |
| `canVerifyWork()` | 1,2,6,7 | ตรวจรับ/ปิด/เปิดงาน |
| `isTechnician()` | 3 | รับงาน/เริ่ม/pause/resume/เสร็จ |
| `canApproveType('loto'\|'spare_issue'\|'pm')` | 1,2,6,7 | อนุมัติตามประเภท |
| `canApproveType('repair'\|'requisition'\|'work_permit')` | 1,2,6 | เฉพาะ Manager+ |
| `canIssue()` | 1,2,6,7 | คลังจ่าย/รับคืน |
| `canRequest()` | ทุก role ยกเว้น 5 | ขอเบิก/บันทึกการใช้ |
| `canAdminSage()` | 1 | ตั้งค่า Sage |

## 3. Module × action (PERMISSION_MATRIX — ตัวอย่างที่ใช้บ่อย)

| module | view | create | edit | approve | อื่น ๆ |
|---|---|---|---|---|---|
| `repair` | 1,2,3,5,6,7,8,9 | 1,2,3,4,6,7,9 | 1,2,3,4,6,7 | `repair:verify` 1,2,6,7 | `repair:schedule` 1,2,6,7 |
| `spare_parts` | 1,2,3,5,6,7,8 | 1,2,6,8 | 1,2,6,8 | — | plan/request/issue/return: 1,2,6,7,8 |
| `asset` | 1,2,3,5,6,7,8 | 1,2,6 | 1,2,6 | — | — |
| `pm_am` | 1,2,3,5,6,7,8 | 1,2,6,7 | 1,2,6,7 | — | `pm_am:execute` 3,7 |
| `inspection` | 1,2,3,6,7 | 1,2,6,7 | — | — | execute 3,7 |
| `report` | 1,2,6 | — | — | — | export 1,2,6 |
| `settings` | 1 | — | 1 | — | manage 1 |
| `roles` | 1 | 1 | 1 | — | manage 1 |
| `users` | 1 (+`?id=` เท่านั้น) | 1 | 1 | — | manage 1 |
| `notification` | ทุก role | — | — | — | อ่านของตัวเอง |
| `cost` | 1,2,6 (V3) | — | — | — | role อื่นได้ 403 |

> ตารางเต็ม 97 endpoint: `docs/API_PERMISSION_MATRIX.md`
> **สถานะบังคับใช้:** 5/113 endpoint (ดู `MASTER_API_INVENTORY.md` §3)

## 4. Menu permission

- ตาราง `menu_permissions (role_id, menu_key, is_granted)` — ซ่อนเมนูด้วย `is_granted=0` (ไม่ลบแถว)
- `src/menu_catalog.php` = source of truth ของ key/href; `frontend/components/dashboard/sidebar-nav.tsx` + `useMenuPermission` + `route-perms.ts` ฝั่ง UI
- ปรับล่าสุด: `roles` → 1,2,6 · `reports/import_excel` → 1,2,6 · `sage_sync` → 1,2,6,8 · `sage_shipments` → 1,2,6,7,8
- ย้อนกลับได้: `php scripts/align_menu_permissions.php --restore=backups/<file>.json`

## 5. Scope ข้อมูลตาม role (server-side — ห้ามทำ client-side only)

| role | scope (kpi_scope) |
|---|---|
| 3 Operate | เฉพาะงานที่ assigned ให้ตัวเอง (+ทีม `work_assignees`) |
| 4 Operator | เฉพาะงานที่ตัวเองแจ้ง |
| อื่น ๆ | ทั้งหมด (ตาม menu/permission) |
| cost KPI | 1,2,6 เท่านั้น (section `cost` ตอบ 403) |

## 6. Read-only UI (ทำแล้ว)

`GET /api/v1/my_permissions.php?module=<m>` + `frontend/lib/useCan.ts` (fail-closed) — ใช้แล้วใน `spare_parts`, `contractors`, `sage_shipments` (header `X-CMMS-Can-Write`), `issue_center`, `stock_take`, `returns`

## 7. เมทริกซ์สำหรับทดสอบ (Phase 6 / 10 / 11)

ต้องทดสอบด้วยบัญชีจริงอย่างน้อย: **User (9), Operate (3), Foreman (7)** + Admin (1) สำหรับ regression
⚠️ บัญชี `e2e_*` ทั้ง 9 ตัวมี `is_active=0` → ต้องปลุกหรือใช้บัญชีจริงแยก (ห้ามแก้ Production data โดยไม่ได้รับอนุมัติ)

## 8. Known issues

| # | เรื่อง | Severity |
|---|---|---|
| P1 | `roles` id 3 label "Operate" ≠ "Technician" ในเอกสารบางฉบับ | Low (แก้ label เท่านั้น) |
| P2 | Officer (8) เดิมไม่อยู่ใน PERMISSION_MATRIX → เคยได้ false ทุกอย่าง; เพิ่มเฉพาะเมนูที่อนุญาต | Medium (ตรวจซ้ำ) |
| P3 | `users.php` list mode เปิด (ใช้เติม dropdown) — ถ้าบังคับจะกระทบ 4 หน้า | Medium (ต้องออกแบบก่อน) |
| P4 | 108 endpoint ยังไม่ enforced | High |
