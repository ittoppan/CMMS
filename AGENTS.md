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