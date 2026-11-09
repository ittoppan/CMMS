# AGENTS Configuration

## Telegram Config
> ⚠️ เก็บค่าลับไว้ใน environment variables เท่านั้น — ห้าม commit token จริงลงใน repo
> (เคยมี bot token รั่วในประวัติ git ให้ revoke ที่ @BotFather แล้วลบจากประวัติ)
- BOT_TOKEN: `${TELEGRAM_BOT_TOKEN}` (ตั้งค่าใน .env หรือ environment ของเครื่อง)
- CHAT_ID: `${TELEGRAM_CHAT_ID}`

## Tech Stack
- PHP REST API (PDO, JSON Output)
- Node.js Frontend
- Astryx Design System

## Architecture Decision (2026-10-17)
- **Next.js (`frontend/app`) คือ UI หลัก (canonical) 100%** — พอร์ตครบทุกโมดูลแล้ว, หน้า PHP ทั้งหมดใน `public/pages/*` เป็น stub 302 ไปยังหน้า Next.js ที่เทียบเท่า (ผ่าน `src/includes/gone_next.php`, ทางผ่าน query string, ใช้ `NEXTJS_PORT` env)
- ไม่เพิ่มฟีเจอร์ใหม่ใน PHP pages — แก้ใน `frontend/app` ผ่าน `/api/v1/*.php` เสมอ (+ API ใหม่: `/api/v1/master_data.php` รวม CRUD master/config, `/api/v1/asset_stats.php` ข้อมูลรวม downtime/TCO/plant_map/energy)
- Logic ใหม่ต้องอยู่ใน `src/helpers/*` เดียว ห้ามก๊อปซ้ำข้ามไฟล์ (เช่น วันทำงานใช้ `src/helpers/calendar.php`, form helpers ใช้ `src/includes/layout.php`)
- API เดิมทุกตัวยังทำงานเหมือนเดิม — ห้าม retire `/api/v1/*`

## Automation Rules
- **Telegram Notifications:**
  - Send `curl` notification to Telegram when a task starts.
  - Send `curl` notification to Telegram when a task finishes.
  - Example `curl` command (replace with actual message and URL):
    ```bash
    curl -s -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage -d chat_id=${TELEGRAM_CHAT_ID} -d text="[CMMS] Task Started: <Task Description>"
    ```
- **Auto-Git Push:**
  - Automatically push changes to `origin main` when a task finishes.
  - Example command:
    ```bash
    git add .
    git commit -m "chore: <Task Description> completed"
    git push origin main
    ```

## Security Rules (บังคับใช้เสมอ)
- **ห้าม commit secrets** (API token, password, .env) ลงใน repo
- ตัวแปรลับทั้งหมดอ่านจาก `.env` (อยู่ใน .gitignore) หรือ environment variables
- อย่าใส่ IP/URL ของเครื่อง dev ฝังตายตัวในโค้ด — ใช้ env `APP_URL` / `ALLOWED_ORIGINS` / settings table แทน
- ทุก endpoint ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่าน CSRF check (`src/csrf.php`)