# DESIGN_BUILD — ความคืบหน้างาน UX/UI (CMMS-TPT)

อัปเดตล่าสุด: 2026-11-23 (เริ่มเฟส UX/UI ต่อยอดจากงาน migration 252 หน้า)

## สถานะ baseline
- UI migration: done 252 หน้า (docs/UI_MIGRATION.md)
- Dashboard modules: done 36 รายการ (docs/DASHBOARD_BUILD.md)
- design-audit: PASS (0 FAIL, 0 WARN, 265 หน้า)
- tsc --noEmit: PASS
- Playwright: 213 passed (รอบล่าสุด)

## เฟสที่ทำแล้ว
- Phase 0 (UX cleanup data): ลบข้อมูลทดสอบ e2e_* ทั้งหมด, ตรวจ secret, สร้าง cleanup scripts (docs/CLEANUP_REPORT.md)
- Phase 1 (เริ่ม): `/dashboard/my` — ลบข้อมูล mock `monthlyData` (ศูนย์) และแปลงปุ่ม quick actions เป็นภาษาไทย
- Phase A: baseline วัดแล้ว (docs/DESIGN_BASELINE.md) — axe/Lighthouse/overflow ของ Level 1 ทั้ง 6 + /login + /repair/request
- Phase B: ตรวจ mock/fabricated values แล้ว (docs/MOCK_DATA_AUDIT.md) — ไม่พบตัวเลขปลอมใหม่
- Phase C (เริ่ม): Backlog & Aging — ปรับ KPI ตาม KPI_INVENTORY (0-7/8-14/15-30/>30 + overdue + overdue%), a11y (heading/scrollable region), เพิ่มหมายเหตุข้อมูลนำเข้า
- Section 1 (รอบนี้): axe strict สำหรับ Backlog & Aging + /dashboard/my; root cause a11y (KpiStrip, layout); Lighthouse หลังล็อกอิน; เป้าหมายคลิกวัดจริง

## ลำดับโมดูล Level 1 (ยังไม่เสร็จ)
1. Maintenance Overview (wallboard) — ปรับ empty/loading/error + a11y
2. Work Order Control (`/supervisor`, `/supervisor/queue`) — ปรับ empty/loading/error + a11y
3. Backlog & Aging (`/dashboard/backlog-aging`) — ปรับ empty/loading/error + a11y
4. PM Compliance (`/dashboard/pm-compliance`) — ปรับ empty/loading/error + a11y
5. Breakdown & Downtime (`/reports/downtime`) — ปรับ empty/loading/error + a11y
6. หน้าแรกช่าง/หัวหน้างาน (`/dashboard/my`, `/supervisor`) — ปรับ empty/loading/error + a11y

## ยังไม่ทำ
- Export ทุกโมดูล, axe audit, Lighthouse ก่อน/หลัง, เป้าหมายคลิก (ยังไม่วัด)
- ไม่ได้ deploy/push