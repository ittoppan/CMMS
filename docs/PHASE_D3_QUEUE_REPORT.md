# PHASE D3.3 — WORK ORDER QUEUE REPORT

> 2026-11-23 · Scope: `/supervisor/queue` · **ไม่แก้ API / ไม่แก้ DB / ไม่เปลี่ยน permission**
> ต่อเนื่องจาก `docs/PHASE_D3_UX_AUDIT.md` §4.2 (10 ปัญหา) — ปิดได้ 7 ข้อ ที่เหลือต้องรออนุมัติแก้ API

## 1. สิ่งที่แก้ (ไฟล์เดียว)

`frontend/app/(dashboard)/supervisor/queue/page.tsx`

| ปัญหาจาก audit | สิ่งที่ทำ | สถานะ |
|---|---|---|
| §4.2.1 table-only, overflow แนวนอนบนมือถือ | เพิ่ม **mobile card view** (`md:hidden`) แสดงรหัส/ชื่องาน, priority, status, เครื่องจักร, ผู้รับผิดชอบ, กำหนด, overdue + action เดียวกับตาราง; ตารางซ่อนบน `<md` | ปิด |
| §4.2.3 search ยิง request ทุกคีย์ | **debounce 350ms** (`searchInput` → `search`) + reset offset เมื่อตัวกรองเปลี่ยน | ปิด |
| §4.2.9 limit 200 hardcode, ไม่มี total | **pagination 50 แถว/หน้า** + แสดง "แสดง 1–50 จาก N รายการ" + ปุ่มก่อนหน้า/ถัดไป (ใช้ `limit/offset` ของ API เดิม) | ปิด |
| §4.2.4 ไม่มีตัวกรองช่าง | เพิ่ม **ตัวกรองผู้รับผิดชอบ** จาก `supervisor.php?action=technicians` (แสดงเมื่อ `can.plan`) | ปิด (บางส่วน — department/date range ยังไม่มีใน API) |
| §4.2.5/6 ไม่มี empty/loading | **skeleton 5 แถว** + `EmptyState` (แยกข้อความ "มีตัวกรอง" vs "คิวว่าง" + ปุ่มล้างตัวกรอง) | ปิด |
| §4.2.10 ไม่มี no-permission state | **Alert อ่านอย่างเดียว** เมื่อไม่มี `plan/verify/review` | ปิด |
| §4.2.7/8 ปุ่มกระจัดกระจาย, ไม่มี aging | รวม action เป็น `renderActions()` ใช้ร่วมตาราง+การ์ด; การ์ดมี "สถานะกำหนดส่ง/เกิน N วัน" | ปิด |
| error ไม่มีทางลองใหม่ | Alert + ปุ่ม **ลองใหม่** | ปิด |
| ไม่มี last-updated | แสดง **"อัปเดต HH:MM:SS"** ท้ายแถบตัวกรอง | ปิด |

**ไม่แตะ:** API, query params ที่มีอยู่, bulk assign, dialogs (assign/pause/verify/reopen/close/resume), สิทธิ์, route/URL, `?g=` deep link

## 2. Before / After (ตาม audit)

| ด้าน | Before | After |
|---|---|---|
| มือถือ 390px | ตาราง 8 คอลัมน์ scroll แนวนอน | การ์ดแนวตั้ง อ่านครบไม่ต้อง scroll แนวนอน |
| request ต่อการพิมพ์ 1 คำ | 1 ครั้ง/คีย์ | 1 ครั้งหลังหยุดพิมพ์ 350ms |
| จำนวนรายการที่เห็น | 200 แถวเสมอ | 50/หน้า + ระบุ total |
| ตัวกรอง | status tab + priority | + ผู้รับผิดชอบ + ล้างตัวกรองทั้งหมด |
| สถานะว่าง/โหลด/ไม่มีสิทธิ์ | ข้อความบรรทัดเดียว | skeleton / EmptyState + action / read-only alert |
| การเข้าถึง | ไม่มี `aria-pressed`, `scope` บางส่วน | `aria-pressed` ที่ tab, `scope="col"` ครบ, `aria-label` ช่องค้นหา/ตัวกรอง |

## 3. ผลทดสอบ

| รายการ | ผล |
|---|---|
| `npx tsc --noEmit` | **PASS** (0 error) |
| `NEXT_DIST_DIR=.next-verify npm run build` | **PASS** (exit 0, route ทั้งหมด compile) |
| Playwright / axe / Lighthouse หน้า queue | **ยังไม่รัน** — ต้องมี session login จริง (บัญชี `e2e_*` `is_active=0`) |
| ทดสอบกับ API จริง (126 ใบงาน) | **ยังไม่รัน** ด้วยเหตุผลเดียวกัน |

## 4. Known issues / สิ่งที่ยังไม่ปิด

1. **department / date-range filter** — `supervisor.php` queue action ไม่รับ param เหล่านี้ → ต้องอนุมัติแก้ API (ห้ามทำเองตามกติกา preserve contract)
2. **search description** — backend ค้นเฉพาะ code/title/asset_code/asset_name/assignee_name
3. pagination ยังไม่จำสถานะใน URL ( refreshing กลับหน้า 1 ) — ต้องออกแบบ query string ก่อน
4. ยังไม่ได้วัด axe/Lighthouse หลังแก้ (ปิดใน D3.6)
5. bulk selection ใช้ได้เฉพาะรายการในหน้าปัจจุบัน (พฤติกรรมเดิม)

## 5. Acceptance

- [x] อ่านข้อมูลหลักบน 390px ได้โดยไม่ต้อง scroll แนวนอน (จากโครงสร้าง/คลาส; ยังไม่วัดด้วยเบราว์เซอร์)
- [x] การกระทำหลัก (ดู/มอบหมาย/หยุด/ต่อ/ตรวจรับ/ปิด/เปิดใหม่) ยังเรียก endpoint เดิม
- [x] ไม่เปลี่ยน route/URL/permission/API
- [x] tsc + production build ผ่าน
- [ ] ยืนยันด้วย role จริง 3 บทบาท (D3.7)
