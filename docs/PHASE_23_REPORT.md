# PHASE 23 REPORT — CMMS-TOPPAN

**หัวข้อ:** Advanced CMMS Intelligence & Analytics (Intelligence Center)
**เวอร์ชัน:** 1.1.0 · **วันที่:** 2026-09-18 · **สถานะ:** เสร็จ + ผ่านเกตทั้งหมด

---

## A. บทสรุปผู้บริหาร (Executive Summary)

Phase 23 เพิ่ม **ศูนย์วิเคราะห์อัจฉริยะ (Intelligence Center)** `/analytics/intelligence`
เป็นแดชบอร์ดผู้บริหารที่ดึง KPI สำคัญจากข้อมูลจริงในระบบ พร้อม **ตรวจสอบคุณภาพข้อมูลทุกตัวเลข**
แบ่งเป็น 10 แท็บ + แถบเตือนคุณภาพข้อมูล + กราฟแนวโน้ม

จุดยืนสำคัญ: **ไม่มี AI ทำนาย ไม่มี mock/prediction ทุกค่ามาจากข้อมูลจริง** และเมื่อข้อมูลไม่พอ
จะแสดง **INSUFFICIENT DATA** พร้อมเหตุผล แทนการแสดงศูนย์ที่ทำให้เข้าใจผิด

ผลลัพธ์หลัก:
- สร้าง engine ใหม่ `src/helpers/analytics.php` (18 ฟังก์ชัน) ที่ **reuse** KPI กลาง `src/helpers/kpi.php`
- เพิ่ม API `GET /api/v1/intelligence.php` (13 sections, RBAC server-side)
- เพิ่มหน้า UI + เมนู + i18n (TH/EN)
- ลบส่วนที่ "แต่งข้อมูล" (mock predictive/energy) ออกจาก `analytics_monthly.php`
- เอกสารครบ 4 ฉบับ + รายงานฉบับนี้
- ผ่านเกต: `php -l`, `tsc --noEmit`, `next build` (134 หน้า), design audit (0 FAIL/0 WARN),
  e2e (84 passed / 2 skipped / 0 failed), RBAC 403 พิสูจน์ด้วย role 3 จริง

---

## B. ขอบเขตและสิ่งที่ส่งมอบ

| ประเภท | รายการ |
|---|---|
| Backend engine | `src/helpers/analytics.php` — `ana_opts`, `ana_paginate`, `ana_reliability`, `ana_trend`, `ana_asset_health`, `ana_repeat_failures`, `ana_downtime_pareto`, `ana_priority_analysis`, `ana_pm_compliance`, `ana_planned_unplanned`, `ana_technician_analytics`, `ana_spare_analytics`, `ana_cost_analytics`, `ana_data_quality`, `ana_overview` (+ helpers) |
| API | `public/api/v1/intelligence.php` — 13 sections, envelope เดียว, `requireLogin`, cost 403 |
| Frontend | `frontend/app/(dashboard)/analytics/intelligence/page.tsx` (10 แท็บ) |
| เมนู/i18n | `sidebar-nav.tsx`, `lib/i18n.ts` (menu/hero/ titles TH+EN) |
| แก้ไขเดิม | `public/api/v1/analytics_monthly.php` — ลบ section แต่งข้อมูล + แก้ join bug |
| Tests | `frontend/tests/e2e/intelligence.spec.ts` (5 เคส) |
| Docs | `KPI_DEFINITIONS.md`, `ANALYTICS_DATA_MODEL.md`, `ADVANCED_ANALYTICS.md`, `ANALYTICS_PERFORMANCE.md`, `PHASE_23_REPORT.md` |
| DB migration | **ไม่มี** — Phase 23 อ่านตารางที่มีอยู่แล้วทั้งหมด (additive, zero-risk) |

**เกตคุณภาพ:** ไม่มีข้อมูลถูกเขียนทับ/ลบ; ไม่มี endpoint เขียนข้อมูลใหม่ (read-only analytics)

---

## C. คุณภาพข้อมูล (Data Quality) — จุดที่ต้องระวังที่สุด

จากใบงานจริงในช่วงปีนี้ **102 ใบ**:

| ฟิลด์ | กรอกแล้ว | % | ผลต่อ KPI |
|---|---|---|---|
| Downtime (`downtime_minutes`) | 1 | 1.0% | KPI downtime ระดับใบงานใช้ไม่ได้ → ใช้ `mtbf_mttr` แทน |
| เวลาซ่อมจริง (`repair_time_minutes`) | 22 | 21.6% | MTTR (core) อ้างอิงได้จำกัด |
| เวลาตอบสนอง (`response_time_minutes`) | 0 | 0% | Response time / SLA = INSUFFICIENT DATA |
| ต้นทุน (labor/parts/outsource) | 0 | 0% | Cost = INSUFFICIENT DATA |
| Failure code | 0 | 0% | วิเคราะห์สาเหตุเสียไม่ได้ |
| RCA category | 0 | 0% | — |
| Planned start | 4 | 3.9% | ตัวชี้วัดการวางแผนอ่อน |

ข้อสรุป: **ตัวเลขผู้บริหารที่เชื่อถือได้ตอนนี้** คือ Reliability (จาก `mtbf_mttr`), สถานะเครื่อง,
การเสียซ้ำ, Pareto, PM (จาก `pm_am`), สต็อก (Sage) และคุณภาพข้อมูล — นอกนั้นติดป้าย insufficient

หน้า UI แสดงแถบเตือน (สูงสุด 3 ข้อ) เมื่อฟิลด์ใดกรอก < 50%

---

## D. Reliability (MTBF / MTTR / Availability)

แหล่งจริง: `mtbf_mttr` (รายเดือนต่อเครื่อง) — ตัวเลขปี 2026 ณ ปัจจุบัน:

| KPI | ค่า |
|---|---|
| Operating hours รวม | 6,840 ชม. |
| Failures รวม | 35 ครั้ง |
| Downtime รวม | 4,950 นาที |
| **MTBF** | **195.4 ชม.** |
| **MTTR** | **141.4 นาที** |
| **Availability** | **98.81%** |
| ความครอบคลุม | 9 เดือน, 2 เครื่อง (ข้อมูลถึง 2026-09) |

**ความขัดแย้งที่ต้องอธิบาย:** KPI กลางเดิม (`kpi_core_metrics`) คำนวณ MTBF จากช่วงห่างรอบซ่อม
(203.98 ชม.) และ MTTR จาก `repair_time_minutes` (163.94 ชม.) ซึ่งคนละนิยามกับ Phase 23
(operating hours ÷ failures, downtime ÷ failures) — เอกสาร `KPI_DEFINITIONS.md` §12 อธิบายทั้งคู่
และหน้า UI ติดป้าย "จาก operating hours จริง" ชัดเจน

---

## E. สถานะเครื่อง (Asset Health) & การเสียซ้ำ

**Asset Health** (ประเมินจากอดีต 90–180 วัน ไม่ใช่การพยากรณ์) — 55 เครื่อง:

| ชั้น | จำนวน |
|---|---|
| CRITICAL | 2 |
| ATTENTION | 0 |
| WATCH | 3 |
| HEALTHY | 18 |
| INSUFFICIENT_DATA | 32 |

- ให้คะแนนเริ่ม 100 แล้วหักตามเหตุผลจริง (ความถี่เสีย, downtime, งานค้าง, PM ค้าง, inspection ไม่ผ่าน)
- แสดง `reasons[]` เป็นรายข้อให้ผู้ใช้ตรวจสอบได้
- 32 เครื่องยังไม่มีประวัติ → แสดง INSUFFICIENT_DATA (ไม่ตีความว่า "ดี")

**การเสียซ้ำ:** 11 เครื่องมีใบงาน > 1 ใบในช่วง พร้อม `avg_gap_hours`/`min_gap_hours`
และปุ่ม drill-down เปิดรายการใบงานจริง

**Fleet:** ทั้งหมด 55, down (มีใบงานค้าง) 23, เครื่อง Critical (A) 8, เสียซ้ำ 90 วัน 2

---

## F. Downtime Pareto & คิวงาน/ความเร่งด่วน

**Downtime Pareto** (จาก `mtbf_mttr`): รวม 4,950 นาที กระจุกที่ 2 เครื่อง — คำนวณ `pct`
และ `cumulative_pct` เพื่อหาตัวที่ควรแก้ก่อน

**คิวงาน (priority & aging):** งาน active 100 ใบ, เกินกำหนด 20 ใบ (20%)
- Aging 30+ วัน: 95 ใบ · 7–14 วัน: 4 · 0–7 วัน: 1 · 14–30 วัน: 0
- ชี้ให้เห็นว่า backlog ค้างสะสมยาว (สอดคล้องกับ 78 ใบรอตรวจรับใน core counts)

---

## G. PM Compliance & Planned vs Unplanned

| KPI | ค่า |
|---|---|
| PM เสร็จในช่วง | 3 |
| ตรงกำหนด (on-time) | 1 |
| ล่าช้า | 2 |
| **Compliance** | **33.3%** |
| PM ค้างกำหนด | 0 |

**Planned vs Unplanned:** ใบงานปีนี้ 102 ใบ เป็น `breakdown` ทั้งหมด → **unplanned 100%**
สะท้อนว่ายังไม่มีใบงานที่เกิดจาก PM (`source_type='pm'`) ในข้อมูลปัจจุบัน

> หมายเหตุ: `pm_compliance_pct` ใน core (77.8%) มาจาก view inspection คนละแหล่งกับ Phase 23
> (บน `pm_am`) — ดู §12.2 ของ `KPI_DEFINITIONS.md`

---

## H. ภาระงานช่าง · สต็อก · ต้นทุน

- **ภาระงานช่าง:** 1 ช่างในข้อมูล, active 0, overlap 0 (ยังไม่มีงาน active ระดับสูงพร้อมกัน)
- **สต็อก/อะไหล่ (Sage 300):** 1,870 รหัส · มูลค่า **10,484,495.28 บาท** · ต่ำกว่าขั้นต่ำ 678 ·
  หมดสต็อก 470 · มูลค่าสูง (≥50k) 44 · ซิงก์ล่าสุด 2026-09-07
- **ประวัติการใช้อะไหล่/ต้นทุนวัสดุ:** 0 แถว → **INSUFFICIENT DATA** (แสดงตามจริง ไม่ประมาณ)
- **ต้นทุน:** labor/parts/outsource/วัสดุ = 0 ทุกช่อง, coverage.with_cost_gt_0 = 0 → insufficient

---

## I. ความปลอดภัย & สิทธิ์ (RBAC)

- ทุก section ต้อง `requireLogin`; เรียกโดยไม่ login → `401` (มี e2e พิสูจน์)
- `cost` เฉพาะ role 1,2,6 (`kpi_can_see_cost`); role อื่น → `403`
  **พิสูจน์จริง:** สร้างผู้ใช้ชั่วคราว role 3 (technician) → login → `section=cost` ได้ `403`
  และ `section=overview` ได้ `200` โดย `meta.can_cost=false` → ลบผู้ใช้ทิ้งหลังทดสอบ
- scope ตาม role ผ่าน `kpi_scope`: Technician เห็นเฉพาะงานตัวเอง, Operator เห็นเฉพาะงานที่แจ้ง
- ไม่มี endpoint เขียนข้อมูล; ไม่เปิดเผย stack error (`api_safe_catch`)

---

## J. ประสิทธิภาพ & เกตคุณภาพ

**ผลวัดจริง API (admin, range=this_year):** เฉลี่ย ~20.7 ms/section, สูงสุด ~44 ms (overview)
รายละเอียดใน `docs/ANALYTICS_PERFORMANCE.md`

| เกต | ผล |
|---|---|
| `php -l` (analytics.php, intelligence.php, analytics_monthly.php) | PASS |
| `npm run typecheck` | PASS (0 error) |
| `next build` | PASS — 134 หน้า, มี route `/analytics/intelligence` |
| `scripts/design-audit.py --strict` | PASS — 0 FAIL, 0 WARN |
| e2e `intelligence.spec.ts` | **5/5 passed** |
| e2e full suite | **84 passed, 2 skipped, 0 failed** |
| RBAC cost gate | ยืนยันด้วย role 3 จริง (403) |

**บั๊กที่พบและแก้ระหว่างทาง:**
- `ana_asset_health` คืน `summary: []` เมื่อไม่มีเครื่องตามตัวกรอง → หน้าจอ crash
  (`Cannot convert undefined or null to object`) — แก้ให้คืน shape ว่างที่ถูกต้อง + frontend guard
- `analytics_monthly.php` มี section แต่งข้อมูล (predictive health / energy) → ลบออก
- `loadOptions` อ่าน shape ผิด (`json.data.assets`) → แก้เป็น `json.data.options`
- `overview.reliability` อ่าน nested ผิด → แก้เป็น `.summary.*`

---

## K. ข้อจำกัด & Roadmap

**ข้อจำกัดปัจจุบัน**
1. ข้อมูลกรอกไม่ครบ (ต้นทุน/เวลาตอบสนอง/RCA/failure code = 0) → KPI เหล่านี้ยังใช้ตัดสินใจไม่ได้
2. Downtime ระดับใบงานกรอกแค่ 1/102 → ต้องพึ่ง `mtbf_mttr`
3. MTBF/MTTR และ PM compliance มีสองนิยาม/แหล่ง — ต้องสื่อสารให้ชัดเมื่อรายงาน
4. ยังไม่มี TLS/HTTPS (blocker เดิมจาก Phase 21 — ไม่เกี่ยวกับ Phase 23)
5. `mtbf_mttr` ใช้ predicate แบบ non-sargable (ไม่มีผลที่ขนาดปัจจุบัน)

**Roadmap แนะนำ**
1. รณรงค์กรอกข้อมูล: ต้นทุน, เวลาตอบสนอง, failure code, downtime ให้ครบ → ปลดล็อก KPI ต้นทุน/วัสดุ/SLA
2. รวมนิยาม MTBF/MTTR และ PM compliance ให้เป็นมาตรฐานเดียว (หรือกำหนดชัดว่าใช้ตัวใดเมื่อไร)
3. เพิ่มการผูกอะไหล่กับใบงาน (`repair_spare_parts`) เพื่อให้วิเคราะห์การใช้วัสดุได้
4. พิจารณา window function (`LAG`) สำหรับ repeat-failure gap เมื่อข้อมูลโต
5. ทยอยใส่ข้อมูล `mtbf_mttr` ให้ครอบคลุมทุกเครื่อง เพื่อให้ availability รายเครื่องสมบูรณ์
