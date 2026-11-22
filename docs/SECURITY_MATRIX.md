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

---

## Phase 10 — ปิด over-permission ให้ตรงกับเมนู (2026-11-22)

Probe สดหลังแก้ (GET ด้วยบัญชี e2e_* ทั้ง 9 role) → 200 = อ่านได้, 403 = บล็อก

| endpoint | Admin | Mgr | Asst | Foreman | Operate | User | Viewer | Officer | OffRead | เมนู (DB) | ผล |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reports.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 200 | 200 | reports (1,2,5,6,8,10) | ✅ |
| machine_bom.php | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | asset_registry/bom_tree (1,2,6) | ✅ |
| notifications_log.php | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | notifications/history (1,2,6) | ✅ |
| kpi_dashboard.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 | 403 | analytics (1,2,5,6) | ✅ |
| analytics_advanced.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 | 403 | analytics (1,2,5,6) | ✅ |
| analytics_monthly.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 | 403 | analytics (1,2,5,6) | ✅ |
| intelligence.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 | 403 | analytics (1,2,5,6) | ✅ |
| predictive_maintenance.php | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 | 403 | analytics (1,2,5,6) | ✅ |
| feedback.php | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 200 | 200 | feedback (1,2,6,8,10) | ✅ |
| repair.php | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 200 | 200 | repair (Viewer=0) | ✅ |
| pm_ical.php | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | session-based scope (Foreman+ all) | ✅ |

Viewer repair menu = 0 (role_id=5, menu_key='repair' is_granted=0) → API 403 แล้ว
pm_ical scope: Foreman+ (1,2,6,7) เห็นทั้งหมด; บทบาทอื่นเห็นเฉพาะ assigned_to = ตัวเอง

scripts/ probe (IIS hiddenSegments บล็อก segment "scripts"):
- /scripts/test_approval_service.php → 404
- /scripts/test_security.php → 404
- /scripts/php-db-tests.sh → 404

## หน้ารายละเอียดเครื่องจักร (/asset_registry/view)

Probe จริงด้วยบัญชีทดสอบ (asset id=91, code=A-BM06). ค่า = HTTP status

| endpoint | แท็บ/ส่วนที่ใช้ | Admin | Manager | Asst.Mgr | Foreman | Operate | Officer | Officer-Read | Viewer | User |
|---|---|---|---|---|---|---|---|---|---|---|
| asset_registry.php?id=91 | ภาพรวม/ทะเบียน | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 403 |
| machine_bom.php?asset_id=91 | อะไหล่ & BOM | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| pm_plans.php?asset_id=91 | PM & ตรวจเช็ค | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 403 |
| inspections.php?schedules=1&asset_id=91 | PM & ตรวจเช็ค | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| calibration.php?asset_id=91 | timeline (สอบเทียบ) | 200 | 200 | 200 | 200 | 403 | 200 | 200 | 200 | 403 |
| facility_layout.php | ผังอาคาร (settings) | 200 | 200 | 200 | 200 | 403 | 200 | 200 | 403 | 403 |
| repair.php?asset_code=A-BM06 | ประวัติซ่อม | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 200 |
| asset_measurements.php?asset_id=91 | เทคนิค/มิเตอร์ | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| asset_meters.php?asset_id=91 | เทคนิค/มิเตอร์ | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| index.php?resource=users | ผู้ใช้ | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| index.php?resource=pm-plans | PM plans (global) | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| scan.php?code=A-BM06 | QR resolve | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| asset_hub.php?code=A-BM06 | asset_hub (QR) | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |

### Flow QR สำหรับ User (scan.php + asset_hub.php)

- scan.php (resolve): คืน type=asset, data.asset keys = id, code, name, category, criticality, status, department, department_id, location, location_id, image_path, qr_token, payload (+ active_work_orders, pm_due, counts). ไม่มี BOM ราคาอะไหล่, ต้นทุน, ประวัติซ่อมของคนอื่น, หรือข้อมูลเต็ม.
- asset_hub.php: คืน asset keys = id, code, name, category, location, department, criticality, status, image_path (ขั้นต่ำ) + counts (pm_open, active_work_orders, repairs_total, repairs_done) + active_work_orders (ที่ยังเปิด) + pm (open/next_due/last_done). history=[] (ไม่ส่งประวัติซ่อมที่ปิดแล้วให้ User). ไม่มี BOM/ราคา/ต้นทุน/ข้อมูลเต็ม.
- ปุ่มแจ้งซ่อม: /repair/request?asset_code=<code> (LIFF endpoint) — User แจ้งซ่อมได้.
