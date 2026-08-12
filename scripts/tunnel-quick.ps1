# tunnel-quick.ps1 - restart trycloudflare (ชั่วคราว) tunnel -> localhost:3001
# ใช้ได้ทันทีโดยไม่ต้องมี domain เอง แต่ URL เปลี่ยนทุกครั้งที่ restart
#   powershell -ExecutionPolicy Bypass -File tunnel-quick.ps1
#
# Output:
#   logs\tunnel-url.txt  <- URL ล่าสุด (ใช้กับแอป/QR ได้)
#   logs\tunnel-quick.log

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Continue"
$root    = "C:\inetpub\wwwroot\cmms-tpt"
$cfExe   = "C:\cloudflared\cloudflared.exe"
$logDir  = Join-Path $root "logs"
$log     = Join-Path $logDir "tunnel-quick.log"
$urlFile = Join-Path $logDir "tunnel-url.txt"

if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $log -Value "$ts $msg" -Encoding utf8 } catch {}
}

if (-not (Test-Path -LiteralPath $cfExe)) {
    Write-Host "!! ไม่พบ cloudflared ที่ $cfExe" -ForegroundColor Red
    exit 1
}

# ปิด process เก่า (ทุก instance ที่รัน quick tunnel)
$old = Get-Process cloudflared -ErrorAction SilentlyContinue
foreach ($p in $old) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Log "stopped old cloudflared PID $($p.Id)" } catch {}
}
Start-Sleep -Seconds 2

# สตาร์ทใหม่ (background) — บันทึก URL ผ่าน log file
$logFile = Join-Path $logDir "cloudflared.log"
$p = Start-Process -FilePath $cfExe -ArgumentList "tunnel --url http://localhost:$Port --logfile `"$logFile`"" -WindowStyle Hidden -PassThru
Write-Log "started cloudflared PID $($p.Id) -> localhost:$Port"

# รอ URL โผล่ใน log (trycloudflare พิมพ์ URL หลัง ready ~5-10 วิ)
$url = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $logFile) {
        $m = Select-String -LiteralPath $logFile -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1
        if ($m) { $url = $m.Matches[0].Value; break }
    }
}

if ($url) {
    $url | Out-File -FilePath $urlFile -Encoding ascii
    Write-Host "==> Tunnel URL: $url" -ForegroundColor Green
    Write-Host "    (บันทึกไว้ที่ logs\tunnel-url.txt)" -ForegroundColor DarkGray

    # รอให้ URL ตอบสนองจริง (ตอน boot node อาจยังไม่พร้อม — แค่รายงาน ไม่ block)
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
} else {
    Write-Host "!! ยังไม่เห็น URL ใน log — ดู logs\cloudflared.log" -ForegroundColor Red
    exit 1
}
