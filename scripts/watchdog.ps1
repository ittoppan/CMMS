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
$phpExe = $null
$cmdPhp = Get-Command php -ErrorAction SilentlyContinue
if ($cmdPhp) { $phpExe = $cmdPhp.Source }
if (-not $phpExe -and (Test-Path -LiteralPath "C:\PHP\php.exe")) { $phpExe = "C:\PHP\php.exe" }
if (-not $phpExe -and (Test-Path -LiteralPath "C:\Program Files\PHP\php.exe")) { $phpExe = "C:\Program Files\PHP\php.exe" }
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
            # เขียนแบบ UTF-8 ไม่มี BOM (ไม่งั้น BOM จะหลุดเข้าไปต้นข้อความใน LINE)
            $tmpMsg = Join-Path $env:TEMP "cmms-watchdog-msg.txt"
            [System.IO.File]::WriteAllText($tmpMsg, $message, (New-Object System.Text.UTF8Encoding $false))
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
        # 1.2) LINE webhook — อัปเดต endpoint อัตโนมัติเมื่อ tunnel URL เปลี่ยน (สคริปต์เช็คเอง)
        $webhookScript = Join-Path $root "scripts\update_line_webhook.php"
        if ($phpExe -and (Test-Path -LiteralPath $webhookScript)) {
            try {
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                $whOut = (& $phpExe $webhookScript 2>&1 | Out-String).Trim()
                if ($LASTEXITCODE -ne 0) {
                    Write-Log "LINE webhook update FAILED: $whOut"
                } elseif ($whOut -match "updated") {
                    Write-Log "LINE webhook: $whOut"
                }
            } catch {
                Write-Log "LINE webhook script error: $_"
            }
        }
        # 1.3) weekly report (สัปดาห์ละ 1 ครั้ง, ทุกวันจันทร์) — สรุปงานซ่อมบำรุงประจำสัปดาห์
        $weekFile = Join-Path $logDir "weekly_report.date"
        # หมายเลขสัปดาห์แบบง่าย (เปลี่ยนทุกสัปดาห์ — ใช้เป็น trigger รายสัปดาห์; ISOWeek ไม่มีใน PS 5.1)
        $thisWeek = (Get-Date -Format "yyyy") + "-W" + ([math]::Floor((((Get-Date).DayOfYear - 1) / 7) + 1))
        $lastWeek = ""
        if (Test-Path -LiteralPath $weekFile) { $lastWeek = ((Get-Content -LiteralPath $weekFile -Raw) -replace "[\r\n]", "").Trim() }
        if ($lastWeek -ne $thisWeek) {
            Write-Log "Weekly report check ($thisWeek)..."
            $reportScript = Join-Path $root "scripts\weekly_report.php"
            if ($phpExe -and (Test-Path -LiteralPath $reportScript)) {
                try {
                    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                    & $phpExe $reportScript 2>&1 | ForEach-Object { Write-Log "  weekly_report: $_" }
                    Set-Content -LiteralPath $weekFile -Value $thisWeek -Encoding ascii
                    Write-Log "Weekly report done"
                } catch {
                    Write-Log "Weekly report FAILED: $_"
                }
            } else {
                Write-Log "weekly_report.php not found or php missing ($phpExe)"
            }
        }
        # 1.2) daily alert check (วันละ 1 ครั้ง) — PM ใกล้กำหนด + สต็อกต่ำ
        $alertDateFile = Join-Path $logDir "alert_check.date"
        $todayStr = Get-Date -Format "yyyy-MM-dd"
        $lastCheck = ""
        if (Test-Path -LiteralPath $alertDateFile) { $lastCheck = ((Get-Content -LiteralPath $alertDateFile -Raw) -replace "[\r\n]", "").Trim() }
        if ($lastCheck -ne $todayStr) {
            Write-Log "Daily alert check ($todayStr)..."
            $checkScript = Join-Path $root "scripts\alert_check.php"
            if ($phpExe -and (Test-Path -LiteralPath $checkScript)) {
                try {
                    # อ่าน output ของ php เป็น UTF-8 (กันตัวหนังสือไทยเพี้ยนใน log)
                    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                    & $phpExe $checkScript 2>&1 | ForEach-Object { Write-Log "  alert_check: $_" }
                    Set-Content -LiteralPath $alertDateFile -Value $todayStr -Encoding ascii
                    Write-Log "Daily alert check done"
                } catch {
                    Write-Log "Daily alert check FAILED: $_"
                }
            } else {
                Write-Log "alert_check.php not found or php missing ($phpExe)"
            }
        }

        # 1.4) ตรวจ Apache :8081 (PHP เว็บหลัก) — Next.js ขึ้นแต่ Apache ตาย = API ทั้งหมดพัง
        $apacheUrl = "http://127.0.0.1:8081/login.php"
        if (-not ((Test-Url $apacheUrl) -eq 200)) {
            Write-Log "WARN Apache :8081 DOWN — retry..."
            $apacheDown = $true
            for ($i = 0; $i -lt $ProbeCount; $i++) {
                Start-Sleep -Seconds $ProbeGapSec
                if ((Test-Url $apacheUrl) -eq 200) { $apacheDown = $false; break }
            }
            if ($apacheDown) {
                Write-Log "Apache :8081 still DOWN — attempting restart"
                Send-Alert "⚠️ [CMMS Watchdog] Apache (PHP :8081) ไม่ตอบสนอง — กำลัง restart บริการ Apache2.4..."
                try {
                    Restart-Service -Name Apache2.4 -Force -ErrorAction Stop
                    Start-Sleep -Seconds 5
                } catch {
                    Write-Log "Restart-Service Apache2.4 failed: $_"
                    # fallback: สั่ง restart ผ่าน httpd เอง
                    try {
                        & "C:\Apache24\bin\httpd.exe" -k restart 2>&1 | Out-Null
                        Start-Sleep -Seconds 5
                    } catch {
                        Write-Log "httpd -k restart failed: $_"
                    }
                }
                if ((Test-Url $apacheUrl) -eq 200) {
                    Write-Log "Apache RECOVERED on :8081"
                    Send-Alert "✅ [CMMS Watchdog] Apache (PHP :8081) กลับมาทำงานแล้ว"
                } else {
                    Write-Log "Apache STILL DOWN after restart"
                    Send-Alert "🔴 [CMMS Watchdog] Apache (PHP :8081) ยังไม่กลับมาหลัง restart — กรุณาตรวจสอบทันที"
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
