# Phase 11 (ต่อ) — ตรวจ guard ของ 6 endpoint ที่เอกสารอ้างว่า "ไม่มี guard"

> วันที่: 2026-11-23 · ปิดช่อง A2 ใน `MASTER_API_INVENTORY.md` §5 (ตรวจซ้ำ ห้ามเดา)
> วิธี: อ่านโค้ดจริงทั้งไฟล์ (ไม่ใช่ grep บรรทัดแรก)

## ผล (6 endpoint)

| endpoint | guard จริง |  verdict |
|---|---|---|
| `csrf.php` | ไม่มี requireLogin (by design — คืน token ของ session ที่มีอยู่; `csrfToken()` start session เอง) | ✔ by design |
| `feedback.php` | `session_start()` + `requireLogin($pdo, false)` (line 18-21) | ⚠ **เอกสารอ้างว่า "ไม่มี guard" แต่มีจริง** → แก้ inventory |
| `iot_ingest.php` | token-based (`iot_source_authenticate`, Bearer/env) | ✔ by design |
| `line_webhook.php` | HMAC signature (`X-LINE-Signature` + channel secret) | ✔ by design |
| `spare_image.php` | ไม่มี session guard; rate limit 120/IP/นาที (`iot_rate_check`); serve รูป/placeholder | ✔ by design (LINE Flex ต้อง public URL) แต่ placeholder พิมพ์ code+name ของอะไหล่ |
| `user_lookup.php` | ไม่มี session guard; rate limit 30/IP + 10/code ต่อนาที; คืนเฉพาะ full_name/employee_code/position/department/avatar | ✔ by design (register flow) — enumeration ถูกลดด้วย rate limit |

## Finding

- **G11-1 (LOW/เอกสาร) — `MASTER_API_INVENTORY.md` §5 อ้างว่า `feedback.php` "ไม่มี guard" แต่โค้ดมี `requireLogin($pdo, false)`** → แก้ inventory (ทำแล้ว) เพื่อไม่ให้ security review หลง
- **G11-2 (LOW/info) — `spare_image.php` placeholder พิมพ์ `code` + `name` ของอะไหล่บน PNG ที่ public URL** → ข้อมูล inventories (รหัส+ชื่ออะไหล่) เปิดเผยแก่ผู้ที่รู้ URL; ยอมรับได้สำหรับ LINE Flex card แต่ถ้าต้องการซ่อนให้ปิด name บน placeholder (แตะ UI/PHP = ต้องอนุมัติ)
- **G11-3 (LOW/info) — `user_lookup.php` คืน `full_name` + `department` + `position` สำหรับทุก employee code ที่ valid (rate-limited 10/code/นาที)** → enumeration ของชื่อพนักงานยังเป็นไปได้ช้า ๆ; by design สำหรับ register flow; ถ้าต้องการลดให้คืนเฉพาะ avatar_path (ต้องอนุมัติ)

## สรุป

6 endpoint ที่ "ไม่มี guard" ตามเอกสาร — **มี alternative control ทุกตัว** (rate limit / token / HMAC) ยกเว้น `feedback.php` ที่มี requireLogin จริง → ไม่พบช่องโหว่ใหม่ แต่แก้ความถูกต้องของเอกสารแล้ว
EOF
echo written