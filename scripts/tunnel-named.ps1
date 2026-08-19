# tunnel-named.ps1 - Cloudflare Named Tunnel (URL ถาวร) -> localhost:3001
# ใช้แทน tunnel-quick.ps1 เมื่อตั้งค่า named tunnel เสร็จแล้ว (ดู docs/tunnel-named-setup.md)
#
#   powershell -ExecutionPolicy Bypass -File tunnel-named.ps1
#
# ข้อดี vs quick tunnel (trycloudflare):
#   - URL ถาวร (https://cmms.<domain>) — ลิงก์/QR/webhook LINE ไม่พังเมื่อ restart
#   - watchdog  restart อัตโนมัติได้ปลอดภัย (URL ไม่เปลี่ยน)
#
# Output:
#   logs\tunnel-url.txt  <- URL ถาวร (ใช้กับแอป/QR/webhook)
#   logs\tunnel-named.log
#
# exit codes:
#   0 = สำเร็จ / 1 = ยังไม่พร้อม / 2 = ยังไม่ได้ตั้งค่า named tunnel

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Continue"
$root    = "C:\inetpub\wwwroot\cmms-tpt"
$cfDir   = "C:\cloudflared"
$cfExe   = Join-Path $cfDir "cloudflared.exe"
$credFile = Join-Path $cfDir "cmms-tpt.json"      # สร้างโดย `cloudflared tunnel create cmms-tpt`
$cfgFile  = Join-Path $cfDir "config.yml"          # ingress rules (สร้างตามคู่มือ)
$logDir  = Join-Path $root "logs"
$log     = Join-Path $logDir "tunnel-named.log"
$urlFile = Join-Path $logDir "tunnel-url.txt"

if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $log -Value "$ts $msg" -Encoding utf8 } catch {}
}

# ---- ตรวจ prerequisites ----
if (-not (Test-Path -LiteralPath $cfExe)) {
    Write-Host "!! ไม่พบ cloudflared ที่ $cfExe" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $credFile)) {
    Write-Host "!! ยังไม่ได้สร้าง named tunnel — ทำตาม docs\tunnel-named-setup.md ก่อน" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ขั้นตอนย่อ:" -ForegroundColor Yellow
    Write-Host "    1) & `"$cfExe`" tunnel login          (ล็อกอิน domain ในเบราว์เซอร์)"
    Write-Host "    2) & `"$cfExe`" tunnel create cmms-tpt (สร้าง tunnel ID + credentials)"
    Write-Host "    3) สร้าง $cfgFile ตามคู่มือ (ingress -> http://127.0.0.1:$Port)"
    Write-Host "    4) & `"$cfExe`" tunnel route dns cmms-tpt cmms.<domain>"
    Write-Host "    5) รันสคริปต์นี้อีกครั้ง"
    exit 2
}
if (-not (Test-Path -LiteralPath $cfgFile)) {
    Write-Host "!! ไม่พบ $cfgFile — สร้างตาม docs\tunnel-named-setup.md (ต้องมี ingress rule ไปยัง http://127.0.0.1:$Port)" -ForegroundColor Red
    exit 2
}

# ---- อ่าน tunnel ID จาก credentials json ----
$tunnelId = ""
try {
    $cred = Get-Content -LiteralPath $credFile -Raw | ConvertFrom-Json
    $tunnelId = [string]$cred.TunnelID
} catch {
    Write-Host "!! อ่าน $credFile ไม่ได้ (JSON ผิด?)" -ForegroundColor Red
    exit 1
}
if ($tunnelId -eq "") {
    Write-Host "!! ไม่พบ TunnelID ใน $credFile" -ForegroundColor Red
    exit 1
}

# ---- อ่าน hostname จาก config.yml (สำหรับเขียน tunnel-url.txt) ----
$hostname = ""
try {
    $cfgRaw = Get-Content -LiteralPath $cfgFile -Raw
    if ($cfgRaw -match "hostname:\s*([^\s#]+)") { $hostname = $Matches[1].Trim() }
} catch {}
if ($hostname -eq "") {
    Write-Host "!! ไม่พบ hostname ใน config.yml — ตรวจ ingress rule" -ForegroundColor Red
    exit 1
}

# ---- ปิด process เก่า (ทุก instance) ----
$old = Get-Process cloudflared -ErrorAction SilentlyContinue
foreach ($p in $old) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Log "stopped old cloudflared PID $($p.Id)" } catch {}
}
Start-Sleep -Seconds 2

# ---- สตาร์ท named tunnel (background) ----
$cfLog = Join-Path $logDir "cloudflared.log"
if (Test-Path -LiteralPath $cfLog) { Set-Content -LiteralPath $cfLog -Value "" -Encoding utf8 }
$cfArgs = "tunnel --config `"$cfgFile`" run $tunnelId --no-autoupdate --logfile `"$cfLog`""
$p = Start-Process -FilePath $cfExe -ArgumentList $cfArgs -WindowStyle Hidden -PassThru
Write-Log "started named tunnel PID $($p.Id) -> $hostname (tunnel $tunnelId)"

# ---- รอ tunnel พร้อม (ดู log ขึ้น Registered tunnel connection) ----
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $cfLog) {
        if (Select-String -LiteralPath $cfLog -Pattern "Registered tunnel connection|Connection .* registered" -Quiet) { $ready = $true; break }
    }
}

$url = "https://$hostname"
$url | Out-File -FilePath $urlFile -Encoding ascii
Write-Host "==> Tunnel URL (ถาวร): $url" -ForegroundColor Green
Write-Host "    (บันทึกไว้ที่ logs\tunnel-url.txt)" -ForegroundColor DarkGray

if (-not $ready) {
    Write-Host "    ยังไม่เห็น 'Registered tunnel connection' ใน log — ดู logs\cloudflared.log" -ForegroundColor Yellow
}

# ---- ตรวจ URL ตอบสนองจริง ----
$reachable = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 2
    try {
        if ((Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 8).StatusCode -eq 200) { $reachable = $true; break }
    } catch {}
}
if ($reachable) {
    Write-Host "    URL ตอบสนองแล้ว (HTTP 200)" -ForegroundColor Green
} else {
    Write-Host "    URL ยังไม่ตอบสนอง (node อาจยังไม่พร้อม) — watchdog จะจัดการให้" -ForegroundColor Yellow
}
exit 0