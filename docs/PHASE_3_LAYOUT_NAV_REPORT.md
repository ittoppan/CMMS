# PHASE 3 — Global Layout & Navigation (verification report)

> วันที่วัด: 2026-11-23 · build จาก HEAD `d6f19ef7` (`.next-verify`, เสิร์ฟที่ :3003)
> บัญชี: `e2e_*` 9 บทบาท (admin, manager, operate, viewer, asstmanager, foreman, officer, user, officer_read) — ไม่ได้แก้สิทธิ์ใด ๆ
> วิธี: Playwright + DOM/API observation (GET เท่านั้น)

## 1. Mobile bottom navigation ที่ 390px — **PASS**

วัดจาก `nav.cmms-mobile-bottom-nav` หลัง login เป็น `e2e_manager` ที่ viewport 390×844 (hasTouch, isMobile)

| รายการ | ค่าที่วัดได้ | เกณฑ์ |
|---|---|---|
| จำนวนปุ่ม | **6** (หน้าแรก, เช็คชีตตามแผน, แผน PM, สแกน, งานของฉัน, เครื่องจักร) | 4–6 ( tracker เดิมเขียน 5 — ของจริงเป็น 6 ตาม role) |
| ขนาดปุ่มเล็กสุด | **59×65 px** | ≥ 44×44 |
| ความสูงแถบ | 60 px | — |
| padding ล่างของเนื้อหา | **96 px** (`pb-24`) | ≥ ความสูงแถบ → ไม่มีเนื้อหาถูกบัง |
| horizontal overflow | **0 px** | 0 |

## 2. Keyboard navigation — **PASS**

| การทดสอบ | ผล |
|---|---|
| Tab แรกของหน้า | โฟกัส "ข้ามไปยังเนื้อหา" (`#cmms-main-scroll`) — skip link ทำงาน |
| กด Enter บน skip link | focus ย้ายไป `<main>` และ URL hash = `#cmms-main-scroll` |
| focus ring 8 จุดแรก | outline **2–3px solid** ทุกจุด (มองเห็นได้ชัด) |
| Ctrl+K | เปิด command palette (`130 รายการ`), input ได้ focus อัตโนมัติ |
| พิมพ์ "supervisor" | กรองเหลือ 5 รายการ (คิวงานหัวหน้างาน/คิวงานทั้งหมด/ทบทวนคำขอ/…) |
| Escape | ปิด palette |

## 3. Role menu vs permission — **PASS (มี finding 1 ข้อ)**

 způsob: ดึงแผนสิทธิ์จริงจาก `GET /api/v1/menu_permissions.php?user=<id>` (แหล่งที่มีผลจริง) แล้วเทียบกับลิงก์ที่แสดงใน sidebar หลังเปิดทุกกลุ่ม + "แสดงเพิ่มเติม"

| บทบาท | keys ที่ API คืน | denied | ลิงก์ที่เก็บได้ | ลิงก์ที่ควรมี (granted) | แสดงทั้งที่ denied |
|---|---:|---:|---:|---:|---|
| 1 Admin | 185 | 0 | 122 | 141 | 0 |
| 2 Manager | 185 | 8 | 109 | 128 | 0 |
| 3 Operate | 165 | 126 | 16 | 19 | **1 (`/dashboard`)** |
| 5 Viewer | 162 | 137 | 9 | 11 | 0 |
| 6 Asst.Manager | 184 | 14 | 108 | 127 | 0 |
| 7 Foreman | 170 | 103 | 29 | 41 | **1 (`/dashboard`)** |
| 8 Officer | 147 | 96 | 42 | 44 | 0 |
| 9 User | 148 | 138 | 8 | 8 | **1 (`/dashboard`)** |
| 10 Officer-Read | 147 | 96 | 42 | 44 | 0 |

- **ไม่พบเมนูที่ไม่มีสิทธิ์ถูกแสดงเลย นอกจากรายการเดียว: `/dashboard`**
- ตัวเลข "ลิงก์ที่ควรมี" มากกว่าที่เก็บได้ เพราะ sidebar เป็น **single-open accordion** (เปิดกลุ่มหนึ่งจะปิดกลุ่มอื่น, `openKey`) และมีปุ่ม "แสดงเพิ่มเติม" ต่อกลุ่มสำหรับ 78 รายการ `secondary: true` → การ crawl อัตโนมัติเก็บได้ไม่ครบ 100% (เช่น admin 122/141) จึง **ยังไม่ยืนยันความเท่ากันแบบ exhaustively** — สิ่งที่ยืนยันได้คือ "ไม่มีรายการที่ไม่ได้ grant ถูกแสดง" (ยกเว้น /dashboard)

### Finding

| # | ระดับ | เรื่อง | หลักฐาน |
|---|---|---|---|
| N1 | M | ลิงก์ `/dashboard` แสดงใน sidebar ของ role 3/7/9 ขณะที่แผนสิทธิ์ตอบ `dashboard = 0` ให้บทบาทนั้น และ route guard ก็ปล่อยให้เข้าหน้านี้ได้ (role 3 landing ที่ /dashboard) | ต้องตัดสินใจว่า key `dashboard` หมายถึง "โมดูล Dashboard" หรือ "หน้าแรก" — ถ้าหมายถึงหน้าแรก ควรแก้ข้อมูลสิทธิ์/ตัวกรอง; **ยังไม่แก้เพราะเป็นการเปลี่ยนสิทธิ์** |
| N2 | M | เมนู "แวบ" แสดงทั้งหมดก่อนสิทธิ์โหลดเสร็จ: `useMenuPermission` ตั้ง `canShowAll = true` เป็นค่าเริ่มต้น แล้ว `canShow` คืน true จนกว่า `permission` จะมา (`lib/useMenuPermission.ts:20, 97-99`) | ผู้ใช้ role ต่ำอาจเห็นเมนูที่ไม่มีสิทธิ์ชั่วขณะ (คลิกแล้วจะโดน 403) — ควรเปลี่ยนเป็น skeleton/deny-by-default หลังโหลด role |
| N3 | L | `GET /api/v1/menu_permissions.php` ไม่มี `?user=` ตอบ **403** (ฝั่ง UI ส่ง `?user=` เสมอ) | ไม่กระทบผู้ใช้ แต่ทำให้ endpoint ใช้เดี่ยว ๆ ไม่ได้ — ควรระบุใน API doc |

## 4. สิ่งที่ยังไม่ได้ตรวจ

- ไม่ได้กดทุกเมนูเพื่อยืนยัน route guard ทีละเส้น (141 เส้น × 9 roles) — ใช้ `route-perms.ts` + ตัวอย่างจาก D3.7 แทน
- ไม่ได้ทดสอบ keyboard บน Safari/Firefox และไม่ได้ทดสอบ screen reader จริง
- ไม่ได้วัด dark mode (ยังไม่มี token ธีมมืดใน `globals.css` — ดู `DESIGN_TOKENS.md` §6)
- ไม่ได้ทดสอบ notification bell / avatar menu ด้วยคีย์บอร์ด (วัดเฉพาะเส้นทางหลัก)

## 5. คำสั่งที่ใช้ซ้ำ

```bash
cd frontend
NEXT_DIST_DIR=.next-verify npm run build
NEXT_DIST_DIR=.next-verify npx next start -p 3003
# สคริปต์ชั่วคราว (ไม่ commit): tmp-p3-menu-api.mjs, tmp-p3-final.mjs, tmp-p3-grants.php
```
