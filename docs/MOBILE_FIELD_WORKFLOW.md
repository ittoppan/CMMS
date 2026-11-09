# Mobile Field Workflow — คู่มือโหมดทำงานหน้างาน (Phase 24)

## ภาพรวมหน้า
| หน้า | เส้นทาง | หน้าที่ |
|---|---|---|
| หน้าแรกช่าง | `/field` | ปุ่มสแกน, งานที่มอบหมาย, PM เกินกำหนด, สแกนล่าสุด |
| หน้าสแกน | `/scan` | เปิดกล้องสแกน QR/บาร์โค้ด → การ์ดผลลัพธ์ |
| โหมดทำงาน | `/field/work/[id]` | รับ/เริ่ม/หยุด/ปิดงาน + วินิจฉัย + รูปหลักฐาน |

## โหมดทำงาน — สถานะและปุ่ม (ตามสถานะใบงาน)
| สถานะ | ปุ่มที่โชว์ |
|---|---|
| pending_approval / approved / assigned / open | รับงาน |
| accepted / assigned / open / approved | เริ่มงาน |
| in_progress | หยุดพัก · ปิดงาน |
| paused / waiting_parts / waiting_external | กลับมาทำ |
| completed / verified / closed / done / cancelled | (read-only — ส่งตรวจรับแล้ว) |

- **ปิดงานบังคับเลือก "ผลตรวจการปนเปื้อน"** (clean / contaminated / not_applicable) — ข้อกำหนดโรงงานอาหาร
  ตรงตามกฎเดียวกับ backend `supervisor.php` / `repair.php`
- พอปิดงาน → สถานะ `completed` (รอหัวหน้าตรวจรับ verify) — workflow เดิมไม่เปลี่ยน

## Offline (สำคัญ)
ทุกปุ่มข้างต้นส่งผ่าน `frontend/lib/field.ts` → `sendOrEnqueue` ของ Sync Engine:
- **ออนไลน์**: ส่งทันที + idempotency header `X-Client-Action-Id` (กันส่งซ้ำ)
- **ออฟไลน์**: เก็บเป็น action ใน IndexedDB `cmms-sync` → อัตโนมัติ sync เมื่อกลับมามีสัญญาณ
  - โชว์ "บันทึกในเครื่องแล้ว จะซิงก์เมื่อออนไลน์" + update สถานะท้องถิ่นแบบ optimistic
- รูปหลักฐาน: บีบอัด JPEG 1280@0.72 → เก็บ offline attachment → enqueue upload `repair_attachment.php`
  (จำกัด 60 รายการ / 120 MB)

## Conflict
ถ้าใบงานถูกแก้จากที่อื่นระหว่างออฟไลน์ → server คืน `409 CONFLICT` (เช็ค `base_updated_at`)
หน้าโหมดทำงานจะเตือน "โหลดข้อมูลล่าสุดก่อนบันทึก" — อย่าเขียนทับข้อมูลใหม่

## วิธีใช้หน้า /scan
1. กด "เปิดกล้องสแกน" (ถ้าขอสิทธิ์กล้อง ให้อนุญาต) หรือ "กรอกรหัสเครื่องจักร"
2. สแกนฉลากเครื่อง → เห็นการ์ดเครื่อง (สถานะ, Criticality, งานที่เปิดอยู่, PM ถึงกำหนด)
   หรือการ์ดใบงาน/PM/อะไหล่ ตาม payload ที่สแกน
3. กด "แจ้งซ่อมเครื่องนี้" / "ทำเช็คชีท PM" / "เปิดโหมดทำงาน" ต่อได้ทันที
4. รหัสที่ระบบไม่รู้จัก → "แจ้งผู้ดูแลระบบ" (เก็บ `scan_events` + audit ไว้งานดูข้อมูล)

## Troubleshooting
- **กล้องไม่เปิดบน LAN**: ใช้ HTTPS เท่านั้น (secure context) — ดู `QR_BARCODE.md`
- **ซิงก์ไม่ทัน**: เปิด `/sync-center` หรือกดชิปสถานะการเชื่อมต่อ
- **กดปุ่มแล้วค้าง**: เช็ค `cmms-sync` IndexedDB ที่ `/sync-center` มีงานค้างส่งหรือไม่