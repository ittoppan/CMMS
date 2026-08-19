# CMMS-TPT — รายงานการตรวจสอบและปรับปรุงระบบ

> วันที่: 19 ส.ค. 2026 · ผู้ตรวจ: OpenWork Agent

---

## 1. สาเหตุที่แท้จริง: ทำไม CMMS Watchdog แจ้งเตือนตลอดเวลา

ตรวจสอบ `notification_logs` + `logs/watchdog.log` + Scheduled Tasks แล้วพบ **4 สาเหตุหลัก**:

### 🔴 สาเหตุที่ 1: LINE Push ส่งไม่สำเร็จทุกครั้ง (400 error) — ตรวจพบ bug ในโค้ด
- ไฟล์ `src/helpers/notification.php` วาง `backgroundColor` / `borderColor` / `cornerRadius` **ผิดระดับ** — วางที่ bubble ตรงๆ แต่ LINE API ไม่อนุญาต (ต้องอยู่ใน `styles.container` ซึ่ง API เวอร์ชันนี้ก็ไม่รองรับอีก) → LINE ตอบ `unknown field /backgroundColor` → **LINE Push ตก 100%**
- ข้อความยาว (LOW STOCK 15 รายการ) ทำ `altText` เกิน 1500 ตัวอักษร → LINE reject อีกชั้น (`Length must be between 0 and 1500`)
- **ผลกระทบ:** ทุกการแจ้งเตือน LINE (งานซ่อมใหม่, PM เกินกำหนด, สต็อกต่ำ, สรุปประจำวัน/สัปดาห์) ส่งไม่ถึงผู้ใช้เลย — เหลือแค่ Telegram ที่ทำงาน

### 🔴 สาเหตุที่ 2: LINE OA หมดโควตาข้อความรายเดือน (HTTP 429)
- ทดสอบส่งจริงแล้ว LINE ตอบ `You have reached your monthly limit.`
- LINE Official Account (ฟรี) มีโควตาจำกัด — ต้อง **อัปเกรดแผน LINE OA** หรือลดปริมาณข้อความ (ดูข้อ 4)

### 🟠 สาเหตุที่ 3: Tunnel (cloudflared) restart ซ้ำ → สแปม Telegram 134 ข้อความ/วัน
- วันที่ 15 ส.ค. tunnel restart ทุก ~1 นาที (16:05–17:00) → URL เปลี่ยนทุกครั้ง → ส่ง "tunnel URL ใหม่" เข้า Telegram ทุกครั้ง = **134 ข้อความในวันเดียว**
- ปัจจุบัน watchdog ไม่ restart tunnel อัตโนมัติแล้ว แต่ยังแจ้ง "tunnel ลง" ซ้ำทุก 1 ชม. (24 ข้อความ/วัน ถ้า tunnel ลงค้าง)

### 🟠 สาเหตุที่ 4: ข้อมูลสต็อก/งาน demo ทำให้แจ้งเตือนรายวันซ้ำซาก
- **LOW STOCK 1,103 รายการ** — ทุก 1,759 รายการมี `min_stock = 5.00` เท่ากันหมด (ค่า default จาก import Excel ไม่ใช่ข้อมูลจริง) + 424 รายการมี `stock_qty = 0` (ยังไม่เคยกรอกสต็อก) → แจ้งเตือนทุกวันไร้ความหมาย
- **ESCALATION งาน demo** — `F-EN-03-DEMO-001` (สถานะ completed แล้ว!) และ `F-EN-03-DEMO-002` ยังถูก escalation ทุกวัน เพราะ query ไม่กรองสถานะ `completed` และไม่กรองงาน DEMO

---

## 2. สิ่งที่แก้ไขแล้ว (10 ไฟล์)

| # | ไฟล์ | การแก้ไข |
|---|------|----------|
| 1 | `src/helpers/notification.php` | ✅ แก้ Flex bubble JSON — ย้ายสีพื้นหลังไปที่ body box (LINE รองรับ) + ตัด `altText` ไม่เกิน 1500 (เผื่อ emoji) |
| 2 | `scripts/alert_check.php` | ✅ Escalation ไม่นับงาน `completed` + กรอง `%DEMO%` ออก + LOW STOCK ไม่นับรายการ stock=0 (1,103 → 679) + แสดงหมายเหตุ "ยังไม่เคยบันทึกสต็อก" |
| 3 | `scripts/watchdog.ps1` | ✅ แจ้งเตือน tunnel ลงซ้ำ 1/ชม. → 1/วัน + กัน log สแปมจาก LINE webhook error (1/ชม.) |
| 4 | `public/index.php` | ✅ ตัวเลข LOW STOCK บน dashboard ไม่นับรายการ stock=0 |
| 5 | `public/pages/notifications/center.php` | ✅ หน้าแจ้งเตือนในแอป ไม่นับรายการ stock=0 |
| 6 | `public/pages/repair/index.php` | ✅ เพิ่ม **Pagination** (25 รายการ/หน้า) — เตรียมพร้อมเมื่อข้อมูลจริงเยอะ |
| 7 | `public/pages/settings/health.php` | ✅ เพิ่ม **ตรวจสุขภาพ LINE Push** — เตือนเมื่อเจอ quota หมด / เทมเพลตผิด |
| 8 | `public/login.php` | ✅ ปุ่มบัญชีทดสอบอ่าน username จริงจาก DB (เดิมปุ่ม "admin" กดแล้ว login ไม่ได้ เพราะ username จริงคือ E01117) + ซ่อนได้ผ่าน setting |
| 9 | `public/pages/settings/branding.php` | ✅ เพิ่มสวิตช์ "ปุ่มบัญชีทดสอบบนหน้า Login" (Module 7 Security) |
| 10 | `src/config/settings_defaults.php` | ✅ เพิ่ม default `demo_login_enabled` |

**ผลลัพธ์หลังแก้:** ทดสอบ `alert_check.php` จริง → escalation เหลือ **0** (เดิม 2), LOW STOCK 1,103 → 679, LINE 400 error หาย (เหลือ quota 429 ที่ต้องแก้ที่ LINE)

---

## 3. สิ่งที่ต้องทำต่อ (คนดูแลระบบ)

### 🔴 ด่วน — LINE ยังส่งไม่ได้เพราะโควตา
1. ไปที่ [LINE Developers Console](https://developers.line.biz) → ตรวจ **Message delivery quota** ของ LINE Official Account
2. ตัวเลือก: อัปเกรดแผน (paid) หรือลดปริมาณข้อความ (ปิด `daily_summary_enabled`, `line_weekly_report` ใน settings)
3. หลังแก้ quota → กด "ทดสอบส่ง" ในหน้า ตั้งค่า → LINE Config เพื่อยืนยัน

### 🟠 ข้อมูลสต็อก — ต้องกรอกข้อมูลจริง
- 1,103 รายการที่ "ต่ำกว่าจุดสั่งซื้อ" เกิดจาก `min_stock = 5` ที่ตั้ง default ไว้ทุกตัว — **ต้องแก้ min_stock ให้ตรงกับของจริง** (หรือปิด `low_stock_alert` ชั่วคราวจนกว่าจะกรอกข้อมูลจริง)
- 424 รายการ `stock_qty = 0` — ยังไม่เคยกรอกสต็อกเริ่มต้น

### 🟠 Tunnel (cloudflared) ยังไม่เสถียร
- ดู log วันที่ 18–19 ส.ค. tunnel หลุดหลายครั้ง (HTTP 0/502/530) — ลองอัปเดต cloudflared (`2026.7.3` → `2026.8.2` ตามที่ตัวมันเองเตือน) หรือพิจารณาใช้ domain จริง (named tunnel) แทน quick tunnel ที่ URL เปลี่ยนทุกครั้ง

### 🟡 ความปลอดภัย
- ปิดปุ่มบัญชีทดสอบ: ตั้งค่าระบบ → Module 7 → "ปุ่มบัญชีทดสอบบนหน้า Login" → **ซ่อน** (บัญชี manager/tech01/tech02/operator ยังใช้รหัส `password` และต้องเปลี่ยนรหัส — มี flag `must_change_password=1` อยู่แล้ว)
- `.env` มี `TELEGRAM_BOT_TOKEN` จริง — ตรวจว่า `.gitignore` ครอบคลุม (AGENTS.md เตือนเรื่องนี้แล้ว)

---

## 4. แนะนำฟีเจอร์ / สิ่งที่ควรปรับปรุงเพิ่มเติม

### ระดับเร่งด่วน (แก้ปัญหาเดิมให้จบ)
1. **Named Tunnel (Cloudflare)** — ใช้ domain ถาวรแทน trycloudflare ที่ URL เปลี่ยนทุก restart → ลดปัญหา webhook/LINE/QR ลิงก์พังทั้งหมด
2. **หน้า "ศูนย์แจ้งเตือน" รวมศูนย์** — ตอนนี้ตั้งค่ากระจัดกระจาย (branding.php, line_config.php, flex_builder.php, email_notifications.php) — รวมเป็นหน้าเดียว + แสดงสถานะ quota/ความสำเร็จล่าสุด
3. **ปุ่ม "ทดสอบส่ง" ครบทุกช่องทาง** — LINE / Telegram / Email / Web Push ในหน้าเดียว (ตอนนี้มีเฉพาะ LINE)

### ระดับ UX/UI (ปรับปรุงประสบการณ์ผู้ใช้)
4. **Dashboard ตามบทบาท** — ตอนนี้ทุกคนเห็น 4 แท็บ (Operational/Tactical/Strategic/Advanced) เต็ม — ควรกรองตาม role: ช่างเห็นเฉพาะงานตัวเอง, หัวหน้าเห็น Tactical, ผู้บริหารเห็น Strategic
5. **แจ้งเตือนในแอป (In-App Toast)** — เมื่อมีงานใหม่/งานถูกมอบหมาย ให้โชว์ toast + badge ที่ sidebar แทนการรอ LINE อย่างเดียว
6. **Dark Mode ให้ครบทุกหน้า** — header มี theme switch แล้ว แต่หลายหน้าใช้สี hardcode (bg-white, text-slate-900) ทำให้ dark mode ไม่สม่ำเสมอ
7. **Pagination + Export** — ต่อจากที่เพิ่ม pagination ให้ repair list แล้ว ควรเพิ่มปุ่ม Export CSV/Excel + ตัวเลือกแสดง 25/50/100 รายการ
8. **Mobile Bottom Nav** — มี config อยู่แล้ว (`migration_20260812_bottom_nav_config.sql`) — ตรวจว่าเปิดใช้งานครบทุก role

### ระดับฟีเจอร์ใหม่ (เพิ่มมูลค่า)
9. **Dashboard งานค้างรายช่าง (My Tasks แบบเรียลไทม์)** — auto-refresh ทุก 30–60 วิ + แสดง SLA ที่เหลือ (มี `sla_control.php` อยู่แล้ว — ต่อยอด)
10. **รายงาน PDF อัตโนมัติ** — ส่งรายงาน PM/ซ่อมประจำเดือนเป็น PDF เข้า LINE/Email อัตโนมัติ (มี weekly_report.php แล้ว — เพิ่มรูปแบบ PDF)
11. **QR Code บนเครื่องจักรจริง** — พิมพ์ QR ติดเครื่อง → สแกนแล้วดูประวัติ/แจ้งซ่อมได้ทันที (มี scanner.php แล้ว — ต่อยอดการพิมพ์)
12. **AI ช่วยวิเคราะห์ RCA** — มี copilot.php แล้ว — เพิ่มการวิเคราะห์สาเหตุซ้ำ (repeat failure) + แนะนำแนวทางแก้
13. **ระบบ KPI เปรียบเทียบรายเดือน** — MTBF/MTTR/Availability เทียบเดือนก่อนหน้า + เป้าหมาย (มี mtbf_mttr.php แล้ว)
14. **การจัดการวันหยุด/กะ** — เชื่อม holiday calendar กับการคำนวณ due date PM (มี holidays.php แล้ว)

---

## 5. ไฟล์ที่แก้ไขทั้งหมด (สำหรับ commit)

```
public/index.php
public/login.php
public/pages/notifications/center.php
public/pages/repair/index.php
public/pages/settings/branding.php
public/pages/settings/health.php
scripts/alert_check.php
scripts/watchdog.ps1
src/config/settings_defaults.php
src/helpers/notification.php
```