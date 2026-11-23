# PHASE D3 — Test Results (Work Order Control)

> Phase 6 · 2026-11-23 · สรุปผลทดสอบทั้งหมดของ D3.2–D3.7 พร้อมคำสั่งที่ใช้และสิ่งที่ยังไม่ได้ทดสอบ
> หลักการ: ทุกแถวที่เขียน "PASS" ต้องมีหลักฐานจากคำสั่งที่รันจริงในรอบนี้หรือ commit ที่อ้างถึง

## 1. Static checks

| # | การตรวจ | คำสั่ง | ผล | หมายเหตุ |
|---|---|---|---|---|
| 1 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** (exit 0) | รันหลัง D3.2, D3.3, D3.4, D3.5/D3.6 |
| 2 | Production build | `cd frontend && NEXT_DIST_DIR=.next-verify npm run build` | **PASS** (exit 0) | `✓ Compiled successfully in 18.0s`, 249/249 pages, route `○ /repair/view`, `○ /supervisor*` |
| 3 | ไม่ทับ build ของ production | ใช้ `NEXT_DIST_DIR=.next-verify` | **PASS** | `.next` (production, BUILD_ID `htWEsqvUdXnCZgebfn3yN`) ไม่ถูกแก้ |

## 2. Responsive (D3.5)

| viewport | `/supervisor` | `/supervisor/queue` | `/repair/view` open | `/repair/view` completed |
|---|---|---|---|---|
| 1440×900 | PASS (1440/1440) | PASS (1440/1440) | PASS (1440/1440) | PASS (1440/1440) |
| 768×1024 | PASS (768/768) | PASS (768/768) — *ก่อนแก้: table 1,110px* | PASS (768/768) | PASS (768/768) |
| 390×844 | PASS (390/390) | PASS (390/390) | PASS (390/390) | PASS (390/390) |

- วัด `document.documentElement.scrollWidth ≤ clientWidth + 1`
- ทุกหน้า `h1 = 1`, ไม่มี console error/pageerror

## 3. Accessibility (D3.6)

axe-core ผ่าน `@axe-core/playwright`, tags `wcag2a, wcag2aa, wcag21a, wcag21aa`

| viewport | Critical | Serious | Moderate/Minor (รายงานไว้ ไม่บล็อก) |
|---|---|---|---|
| 1440 | 0 | 0 | 0 |
| 768 | 0 | 0 | 0 |
| 390 | 0 | 0 | 0 |

ก่อนแก้: Serious 1–2 ต่อหน้า จาก `color-contrast` และ `label-content-name-mismatch`
หลังแก้: 0 ทั้ง 12 เคส (รายละเอียดการแก้: `PHASE_D3_RESPONSIVE_A11Y_REPORT.md`)

## 4. Role E2E (D3.7)

| บทบาท | supervisor | supervisor/queue | repair/view | หมายเหตุ |
|---|---|---|---|---|
| 9 User (`e2e_user`) | PASS — 403 page | PASS — 403 page | PASS — API 403 + ข้อความปฏิเสธ | ไม่มี data รั่วบนหน้าจอ |
| 3 Operate (`e2e_operate`) | PASS — 403 page | PASS — 403 page | PASS (ข้อมูลหลัก 200) / **S2** ข้อความ 403 ของ attachment | ดู `PHASE_D3_ROLE_PERMISSION_TEST.md` |
| 7 Foreman (`e2e_foreman`) | PASS — 23 การ์ด | PASS — 50 แถว/หน้า | PASS — ทุก API 200 | can.plan/verify = true |

- **S1 (HIGH, ยังไม่แก้)**: `GET /api/v1/supervisor.php?action=queue&limit=5` ตอบ 200 พร้อมข้อมูลใบงานจริงให้ role 9 — GET ทั้ง 8 action ไม่มี `requireRole()`
- **S2 (MEDIUM, ยังไม่แก้)**: interceptor แสดง “คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้” เมื่อ sub-resource 403 แม้ข้อมูลหลักจะอ่านได้

## 5. Regression ที่ไม่ได้รันในรอบนี้

- e2e suite เต็ม (`npm run test:e2e`, 31 specs) — ไม่ได้รัน เพราะ globalSetup มีการ seed/cleanup ข้อมูลใน DB จริง และต้องมีผู้อนุมัติ
- Lighthouse (Perf/A11y/BP) ใหม่ — ยังใช้ baseline เดิม (`MASTER_BASELINE.md`)
- dark mode contrast, PWA/offline, พิมพ์/PDF จริง, การกดปุ่ม mutation (assign/verify/close/approve)

## 6. สรุปสถานะ Phase 6

- UI/UX acceptance ผ่าน: 3 หน้าหลัก responsive ครบ, axe 0 Critical/Serious, role behaviour ถูกต้อง, tsc/build ผ่าน
- ค้าง 2 finding ที่ **ต้องอนุมัติก่อนแก้** (S1 authorization ที่ API, S2 error handling) → Phase 6 จึงรายงานเป็น **PASS (UI)** ไม่ใช่ COMPLETE
- งานถัดไป: Phase 2 docs (`COMPONENT_LIBRARY.md`, `DESIGN_TOKENS.md`) + ลบ `/ui-demo` `/ui-kit`, Phase 4 KPI validation
