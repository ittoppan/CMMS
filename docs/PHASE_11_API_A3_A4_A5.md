# Phase 11 (ต่อ) — ตรวจสอบ A3 / A4 / A5 จาก `MASTER_API_INVENTORY.md` §6

> วันที่: 2026-11-23 · ปิดช่อง A3/A4/A5 (ตรวจซ้ำ ห้ามเดา)
> วิธี: grep/call-site จริง + อ่านโค้ด endpoint

## A3 — `index.php` เป็น endpoint แปลก (ไม่ใช่ API จริง)?

**ผล: ไม่ใช่ endpoint แปลก — เป็น resource router ที่ใช้จริง**

- `/api/v1/index.php?resource=...` ถูกเรียกจาก UI จริงในหลายหน้า:
  - `frontend/app/(dashboard)/analytics/page.tsx` → `resource=assets`, `resource=pm-plans`
  - `frontend/app/(dashboard)/assets/page.tsx` → `resource=assets`
  - `frontend/app/(dashboard)/asset_registry/bom_tree/page.tsx` → `resource=spare-parts`
  - `frontend/app/(dashboard)/asset_registry/criticality/page.tsx` → `resource=assets`
  - `frontend/app/(dashboard)/asset_registry/view/page.tsx` → `resource=users`, `resource=pm-plans`
- สรุป: `index.php` เป็น gateway ที่ dispatch ไปยัง resource ต่าง ๆ — ไม่ใช่ endpoint แปลก ไม่ต้อง retire
- แก้ inventory A3: เปลี่ยนสถานะจาก "Low" → "verified (used in production UI)"

## A4 — `spare_parts.php` list ส่ง ~1MB (ต้อง pagination ฝั่ง server)

**ผล: pagination มีแล้วฝั่ง server; การใช้งานฝั่ง client ไม่สม่ำเสมอ**

- Server (`public/api/v1/spare_parts.php`): รองรับ `limit`/`page`/`offset`/`sort`/`q`/`sage_category`/`stock_status`; default (ไม่ส่ง param) → คืน **ทั้งหมด** (ไม่ paginate)
- Client:
  - `spare_parts/page.tsx` (หน้าหลัก): ส่ง `limit`+`page` → paginate แล้ว ✔ (PAGE_SIZE=15)
  - `andon-board`, `balances`, `issue_center`, `onboarding`, `bom_tree`, `view` (asset_registry): เรียก `/api/v1/spare_parts.php` **โดยไม่ส่ง param** → คืนทั้งหมด (~1MB) ✘
- สรุป: A4 เป็นปัญหาจริง (payload ใหญ่) แต่แก้ได้ด้วยการเพิ่ม query param ฝั่ง client — เป็น performance fix ที่ **ต้องอนุมัติ** (เปลี่ยนพฤติกรรมการโหลดข้อมูล)
- ไม่แก้โค้ดในรอบนี้

## A5 — `approval.php` ใช้ token-based (email/LINE link)

**ผล: ยืนยันแล้ว — token-based + role check**

- `approval.php` line 17: `requireLogin($pdo)`
- line 89-108: รับ `token` (approve/reject) → hash sha256 → ค้นหา `approval_requests.approval_token` → `requireRole(canApproveType(...))` → `ApprovalService::processApproval`
- ยืนยันตามคำสั่งเดิม: คง token-based auth ไว้ ห้ามเปลี่ยน
- ไม่มี action ที่ต้องทำ

## สรุป

| # | เรื่อง | สถานะ |
|---|---|---|
| A3 | index.php แปลก | ❌ ไม่จริง — ใช้จริง (resource router) → แก้ inventory |
| A4 | spare_parts ~1MB | ✔ จริง — pagination มีฝั่ง server; client บางหน้าไม่ใช้ → ต้องอนุมัติเพื่อแก้ |
| A5 | approval token-based | ✔ ยืนยัน — คงไว้ตามคำสั่ง |
EOF
echo written