# Deploy CMMS-TPT frontend (Next.js standalone) — Windows PowerShell
# ขั้นตอน: build -> copy public + .next/static ไป standalone -> restart server :3001
#
# ทำไมต้อง copy เอง:
#   Turbopack + outputFileTracingRoot=C:\inetpub\wwwroot\cmms-tpt (repo root)
#   ทำให้ build ใหม่ไม่ copy public และ .next/static เข้า standalone
#   ถ้าไม่ copy: /icons/*.png 404 + ทุก /_next/static/chunks 404
#   (HTML โหลดได้แต่ React mount ไม่ได้ = หน้าเปิดใน LINE เป็น error — ต้นตอ 400)
#
# ทำไมต้อง restart หลัง copy:
#   next-server (fs-checker) อ่านรายการไฟล์ public เข้า Set ตอน startup
#   (recursiveReadDir) — ไฟล์ที่เพิ่มหลัง startup จะไม่มีทางถูก serve

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
# server.js (standalone) อ่าน static จาก __dirname\.next\static และ public จาก __dirname\public
# (__dirname = .next\standalone) — ห้าม copy ไป subfolder อื่น ไม่งั้น chunks/manifest/logo 404
$frontendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicSrc   = Join-Path $frontendDir "public"
$nextStaticSrc = Join-Path $frontendDir ".next\static"
$standaloneDir = Join-Path $frontendDir ".next\standalone"
$standalonePublic = Join-Path $standaloneDir "public"
$standaloneNextStatic = Join-Path $standaloneDir ".next\static"
$port = 3001

# หยุด server เก่าก่อน build (server.js ล็อกไฟล์ใน .next\standalone -> build จะ EBUSY)
$oldConn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($oldConn) {
    Write-Host "==> stop old server on :$port (before build)" -ForegroundColor Cyan
    Stop-Process -Id $oldConn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

if (-not $SkipBuild) {
    Write-Host "==> npm run build" -ForegroundColor Cyan
    Push-Location $frontendDir
    try { npm run build } finally { Pop-Location }
}

# Auto-bump service worker version on every deploy so clients pick up the
# new shell immediately (old caches = stale chunks / hydration mismatches).
$swFile = Join-Path $frontendDir "public\sw.js"
if (Test-Path -LiteralPath $swFile) {
    $sw = Get-Content $swFile -Raw
    if ($sw -match 'const SW_VERSION = "v([0-9]+)') {
        $next = [int]$Matches[1] + 1
        $stamp = Get-Date -Format "yyyyMMdd-HHmm"
        $sw = $sw -replace 'const SW_VERSION = "v[^"]*"', ('const SW_VERSION = "v' + $next + '-' + $stamp + '"')
        Set-Content $swFile $sw -Encoding UTF8 -NoNewline
        Write-Host "==> bumped SW_VERSION -> v$next-$stamp" -ForegroundColor Cyan
    } else {
        Write-Warning "SW_VERSION marker not found in sw.js — cache-bust skipped"
    }
}

if (Test-Path -LiteralPath $publicSrc) {
    Write-Host "==> copy public -> standalone" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $standalonePublic | Out-Null
    & robocopy $publicSrc $standalonePublic /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy public failed (exit $LASTEXITCODE)" }
}

if (Test-Path -LiteralPath $nextStaticSrc) {
    Write-Host "==> copy .next/static -> standalone" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $standaloneNextStatic | Out-Null
    & robocopy $nextStaticSrc $standaloneNextStatic /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy static failed (exit $LASTEXITCODE)" }
}

Write-Host "==> start server" -ForegroundColor Cyan
$env:PORT = "$port"
Start-Process -FilePath "node" -ArgumentList "server.js" `
    -WorkingDirectory $standaloneDir -WindowStyle Hidden
Start-Sleep -Seconds 5

$newConn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($newConn) {
    Write-Host "OK: server running PID $($newConn.OwningProcess) on :$port" -ForegroundColor Green
} else {
    throw "server did not start on :$port"
}
