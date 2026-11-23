# PHASE D3.7 — Role E2E (User / Operate / Foreman)

> วันที่ทดสอบ: 2026-11-23 · build จาก HEAD `f5f78bcd` (`.next-verify`, เสิร์ฟที่ :3003)
> บัญชีที่ใช้: `e2e_user` (role 9), `e2e_operate` (role 3), `e2e_foreman` (role 7) — บัญชีทดสอบเดิมของโปรเจกต์ (`is_active=1`) ไม่ได้สร้าง/แก้ผู้ใช้หรือสิทธิ์ใด ๆ
> วิธี: Playwright login จริงทางฟอร์ม `/login` แล้วเปิด 3 หน้า, เก็บ URL/ข้อความปฏิเสธ/จำนวนแถว/ปุ่ม/สถานะ API ทุกตัว

## 1. ผลลัพธ์ต่อบทบาท

| บทบาท | `/supervisor` | `/supervisor/queue` | `/repair/view?id=2061` |
|---|---|---|---|
| **9 User** | หน้า 403 “ไม่มีสิทธิ์เข้าใช้หน้านี้” · 0 แถว · ไม่มีปุ่มจัดการ | หน้า 403 เดียวกัน · 0 แถว | `repair.php` **403** → ข้อความ “คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้” · 0 แถว |
| **3 Operate** | หน้า 403 “ไม่มีสิทธิ์เข้าใช้หน้านี้” · 0 แถว | หน้า 403 เดียวกัน · 0 แถว | `repair.php` **200** (อ่านใบงานได้ตามเมทริกซ์) แต่ `repair_attachment.php` **403** → ขึ้นข้อความ “คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้” |
| **7 Foreman** | ใช้งานได้เต็ม: h1 “Work Order Control”, 23 การ์ด, can.plan/verify = true | ใช้งานได้: 50 แถว/หน้า, ตัวกรองครบ, มียอด “ทั้งหมด 105” | ใช้งานได้: h1 “ใบสั่งงานซ่อม”, API 200 ทุกตัว (`repair`, `spare_usage`, `failure`, `repair_attachment`) |

- ทั้ง 9 เคส: **ไม่มี console error / pageerror** และไม่มี horizontal overflow
- ผลตรงกับ `MASTER_ROLE_PERMISSION_MATRIX.md` §2 (`canSupervisor()` = 1,2,6,7) สำหรับการเข้าหน้า supervisor
- เมนูของ role 3/9 ไม่มีคีย์ `repair` (มี `repair/my_tasks`, `repair/tracking`) จึงไม่ควรเปิด `/repair/view` — พฤติกรรมที่เห็นสอดคล้องกับเมนู

## 2. Findings (ยังไม่แก้ — ต้องอนุมัติ)

### S1 (HIGH, ความปลอดภัย): `supervisor.php` GET ไม่ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์

หลักฐาน (ยิงจากเบราว์เซอร์ที่ล็อกอินเป็น `e2e_user` role 9 ซึ่ง UI บล็อกหน้าไว้แล้ว):

| request | status | ผล |
|---|---|---|
| `GET /api/v1/supervisor.php?action=kpis` | **200** | คืน `counts`, `mttr_hours`, `mtbf_hours`, `sla_compliance_pct`, `pm_compliance_pct`, `top_overdue`, `can` |
| `GET /api/v1/supervisor.php?action=queue&limit=5` | **200** | คืน **5 รายการใบงานจริง** |
| `GET /api/v1/supervisor.php?action=requests` | **200** | คืน 0 รายการ (ช่วงที่ทดสอบ) |

`code`: `public/api/v1/supervisor.php` ตรวจสิทธิ์เฉพาะ method ที่เขียนข้อมูล (`PUT/POST` ใช้ `requireRole(canPlanWork()/canVerifyWork()/canReviewRequest())`) แต่ `case 'GET'` ทั้ง 8 action (`kpis`, `queue`, `requests`, `workorders`, `schedule`, `technicians`, `pause_log`, `request_log`) เรียกแค่ `requireLogin()`

- ผลกระทบ: ผู้ใช้ที่ล็อกอินทุก role อ่านข้อมูลคิวงาน/KPI/รายชื่อช่างได้ผ่าน API ตรง แม้ UI จะซ่อน
- สอดคล้องกับที่ `MASTER_API_INVENTORY.md` §3 ระบุว่า API enforcement 5/113
- **ยังไม่แก้ในรอบนี้** เพราะเป็นการเปลี่ยน authorization (ห้ามเพิ่ม/ลดสิทธิ์โดยไม่ได้รับอนุมัติ) — ต้องอนุมัติก่อนแก้
- แนวทางที่เสนอ (หลังอนุมัติ): เพิ่ม `requireRole(canSupervisor())` ให้ GET ที่เป็นข้อมูลหัวหน้างาน (`kpis`, `queue`, `requests`, `workorders`, `schedule`, `technicians`) และคง `pause_log`/`request_log` ตามเจ้าของงาน เพื่อไม่ให้ช่าง (role 3) ที่ใช้หน้า my_tasks พัง

### S2 (MEDIUM, UX): ข้อความ 403 ของ sub-resource ขึ้นทับหน้าที่ใช้งานได้

- `ApiFetchInterceptor.tsx` แสดงข้อความ “คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้” เมื่อเจอ 403 ตัวใดก็ตาม
- ที่ role 3 หน้า `/repair/view` ข้อมูลหลักอ่านได้ (200) แต่ `repair_attachment.php` ตอบ 403 → ผู้ใช้เห็นข้อความเหมือนถูกปฏิเสธทั้งหน้า
- ยังไม่แก้ เพราะเป็นการเปลี่ยนพฤติกรรม error handling ทั้งระบบ (ต้องตกลงว่าจะแยก 403 ระดับหน้า vs ระดับ widget หรือไม่)

## 3. สิ่งที่ยังไม่ได้ทดสอบ

- ไม่ได้กดปุ่ม mutation (assign/verify/close) ของ Foreman — เป็นการเปลี่ยนข้อมูลจริง ต้องมีข้อมูลทดสอบ/อนุมัติ
- ไม่ได้ทดสอบ role 1,2,6,8,10 ในรอบนี้ (D3.7 ระบุ 3 บทบาท)
- ไม่ได้ทดสอบการแจ้งเตือนที่เกิดจาก workflow
- ไม่ได้ทดสอบขอบเขตข้อมูล (role 3 เห็นเฉพาะงานที่ได้รับมอบหมาย) ด้วยข้อมูลที่มีผู้รับงานจริง — ใบงานที่ใช้ทดสอบไม่มีผู้รับงาน

## 4. คำสั่งที่ใช้ซ้ำ

```bash
cd frontend
NEXT_DIST_DIR=.next-verify npm run build
NEXT_DIST_DIR=.next-verify npx next start -p 3003
node tmp-d37-roles.mjs    # 3 roles × 3 routes + API probe (สคริปต์ชั่วคราว ไม่ได้ commit)
```
