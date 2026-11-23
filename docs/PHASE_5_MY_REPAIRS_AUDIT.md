# Phase 5 — Audit: /my-repairs, /repair/history, /repair/view

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] ตรวจ my-repairs/history/detail` ใน Phase 5
> สภาพแวดล้อม: production build บน `http://localhost:3001` (IIS standalone)
> บัญชี: `e2e_viewer` (role 5 Viewer) — session cookie, ไม่มีการเขียน DB
> Viewport: **390 × 844** (มือถือ) · Playwright 1 test, PASS

## 1. วิธีวัด

สคริปต์ Playwright ชั่วคราว (ลบหลังรันแล้ว) ล็อกอินผ่านหน้า `/login` แล้วเปิดทีละหน้า เก็บ:
- HTTP status, จำนวน `<h1>` และข้อความหัวเรื่อง
- `documentElement.scrollWidth − clientWidth` (horizontal overflow)
- console `error` และ `pageerror`
- response ที่ถูกปฏิเสธ (401/403) พร้อม method + path

## 2. ผลการวัด (ดิบ)

| path | HTTP | h1 | overflowX | console error | pageerror | 401/403 |
|---|---|---|---|---|---|---|
| `/my-repairs` | 200 | 1 · "ติดตามงานของฉัน" | 0 | 0 | 0 | 0 |
| `/repair/history` | 200 | 1 · "403 — ไม่มีสิทธิ์เข้าใช้หน้านี้" | 0 | 2 | 0 | 2 |
| `/repair/view` | 200 | 1 · "ใบสั่งงานซ่อม" | 0 | 4 | 0 | 4 |

### 2.1 `/my-repairs` — PASS

ข้อความที่ render จริง (ตัดจาก DOM):

```
MAINTENANCE TRACKING · F-EN-03 / ติดตามงานของฉัน / E2E Viewer (test)
ทั้งหมด 0 · กำลังทำ 0 · เสร็จแล้ว 0
"ยังไม่มีงานที่คุณแจ้งไว้" + ปุ่ม "แจ้งซ่อมใหม่" + "กลับหน้าแจ้งซ่อม"
```

- หัวเรื่องใช้ `cmms-liff-hero` (นอก dashboard shell ตาม UI_MIGRATION §5 — ไม่ต้องใช้ PageHeader)
- 3 แท็บแสดงครบ, empty state ถูกต้อง (บัญชีนี้ไม่มีงานที่แจ้งเอง → 0/0/0 ตรงกับข้อมูล)
- ไม่มี horizontal overflow ที่ 390 px, ไม่มี console/page error
- ปุ่มรีเฟรชมี `aria-label="รีเฟรชรายการงาน"`, แท็บมี `role="tablist"`/`aria-selected`

**สรุป: ผ่าน** (ข้อมูลว่างเพราะบัญชีทดสอบไม่มีงาน — ไม่ใช่ bug)

### 2.2 `/repair/history` — ผ่านเชิงสิทธิ์, พบ F5-1

หน้าแสดง gate 403 ของ role Viewer ถูกต้อง (หัวเรื่อง + คำอธิบาย + ปุ่มกลับหน้าแรก/ย้อนกลับ)
แต่ยังยิงคำขอต่อไปถึง 2 ตัว ทั้งที่รู้ว่าบทบาทนี้ไม่มีสิทธิ์:

```
403 GET /api/v1/settings.php
403 GET /api/v1/repair.php?status=completed_all
```

→ เกิด console error 2 รายการ (เบราว์เซอร์ฟ้อง `Failed to load resource: 403`)

### 2.3 `/repair/view` — พบ F5-2 (สำคัญกว่า)

เปิดโดยไม่มี `?id=` แล้วหน้า**ไม่แจ้งว่าต้องเลือกใบงาน** แต่ยิงคำขอด้วย `id=1`:

```
403 GET /api/v1/settings.php
403 GET /api/v1/repair.php?id=1
403 GET /api/v1/repair.php?activity=1&id=1
403 GET /api/v1/repair_attachment.php?work_order_id=1
```

ต้นเหตุอยู่ในโค้ด (ยืนยันด้วยการอ่านไฟล์):

`frontend/app/(dashboard)/repair/view/page.tsx:346`
```ts
const idParam = params.get("id") || "1";
```

ผลที่วัดได้: หน้าแสดง shell ของรายละเอียดใบงานแต่ทุกช่องเป็น `—`
(ความเร่งด่วน —, ผู้แจ้ง -, ผู้รับผิดชอบ -, วันที่แจ้ง -, Downtime —, ค่าใช้จ่ายรวม ฿0)

## 3. Findings

| ID | หน้า | ระดับ | อาการ | หลักฐาน | ต้องอนุมัติ? |
|---|---|---|---|---|---|
| F5-1 | `/repair/history` | LOW | บทบาทที่ไม่มีสิทธิ์ยังยิง `settings.php` + `repair.php?status=completed_all` → console error 2 รายการ | §2.2 | ใช่ (แตะลำดับการโหลด state) |
| F5-2 | `/repair/view` | MEDIUM | ไม่มี `?id=` → fallback เป็น `id=1` แทนที่จะบอกให้เลือกใบงาน; ผู้ใช้ที่มีสิทธิ์จะเห็นข้อมูล**ใบงานอื่น**โดยไม่รู้ตัว | §2.3 + `page.tsx:346` | ใช่ (เปลี่ยนพฤติกรรมเริ่มต้น) |

### เหตุผลที่ยังไม่แก้ในรอบนี้

กฎโครงการ (AGENTS.md — UI Migration Rules) ห้ามแก้ logic/state/validation/permission
และการเปลี่ยนค่า default ของ `id` เปลี่ยนพฤติกรรมของหน้าโดยตรง จึงต้องอนุมัติก่อน
ข้อเสนอ:
- **F5-2:** ถ้าไม่มี `id` → แสดง empty state "เลือกใบงานจากรายการ" + ปุ่มไป `/repair` (ไม่ยิง API)
- **F5-1:** เมื่อ gate 403 แสดงแล้ว ให้ข้ามการโหลดข้อมูล (ลด 2 คำขอที่รู้ผลล่วงหน้า)

## 4. สิ่งที่ยังไม่ได้ตรวจ

- `/repair/history` และ `/repair/view` ด้วยบัญชีที่มีสิทธิ์จริง (role 1/2/6/7) — บัญชี e2e ที่มีรหัสผ่านใช้ได้เฉพาะ `e2e_viewer`
  → ยังไม่ยืนยันว่าตาราง/รายละเอียดแสดงข้อมูลถูกต้องเมื่อมีสิทธิ์ (ตัว 403 ยืนยันได้แค่ว่า server ปฏิเสธถูกต้อง)
- `/repair/view` ที่มี `?id=` ของใบงานจริง (105 ใบ) — ไม่ได้เปิดดู
- การให้คะแนน (`RepairRating`) บน `/my-repairs` — ต้องมีงานสถานะ completed ของผู้ใช้เอง ซึ่งบัญชีทดสอบไม่มี
- Visual diff / screenshot — ไม่ได้เก็บภาพในรอบนี้ (เก็บเฉพาะค่าที่วัดได้)

## 5. สรุปสถานะ Phase 5 checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] ตรวจ my-repairs/history/detail` | **ตรวจแล้วบางส่วน** — `/my-repairs` PASS; `/repair/history` + `/repair/view` ตรวจได้เฉพาะเส้นทาง 403 (F5-1, F5-2) |
| `[ ] notification ตาม workflow (ตรวจของเดิม)` | ยังไม่ตรวจ |
