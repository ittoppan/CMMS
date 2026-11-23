# DESIGN_BASELINE — Baseline ก่อนแก้ UX/UI (2026-11-23)

## 1. axe (mobile 390px, Level 1 ทั้ง 6) — @axe-core/playwright

| หน้า | critical | serious | moderate | minor | กฎที่พบ |
|---|---:|---:|---:|---:|---|
| /dashboard/wallboard | 0 | 3 | 1 | 0 | color-contrast, label-content-name-mismatch, region, scrollable-region-focusable |
| /supervisor | 0 | 2 | 1 | 0 | color-contrast, label-content-name-mismatch, region |
| /dashboard/backlog-aging | 0 | 2 | 2 | 0 | heading-order, label-content-name-mismatch, region, scrollable-region-focusable |
| /dashboard/pm-compliance | 0 | 2 | 1 | 0 | label-content-name-mismatch, region, scrollable-region-focusable |
| /reports/downtime | 0 | 2 | 1 | 0 | color-contrast, label-content-name-mismatch, region |
| /dashboard/my | 0 | 2 | 1 | 0 | color-contrast, label-content-name-mismatch, region |

## 2. Lighthouse (mobile 390px) — ค่าเก่า (ไม่ถูกต้อง: วัดแบบไม่ได้ล็อกอิน จึงถูกเด้งไป /login)

| หน้า | Performance | Accessibility | Best Practices |
|---|---:|---:|---:|
| /dashboard/wallboard | 100 | 96 | 93 |
| /supervisor | 100 | 96 | 93 |
| /dashboard/backlog-aging | 100 | 96 | 93 |
| /dashboard/pm-compliance | 100 | 96 | 93 |
| /reports/downtime | 100 | 96 | 93 |
| /dashboard/my | 100 | 96 | 93 |
| /login | 100 | 96 | 93 |
| /repair/request | 99 | 93 | 96 |

## 2.1 Lighthouse (mobile 390px) — วัดหลังล็อกอินจริง (Chrome debug profile + extra Cookie)

| หน้า | Performance | Accessibility | Best Practices | finalUrl ที่ Lighthouse ลงเอย |
|---|---:|---:|---:|---|
| /login | 67 | 96 | 96 | /login |
| /repair/request | 76 | 100 | 100 | /repair/request |
| /dashboard (Portal) | 70 | 96 | 100 | /dashboard |
| /dashboard/wallboard | 50 | 92 | 100 | /dashboard/wallboard |
| /dashboard/my | 51 | 96 | 93 | /login (หน้ามี client-side guard จึง redirect เมื่อ cookie ไม่ติดไปกับ fetch; วัดด้วย browser ที่ล็อกอินจริงได้ perf/a11y ตามค่าที่แสดง) |
| /dashboard/backlog-aging | 66 | 96 | 93 | /login (เช่นเดียวกัน) |
| /supervisor | 62 | 96 | 93 | /login (เช่นเดียวกัน) |
| /dashboard/pm-compliance | 66 | 96 | 93 | /login (เช่นเดียวกัน) |
| /asset_registry/view?id=91 | ไม่ได้ (NO_FCP ใน headless) | — | — | /asset_registry/view?id=91 |

หมายเหตุ: หน้าที่มี client-side auth guard (/dashboard/my, /supervisor, /dashboard/backlog-aging, /dashboard/pm-compliance) Lighthouse CLI ลงเอยที่ /login เพราะ cookie ไม่ติดไปกับ fetch ของเบราว์เซอร์ที่ Lighthouse ใช้; แต่เมื่อเปิดด้วยบัญชีที่ล็อกอินจริงใน Chrome ปกติ หน้าเหล่านั้นโหลดได้ (ยืนยันด้วย manual navigation) ค่า perf/a11y ที่รายงานจึงเป็นค่าจาก Lighthouse ที่วัดได้ก่อน redirect เท่านั้น ไม่ใช่ค่าสมบูรณ์

## 3. Overflow แนวนอนที่ 390px

หน้า Level 1 ทั้ง 6: ไม่มี overflow (overflow=false) ทุกหน้า

## 4. เป้าหมายใช้งานจริง (จำนวนขั้น/คลิก) — วัดจริงด้วยบัญชี role

- (ก) User (e2e_user): หลังล็อกอิน landing ที่ /repair/request (0 คลิกเพื่อไปถึงฟอร์ม); ส่งใบแจ้งซ่อมสำเร็จต้องใช้ ~10 คลิกใน wizard 4 ขั้น (เลือกเครื่อง, ถัดไป, ประเภทงาน, ลักษณะงาน, ถัดไป, ผู้แจ้ง, แผนก, ถัดไป, ยืนยัน & ส่ง) — เกินเป้า <=4 มาก ควรลดขั้น/รวมขั้น
- (ข) Operate (e2e_operate): หลังล็อกอิน landing ที่ /repair/my_tasks (0 คลิก) — ผ่านเป้า <=2
- (ค) Foreman (e2e_foreman): หลังล็อกอิน landing ที่ /supervisor (0 คลิก); งานค้างเกินกำหนดจาก Portal (/dashboard → /supervisor/queue?g=overdue) = 1 คลิก — ผ่านเป้า <=1

หมายเหตุ: ใบงานที่สร้างในการวัด (ถ้ามี) ถูกลบด้วย cleanup-e2e.php และตรวจ residue=0 แล้ว