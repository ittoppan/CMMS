# watchdog.ps1 - ตรวจสุขภาพเว็บทุก 1 นาที (Scheduled Task "CMMS-Watchdog")
#   - เว็บตอบ 200  -> จบ (ไม่มีอะไรทำ)
#   - เว็บตาย      -> ลองอีก 3 ครั้ง (30 วิ) -> restart ผ่าน ensure-next.ps1
#                     -> ยังไม่ขึ้น -> แจ้งเตือน LINE (LINE Notify) + log
#
#   powershell -ExecutionPolicy Bypass -File watchdog.ps1
#   exit 0 = ปกติ / กู้คืนได้, exit 1 = ยังลงอยู่ (มีการแจ้งเตือนแล้ว)

param(
    [int]$Port        = 3001,
    [int]$ProbeCount  = 3,     # จำนวนครั้งที่ลองเช็คซ้ำก่อน restart
    [int]$ProbeGapSec = 10,    # วินาทีระหว่างการลองแต่ละครั้ง
    [int]$LockMinutes = 5      # ป้องกันรันซ้อน (ถ้า run ก่อนหน้ายังค้างอยู่)
)

$ErrorActionPreference = "Stop"
$root   = "C:\inetpub\wwwroot\cmms-tpt"
$logDir = Join-Path $root "logs"
$log    = Join-Path $logDir "watchdog.log"
$lock   = Join-Path $logDir "watchdog.lock"
$cmdPhp = Get-Command php -ErrorAction SilentlyContinue
if ($cmdPhp) {
    $phpExe = $cmdPhp.Source
} else {
    $phpExe = "C:\Program Files\PHP\php.exe"
}
$notifyScript = Join-Path $root "scripts\watchdog-notify.php"

if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $log -Value "$ts $msg" -Encoding utf8 } catch {}
}

function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        return [int]$r.StatusCode
    } catch {
        return 0
    }
}

function Send-Alert([string]$message) {
    if (-not $phpExe) { Write-Log "LINE alert skipped (php not found): $message"; return }
    if (Test-Path -LiteralPath $notifyScript) {
        try {
            # ส่งผ่านไฟล์ชั่วคราวเพื่อไม่ให้ข้อความพังเพราะ quoting ใน cmd
            $tmpMsg = Join-Path $env:TEMP "cmms-watchdog-msg.txt"
            Set-Content -LiteralPath $tmpMsg -Value $message -Encoding utf8 -NoNewline
            & $phpExe $notifyScript $tmpMsg | Out-Null
            Write-Log "LINE alert sent: $($message.Split("`n")[0])"
            Remove-Item -LiteralPath $tmpMsg -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Log "LINE alert FAILED: $_"
        }
    } else {
        Write-Log "notify script not found: $notifyScript"
    }
}

# ---- กันรันซ้อน (ถ้า run ก่อนหน้ายังค้าง เพราะ restart ใช้เวลานาน) ----
$stale = $false
if (Test-Path -LiteralPath $lock) {
    $age = (Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime
    if ($age.TotalMinutes -lt $LockMinutes) { $stale = $true }
}
if ($stale) {
    Write-Log "SKIP previous run still active (lock < ${LockMinutes} min)"
    exit 0
}
try { Set-Content -LiteralPath $lock -Value (Get-Date) -Encoding ascii } catch {}

try {
    # 1) ปกติ -> จบ
    if ((Test-Url "http://127.0.0.1:$Port/login") -eq 200) {
        # 1.1) ตรวจ tunnel เพิ่ม (ถ้ามี tunnel-url.txt) — เว็บ local ดี แต่คนนอกเข้าไม่ได้ก็พังเหมือนกัน
        $urlFile = Join-Path $logDir "tunnel-url.txt"
        if (Test-Path -LiteralPath $urlFile) {
            $tunnelUrl = ((Get-Content -LiteralPath $urlFile -Raw) -split "\s+")[0]
            if ($tunnelUrl -match "^https://") {
                if (-not ((Test-Url "$tunnelUrl/login") -eq 200)) {
                    Write-Log "WARN tunnel URL ลง ($tunnelUrl) — restart tunnel"
                    $tq = Join-Path $root "scripts\tunnel-quick.ps1"
                    & powershell -NoProfile -ExecutionPolicy Bypass -File $tq | Out-Null
                    Start-Sleep -Seconds 5
                    $newUrl = ((Get-Content -LiteralPath $urlFile -Raw) -split "\s+")[0]
                    Send-Alert "🔄 [CMMS Watchdog] tunnel ถูก restart — URL ใหม่: $newUrl"
                }
            }
        }
        exit 0
    }

    # 2) สงสัยตาย -> เช็คซ้ำก่อน
    $stillDown = $true
    for ($i = 0; $i -lt $ProbeCount; $i++) {
        Start-Sleep -Seconds $ProbeGapSec
        if ((Test-Url "http://127.0.0.1:$Port/login") -eq 200) { $stillDown = $false; break }
    }
    if (-not $stillDown) { exit 0 }

    Write-Log "WARN server DOWN on :$Port — attempting restart"
    Send-Alert "⚠️ [CMMS Watchdog] เว็บ CMMS ไม่ตอบสนอง (port $Port) — กำลัง restart อัตโนมัติ..."

    # 3) restart ผ่าน ensure-next.ps1 (idempotent + รอ ready)
    $ensure = Join-Path $root "scripts\ensure-next.ps1"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ensure -Port $Port | Out-Null
    $ensureExit = $LASTEXITCODE

    # 4) เช็คอีกรอบหลัง restart
    Start-Sleep -Seconds 5
    if ((Test-Url "http://127.0.0.1:$Port/login") -eq 200) {
        Write-Log "RECOVERED — server is back up on :$Port"
        Send-Alert "✅ [CMMS Watchdog] เว็บกลับมาใช้งานได้แล้ว (port $Port)"
        exit 0
    }

    # 5) ยังไม่ขึ้น -> แจ้งเตือนอีกครั้ง (เรื่องจริงจัง)
    $hostname = $env:COMPUTERNAME
    Write-Log "FAIL server still DOWN after restart (ensure exit $ensureExit)"
    Send-Alert "🔴 [CMMS Watchdog] RESTART ล้มเหลว — เว็บยังไม่กลับมา (port $Port, host $hostname) กรุณาตรวจสอบทันที"
    exit 1
}
finally {
    Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}
