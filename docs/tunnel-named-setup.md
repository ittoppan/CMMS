# คู่มือตั้งค่า Cloudflare Named Tunnel (URL ถาวร)

> แทนที่ quick tunnel (trycloudflare) ที่ URL เปลี่ยนทุกครั้งที่ restart
> → ลิงก์/QR/webhook LINE ไม่พังอีกต่อไป และ watchdog restart อัตโนมัติได้ปลอดภัย

**เวลาโดยประมาณ:** 15–20 นาที (ต้องมี domain อยู่ใน Cloudflare account)

---

## ข้อดี vs Quick Tunnel (ปัจจุบัน)

| | Quick Tunnel (trycloudflare) | Named Tunnel |
|---|---|---|
| URL | เปลี่ยนทุก restart | **ถาวร** (`https://cmms.<domain>`) |
| ลิงก์/QR/webhook LINE | พังทุกครั้งที่ restart | ไม่พัง |
| Watchdog restart อัตโนมัติ | ไม่ได้ (URL จะเปลี่ยน) | **ได้** (ปลอดภัย) |
| ต้องมี domain | ไม่ต้อง | ต้องมี (Cloudflare DNS) |
| ความเสถียร | หลุดบ่อย (เห็นใน log) | สูงกว่า |

---

## ขั้นตอน

### 1. ล็อกอิน Cloudflare (เปิดเบราว์เซอร์ให้ authorize domain)

```powershell
& "C:\cloudflared\cloudflared.exe" tunnel login
```

- เบราว์เซอร์จะเปิดขึ้น → เลือก domain ที่ต้องการ (เช่น `toppan.co.th`)
- ระบบจะสร้างไฟล์ `C:\Users\<user>\.cloudflared\cert.pem` อัตโนมัติ

### 2. สร้าง Tunnel

```powershell
& "C:\cloudflared\cloudflared.exe" tunnel create cmms-tpt
```

- ระบบจะสร้างไฟล์ `C:\cloudflared\cmms-tpt.json` (credentials) + แสดง Tunnel ID
- **จด Tunnel ID ไว้** (เช่น `a1b2c3d4-...-xxxxxxxx`)

### 3. สร้างไฟล์ config

สร้างไฟล์ `C:\cloudflared\config.yml` ด้วยเนื้อหานี้ (แก้ hostname เป็น domain จริง):

```yaml
tunnel: a1b2c3d4-....-xxxxxxxx        # <- Tunnel ID จากขั้นตอน 2
credentials-file: C:\cloudflared\cmms-tpt.json

ingress:
  - hostname: cmms.toppan.co.th       # <- subdomain ที่ต้องการ (URL ถาวรของระบบ)
    service: http://127.0.0.1:3001    # <- Next.js (ถ้าจะชี้ Apache ให้ใช้ 8081)
  - service: http_status:404          # <- catch-all (จำเป็นเสมอ)
```

> ⚠️ ถ้าใช้ Apache :8081 เป็นหลัก ให้เปลี่ยน `service` เป็น `http://127.0.0.1:8081`
> (ระบบ PHP อยู่ที่ Apache — ดู AGENTS.md / health.php)

### 4. สร้าง DNS record (CNAME)

```powershell
& "C:\cloudflared\cloudflared.exe" tunnel route dns cmms-tpt cmms.toppan.co.th
```

### 5. ทดสอบรัน Named Tunnel

```powershell
powershell -ExecutionPolicy Bypass -File "C:\inetpub\wwwroot\cmms-tpt\scripts\tunnel-named.ps1"
```

- ควรเห็น `==> Tunnel URL (ถาวร): https://cmms.toppan.co.th` + `URL ตอบสนองแล้ว (HTTP 200)`
- เปิด URL ในเบราว์เซอร์ → ควรเห็นหน้า login

### 6. เปลี่ยน Scheduled Task ให้ใช้ Named Tunnel

```powershell
# ดูชื่อ task ปัจจุบัน
Get-ScheduledTask | Where-Object { $_.TaskName -like "CMMS*" } | Select-Object TaskName

# เปลี่ยน action ของ CMMS-TunnelQuick ให้รัน tunnel-named.ps1 แทน tunnel-quick.ps1
$task = Get-ScheduledTask -TaskName "CMMS-TunnelQuick"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\inetpub\wwwroot\cmms-tpt\scripts\tunnel-named.ps1`""
Set-ScheduledTask -TaskName "CMMS-TunnelQuick" -Action $action
```

### 7. อัปเดต LINE webhook (ถ้าใช้ LINE Messaging API)

- รัน `scripts\update_line_webhook.php` หนึ่งครั้ง หรือรอ watchdog รอบถัดไป (มันเช็คเองทุกนาที)
- ตรวจใน LINE Developers Console ว่า Webhook URL เป็น `https://cmms.<domain>/webhook/line.php` แล้ว

---

## การย้อนกลับ (Rollback)

ถ้าต้องการกลับไปใช้ quick tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\inetpub\wwwroot\cmms-tpt\scripts\tunnel-quick.ps1"
```

แล้วเปลี่ยน Scheduled Task กลับเป็น `tunnel-quick.ps1` (เหมือนขั้นตอน 6)

---

## การดูแลรักษา

- **อัปเดต cloudflared:** ดาวน์โหลดเวอร์ชันใหม่จาก https://github.com/cloudflare/cloudflared/releases
  แทนที่ `C:\cloudflared\cloudflared.exe` แล้ว restart tunnel (URL ไม่เปลี่ยน — ปลอดภัย)
- **ตรวจสถานะ:** หน้า ตั้งค่าระบบ → ตรวจสุขภาพระบบ (health.php) หรือดู `logs\tunnel-named.log`
- **Watchdog:** เมื่อใช้ named tunnel แล้ว watchdog จะ restart tunnel อัตโนมัติเมื่อหลุด
  (URL ถาวร → ไม่กระทบผู้ใช้ภายนอก) — ดู `scripts\watchdog.ps1`