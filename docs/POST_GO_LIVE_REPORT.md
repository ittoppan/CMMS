# POST-GO-LIVE REPORT — CMMS-TOPPAN (Phase 22)

> ฉบับ: **v1.0.1** · วันที่: 17/09/2026 · ขอบเขต: ตรวจสอบหลัง go-live + ออฟไลน์ตรวจสอบความพร้อม และการปรับปรุงระยะแรก
> หลักการเดียวกันทุก Phase: **ตัวเลขทุกตัวต้องมีหลักฐานจริง** — ไม่มีการจำลอง/ประมาณค่า

---

## A. สรุปสถานะ (Executive Summary)

ระบบ CMMS-TOPPAN อยู่ในสถานะ **RELEASE CANDIDATE (go-live blocker เหลือที่ฝั่งภายนอก)** การตรวจสอบรอบ Phase 22 ยืนยันว่า:
- โมดูลตรวจการทำงาน (Health) และช่องรับฟีดแบ็ก **ทำงานจริงและถูกตรวจสอบด้วยข้อมูลจริง** (ทั้ง view admin/refusal 403)
- ระบบ error กลางช่วยให้เห็นข้อผิดพลาด API ทุกจุดได้จริง
- ยังมี “blocker” ที่ไม่ใช่ตัวเรา: **HTTPS still not enabled**, **บัญชีผู้ใช้จริงยังไม่ถูกสร้าง**, **LINE quota ฟรีเต็ม** — ทั้งหมดอยู่ใน `docs/IMPROVEMENT_BACKLOG.md` เป็น P0

**คำแนะนำ:** อย่าเริ่มใช้งาน wide จนกว่า P0 3 ข้อจะปิด (I-01 TLS, I-02 บัญชี, I-08 LINE) — เส้นทางที่ชัดเจนพร้อมแล้ว

---

## B. สิ่งที่สร้างใน Phase 22 (มีหลักฐานรันจริง)

| ชิ้นงาน | ที่อยู่ | ตรวจแล้ว (หลักฐาน) | หมายเหตุ |
|---|---|---|---|
| Migration monitoring | `database/migration_20260917_phase22_monitoring.sql` + `scripts/apply_phase22_monitoring.php` | รันสำเร็จ; idempotent (รันซ้ำได้) | เพิ่ม `system_errors`, `feedback`, index เร็ว oracle, menu_permissions 14 แถว |
| ระบบ error กลาง | `src/helpers/errors.php` + เชื่อม `api_safe_catch()`/`health.php` | logout ใช้ได้; health ตัวจริง | redact secrets; ไม่ throw |
| Health API | `public/api/v1/system_health.php` | HTTP 200 (ข้อมูลจริง), timing 9–39ms; **role 3 → 403** | กลุ่มข้อมูล 9+1; audit-event |
| หน้า UI หัวข้อสุขภาพ | `/settings/health` | Playwright: KPI แสดงจริง + warning HTTPS + chip "ต้องตรวจสอบ" | admin เท่านั้น |
| Feedback API | `public/api/v1/feedback.php` | POST ผ่าน Origin; admin ดูทั้งหมด; role3 ดู own | CSRF+Origin บังคับจริง |
| หน้า UI Feedback | `/feedback` | Playwright: ส่งแล้วขึ้นจริง + list update | ทั้งบทบาท; admin ปรับสถานะ |
| เมนู/i18n/perm | `sidebar-nav.tsx`, `i18n.ts`, `menu_permissions` | role 1 เห็นทั้งสอง; role 2–7 เห็น feedback แต่ไม่เห็น health | — |
| เอกสาร | 5 docs ใหม่ + POST_GO_LIVE_REVIEW + CHANGELOG v1.0.1 | — | ดู §L |

---

## C. ผลตรวจ данныхจริง (Data Quality) — ข้อเท็จจริงของวันนี้

ตัวเลขจาก DB โดยตรง (ไม่ใช่สคริปต์แต่ง): **งานซ่อม 102** (active 22, เสร็จ 78, closed 2), **ค้าง >30 วัน 17**, **completed ที่ไม่มีช่าง 78**, **วันที่เพี้ยน 9**, **assignee หายจาก users 9**, **created_by NULL 98**. ผู้ใช้จริงยังมีแค่ 2 account (admin + role null) — ยังไม่พร้อม pilot ชัดเจน (บัญชีจริง P0)

รายละเอียด/root cause/แผนแก้ทั้งหมด: `docs/PRODUCTION_DATA_QUALITY.md`

---

## D. Monitoring (บอกว่าเราตรวจเองแล้วจริง)

- Health dashboard กำลังทำงาน; ครั้ง สุดท้าย: DB 0.3ms, Sage connected (PDO_ODBC), disk 3.7% ฟรี,  errors 30d 0, sync conflict 1, notification LINE fail 58 (quota) — ดูตัวเลขเต็มใน `docs/PRODUCTION_MONITORING.md`
- `php-error.log` ถูก truncate และกลับมาสะอาด (แก้อัน root ที่ display_errors) — ตรวจผ่าน health ได้

---

## E. Performance (ตัวเลขจริง ไม่ใช่สัญญา)

- DB ping 0.2–0.3ms; system_health รวม 9.2–38.8ms/request (median ~22ms); Next production build เร็ว
- ยังไม่มีผู้ใช้จริง ตัวเลข scaling ไม่มีเชิงสถิติ — จะวัดเมื่อ pilot จริง (SLO ต้องรอ)

---

## F. Security (ตรวจใหม่รอบนี้)

- ยืนยัน RBAC backend เป็นหลัก: technician เข้า health → `403 FORBIDDEN` (test จริง), unauth → `401`
- CSRF/Origin: POST feedback ที่ไม่มี CSRF token/Origin ถูกบล็อก (`403`) — ยืนยันด้วย curl; UI ผ่าน `Origin: localhost` กำลังทำงาน
- ไม่มี secret ในโค้ด: token อ่านจาก `.env`; ยังยืนยันห้าม commit token (AGENTS.md)
- **เปิดค้าง:** TLS/HTTPS (P0), หมดอายุ token/config review — ตาม backlog I-01/I-02

---

## G. Availability / บริการเวลา (สิ่งที่เราควบคุมได้)

เป็นการติดตั้งเดียว (IIS + Next + MySQL เดียวกัน) ยังไม่มีการ redundancy; backup รายวัน 02:30 มี; ยังไม่มี SLA — ระยะแรกจึงควรเปิดด้วย production ตัวเดียวแล้ว monitor ผ่าน `/health`.

---

## H. Notifications (ผลจริง)

30 วัน: **LINE ส่งสำเร็จ 23 / ล้มเหลว 58 (quota ฟรีเต็ม)** · Telegram 209 สำเร็จ → แสดง quota error ใน health แล้ว เป็นเหตุให้ขึ้น P0 I-08

---

## I. Feedback (ผลจริงทันที)

ฟีดแบ็กจริงยัง 0 (ตารางว่าง — แถวทดสอบถูกลบหลัง QA) ระบบพร้อมรับตั้งแต่เปิดใช้จริง — ดู `docs/USER_FEEDBACK.md`

---

## J. พนักงาน / ผู้ใช้ / การอบรม

ยังไม่มีผู้ใช้จริง อบรมก่อน pilot ตาม `TECHNICIAN_QUICK_GUIDE.md`/`OPERATOR_QUICK_GUIDE.md`; เพิ่ม account จริงเป็น P0 ก่อนเปิดใช้จริง.

---

## K. Roadmap ระยะถัดไป (ทำได้เลย เลือกให้ถูก)

**P0 (ยังปิดไม่ได้ด้วยตัวเรา ต้องฝ่ายภายนอก):** I-01 TLS · I-02 บัญชี/role จริง · I-08 LINE ทางการ
**P1 ควรทำก่อน/ทันทีที่ pilot:** I-03 ปิดงานค้าง · I-04 cleanup ข้อมูลซ้ำ · I-09 cron sage_sync · I-10 validate วันที่/assignee
**P2 ตามข้อมูลจริง:** I-05 alert อัตโนมัติ · I-06 health history · I-07 load test · I-11 assignee reassign · I-15 push
ทั้งหมด: `docs/IMPROVEMENT_BACKLOG.md`

---

## L. เอกสารที่อัปเดตใน Phase 22

| เอกสาร | สถานะ |
|---|---|
| `docs/PRODUCTION_MONITORING.md` | ใหม่ |
| `docs/USER_FEEDBACK.md` | ใหม่ |
| `docs/PRODUCTION_DATA_QUALITY.md` | ใหม่ |
| `docs/PERFORMANCE_MONITORING.md` | ใหม่ |
| `docs/IMPROVEMENT_BACKLOG.md` | ใหม่ |
| `docs/POST_GO_LIVE_REVIEW.md` | เพิ่ม §6 (Phase 22) |
| `CHANGELOG.md` | เพิ่ม v1.0.1 |

---

## M. ข้อสรุปและคำขอ

1. **ปล่อยระบบได้ตามเงื่อนไข** (controlled use/pre-pilot testing) — ยังไม่เปิด wide; ใช้บัญชี admin ที่มีอยู่เดิมในการตรวจภายใน
2. ให้ทีม IT/องค์กรดำเนินการ **P0 3 ข้อ** (TLS/Bัญชีจริง/LINE) โดยอ้างอิง `IMPROVEMENT_BACKLOG.md`
3. เป็นขั้นตอนแรกของกระบวนการต่อเนื่อง: ทุก Sprint ใหม่ต้องอัปเดต 3 docs นี้ (PRODUCTION_MONITORING / USER_FEEDBACK / PRODUCTION_DATA_QUALITY) ตามข้อมูลจริง

_ลงชื่อ: ทีมปฏิบัติจริง (ตรวจสอบด้วยหลักฐานจาก DB/HTTP จริง 17/09/2026)_