# MASTER BASELINE — CMMS-TPT

> Phase 0 · 2026-11-23 · **ใช้ผลเดิม ไม่วัดซ้ำ** ตามคำสั่ง (§3 Phase 0)
> ที่มา: `docs/DESIGN_BASELINE.md`, `docs/DESIGN_REPORT.md`, `docs/PHASE_D_EXECUTION_REPORT.md`, `docs/PHASE_D2_*`, `docs/PHASE_D3_UX_AUDIT.md`, `docs/IMPECCABLE_FULL_PROJECT_AUDIT.md`, `docs/PHASE_D_TEST_RESULTS.md`
> ค่าที่บันทึกไว้ = หลักฐาน ณ วันที่ระบุในเอกสารต้นทาง ห้ามตีความว่าเป็นค่าล่าสุดของ HEAD

## 1. Build / Type / Lint (ณ วันที่เก็บ)

| รายการ | ผล | ที่มา |
|---|---|---|
| `tsc --noEmit` | PASS (0 error) — **ตรวจซ้ำวันนี้ 2026-11-23 บน working tree ที่มี D3.2: PASS** | รอบนี้ |
| Production build (`next build`, `NEXT_DIST_DIR=.next-verify`) | PASS (Phase D1/D2) | `PHASE_D_EXECUTION_REPORT.md` |
| design-audit (strict) | PASS 0 FAIL / 0 WARN (2026-08-23) | `TASKS.md` |
| design-audit (รอบ DESIGN_REPORT §7) | PASS 0 FAIL / 2 WARN hex `/dashboard/my` | `DESIGN_REPORT.md` |
| Playwright | 219 tests pass (213 + 6 axe) · `--list` ปัจจุบัน 213 tests / 27 ไฟล์ (31 ไฟล์รวม helper) | `DESIGN_REPORT.md`, `STATUS.md` |
| residue `e2e_*` | 0 (หลัง cleanup fixtures) | `DESIGN_REPORT.md` |

## 2. Lighthouse (mobile 390, authenticated, production build)

| หน้า | Perf | A11y | BP | ที่มา |
|---|---:|---:|---:|---|
| `/login` | 67 | 96 | 96 | DESIGN_REPORT §10 |
| `/repair/request` | 76 | 100 | 100 | DESIGN_REPORT §10 |
| `/dashboard` | 70 | 96 | 100 | DESIGN_REPORT §10 |
| `/dashboard/wallboard` | 50 → **80** (หลัง D2) | 92 → **100** | 100 → **96** | D2 report |
| `/dashboard/my` | 51 | 96 | 93 | DESIGN_REPORT §10 |
| `/dashboard/backlog-aging` | 66 | 96 | 93 | DESIGN_REPORT §10 |
| `/supervisor` | 62 | 96 | 93 | DESIGN_REPORT §10 |
| `/dashboard/pm-compliance` | 66 | 96 | 93 | DESIGN_REPORT §10 |

**เป้าหมาย master spec:** Perf ≥85 · A11y ≥95 · BP ≥95 → **ยังไม่ผ่านเกือบทุกหน้า** (ต้องเก็บเป็น Phase 11 gap)
TBT wallboard หลัง D2 = 680ms (เป้า <300ms) — root cause Recharts bundle

## 3. axe (mobile 390)

| ขอบเขต | ผล | ที่มา |
|---|---|---|
| Level 1 6 หน้า (`baseline-level1.spec.ts`) | critical=0, serious=0 (adjusted pages) | DESIGN_REPORT §7 |
| wallboard (dev, 390 + desktop) | 0 violations | D2 report |
| `/dashboard/my` | critical 0 / serious 0 (หลังแก้) | DESIGN_REPORT §4 |

## 4. Responsive / overflow

- 390px: ไม่มี horizontal overflow ใน Level 1 ที่ตรวจ (kpi-strip tabIndex แก้แล้ว)
- 768 / 1440: **ยังไม่มีผลตรวจอย่างเป็นระบบ** (Phase 6/10 จะวัด)
- ตาราง: `.data-table.cmms-stack-table` + `data-label` ครบ 37 ตาราง (2026-08-23)

## 5. เป้าหมายการใช้งานจริง (click/steps) — วัดแล้วบางส่วน

| Flow | เป้า | วัดจริง | ที่มา |
|---|---|---|---|
| User แจ้งซ่อม (D1) | ≤4 คลิก | **4 คลิก** (machine, status, job type, submit) | PHASE_D |
| Operate เปิดงานตัวเอง | ≤2 | 1 (จากโครงสร้างลิงก์) | DESIGN_REPORT §11 |
| Foreman เห็นงานค้าง | ≤1 | 1 | DESIGN_REPORT §11 |

## 6. ข้อมูลจริงใน DB (อ้าง ณ 2026-11-23 — ต้องยืนยันซ้ำก่อนสรุป KPI)

| ตาราง | จำนวน | ผลต่อการทดสอบ |
|---|---:|---|
| `users` | 21 (e2e active 0) | role E2E ต้องเตรียมบัญชี |
| `asset_registry` | 82 | — |
| `repair` | 126 (completed 0) | KPI completion/MTTR = 0/null |
| `spare_parts` | 1,870 | list ~1MB |
| `pm_am` | 0 | PM workflow ตรวจไม่ได้ |
| `shift_handovers` / `utility_readings` / `lubrication_points` | 33 / 33 / 33 | ข้อมูลตัวอย่าง |
| `lubrication_logs` | 0 | dashboard lubrication = empty |

## 7. สถานะ Production (ขณะเริ่มโครงการ)

- BUILD_ID รันอยู่: `htWEsqvUdXnCZgebfn3yN` (ตรง commit `c9dbb3fd` ตาม `docs/DEPLOY_LOG.md`)
- HEAD: `bf0ab5f2` + งานค้างใน working tree → **production ล้าหลัง ~18 commit**
- Smoke เดิม: `/login`, `/repair`, `/dashboard`, `/settings`, `/asset_registry` → 200 (STATUS.md §2)
- **ยังไม่มี Staging** และ **HTTPS ยังไม่เปิด** (I-01)

## 8. ข้อจำกัดของ baseline นี้

- Lighthouse ที่วัดก่อนหน้าใช้ Chrome debug profile + cookie — ยังอ่อนไหวต่อ SW cache (D2 ระบุ)
- ไม่มี baseline ของ 768/1440, ไม่มี baseline axe ครบทุกหน้า, ไม่มี baseline API load
- ไม่ได้วัด bundle size แยก chunk (มีเฉพาะข้อสรุป Recharts ~400KB parse/eval)
