# backup-task.ps1 - เรียกจาก Scheduled Task "CMMS-Backup" (รันทุกคืน 02:30)
# รัน backup.sh ผ่าน Git Bash (ต้องมี bash สำหรับ mysqldump/tar/gzip)
#
#   powershell -ExecutionPolicy Bypass -File backup-task.ps1
#   exit 0 = สำเร็จ, exit 1 = bash ไม่พบ/ล้มเหลว

$ErrorActionPreference = "Stop"
$root  = "C:\inetpub\wwwroot\cmms-tpt"
$log   = Join-Path $root "logs\backup.log"

# หา bash (Git Bash 64-bit -> 32-bit)
$bash = $null
foreach ($p in @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe",
    "C:\Program Files\Git\usr\bin\bash.exe"
)) {
    if (Test-Path -LiteralPath $p) { $bash = $p; break }
}

if (-not $bash) {
    $msg = "[backup-task] ERROR: ไม่พบ bash.exe (Git Bash) — ตรวจสอบการติดตั้ง Git"
    try { Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" -Encoding utf8 } catch {}
    Write-Host $msg -ForegroundColor Red
    exit 1
}

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
try { Add-Content -LiteralPath $log -Value "$ts [backup-task] เริ่ม backup..." -Encoding utf8 } catch {}

& $bash -lc "cd /c/inetpub/wwwroot/cmms-tpt && bash scripts/backup.sh >> logs/backup.log 2>&1"
$exit = $LASTEXITCODE

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
try { Add-Content -LiteralPath $log -Value "$ts [backup-task] จบ (bash exit $exit)" -Encoding utf8 } catch {}

exit $exit
