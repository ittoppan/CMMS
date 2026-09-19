# PHASE 24 — Mobile Field Workflow + In-app QR/Barcode Scan

> วันที่: 2026-09-18 · ส่วนเกี่ยวข้อง: Mobile Field Workflow สำหรับช่างหน้างาน

## เป้าหมาย
ให้ช่าง/พนักงานใช้โทรศัพท์สแกน QR/บาร์โค้ดของเครื่องจักรได้ **ในแอป CMMS เอง** (ไม่ต้องมีกล้อง/LINE แยก)
แล้วดูสถานะ → เปิดโหมดทำงาน → เริ่ม / หยุดพัก / ปิดงาน → แนบรูปหลักฐานได้ทันที แม้ไม่มีสัญญาณ (offline)

## สรุปงานที่ทำ

### 1. Backend — QR payload + resolver + audit
- ตารางใหม่: `scan_events` (ประวัติการสแกน), `qr_print_log` (ประวัติพิมพ์ฉลาก)
- คอลัมน์ใหม่: `asset_registry.qr_token` (opaque 16-hex) + unique index `uq_asset_qr_token`
- `src/helpers/scan.php`:
  - `scan_extract` / `scan_parse`/`scan_asset_payload`/`scan_ensure_asset_token` — แยก/สร้าง payload
  - `scan_resolve` + `scan_resolve_asset/work_order/pm/spare` — resolve พร้อมตรวจสิทธิ์
  - `scan_log_event` / `scan_recent` / `scan_purge_old` — audit + retention 180 วัน
- `public/api/v1/scan.php`:
  - `GET ?code=...` → resolve + log
  - `GET ?action=history` · `GET ?action=labels` (พิมพ์ฉลาก) · `GET ?action=resolve`
  - `POST ?action=report_unknown` · `POST ?action=print_log` · `POST ?action=purge` (admin)
- ขั้นตอนย้ายข้อมูล: `database/migration_20260918_phase24_field_qr.sql` + `scripts/apply_phase24_field_qr.php`
  → รันสำเร็จ **QR token backfill 55/55** เครื่อง

### 2. Frontend — คอมโพเนนต์สแกนในแอป
- `frontend/components/field/QrScanner.tsx` — กล้องเต็มจอ (@zxing/browser) + เปิดไฟฉาย + กรอกมือเอง (fallback)
- เปิดผ่าน `Permissions-Policy: camera=(self)` ใน `frontend/next.config.ts`
- dependency ใหม่: `@zxing/browser` ^0.1.5, `@zxing/library` ^0.21.3

### 3. หน้า /scan (รีไรต์)
- สแกนได้ทั้ง QR payload `CMMS-A-<token>` และบาร์โค้ด code ตรง ๆ / legacy `?asset_code=`
- Render ผลลัพธ์ 5 แบบ: asset / work_order / pm / spare / unknown (+ report_unknown)
- เก็บ deep-link เดิม (`?asset_code=`) และ LIFF shell (LiffBridge, LiffLangToggle)

### 4. โหมดภาคสนาม
- `/field` — หน้าแรกของช่าง: ปุ่มสแกนใหญ่, งานที่มอบหมาย (dashboard `overview.my_requests`),
  PM เกินกำหนด (`action=pm&group=overdue`), สแกนล่าสุด (`scan.php?action=history`), ชิปออนไลน์
- `/field/work/[id]` — โหมดทำงาน:
  - รับงาน / เริ่มงาน / หยุดพัก (เหตุผล) / กลับมาทำ / ปิดงาน (บังคับ contaminate_checking)
  - บันทึกการวินิจฉัย (diagnosis / root_cause / solution)
  - แนบรูปก่อน/หลังซ่อม (บีบอัด + offline queue + idempotent upload)
  - ทุก mutation ผ่าน `sendOrEnqueue` → ทำงาน offline ได้

### 5. ฉลาก QR (`/qr-sheet`)
- เปลี่ยนมาใช้ payload `CMMS-A-<token>` จาก `scan.php?action=labels`
- กดพิมพ์ครั้งแรก → บันทึก `qr_print_log` ทุกเครื่อง

### 6. เมนูและ i18n
- เพิ่มลิงก์ `โหมดภาคสนาม` (`/field`) ใน sidebar + bottom nav (Technician อยู่ลำดับ 2)
- เพิ่ม `menu.field_work` ใน `lib/i18n.ts`

## API Contract (ย่อ)
| Endpoint | Method | ใช้สำหรับ |
|---|---|---|
| `/api/v1/scan.php?code=` | GET | resolve รหัสที่สแกน + log |
| `/api/v1/scan.php?action=history` | GET | ประวัติสแกนของผู้ใช้ |
| `/api/v1/scan.php?action=labels` | GET | รายการเครื่อง + payload สำหรับพิมพ์ฉลาก |
| `/api/v1/scan.php?action=report_unknown` | POST | แจ้งรหัสที่ไม่รู้จัก |
| `/api/v1/scan.php?action=print_log` | POST | บันทึกการพิมพ์ฉลาก |
| `/api/v1/scan.php?action=purge` | POST | ลบ scan_events เก่า (admin) |

## ข้อจำกัด / หมายเหตุ
- **กล้องต้องใช้ secure context**: บน HTTP (IP LAN ธรรมดา) เบราว์เซอร์บล็อกกล้องทุกกรณี —
  ในโรงงานต้องใช้ HTTPS (ติดตั้ง certificate) หรือ PWA ที่ประกาศใช้กล้อง
- payload QR เป็นแค่ตัวชี้ (untrusted) ไม่ใช่ auth — resolver ตรวจสิทธิ์ทุกครั้ง
- `scan_events` เก็บ retention 180 วัน (ลบได้ด้วย `action=purge`)

## ยังไม่ได้ทำ (นอกขอบรอบนี้)
- ปริ้นต์ฉลาก 1:1 แยกต่อเครื่อง ป้ายแบบ Brother/Zebra (ต่อยอดจาก `print_log`/`labels`)
- ต่อ spare part / issue center ลงในโหมดทำงานของช่าง (Phase 25)
- weatherproof label / تعيينตำแหน่ง floor_x/y บนฉลาก

## ตรวจสอบ
- `php -l` ผ่านทุกไฟล์ PHP ใหม่/แก้
- `npm run typecheck` ผ่าน
- `next build` ผ่าน (routes `/field`, `/field/work/[id]`, `/scan`, `/qr-sheet`)
- resolver ทดสอบด้วย CLI script: token / code / legacy URL / `CMMS-W-` / `CMMS-P-` / `CMMS-S-` / garbage