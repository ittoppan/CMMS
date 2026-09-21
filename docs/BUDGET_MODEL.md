# Budget Model (Phase 26)

> Engine: `src/helpers/cost.php` — งบประมาณผูกกับ `budget_plan` (เดิม) + `budget_adjustment` (ใหม่)

## Concept

งบประมาณเป็นราย **เดือน × ปี × แผนก** (department ว่าง = ทุกแผนก)

```
effective budget = allocated_budget + Σ budget_adjustment
utilization      = actual / effective_budget × 100       (actual จาก v_maintenance_cost ของเดือนนั้น)
remaining        = effective_budget − actual
```

## ระดับแจ้งเตือน (alert)

| ระดับ | เงื่อนไข | ป้าย |
|---|---|---|
| `NORMAL` | utilization < warning_pct (default 80) | เขียว |
| `WARNING` | warning_pct ≤ utilization < exceed_pct (default 100) | เหลือง "ใกล้ถึงเกณฑ์" |
| `EXCEEDED` | utilization ≥ exceed_pct | แดง "เกินงบประมาณ" |
| `NO_BUDGET` | ยังไม่ได้ตั้งงบ/งบ 0 แต่มีใช้จ่าย | เทา |

- ค่าพิกัด `budget_warning_pct` / `budget_exceed_pct` ตั้งได้ที่ System Settings
- เมื่องบรายเดือนเป็น `active` และ utilization แตะ WARNING/EXCEEDED → ส่ง NotificationCenter
  (template `budget:alert` / `budget:over`) dedup ด้วย `event_key` ต่อเดือน-แผนก

## Workflow สถานะ

```
draft  ──submit──►  submitted  ──approve──►  active  ──close──►  closed
  │  ▲                 │                        │
  └──┴────cancel───────└────────────────────────┴────────────►  cancelled
```

| สถานะ | ทำอะไรได้ |
|---|---|
| `draft` | แก้ไข (`update`), ยื่นขออนุมัติ (`submit`), ยกเลิก (`cancel`) |
| `submitted` | แก้ไข (`update`), อนุมัติ (`approve` → active), ยกเลิก (`cancel`) |
| `active` | ปรับงบ (`adjust`), ปิด (`close`) — **เป็นสถานะเดียวที่เอาไปเทียบใช้จริงใน alert** |
| `closed` / `cancelled` | สิ้นสุด — แก้ไม่ได้ |

- `approve` บันทึก `approved_by` / `approved_at` + แจ้งเตือน `budget:approved`
- `adjust` บันทึกลง `budget_adjustment` คอลัมน์ `+/−` ต้องมี `reason` **ตลอด**

## สิทธิ์

- ดู (GET ทั้งหมด + `/cost` + `/budget`) → `kpi_can_see_cost(r)` = roles 1, 2, 6
- จัดการ (POST budget/*) → `cost_can_manage_budget(r)` = roles 1, 2, 6
  - ใช้ชุดเดียวกับ cost — **ไม่สร้างสิทธิ์ขนาน** (ตามนโยบาย do-not-parallel)
- POST ทุกรายการ: `enforceCsrf()` + `requireRole(cost_can_manage_budget)` + audit_log
- หน้า `/budget` แสดงปุ่มจัดการเฉพาะเมื่อ API คืน `can_manage=true` (server เป็นผู้ตัดสินจริง)

## ดูเพิ่ม
- `docs/BUDGET_RULES.md` — business rules & edge cases
- `docs/MAINTENANCE_COST_MODEL.md` — ที่มาของ "actual"