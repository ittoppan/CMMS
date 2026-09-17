# FUTURE BACKLOG — CMMS-TOPPAN

ไอเท็มที่รู้ว่าต้องทำแต่ยังไม่เดี๋ยว (จัดจาก review phase 17-20 + 21). ประเภทหมวด: `BUG / IMPROVEMENT / FEATURE / INTEGRATION / PERFORMANCE / UX`.
Priority: **HIGH/MED/LOW**.

> หลัก: ก่อนพัฒนา ต้อง categorize + รับ priority แล้วค่อยทำเป็น controlled release. ห้ามแก้ data ด้วยปุ่มมือใน staging จริง.

## BUG
| # | เรื่อง | Priority | หมายเหตุ |
|---|---|---|---|
| BUG-1 | `roles` id3 label "Operate" ≠ permission matrix "Technician" (UI แสดงชื่อผิด) | MED | แก้ label ในตาราง roles เท่านั้น (id 3 = Technician); เข้าถึงถูกอยู่แล้วตาม id |
| BUG-2 | `Sage300Service::logAudit` เขียน `audit_trail` legacy แทน `audit_logs` | MED | วิชาช้า auditing I-6; แก้ไปที่ service ของ audit ใหม่ |
| BUG-3 | FastCGI `stderrMode=ReturnStdErrIn500` ทำให้ PHP error (ที่ไม่ผ่าน helper) → 500 แทน JSON error | LOW | เบากับ I-2; รอ error log เก็บแล้วดู pattern จริง |

## IMPROVEMENT
| # | เรื่อง | Priority |
|---|---|---|
| IMP-1 | spare_parts list payload ~1MB → server-side pagination/filter (ตัดโหลด) | HIGH (I-1) |
| IMP-2 | pivot: upload limit mismatch (`post_max_size 32M` vs `upload_max_filesize 900M`) | MED (I-3) |
| IMP-3 | จัดการ `public/uploads` 66 ไฟล์ใน git ium กับ gitignore | LOW (I-7) |
| IMP-4 | auto-rotation ของ `logs/php-error.log` (scheduled /ขนาด) | MED (I-9) |

## FEATURE
| # | เรื่อง | Priority |
|---|---|---|
| FEAT-1 | การแจ้งเตือนแบบ Realtime/Push (Web Push เมื่อ PWA; ยังทดสอบได้เฉพาะอุปกรณ์ HTTPS) | HIGH (ต้อง TLS ก่อน) |
| FEAT-2 | มุมมอง "ของฉัน" แบบปรับเอง + แดชบอร์ดสำหรับ supervisor/managers | MED |
| FEAT-3 | workflow อะไหล่ตัดสต็อกอัตโนมัติกับ Sage (ตอนนี้ ตัดมือ + บันทึก doc #) | HIGH (ขึ้นอยู่กับ Sage scope) |
| FEAT-4 | การยอมรับ round-robin สำหรับ asset หลาย tags / scan QR ที่ฝั่ง PM | LOW |

## INTEGRATION
| # | เรื่อง | Priority |
|---|---|---|
| INT-1 | ยืนยัน DSN/Sage ที่ชี้ไป "ฝั่ง production" (ต้องยืนยันโดยผู้ตั้ง DSN — B-3) | HIGH |
| INT-2 | push รายงาน/PDF ไปยังช่องทาง LINE/Email ตาม role (จัด schedule ใช้ได้แล้ว ครึ่งทาง) | MED |
| INT-3 | SSO/SAML กับบัญชีองค์กร (ฝั่งอ้างอิง users) | LOW |

## PERFORMANCE
| # | เรื่อง | Priority |
|---|---|---|
| PERF-1 | เป็น modus: ด้วย recharts บน /dashboard & /analytics (dynamic import เฉพาะ report อยู่แล้ว) | MED |
| PERF-2 | ลดการเรียกรายงานหนักรายครั้ง (cache/denormalized บน report api) | MED |
| PERF-3 | ตั้ง load test จริง (ApacheBench) + บันทึกใหม่ใน PERFORMANCE_BASELINE | LOW-MED (ก่อนเปิดได้) |

## UX
| # | เรื่อง | Priority |
|---|---|---|
| UX-1 | TL;DR พอแล้ว: รูปแบบเช็กลิสต์ PM บนแท็บเล็ต (ใหญ่ขึ้น, ปุ่มนิ้ว) | MED |
| UX-2 | onboarding wizard ครั้งแรก (ตั้งรหัสใหม่) — ตอนนี้บัญชี admin ใช้ร่วม | MED |
| UX-3 | ทั้งหมด: ปุ่มกลับไปหน้าเดิม / breadcrumb ใน flow ยาว | LOW |

---
รีวิวบ่อยครั้ง (อย่างน้อยทุก 2 สัปดาห์เมื่อเปิดจริง) ย้าย item ที่มี priority เข้าสู่ sprint เฉพาะ โดยไม่ทิ้ง POLICY ของ docs/GO_LIVE_PLAN.md (controlled release)