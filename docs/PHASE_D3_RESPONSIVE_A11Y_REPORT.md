# PHASE D3.5 / D3.6 — Responsive + Accessibility Verification

> วันที่วัด: 2026-11-23 · ผู้วัด: agent (Playwright + axe-core) · commit ฐาน: `0664c1e3` + งานรอบนี้
> ขอบเขต: `/supervisor`, `/supervisor/queue`, `/repair/view?id=2061` (open), `/repair/view?id=2059` (completed)

## 1. วิธีวัด (ทำซ้ำได้)

- build จากซอร์ส HEAD ด้วย `NEXT_DIST_DIR=.next-verify npm run build` (ไม่แตะ `.next` ของ production)
- เสิร์ฟ build นั้นด้วย `NEXT_DIST_DIR=.next-verify npx next start -p 3003`
- login ด้วยบัญชีทดสอบที่มีอยู่จริง `e2e_manager` (role 2, `is_active=1`) — ไม่ได้สร้าง/แก้ผู้ใช้
- viewport 3 ขนาด: 1440×900, 768×1024, 390×844
- วัด `document.documentElement.scrollWidth` เทียบ `clientWidth` (+1px เผื่อ sub-pixel) และหา element ที่ `getBoundingClientRect().right > clientWidth`
- นับ `<h1>` ต่อหน้า (สัญญา "หนึ่ง h1 ต่อหน้า")
- axe-core ผ่าน `@axe-core/playwright` ด้วย tag `wcag2a, wcag2aa, wcag21a, wcag21aa`
- เก็บ console error/pageerror ระหว่างทาง (401/403 ที่คาดไว้ถูกตัดออก)

คำสั่งที่ใช้ (สคริปต์ชั่วคราว ไม่ได้ commit):

```bash
cd frontend
NEXT_DIST_DIR=.next-verify npm run build
NEXT_DIST_DIR=.next-verify npx next start -p 3003
node tmp-d3-axe.mjs           # 12 เคส = 4 route × 3 viewport
```

## 2. ผลก่อนแก้ (baseline ของรอบนี้)

| หน้า | 1440 overflow | 768 overflow | 390 overflow | Critical | Serious |
|---|---|---|---|---|---|
| `/supervisor` | ไม่มี | ไม่มี | ไม่มี | 0 | 2 (1440) / 1 (768, 390) |
| `/supervisor/queue` | ไม่มี | **มีในตาราง** (table 1110px, กระดานเลื่อนในกรอบ) | ไม่มี | 0 | 1 |
| `/repair/view` (open/completed) | ไม่มี | ไม่มี | ไม่มี | 0 | 1 |

รายละเอียดที่ axe จับได้:

1. `color-contrast` — `--cmms-text-muted` (#64748b) บนพื้นหน้า #f5f7fa/​#f6f8fb = **4.43:1** (ต้อง ≥ 4.5) พบในหน้า supervisor และ queue (ข้อความ "อัปเดตเมื่อ …", "ซ่อนวิธีใช้", "ข้อมูลจาก: …", "ใช้คู่กับ")
2. `color-contrast` — เอกสารปิดงาน `WorkOrderClosureDocument.tsx`: `#16A34A` บน #f8fafc = 3.14:1, `#DC2626` บน #fef2f2 = 4.41:1, `#64748B` บนพื้น #cbd5e1 = 3.20:1
3. `label-content-name-mismatch` — ปุ่มใน header 3 ปุ่ม: ปุ่ม ⌘K, ปุ่มแจ้งเตือน, ปุ่มสลับภาษา EN (accessible name ไม่มีข้อความที่มองเห็น)

## 3. สิ่งที่แก้ (แก้ที่ต้นเหตุ)

| ไฟล์ | การแก้ | เหตุผล |
|---|---|---|
| `frontend/app/globals.css` | `--color-text-muted` #64748B → **#5B6B80** และ `--cmms-text-muted` (blk. refreshed) #64748b → **#5b6b80** | 4.43:1 → ~4.8:1 บนพื้นหน้า, ~5.2:1 บนการ์ดขาว — แก้ token เดียว ครอบทุกหน้าที่ใช้ `var(--cmms-text-muted)` |
| `frontend/components/WorkOrderClosureDocument.tsx` | เขียว #16A34A → **#15803D**, แดง #DC2626 → **#B91C1C**, ตัวอักษรบนพื้น #CBD5E1 #64748B → **#475569** | ผ่าน AA โดยไม่เปลี่ยนความหมายสี |
| `frontend/components/dashboard/sidebar-nav.tsx` | `aria-label` ปุ่ม ⌘K → `"เปิดค้นหาทั่วทั้งแอป ⌘K (Ctrl+K)"` | axe ตัดวงเล็บก่อนเทียบ token; ต้องมี "⌘K" อยู่นอกวงเล็บ |
| `frontend/components/NotificationBell.tsx` | `aria-label` → `การแจ้งเตือน — N รายการที่ยังไม่อ่าน` (เฉพาะเมื่อมี unread) | ตัวเลขบน badge ต้องอยู่ในชื่อ accessible |
| `frontend/app/(dashboard)/layout.tsx` | `aria-label` ปุ่มภาษา → `"EN · Switch to English"` / `"TH · สลับเป็นภาษาไทย"` | ข้อความ EN/TH ที่มองเห็นต้องอยู่ในชื่อ |
| `frontend/app/(dashboard)/supervisor/queue/page.tsx` | ตาราง `md:block` → **`lg:block`**, การ์ด `md:hidden` → **`lg:hidden`** | ที่ 768 ตารางกว้าง 1110px ต้องเลื่อนในกรอบ → ให้แท็บเล็ตใช้การ์ดแทน (≥1024 ค่อยเป็นตาราง) |

ไม่มีการเปลี่ยน query/API/permission/route/สูตร KPI ใด ๆ — เป็น CSS token, inline style colour, `aria-label` และ breakpoint ของ markup เท่านั้น

## 4. ผลหลังแก้ (หลักฐาน)

| หน้า | 1440 | 768 | 390 | Critical | Serious |
|---|---|---|---|---|---|
| `/supervisor` | overflow 1440/1440 | 768/768 | 390/390 | **0** | **0** |
| `/supervisor/queue` | 1440/1440 | 768/768 | 390/390 | **0** | **0** |
| `/repair/view?id=2061` | 1440/1440 | 768/768 | 390/390 | **0** | **0** |
| `/repair/view?id=2059` | 1440/1440 | 768/768 | 390/390 | **0** | **0** |

- ทุกหน้า: `h1 = 1`, ไม่มี console error/pageerror
- 12/12 เคส (4 หน้า × 3 viewport) ไม่มี horizontal overflow ระดับหน้า และ axe ไม่พบ Critical/Serious
- ผล JSON ดิบเก็บไว้ที่ log ของรอบวัด (`/tmp/d3-axe-final2.log` บนเครื่องที่รัน) — ไม่ commit

## 5. Typecheck / Build

- `cd frontend && npx tsc --noEmit` → exit 0
- `NEXT_DIST_DIR=.next-verify npm run build` → exit 0, `✓ Compiled successfully in 18.0s`, 249/249 pages

## 6. สิ่งที่ยังไม่ได้ตรวจ (Known issues)

- **D3.7 role E2E (User/Operate/Foreman)** ยังไม่ทำ — รอบนี้ใช้ `e2e_manager` เพื่อเข้าถึงได้ทั้ง 3 หน้า
- **โหมดมืด** ไม่ได้วัด contrast (axe รอบนี้รันที่ธีมสว่างค่าเริ่มต้น)
- **Lighthouse** ไม่ได้วัดใหม่ (ใช้ baseline เดิมของ Phase 0)
- ไม่ได้เก็บภาพหน้าจอ before/after — หลักฐานเป็นตัวเลขที่วัดจาก DOM
- ปุ่ม/ลิงก์ยังไม่ได้กดทดสอบด้วยมือ (ไม่ใช่ axe scan เต็มรูปแบบ)
- `--cmms-text-muted` ในธีมมืดยังไม่มีค่าทับเฉพาะ (ค่าที่แก้เป็นค่าเดียวใช้ทั้งสองธีม) — ควรกำหนดค่า dark แยกใน Phase 2/3
