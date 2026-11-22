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
