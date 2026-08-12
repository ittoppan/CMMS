# setup-tunnel.ps1 - ตั้งค่า Cloudflare Tunnel แบบถาวร (named tunnel) แทน trycloudflare ชั่วคราว
#
#   powershell -ExecutionPolicy Bypass -File setup-tunnel.ps1 [-Domain cmms.example.com] [-ServiceName cloudflared-cmms]
#
# ขั้นตอน:
#   1. ตรวจว่า cloudflared login แล้วหรือยัง (~/.cloudflared/cert.pem) — ถ้ายัง ไม่มีพิมพ์วิธี login
#   2. สร้าง named tunnel "cmms-tpt" ถ้ายังไม่มี
#   3. เขียน config.yml (ingress: <Domain> -> http://localhost:3001)
#   4. ติดตั้ง Windows Service เพื่อให้รันอัตโนมัติหลังรีบูต (ต้องมี -Domain)
#
# หมายเหตุ: ต้องมี domain ใน Cloudflare Zone อยู่แล้ว + รัน login ผ่านเบราว์เซอร์ครั้งเดียว

param(
    [string]$Domain      = "",
    [string]$ServiceName = "cloudflared-cmms",
    [string]$TunnelName  = "cmms-tpt"
)

$ErrorActionPreference = "Stop"
$root         = "C:\inetpub\wwwroot\cmms-tpt"
$cfExe        = "C:\cloudflared\cloudflared.exe"
$cfHome       = Join-Path $env:USERPROFILE ".cloudflared"
$certPem      = Join-Path $cfHome "cert.pem"
$configFile   = Join-Path $root "cloudflared-config.yml"
$logDir       = Join-Path $root "logs"

if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Err([string]$msg)  { Write-Host "!!  $msg" -ForegroundColor Red }
function Write-Ok([string]$msg)   { Write-Host "OK  $msg" -ForegroundColor Green }

if (-not (Test-Path -LiteralPath $cfExe)) {
    Write-Err "ไม่พบ cloudflared ที่ $cfExe"
    Write-Host "ติดตั้งจาก https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ แล้ววาง cloudflared.exe ไว้ที่ C:\cloudflared\"
    exit 1
}

Write-Step "1) ตรวจสถานะ login"
if (-not (Test-Path -LiteralPath $certPem)) {
    Write-Err "ยังไม่เคย login กับ Cloudflare (ไม่มี $certPem)"
    Write-Host ""
    Write-Host "รันคำสั่งนี้ แล้วเปิดลิงก์ในเบราว์เซอร์เพื่อ authorize (ทำครั้งเดียว):" -ForegroundColor Yellow
    Write-Host "    & '$cfExe' tunnel login" -ForegroundColor Yellow
    Write-Host "แล้วรันสคริปต์นี้อีกครั้ง" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "(ถ้าอยากได้ tunnel ชั่วคราวทันที ใช้ scripts\tunnel-quick.ps1 แทน)"
    exit 1
}
Write-Ok "login แล้ว ($certPem)"

Write-Step "2) ตรวจ named tunnel '$TunnelName'"
$tunnelId = (& $cfExe tunnel list --name $TunnelName 2>$null | Select-String "\b$TunnelName\b").ToString()
if ($LASTEXITCODE -ne 0 -or -not $tunnelId) {
    Write-Host "ยังไม่มี tunnel — กำลังสร้าง..."
    & $cfExe tunnel create $TunnelName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "สร้าง tunnel ไม่สำเร็จ ดูข้อความด้านบน"
        exit 1
    }
    $tunnelId = (& $cfExe tunnel list --name $TunnelName 2>$null | Select-String "\b$TunnelName\b").ToString()
    Write-Ok "สร้าง tunnel '$TunnelName' แล้ว"
} else {
    Write-Ok "มี tunnel '$TunnelName' อยู่แล้ว"
}

if (-not $Domain) {
    Write-Err "ยังไม่ระบุ -Domain — ข้ามขั้นตอน config/service"
    Write-Host "รันอีกครั้งแบบนี้:"
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\setup-tunnel.ps1 -Domain cmms.yourdomain.com" -ForegroundColor Yellow
    Write-Host "(ต้องเพิ่ม DNS CNAME ใน Cloudflare Dashboard ก่อน: $TunnelName.cfargotunnel.com)"
    exit 1
}

Write-Step "3) เขียน config.yml ($configFile)"
$config = @"
tunnel: $TunnelName
credentials-file: $cfHome\$TunnelName.json

ingress:
  - hostname: $Domain
    service: http://localhost:3001
  - service: http_status:404
"@
Set-Content -LiteralPath $configFile -Value $config -Encoding ascii
Write-Ok "config เขียนแล้ว"

Write-Step "4) เพิ่ม DNS route + ติดตั้ง Windows Service"
& $cfExe tunnel route dns $TunnelName $Domain | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "route dns ไม่สำเร็จ — ตรวจว่า domain อยู่ใน Cloudflare Zone"
    exit 1
}
Write-Ok "DNS route: $Domain -> $TunnelName"

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "service มีอยู่แล้ว — restart"
    & $cfExe service uninstall --service-name $ServiceName | Out-Null
}
& $cfExe service install --legacy $ServiceName
Start-Service -Name $ServiceName
Write-Ok "service '$ServiceName' เริ่มทำงานแล้ว"

Start-Sleep -Seconds 6
try {
    $r = Invoke-WebRequest -Uri "https://$Domain/login" -UseBasicParsing -TimeoutSec 15
    Write-Ok "ทดสอบ https://$Domain/login -> HTTP $($r.StatusCode)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { Write-Ok "ทดสอบ https://$Domain/login -> HTTP $code (กำลัง start ครั้งแรก อาจรอสักครู่)" }
    else { Write-Err "ยังเข้าไม่ได้: $($_.Exception.Message)" }
}

Write-Host ""
Write-Ok "เสร็จสิ้น! เว็บเข้าถึงได้ที่ https://$Domain (ถาวร ไม่เปลี่ยนทุกครั้ง)"
