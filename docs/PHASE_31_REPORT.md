# PHASE 31 REPORT — CMMS-TPT Contractor & External Service Management

> สรุปงาน Phase 31 (Contractor Management & External Service)
> เอกสารที่เกี่ยวข้อง: CURRENT_STATE · ENGINE(IMPLEMENTATION) · API · MIGRATION ·
> WORKFLOW · NOTIFICATIONS · SECURITY · OPERATIONS · TEST_PLAN

## 1. สิ่งที่ทำ

สร้างโมดูล **ผู้รับเหมา & งานภายนอก** ครบวงจร ตั้งแต่ทะเบียนผู้รับเหมา →
ประเมินคุณสมบัติ → บันทึกเอกสาร/สัญญา → มอบหมายงาน → คุมความปลอดภัย (PTW) →
ตรวจรับงาน → คิดผลงานและค่าใช้จ่ายจริง

## 2. ขอบเขตที่ส่งมอบ

| ชั้น | ผลงาน |
|---|---|
| DB | ขยาย `contractors` +15 คอลัมน์, ตารางใหม่ 9, settings 12 คีย์, notification_templates 13, เมนู 2 |
| Engine | `src/helpers/contractor.php` — 1,289 บรรทัด / 48 ฟังก์ชัน |
| API | `public/api/v1/contractor.php` — 486 บรรทัด, GET 20 action + POST 24 action |
| Frontend | 4 หน้า + `lib/contractor.ts` (20 interface) |
| Wiring | sidebar, i18n (th/en), pageLayout, layout menu, permissions, menu_catalog, upload allowlist |
| เอกสาร | 10 ไฟล์ |

## 3. คุณค่าที่ได้

1. **ทะเบียนผู้รับเหมาเป็นระบบ** — ไม่ต้องค้นในไฟล์ Excel, มีรหัส `CON-YYYY-NNN`
2. **คุณสมบัติตรวจสอบย้อนหลังได้** — ทุกรอบประเมินเก็บแยกแถว ไม่ถูกเขียนทับ
3. **ควบคุมความปลอดภัยจริง** — งานที่ต้องใช้ PTW เดินต่อไม่ได้จนกว่าจะผูก permit ที่อนุมัติแล้ว
4. **คิดผลงานจากข้อมูลจริง** — ไม่กุคะแนน/ค่าใช้จ่ายขึ้นเอง; ข้อมูลไม่พอรายงาน `ไม่เพียงพอ` ชัดเจน
5. **ส่งงานคุณภาพ** — มาตรการแก้ไขต้องผ่านการ verify ก่อนปิด
6. **เตือนล่วงหน้า** — เอกสาร/ใบรับรอง/สัญญา/คุณสมบัติใกล้หมดอายุ + SLA breach
7. **ตรวจคุณภาพข้อมูล** — 13 checks ชี้ช่องว่าง (รหัส/เลขผู้เสียภาษี/ค้างนาน/ไม่มีผู้รับผิดชอบ/งานต้องมี PTW แต่ไม่ผูก)
8. **รายงาน 12 แบบ** — ทะเบียน, หมวดงาน, คุณสมบัติ, เอกสาร, ใบรับรอง, สัญญา, งานภายนอก, SLA, ตรวจรับ, ค่าใช้จ่าย, รีวิว, รายผู้รับเหมา

## 4. การตัดสินใจสำคัญ

| เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|
| เก็บประวัติประเมิน/ตรวจรับ | append-only ทุกรอบ | ตรวจสอบย้อนหลังได้ ไม่แก้ประวัติทับ |
| ลบผู้ติดต่อ | soft delete (`is_active=0`) | เก็บประวัติการติดต่อเดิม |
| ลบผู้รับเหมา | ไม่มี hard delete ใช้สถานะ `inactive` | อ้างอิงงานเก่าได้ครบ |
| เอกสารรุ่นใหม่ | ของเดิม `archived` | เก็บหลักฐานครบ |
| `failure_id`/`rca_id` | เพิ่มคอลัมน์ nullable ไว้ แต่ **ไม่เรียกใช้** | Phase 27/28 ยังเป็น WIP — Phase 31 ต้องไม่พั่งพา |
| ออกแบบแบบ config-driven | SLA/หมวดงาน/เอกสาร/คะแนน อยู่ใน settings | แก้ได้โดยไม่แตะโค้ด/ไม่ต้อง migration ใหม่ |
| สถานะ `blocked` | มี `block_review_date` | บังคับให้ทบทวน ไม่บล็อกถาวร |
| งานเริ่มแล้วยกเลิกไม่ได้ | บังคับใน state machine | งานจริงต้องปิดให้ครบ ไม่ทิ้งงานค้างเงียบ ๆ |
| ให้ role 7 `execute` แต่ไม่ให้ `approve` | แยกหน้าที่ | หัวหน้าชุดคุมงานได้ แต่ไม่อนุมัติตัวเอง |

## 5. สิ่งที่พบและแก้ระหว่างทำ

| ปัญหา | สาเหตุ | การแก้ |
|---|---|---|
| หน้า 500 จาก client เรียก API | เรียก `fetch()` ตรงโดยไม่แนบ credential | ใช้ `ctrApi()` ใน `lib/contractor.ts` ที่จัดการ session/error ให้ |
| ข้อมูลแสดง `[object Object]` | unwrap response ไม่ตรงโครงสร้างจริง | แก้ให้ตรงกับคีย์ที่ API คืนจริง |
| Prod `:3001/contractors` = 500 | server prod ยังรัน build ก่อน Phase 31 (`.next` เก่า) | **ไม่ใช่บั๊ก** — ต้อง build/restart ตอน deploy ตามปกติ (ไม่แตะ prod ตอน dev) |
| design-audit รวม FAIL | WARN 3 รายการอยู่ในหน้า Phase 27/28 WIP | แยกขอบเขต: หน้า `contractors/**` สะอาด 0/0, ปล่อย 27/28 แก้เอง |

## 6. สิ่งที่ยังไม่ทำ (ขอบเขตนอก Phase 31)

| หัวข้อ | เหตุผล |
|---|---|
| Portal login สำหรับผู้รับเหมา | Phase 31 จัดการฝั่ง CMMS; ผู้รับเหมาใช้ LINE แจ้งเตือน |
| cron ยิงเตือนตามเวลา | ปัจจุบันคำนวณใน dashboard/data-quality; เสริม cron ภายหลัง |
| เชื่อม WIP Phase 27/28 (failure/RCA) | คอลัมน์พร้อมแล้ว แต่ไม่เรียกใช้จน 27/28 เสร็จ |
| แก้ andon WARN 3 รายการ | เป็นของ Phase 27/28 |
| Deploy prod | ทำตอน release ตามปกติ |

## 7. สถานะการทดสอบ

| หมวด | ผล |
|---|---|
| PHP syntax (3 ไฟล์) | PASS |
| Migration จริง + idempotent | PASS |
| Backend API (ทุก endpoint) | PASS |
| Business rules | 15/15 PASS |
| Security | 7/7 PASS |
| Browser (4 หน้า) | PASS |
| Design audit (Phase 31) | 0 FAIL / 0 WARN |
| TypeScript | PASS |
| Production build | PASS |

## 8. เอกสารในรอบนี้

| ไฟล์ | เนื้อหา |
|---|---|
| `PHASE_31_CURRENT_STATE.md` | inventory ก่อนเริ่ม (ตัดสินใจ reuse อะไร) |
| `PHASE_31_IMPLEMENTATION.md` | ไฟล์ที่สร้าง/แก้, ฟังก์ชันทั้งหมด |
| `PHASE_31_API.md` | endpoint + payload + permission ทุก action |
| `PHASE_31_MIGRATION.md` | DDL, settings, deploy, rollback |
| `PHASE_31_WORKFLOW.md` | state machine, permit gate, SLA, scoring |
| `PHASE_31_NOTIFICATIONS.md` | 13 เทมเพลต + ตัวแปร |
| `PHASE_31_SECURITY.md` | permission matrix, กฎที่บังคับ, audit |
| `PHASE_31_OPERATIONS.md` | คู่มือใช้งานรายวัน + แก้ปัญหา |
| `PHASE_31_TEST_PLAN.md` | แผนทดสอบ + ผลจริง + บั๊กที่เจอ |
| `PHASE_31_REPORT.md` | เอกสารนี้ |
