# Phase 1 (ต่อ) — ตรวจ emoji แทน icon (MASTER_UI_AUDIT)

> วันที่: 2026-11-23 · ปิดช่อง "ตรวจ emoji แทน icon" (tracker §1)
> วิธี: สแกน `app/**/*.tsx` + `components/**/*.tsx` ด้วย `\p{Extended_Pictographic}`

## ผล

- **32 emoji ใน 16 ไฟล์** (จาก ~100+ ไฟล์)
- ไม่มี emoji ที่ใช้เป็น "ไอคอน UI" ตรง ๆ ในหน้าที่ย้ายแล้ว (dashboard shell) ยกเว้น `CHANNEL_ICON` map (✈/🔵/✉) ที่เป็น label ช่องทางแจ้งเตือน
- ที่เหลือเป็น content/status ที่ตั้งใจใช้ emoji:
  - ผู้นำ (leaderboard): 🥇🥈🥉
  - สถานะซิงค์/อัปโหลด: ✅❌⏳
  - ปุ่มรัน/หยุด (editor): ▶⏹
  - รูปถ่ายก่อน/หลังซ่อม (repair view): 🔴🟢
  - หัวข้อ calibration: 🔧🔩
  - ช่องทางแจ้งเตือน: ✈🔵✉
  - ตั้งค่าธีม: 🎨
  - ลิงก์เปิดไฟล์: ↗
  - คำเตือน error: ⚠️

## สรุป

**ไม่พบ emoji ที่ใช้แทนไอคอน UI ในหน้าที่ย้ายแล้ว** — emoji ทั้งหมดเป็น content/status ที่ตั้งใจ ไม่ต้องแก้
EOF
echo written