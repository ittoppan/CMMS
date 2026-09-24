# PHASE 29 KPIS — ตัวชี้วัดการสอบเทียบ

> อัปเดตล่าสุด: 2026-09-23
> อธิบายตัวชี้วัด (KPI) ของบริบทสอบเทียบที่ **backend คำนวณจากข้อมูลจริง**
> — ไม่มีตัวเลขปลอม / ไม่ extrapolate / ไม่แสดง 100% เมื่อข้อมูลไม่พอ (rule 2)
> แหล่ง: `cal_compliance()`, `cal_instrument_status_value()`, `cal_dashboard()`,
> `cal_build_report(type=compliance|history|...)` ใน `src/helpers/calibration.php`

## 1. KPI ยอดนิยม (Dashboard `/calibration/dashboard`)

Dashboard ส่ง `compliance` object:
```json
{
  "total_instruments": 2,
  "registered_instruments": 0,
  "unregistered_instruments": 2,
  "overdue_plans": 0,
  "due30_plans": 0,
  "due30_overdue": 0,
  "done_total": 0,
  "on_time": 0,
  "compliance_pct": null,
  "compliance_label": "N/A",
  "denominator": 0,
  "insufficient_data": true,
  "computed_from": "real_data"
}
```

### 1.1 คำจำกัดความ

| KPI | สูตร/นิยาม (backend) |
|---|---|
| `total_instruments` | `COUNT(DISTINCT asset_registry.id)` ที่ `category LIKE '%instrument%'` **หรือ** มีแถว `calibration_instruments` |
| `registered_instruments` | `COUNT(DISTINCT a.id)` ที่มี `calibration_instruments` (ลงทะเบียนส่วนขยายแล้ว) |
| `unregistered_instruments` | total − registered |
| `overdue_plans` | จำนวน plan `status='active'` ที่ `next_calibration_date < CURDATE()` |
| `due30_plans` | plan `next_calibration_date` อยู่ใน `[CURDATE, CURDATE+cal_alert_days]` |
| `due30_overdue` | overdue_plans + due30_plans |
| `done_total` | รอบ `status IN ('approved','completed')` ที่ `completed_at/approved_at` ใน 12 เดือนหลัง |
| `on_time` | ใน done_total: `next_calibration_date <= now+14d` (ทำภายในกำหนด) |
| `compliance_pct` | `on_time / (done_total + overdue) * 100` — ถ้าฐาน≤0 → **null (N/A)** |
| `insufficient_data` | true เมื่อ `denominator <= 0` (ห้ามเดา) |

> หมายเหตุ `total_instruments` ใช้ `COUNT(DISTINCT a.id)` เพราะ JOIN กับ `calibration_plans` อาจทำให้
> asset ที่มีหลายแผนนับซ้ำ (bug ที่พบและแก้ใน smoke test 2026-09-23)

## 2. สถานะ GREEN / AMBER / RED (ต่อเครื่องมือ)

`cal_instrument_status_value($row)`:

```
ถ้ามี due date:
  due  = next_calibration_date
  warn = due − cal_alert_days
  due < today                       → RED
  warn <= today <= due              → AMBER
  อย่างอื่น                          → GREEN
ถ้าไม่มี due date:
  เคยสอบเทียบ (last_calibration/last_run) → AMBER
  ยังไม่เคยสอบเทียบ                   → RED   (ข้อมูลไม่พอ = เสี่ยง)
```

- สีนี้ใช้ตาม design system เดิม (GREEN/AMBER/RED — ไม่ hardcode hex ใหม่)
- `cal_instruments(status=RED|AMBER|GREEN)` รองรับกรองตามสี
- `status=unregistered` = ยังไม่มี `calibration_instruments`

## 3. compliance (%) ในการทำงานจริง — ข้อควรระวัง

- ถ้า denominator = 0 (เช่น ยังไม่มีรอบที่ทำแล้วใน 12 เดือน) → `compliance_pct=null`, label `N/A`
- ถ้า denominator > 0 → `on_time/denominator*100` (1 ตำแหน่ง)
- **ห้าม** แปลง N/A ให้เป็น 0% หรือ 100% ที่หน้าหน้า (frontend ห้ามคำนวณ)

## 4. KPI อื่น

### 4.1 Report compliance (ช่วงเวลา)
`reports.php?resource=reports&type=compliance&from=&to=`
- คำนวณจาก `calibration_history`/`calibration` ในช่วงที่เลือก
- `done_total, on_time, passed, failed, conditional` — แยกรายเดือน/ช่วงได้จาก row ข้อมูลจริง

### 4.2 Due ใกล้/เลย (report due & schedule)
- `reports?type=due`: แจกแจง plan `days_left=DATEDIFF(next,CURDATE)` → status overdue/due_soon/ok
- schedule: เอา due รายเดือนมาแสดง (หน้า `/calibration/schedule`)

### 4.3 มาตรฐานใกล้หมดอายุ (dashboard `expiring_standards`)
- มาตรฐาน `status='active'` ที่ `next_calibration_date ∈ [CURDATE, CURDATE+cal_reference_expiry_warn_days]`

### 4.4 คุณภาพข้อมูล (dashboard ไปดู pages data-quality)
- 8 checks ดู `docs/PHASE_29_DATA_QUALITY.md` — นำมาเป็น KPI รายเดือนได้ (count แต่ละข้อ)

## 5. Boot run ตัวอย่าง (ข้อมูลจริง 2026-09-23 ก่อนมีข้อมูล)

```json
total_instruments=2, registered=0, unregistered=2,
overdue_plans=0, due30_plans=0, done_total=0, on_time=0,
compliance_pct=null, compliance_label="N/A", denominator=0, insufficient_data=true
```
→ สอดคล้อง data-quality (มีเครื่องมือ 2 ชิ้น ยังไม่ลงทะเบียน) — สองแหล่งเห็นตรงกัน

## 6. Rule ที่แฝง (บังคับ)

1. ตัวเลขทุกตัวคำนวณ backend (`cal_compliance`, `cal_run_computed`, `cal_instrument_status_value`)
2. ไม่มีfake data — หากไม่มีข้อมูลจริงให้ ≤0 → N/A (ไม่อวย 100%)
3. สีจาก design system เดิม — ไม่สร้างสี/hex ใหม่
4. `computed_from: "real_data"` แสดงฐานข้อมูลจริงเสมอ