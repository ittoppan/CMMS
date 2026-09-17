# Improvement Backlog — CMMS-TOPPAN

> Phase 22 (§19) · รายการปรับปรุงจากทุกหมวด เก็บเป็น **ticketed backlog** (ยังไม่ได้จัดลำดับทำเป็นครั้งเดียว). ใช้เลข I-XX อ้างอิงในรายงาน/PR
> Priority: **P0** = ต้องก่อนเปิดจริง/ความเสี่ยงสูง · **P1** = แก้ภายใน 1–2 สัปดาห์ใช้งานจริง · **P2** = เมื่อมีข้อมูล/ผู้ใช้จริง · **P3** = nice-to-have

## ตาราง Backlog

| ID | หมวด | หัวข้อ | หลักฐาน (จริง ณ 2026-09-17) | ความเสี่ยง/ผลได้ถ้าไม่ทำ | แนวทางแก้ | Priority | สถานะ |
|---|---|---|---|---|---|---|---|
| I-01 | Security | **เปิด HTTPS/TLS (IIS/Next)** | health API แสดง warning "HTTPS ยังไม่เปิด" (Phase 21 blocker B-1 ค้าง) | data ผ่าน plain HTTP บน WAN; phishing/mitm | รับ cert → bind 443 IIS (PHP 8081) + Next 3001 → reverse proxy | **P0** | เปิดอยู่ (Blocked: รอ cert ภายนอก) |
| I-02 | Security | ตั้ง account จริงแทน admin/test + role mapping ครบ | users = 2 (admin + role null); technicians ยังไม่มี | ปิดช่อง "ทุกคนเป็น admin" | LDAP/AD integration หรือ user onboarding ตามองค์กร | **P0** | ยังไม่เริ่ม |
| I-03 | CMMS | Flow supervisor "ปิดงานค้าง" (ไม่อนุญาตลบ) | 17 WO ค้าง >30 วัน; 78 completed ไม่มีช่าง | งานค้างบิด KPI "backlog" | role supervisor เห็น stale list → บันทึกเหตุผล → ตั้งสถานะ closed | **P1** | backlog |
| I-04 | Data | Cleanup ข้อมูลเก่า/ซ้ำ (machines 13.5k, อะไหล่ 1.8k) | duplicate asset_code, ว/ช ไม่ mapping ใช้จริง | ข้อมูลหลักเพี้ยน หน้า report เชื่อถือไม่ได้ | และกันแทรกซ้ำผ่านฟอร์ม + audit ของแก้ | **P1** | backlog |
| I-05 | Monitoring | Alert อัตโนมัติจาก health ไป LINE/Telegram | ยังเป็น dashboard อย่างเดียว | admin ต้องเข้าเว็บเองถึงรู้ | ผูก health threshold เข้า alert engine (มีอยู่แล้ว) | **P2** | backlog |
| I-06 | Monitoring | History/trend ของ health API | ยัง snapshot ไม่มี series | เทียบ trend ไม่ได้ | บันทึก health snapshots รายวัน + mini chart | **P2** | backlog |
| I-07 | Performance | Load test / ปรับ cache | ยังไม่มีข้อมูลผู้ใช้จริง | ตอนเปิด wide อาจทรุด | k6/vegeta ตาม scenario จริง + เพิ่ม Redis ถ้าจำเป็น | **P2** | backlog |
| I-08 | Notification | LINE quota ฟรีเต็ม (58 ล้มเหลว/30d) | quota error ใน log | คนจริงไม่ได้รับการแจ้งเตือน | account LINE ทางการ / fallback Email+Telegram สำคัญ | **P0** | **ค้างรอฝั่ง LINE admin** |
| I-09 | Notification | ตั้ง daily cron ของ sage_sync | last_sync ยังค้าง 2026-09-07 | ข้อมูล Sage ล้าสมัย longest | จัดตาราง vi scheduler/Windows Task | **P1** | backlog |
| I-10 | Data Quality | บังคับ `created_by`/assignee ผ่าน API + validate วันที่ | 98/102 created_by NULL, 9 วันที่ผิด | เจตนา/กำกับไม่ได้ใครทำอะไร | แก้ฟอร์มงานซ่อม + validation API | **P1** | backlog |
| I-11 | CMMS | ปิดงานที่ assignee ไม่อยู่แล้ว (9 orphans) | users หาย แต่งานยังอ้าง | assignment เด้ง | snapshot display name + flow reassign | **P2** | backlog |
| I-12 | CMMS | ตารางเวลาอนุญาตงานซ่อม/merge WO | ยังไม่มี | ซ้ำ/ยืดไม่ได้ตอนงานเยอะ | ต่อจาก flow ปิดงานค้าง → เทียบ Sage calendar | **P2** | backlog |
| I-13 | UX | คู่มือ/QR เข้าถึงเท่านั้น; add role "Operate" label เป็น Technician | roles id=3 ยัง label "Operate" | งงกับการอบรม | แก้ label + QR แยกช่อง (เยอะแล้ว) | **P3** | backlog |
| I-14 | Frontend | bundle split / report recharts แยก | Phase 20 ลด commit ลงแล้ว | bundle ใหญ่เมื่อ data โต | audit dynamic import ต่อ | **P3** | backlog |
| I-15 | Mobility | Push notification เมื่อรับงาน (PWA) | ไม่มี fallback push | คนไม่รู้ว่างานใหม่ | web-push service (แม้ม LINE fail) | **P2** | backlog |
| I-16 | Monitoring | retention/archive ตาราง log ใหญ่ | ยังไม่มี event เก็บ | log โต (audit/system_errors) | MySQL event + archive หรือ AWS S3 | **P3** | backlog |

## เกณฑ์ย้าย Backlog → Sprint (กฎที่เซ็ตไว้)

- เริ่มทำเมื่อ: (a) มีผู้ใช้จริง ≥ รับงานจริง, หรือ (b) ถูกใบงานจริง, หรือ (c) มีข้อมูลจริง ≥ 2 สัปดาห์
- ทำเสร็จ 1 ชิ้น → เปิด PR → design-audit + tsc (pre-push) → controlled release (tag v1.x.y)
- ห้ามทำ P3 หลายชิ้นพร้อมกัน (เสียการควบคุมความเสี่ยง)
- สำหรับทุกชิ้นที่ต้องแตะข้อมูล: ต้อง migration backward-compatible + ตรวจ `docs/DATABASE_RECOVERY.md`

## Priority ชัดเจนสำหรับมือใหม่? → ดู "P0 ยังค้าง": I-01 (TLS), I-02 (บัญชี), I-08 (LINE). คัดลอกอ้างอิงข้ามรายงานได้เลย