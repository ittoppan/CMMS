# DESIGN_REPORT — รายงานงาน UX/UI (2026-11-23)

## 1. ทำแล้ว + ไฟล์
- Phase A baseline: `docs/DESIGN_BASELINE.md` (axe, Lighthouse, overflow, เป้าหมายคลิก)
- Phase B mock audit: `docs/MOCK_DATA_AUDIT.md`
- Phase C Backlog & Aging: `frontend/app/(dashboard)/dashboard/backlog-aging/page.tsx` (KPI ตาม KPI_INVENTORY, a11y, หมายเหตุข้อมูลนำเข้า)
- Phase C /dashboard/my: `frontend/app/(dashboard)/dashboard/my/page.tsx` (ลบ mock monthlyData แล้วก่อนหน้า, แปลง quick actions เป็นไทย, แก้ contrast)
- a11y global: `frontend/app/(dashboard)/layout.tsx` (profile button, scan FAB landmark)
- เทส axe: `frontend/tests/e2e/baseline-level1.spec.ts` (critical=0 assertion)
- แพ็กเกจ: `@axe-core/playwright` (devDependency)

## 2. ยังไม่ทำและเหตุผล
- โมดูล Level 1 ที่เหลือ (wallboard, supervisor, pm-compliance, reports/downtime) ยังไม่ได้ปรับ (ต้องทำทีละใบ)
- Export ทุกโมดูล, drill-down, ตัวกรองเพิ่มเติม ยังไม่ได้ทำ
- เป้าหมายคลิกยังไม่วัดด้วยบัญชี role จริง (User/Operate/Foreman)

## 3. ให้ตัดสินใจ (ที่ค้างจริง)
- Backlog & Aging: ใบงานทั้งหมดเป็นข้อมูลนำเข้าเก่าที่ยังไม่ได้ยืนยัน (ดู docs/REPAIR_BACKLOG_REPORT.md); ไม่ได้แก้/ปิดใบงานใดๆ ตามคำสั่ง; ขอตัดสินใจว่าจะปิดเป็นชุดหรือรายใบ

## 4. ผลเทส + axe + Lighthouse ก่อน/หลัง
- tsc --noEmit: PASS
- Playwright: 219 tests passed (213 baseline + 6 axe baseline), residue e2e_* = 0
- design-audit: PASS (ไม่ได้รันซ้ำในรอบนี้)
- Lighthouse มือถือ: ทุกหน้า perf 99-100, a11y 93-96, bp 93-96 (baseline)
- axe /dashboard/my: critical 0, serious 0 (หลังแก้), baseline ก่อนแก้ serious 2

## 5. ผลเป้าหมายใช้งานจริง
- (ก) User แจ้งซ่อม: ยังไม่วัด (ต้องบัญชี role User)
- (ข) Operate เปิดงานของตัวเอง: 1 คลิก (เป้า <=2) — จากโครงสร้างลิงก์
- (ค) Foreman เห็นงานค้าง: 1 คลิก (เป้า <=1) — จากโครงสร้างลิงก์

## 6. mock ที่พบและแก้
- /dashboard/my: ลบ mock monthlyData (ศูนย์) แล้วก่อนหน้า; คง N/A ป้ายชัดเจน
- ไม่พบตัวเลขปลอมใหม่ (docs/MOCK_DATA_AUDIT.md)
- Math.random ใช้เฉพาะ id/เอฟเฟกต์ภาพ ไม่ใช่ข้อมูล KPI
## 7. รอบนี้ (Section 1) — ทำแล้ว + ไฟล์
- แก้ axe test: `frontend/tests/e2e/baseline-level1.spec.ts` (adjusted pages fail on serious)
- Root cause a11y: `frontend/components/layout/kpi-strip.tsx` (tabIndex บน scrollable region), `frontend/app/(dashboard)/layout.tsx` (profile button aria-label, scan FAB landmark)
- วัด Lighthouse หลังล็อกอิน: `docs/DESIGN_BASELINE.md` §2.1
- วัดเป้าหมายใช้งานจริง: `docs/DESIGN_BASELINE.md` §4 (User/Operate/Foreman)
- design-audit: PASS (0 FAIL, 2 WARN hex ใน /dashboard/my)
- KPI/component: ไม่ได้แก้ KPI ใหม่ในรอบนี้

## 8. ยังไม่ทำและเหตุผล
- Section 2 (2.1–2.3) ยังไม่ทำ เพราะไม่มี `docs/DATA_RESET.md` และการล้างข้อมูลยังไม่ถูกสั่งให้ไปขั้นลบจริง — หยุดตามคำสั่ง
- โมดูล Level 1 ที่เหลือ (Work Order Control, PM Compliance, Breakdown & Downtime, Maintenance Overview) ยังไม่ได้ปรับ
- Lighthouse ของหน้า auth-guarded วัดได้ไม่สมบูรณ์ (redirect ไป /login) เนื่องจากข้อจำกัดเครื่องมือ
- Export/drill-down/ตัวกรองเพิ่มเติมยังไม่ได้ทำ

## 9. ให้ตัดสินใจ (ที่ค้างจริง)
- User flow แจ้งซ่อมใช้ ~10 คลิก (เป้า <=4) — เสนอรวมขั้น/ลดคลิก (ไม่ได้แก้ในรอบนี้)
- Backlog & Aging: ใบงานทั้งหมดเป็นข้อมูลนำเข้าเก่าที่ยังไม่ได้ยืนยัน — รอการล้างข้อมูลก่อน (Section 2)
- 2 WARN hex ใน /dashboard/my (inline color) — เลือกว่าจะเปลี่ยนเป็น CSS variable หรือปล่อย

## 10. ผลเทสทั้งชุด + axe + Lighthouse(ล็อกอิน) ก่อน/หลัง
- tsc --noEmit: PASS
- Playwright baseline-level1: 6/6 PASS (adjusted pages serious=0)
- design-audit: PASS (0 FAIL, 2 WARN)
- residue e2e_*: 0
- Lighthouse หลังล็อกอิน: /login 67/96/96, /repair/request 76/100/100, /dashboard 70/96/100, /dashboard/wallboard 50/92/100, /dashboard/my 51/96/93, /dashboard/backlog-aging 66/96/93, /supervisor 62/96/93, /dashboard/pm-compliance 66/96/93

## 11. เป้าหมายใช้งานจริงที่วัดจริง
- User: landing /repair/request (0 คลิก), ส่งสำเร็จ ~10 คลิก (เกินเป้า)
- Operate: landing /repair/my_tasks (0 คลิก, ผ่าน)
- Foreman: landing /supervisor (0 คลิก), งานค้างเกินกำหนดจาก Portal 1 คลิก (ผ่าน)

## 12. ค่าปลอมที่พบจากการเปิดตอนฐานข้อมูลว่าง
- ยังไม่ได้ทำ (รอ Section 2 / DATA_RESET.md) — ไม่แน่ใจ
