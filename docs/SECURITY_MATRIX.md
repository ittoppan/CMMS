# SECURITY_MATRIX — Phase 6 วัดผลจริง (ไม่แก้โค้ด)

สร้าง: 2026-11-22

## ตารางผล (GET/POST) ต่อ role

ค่า: 200/400/403/500 = HTTP status; 401/403 = บังคับสิทธิ์แล้ว; 400/422/200/500 = ยังไม่บังคับ (validation ก่อนสิทธิ์ หรือผ่านโดยไม่ตรวจ)

| endpoint | Admin | Manager | Asst.Mgr | Foreman | Operate | User | Viewer | Officer | Officer-Read |
|---|---|---|---|---|---|---|---|---|---|
| repair.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| repair.php POST | 500 | 500 | 500 | 500 | 500 | 500 | 500 | 500 | 500 |
| spare_parts.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| spare_parts.php POST | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| spare_issue_request.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| spare_issue_request.php POST | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| stock_take.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| stock_take.php POST | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| inspections.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| inspections.php POST | 400 | 400 | 400 | 400 | 403 | 403 | 403 | 403 | 403 |
| checklist_templates.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| checklist_templates.php POST | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| form_templates.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| form_templates.php POST | 400 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| forms.php GET | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| forms.php POST | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| planning.php GET | 400 | 400 | 400 | 400 | 400 | 403 | 400 | 400 | 403 |
| planning.php POST | 400 | 400 | 400 | 400 | 403 | 403 | 403 | 403 | 403 |
| supervisor.php GET | 400 | 400 | 400 | 400 | 400 | 403 | 400 | 400 | 403 |
| supervisor.php POST | 400 | 400 | 400 | 400 | 403 | 403 | 403 | 403 | 403 |
| approval.php GET | 200 | 200 | 200 | 200 | 200 | 403 | 200 | 403 | 403 |
| approval.php POST | 400 | 400 | 400 | 403 | 403 | 403 | 403 | 403 | 403 |
| sage_shipments.php GET | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 200 |
| sage_shipments.php POST | 400 | 400 | 400 | 403 | 403 | 403 | 403 | 400 | 403 |
| permission_diff.php GET | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| permission_diff.php POST | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |

## รายการ "ยังไม่บังคับ" (ก่อนเฟส B/C)

- repair.php: GET เปิดให้ทุก role (ไม่มี ownership scoping สำหรับ User — เฟส C เพิ่มแล้ว)
- spare_parts.php, spare_issue_request.php, stock_take.php, checklist_templates.php, forms.php: GET/POST ไม่บังคับ permission (matrix ยังเป็นเอกสาร) → เฟส C เปิด enforcement แล้ว
- inspections.php, form_templates.php: มี internal role check บางส่วน แต่ GET ยังเปิดทุก role

## Cross-user (User role)

- GET /api/v1/repair.php?id=N คืนใบงานของผู้ใช้อื่นได้ (ก่อนแก้) → เฟส C เพิ่ม ownership check แล้ว (role 9 เห็นเฉพาะ created_by = ตัวเอง)
- POST created_by ถูก resolve ฝั่งเซิร์ฟเวอร์แล้ว (repair_owner_resolve)

## ให้ผมตัดสินใจ

- User ควรเห็น repair ที่ assigned ให้ตัวเองด้วยหรือไม่ (ปัจจุบัน scope เฉพาะ created_by)
- inspections/form_templates internal check ควรย้ายมาใช้ api_permissions หรือไม่

---

## หลังแก้ (Phase 6C) — ผลรันซ้ำ

(คอลัมน์ก่อนแก้ดูตารางด้านบน; หลังแก้ = สถานะปัจจุบัน)


---

## การอ่านข้อมูล (เฟส 7)

วัดด้วย phase7-read.spec.ts (GET เท่านั้น) ผลดิบ: docs/phase7_read_raw.json

### สถานะ HTTP (200 = อ่านได้, 403 = บล็อก, 400 = validation/พารามิเตอร์)

| endpoint | Admin | Mgr | Asst | Foreman | Operate | User | Viewer | Officer | OffRead | ควรอ่าน (ตามเมนู) | ช่องว่าง |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cost | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | Mgr+/Asst+ | OK |
| kpi_dashboard | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ทุก role (dashboard) | User/Operate/Viewer อ่าน KPI ทั้งโรงงาน — สูง |
| analytics_advanced | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+/Viewer | Foreman/Operate/User/Officer อ่าน analytics ทั้งโรงงาน — สูง |
| analytics_monthly | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+/Viewer | เหมือนด้านบน — สูง |
| reports | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+/Viewer/Officer | Foreman/Operate/User อ่าน reports ทั้งโรงงาน — สูง |
| workload | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 403 | Mgr+/Asst+/Foreman | Operate/User/Viewer/Officer อ่าน workload ทั้งโรงงาน — สูง |
| notifications_log | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+ | Foreman/Operate/User/Viewer/Officer อ่าน log แจ้งเตือนทั้งโรงงาน — สูง |
| global_search | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ทุก role (ในขอบเขต) | อาจคืนข้อมูลนอกสิทธิ์ — ต้องตรวจ |
| dashboard | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ทุก role | OK (กรองตาม role ฝั่ง UI) |
| intelligence | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+ | Foreman/Operate/User/Viewer/Officer อ่าน intelligence — สูง |
| predictive_maintenance | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+ | เหมือนด้านบน — สูง |
| pm_reminders | 200 | 200 | 200 | 200 | 200 | 403 | 200 | 200 | 200 | Mgr+/Asst+/Foreman/Operate/Viewer | User บล็อกแล้ว OK; Officer อ่านได้ (ตามเมนู) |
| pm_ical | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+/Foreman | Operate/User/Viewer/Officer อ่าน PM calendar ทั้งโรงงาน — กลาง |
| inspection_dashboard | 200 | 200 | 200 | 200 | 200 | 403 | 200 | 200 | 200 | Mgr+/Asst+/Foreman/Operate/Viewer/Officer | User บล็อกแล้ว OK |
| inspection_history | 200 | 200 | 200 | 200 | 200 | 403 | 200 | 200 | 200 | Mgr+/Asst+/Foreman/Operate/Viewer/Officer | User บล็อกแล้ว OK |
| spare_usage | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | ต้อง param | ไม่ได้ข้อมูล (validation) |
| asset_stats | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | ต้อง param | ไม่ได้ข้อมูล |
| report_schedule | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | Mgr+/Asst+ | Foreman บล็อกแล้ว OK; Operate/User/Viewer/Officer บล็อกแล้ว OK |
| feedback | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+/Officer | Foreman/Operate/User/Viewer อ่าน feedback ทั้งหมด — กลาง |
| departments | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ทุก role (dropdown) | ยกเว้น: ข้อมูลแผนกไม่อ่อนไหว — อนุญาต |
| machine_bom | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | Mgr+/Asst+ | Foreman/Operate/User/Viewer/Officer อ่าน BOM — กลาง |
| sage_items | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | ต้อง param | ไม่ได้ข้อมูล |
| iot | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | Mgr+ (iot/monitor) | OK |
| repair_options | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 200 | ทุก role ที่แจ้งซ่อม | Operate/User/Viewer บล็อก (repair_options มีข้อมูล?) — ต้องตรวจ |
| asset_hub | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | ต้อง param | ไม่ได้ข้อมูล |

### สรุปช่องว่างสูง (ต้องแก้)
- kpi_dashboard, analytics_advanced, analytics_monthly, intelligence, predictive_maintenance, reports, workload, notifications_log: ทุก role อ่านได้ (รวม User/Operate) — ควรเป็น Mgr+/Asst+/Viewer ตามเมนู
- global_search: ทุก role ได้ 200 (ขนาด 57 bytes) — ต้องตรวจว่าคืนข้อมูลนอกสิทธิ์หรือไม่
- pm_ical, inspection_dashboard/history, feedback, machine_bom: เปิดกว้างเกิน
- repair_options: Operate/User/Viewer ได้ 403 (อาจกระทบ flow แจ้งซ่อม — ต้องตรวจ)
