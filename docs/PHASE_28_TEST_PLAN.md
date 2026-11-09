# PHASE 28 — TEST PLAN (Asset Reliability & Lifecycle Management)

> วันที่: 2026-09-22 · ระบบ: CMMS-TPT
> วิธีรัน: setup session admin (ดูล่าง) แล้วเรียกผ่าน HTTP `http://127.0.0.1:8878` หรือ
> CLI smoke script `C:\Users\ADMINI~1.MAJ\AppData\Local\Temp\opencode\p28_api_smoke.php`

## เตรียมสภาพแวดล้อม

1. Dev server: `php -S 127.0.0.1:8878 -d session.save_path=C:/opencode_sess -t public` (docroot = `public`)
2. สร้าง session admin: `.temp\opencode\p28_mksess.php` → SID `phase28smoke000000000001`
3. ยิง probe: `.temp\opencode\p28_api_smoke.php`

## T1 — Dashboard & รายการเครื่อง (api + UI)

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_reliability.php?action=dashboard` | 200, keys: `total_assets`, `by_criticality`, `by_lifecycle`, `critical_review_due_count`, `aging_summary` |
| 2 | `GET asset_reliability.php?action=critical` | 200, รายการ criticality A–D + score |
| 3 | `GET asset_reliability.php?action=aging` | 200, รายการอายุเครื่อง (warning/retire) + เกณฑ์จาก config |
| 4 | หน้า `/asset-reliability` | ผ่าน menu permission, แสดง KPI + กราฟ ไม่มี console error |

## T2 — Reliability Profile รายเครื่อง

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_reliability.php?id=89` (หรือ asset จริง) | 200, profile มีทุก sections: asset/criticality/reliability/health/.../decision_support |
| 2 | reliability.MTBF/MTTR | คำนวณจาก repair จริง หรือ `INSUFFICIENT_DATA` (ห้ามค่าเดา) |
| 3 | decision_support | ไม่มีข้อความ "ควรเปลี่ยนเครื่อง" แบบ auto — เป็นข้อมูลประกอบตัดสินใจ |
| 4 | หน้า `/asset-reliability/89` | UI แสดงทุก tab; ปุ่มเปลี่ยน lifecycle ปรากฏเมื่อมีสิทธิ์ `asset_reliability/lifecycle` |
| 5 | เปลี่ยน lifecycle (POST) | บันทึก + ลง history append-only + audit_log + LINE notify |

## T3 — Criticality A–D

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_criticality.php?action=list` | 200 ครบ B เป็น default |
| 2 | ตั้งค่า level 'D' ผ่าน review | บันทึก + มี human review record (ไม่เดา) + audit |

## T4 — Lifecycle

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_lifecycle.php?id=<asset>` | 200, ตำแหน่ง ณ ปัจจุบัน + status |
| 2 | `GET asset_lifecycle.php?action=transition` | รายการ transition ที่ถูกต้อง (แก่), ไม่อนุญาตย้อนผิดลำดับ |
| 3 | เปลี่ยนสถานะ | history append-only 1 แถว + LINE notify (`lifecycle_change`) |
| 4 | due detection | ใกล้ครบ expected_life_months → flag `overdue`/`due_soon` (ไม่มีค่า remaining life เดา) |

## T5 — Replacement / Overhaul / Relationships / Measurements

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_reports.php?report=replacement_summary` | 200, ทุกแถวมี `asset_code` + `asset_name` |
| 2 | `POST asset_components.php?action=create` (endpoint เปลี่ยนชิ้นส่วน) | CSRF required, success + audit + notify `component_replaced` |
| 3 | `POST asset_overhauls.php?action=create` | สร้างแผน + due check + audit |
| 4 | `GET asset_data_quality.php` | 200, fleet summary (range/total_wos/fields/reliability/warnings) |
| 5 | `GET asset_data_quality.php?asset_id=N` | 200, `{ score, checks, has_data }` |
| 6 | relationship parent/child | CRUD ป้องกัน self-reference/cycle |

## T6 — Reports (asset_reports.php)

| # | report | คาดหวัง |
|---|---|---|
| 1 | `critical_assets` | 200 + rows |
| 2 | `aging` | 200 + rows |
| 3 | `lifecycle_distribution` | 200 + rows |
| 4 | `replacement_summary` | 200 + rows + asset_code/name |
| 5 | `overhaul_summary` | 200 + rows |
| 6 | `data_quality_summary` | 200 + rows |
| 7 | `reliability_ranking` | 200 + rows |
| 8 | `report=bogus` | 400 (invalid report) |

## T7 — Config & RBAC

| # | ขั้นตอน | คาดหวัง |
|---|---|---|
| 1 | `GET asset_reliability.php?action=config` | 200, keys `ar_*` ครบ (>=18) |
| 2 | `POST asset_reliability.php?action=config` (settings/edit perm) | บันทึก + audit; ใส่ weight/เกณฑ์ไม่สมเหตุผลโดน validation |
| 3 | สิทธิ์เมนู | sidebar แสดงเฉพาะ key ที่ `menu_permissions` เปิด; API 403 เมื่อ user ขาด perm |

## ผลลัพธ์ล่าสุด (2026-09-22)

- API smoke: **FAILURES=0** (16 x 200 + bogus → 400)
- `npm run typecheck`: ผ่าน
- `php -l`: ผ่านทุกไฟล์ใหม่ (asset_reports.php, asset_reliability.php, menu_catalog.php)
- `scripts/apply_phase28_asset_reliability.php` ครั้งที่ 2 → idempotent (ไม่มี error)