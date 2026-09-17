# POST GO-LIVE REVIEW — CMMS-TOPPAN

เทมเพลตโครงสร้างสำหรับการประเมิน RESULTS **หลัง** pilot/เปิดจริง 30 วัน.
สถานะ ณ 17/09/2026: **ยังไม่ผ่าน pilot** — เอกสารนี้เป็น form/process พร้อมตรวจ (ตาม docs/GO_LIVE_PLAN.md §9; กรอกตัวเลขจริงเมื่อ pilot จบ).

> หลัก: ห้ามใส่ตัวเลขที่ไม่มีหลักฐาน.

## 1. ผลแบบกลั่น (จะกรอกเมื่อ Data จริงมา)
| เมตริก | เป้าหมาย | ผลจริง (30d) | ผ่าน? |
|---|---|---|---|
| WO ที่เปิด/ปิด ต่อสัปดาห์ | ≥ X | — | ☐ |
| % อัตโนมัติ sync success | ≥ 99% | — | ☐ |
| /api/health.php uptime | ≥ 99% | — | ☐ |
| PHP error_log ขนาดเติบโต/วัน | < 300KB | — | ☐ |
| ดิสก์ว่าง | > 5GB | — | ☐ |
| repair list API | < 500ms | — | ☐ |
| ผู้ใช้ active / ทั้งหมด | ≥ 80% | — | ☐ |
| ความพอใจ pilot (survey 1-5) | ≥ 4.0 | — | ☐ |

## 2. Checklist หลังเปิด 30 วัน
- [ ] pilot device (Android/iOS/tablet) ทดสอบ PWA install + offline + sync ผ่านเป็นรายจริง (ยังไม่อยู่ — ต้องลงมือใน pilot)
- [ ] test error path: Sage หาย, notif fail, network หลุด — ว่า UX ยังทำงานได้ (procedure ใน INCIDENT_RESPONSE)
- [ ] ลอง restore test รายเดือนตาม DATABASE_RECOVERY.md
- [ ] มีเหตุการณ์ SEV1/SEV2? → ทุกจุด root cause + ใส่ FUTURE_BACKLOG
- [ ] ส่งมอบ/ฝึกอบรมผู้ใช้รอบจริง (ตามTechnician/Operator quick guide)
- [ ] ตรวจ audit_logs ไม่มี action ผิดปกติ
- [ ] ประเมิน per-metric ตาม tabe1 → ตั้งข้อสรุป

## 3. Feedback mechanism (ช่องรับเรื่อง)
- ช่องทาง: ผ่าน admin/หัวหน้า, issue ใน repo, Group LINE
- ก่อนพัฒนาต้อง categorize: `BUG` (แก้เร็ว) / `IMPROVEMENT` / `FEATURE` / `INTEGRATION` / `PERFORMANCE` / `UX` → ใส่ `docs/FUTURE_BACKLOG.md` พร้อม priority

## 4. รายการที่อาจได้จาก review (ตัวอย่างกฎ)
- นอกเหนือ build ผ่าน — สรุป decision: **GO-LIVE ได้** / **ยัง / ปรับปรุงเฉพาะจุด** → ลงใน GO_LIVE_REPORT.md
- ยืนยันหรือปรับ threshold ใน PERFORMANCE_BASELINE.md (§4) ให้ตรงสภาพจริง

## 5. Owner & กำหนด
- Owner: ผู้ดูแลระบบโรงงาน (Admin) + ทีม CMMS
- วันที่นัด: 30 วันหลังเริ่ม pilot (ต้องระบุตอนวางแผน)

---
_หมายเหตุ: เมื่อ此时此刻ยังไม่มี pilot —— เอกสารนี้คือแม่แบบการประเมิน อย่าใช้เป็นหลักฐานผลลัพธ์จริง_