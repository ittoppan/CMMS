# deploy-next.ps1 - Build Next.js PWA, stage standalone output, restart node server, verify.
# Usage: powershell -ExecutionPolicy Bypass -File deploy-next.ps1 [-SkipBuild] [-Prebuilt <dir>] [-Port 3001]
#   -Prebuilt <dir> : fast-deploy — reuse a prebuilt .next (e.g. from the worktree) instead of
#                     running `npm run build` on the production box. Cuts the server-down window
#                     from minutes to seconds. The dir must contain .next\standalone\server.js.
# Deploys to http://<host>:3001 — the production Next.js server.
#
# Why manual staging is required:
#   Next.js `output: "standalone"` does NOT copy .next/static or public/ into the
#   standalone folder — they must be copied manually, otherwise the browser gets
#   404s for every JS/CSS chunk, logo.png, manifest.webmanifest and sw.js.
#
# Why node must be stopped before build:
#   The running `node server.js` holds the standalone directory as its CWD, which
#   locks it and makes `next build` fail with EBUSY on rmdir.

param(
    [int]$Port = 3001,
    [switch]$SkipBuild,
    [string]$Prebuilt = ""
)

$ErrorActionPreference = "Stop"
$root = "C:\inetpub\wwwroot\cmms-tpt"
$frontend = Join-Path $root "frontend"
$standalone = Join-Path $frontend ".next\standalone"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$logDir = Join-Path $root "logs"   # project logs\ — same folder ensure-next.ps1 / nextjs-service.ps1 use
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Stop-NextServer {
    $procs = Get-Process node -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
            if ($cmd -match "server\.js") {
                Write-Host "Stopping node PID $($p.Id): $cmd"
                Stop-Process -Id $p.Id -Force
            }
        } catch {}
    }
    Start-Sleep -Seconds 2
}

function Start-NextServer {
    # Start via the Scheduled Task "CMMS-NextJS" instead of a direct Start-Process:
    # node started from an interactive/agent session can bind 127.0.0.1 only, which
    # makes the site unreachable from the LAN even though localhost keeps answering.
    $taskName = "CMMS-NextJS"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "FAIL scheduled task '$taskName' not found - cannot start the Next.js server" -ForegroundColor Red
        Send-Telegram "[CMMS] DEPLOY FAIL scheduled task $taskName not found"
        exit 1
    }
    Write-Host "Starting node server via scheduled task '$taskName' (PORT=$Port) ..."
    Start-ScheduledTask -TaskName $taskName
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if ((Get-ScheduledTask -TaskName $taskName).State -ne "Running") { break }
    }
    Write-Host "Scheduled task '$taskName' triggered"
}

function Test-BoundAllInterfaces {
    # localhost:3001 ตอบ 200 ไม่ได้แปลว่า LAN เข้าได้ — ต้องมี listener บน 0.0.0.0
    param([int]$ListenPort = 3001)
    $listeners = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) { return $false }
    return [bool]($listeners | Where-Object { $_.LocalAddress -eq "0.0.0.0" -or $_.LocalAddress -eq "::" })
}

function Get-LanBaseUrl {
    param([int]$ListenPort = 3001)
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress
    if (-not $ip) { return "" }
    return "http://$($ip):$ListenPort"
}

function Wait-ServerReady {
    param([int]$Seconds = 30)
    for ($i = 0; $i -lt $Seconds; $i += 3) {
        $code = Test-Url "http://localhost:$Port/login"
        if ($code -eq 200) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
        return $r.StatusCode
    } catch {
        return 0
    }
}

function Send-Telegram([string]$message) {
    # เก็บ token/chat ไว้ใน environment variables เสมอ (AGENTS.md) — อย่า commit จริง
    $token = $env:TELEGRAM_BOT_TOKEN
    $chat  = $env:TELEGRAM_CHAT_ID
    if (-not $token -or -not $chat) { return }
    try {
        Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/sendMessage" `
            -Method Post -Body @{ chat_id = $chat; text = $message } -TimeoutSec 15 | Out-Null
    } catch {
        Write-Host "Telegram notify failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Assert-DeployableNextDir {
    # ตรวจว่า .next ที่จะเอาไป deploy มี layout ของ output:standalone ปกติ
    # คืนข้อความปัญหา (ว่าง = ใช้ได้) — ต้องเรียกก่อนหยุด server เสมอ
    param([string]$NextDir)
    $sa = Join-Path $NextDir "standalone"
    if (-not (Test-Path -LiteralPath (Join-Path $sa "server.js"))) {
        return "server.js not found at $sa (build/prebuilt ยังไม่สมบูรณ์)"
    }
    $alien = @(Get-ChildItem -LiteralPath $sa -Directory -Filter ".next-*" -ErrorAction SilentlyContinue)
    if ($alien.Count -gt 0) {
        return "standalone ถูก build ด้วย NEXT_DIST_DIR ($($alien[0].Name)) - runtime/static อยู่ใต้ชื่อ distDir ทำให้ asset 404; ให้ build ด้วย distDir ปกติ (.next)"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $sa ".next"))) {
        return "standalone\.next missing - layout ไม่ใช่ output:standalone ปกติ"
    }
    return ""
}

Write-Host "=== CMMS-TPT Next.js deploy ==="

# 0. fail fast — ตรวจทุกเงื่อนไข “ก่อน” แตะ server ที่รันอยู่
#    (เดิม: หยุด server ก่อนแล้วค่อย throw → เว็บ down ฟรี)
if ($env:NEXT_DIST_DIR) {
    Write-Host "FAIL: NEXT_DIST_DIR=$($env:NEXT_DIST_DIR) ใช้กับ deploy ไม่ได้" -ForegroundColor Red
    Write-Host "      build ด้วย distDir ที่ไม่ใช่ .next ทำให้ standalone เก็บไฟล์ใต้ชื่อ distDir และ static/BUILD_ID ตรวจไม่เจอ (asset 404)" -ForegroundColor Red
    Write-Host "      ให้ unset NEXT_DIST_DIR แล้ว build ด้วย distDir ปกติ (หรือส่ง -Prebuilt ที่ build แบบปกติ)" -ForegroundColor Red
    exit 1
}

# 0b. -SkipBuild ต้องมี -Prebuilt (กัน deploy .next ที่พัง/เก่าเงียบ ๆ — เหตุการณ์ 2026-08-30)
if ($SkipBuild -and -not $Prebuilt) {
    Write-Host "FAIL: -SkipBuild ต้องระบุ -Prebuilt <dir> ที่มี .next\standalone\server.js ด้วย" -ForegroundColor Red
    exit 1
}

$prebuiltNext = ""
if ($Prebuilt) {
    if (-not (Test-Path -LiteralPath $Prebuilt)) {
        Write-Host "FAIL: -Prebuilt path not found: $Prebuilt" -ForegroundColor Red
        exit 1
    }
    $Prebuilt = (Resolve-Path -LiteralPath $Prebuilt).Path
    $prebuiltNext = Join-Path $Prebuilt ".next"
    if (-not (Test-Path -LiteralPath $prebuiltNext)) {
        Write-Host "FAIL: -Prebuilt ต้องมี .next อยู่ข้างใน: $prebuiltNext" -ForegroundColor Red
        exit 1
    }
    $prebuiltIssue = Assert-DeployableNextDir -NextDir $prebuiltNext
    if ($prebuiltIssue) {
        Write-Host "FAIL: prebuilt ใช้ไม่ได้ — $prebuiltIssue" -ForegroundColor Red
        Write-Host "      (ยังไม่หยุด server; build ใหม่แบบปกติหรือแก้ prebuilt ก่อน)" -ForegroundColor Red
        exit 1
    }
}

# 1. stop current server (releases the standalone folder lock)
Stop-NextServer

# 2. clean + (build หรือ copy prebuilt)
Remove-Item -Recurse -Force -LiteralPath (Join-Path $frontend ".next") -ErrorAction SilentlyContinue
if ($Prebuilt) {
    # fast-deploy: copy the prebuilt bundle (ใช้ได้ทั้งมีและไม่มี -SkipBuild)
    Write-Host "Reusing prebuilt .next from $Prebuilt (skip build=$SkipBuild)..."
    Copy-Item -Recurse -Force -LiteralPath $prebuiltNext -Destination (Join-Path $frontend ".next")
} else {
    Write-Host "Building (npm run build)..."
    Push-Location $frontend
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

# 2b. post-build sanity: layout ต้องเป็น output:standalone ปกติ + มี BUILD_ID เสมอ (กัน deploy เก่า)
$layoutIssue = Assert-DeployableNextDir -NextDir (Join-Path $frontend ".next")
if ($layoutIssue) { throw "deploy ไม่ได้: $layoutIssue" }
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
    throw "server.js not found at $standalone - build ยังไม่สมบูรณ์ (output:standalone/ turbopack.root)"
}
$buildIdFile = Join-Path $frontend ".next\BUILD_ID"
if (-not (Test-Path $buildIdFile)) {
    throw "BUILD_ID not found at $buildIdFile - build ไม่สมบูรณ์"
}
$deployedBuildId = (Get-Content $buildIdFile -Raw).Trim()
Write-Host "Deploying BUILD_ID=$deployedBuildId"

# 3. stage standalone: copy .next/static + public (Next standalone does NOT do this)
Write-Host "Staging standalone output..."
Copy-Item -Recurse -Force -LiteralPath (Join-Path $frontend ".next\static") -Destination (Join-Path $standalone ".next\static")
Copy-Item -Recurse -Force -LiteralPath (Join-Path $frontend "public")  -Destination (Join-Path $standalone "public")

# sanity: server.js must exist at standalone root (Next 16 with turbopack.root set)
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
    throw "server.js not found at $standalone - check next.config turbopack.root / output layout"
}

# 4. start server via the scheduled task (binds 0.0.0.0, reachable from the LAN)
Start-NextServer

# 5. verify (wait until the server actually starts listening)
Write-Host "Waiting for server to be ready..."
if (-not (Wait-ServerReady)) {
    Write-Host "FAIL server did not become ready on port $Port within 30s"
    exit 1
}

# 5a. ต้องผูก 0.0.0.0 จริง — กันเคส server ตอบ localhost แต่ LAN เข้าไม่ได้
Write-Host "Checking port $Port is bound to all interfaces (LAN reachable)..."
if (-not (Test-BoundAllInterfaces -ListenPort $Port)) {
    $bound = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty LocalAddress) -join ", "
    Write-Host "FAIL port $Port bound to [$bound] only - LAN clients cannot connect (expected 0.0.0.0)" -ForegroundColor Red
    Send-Telegram "[CMMS] DEPLOY FAIL :$Port not bound to 0.0.0.0 (LAN unreachable)"
    exit 1
}
Write-Host "OK port $Port is bound to 0.0.0.0"

# 5b. ยืนยัน server ที่รันอยู่เสิร์ฟ BUILD_ID ตัวที่ deploy (กันรันของเก่า/พัง)
#     Next 16 Turbopack: static paths ใช้ hash ต่อไฟล์ (ไม่ฝัง BUILD_ID)
#     → ตรวจตรง ๆ ว่า /_next/static/<BUILD_ID>/_buildManifest.js สมัคร 200
Write-Host "Verifying deployed BUILD_ID is being served..."
$buildManifestUrl = "http://localhost:$Port/_next/static/$deployedBuildId/_buildManifest.js"
if ((Test-Url $buildManifestUrl) -ne 200) {
    Write-Host "FAIL: server ไม่เสิร์ฟ BUILD_ID=$deployedBuildId ($buildManifestUrl -> 404/ไม่เจอ รันของเก่ายังค้างอยู่?)" -ForegroundColor Red
    exit 1
}
Write-Host "OK live server serves BUILD_ID=$deployedBuildId"
$hostUrl = "http://localhost:$Port"
$ok = 0; $total = 0

# ยืนยันเส้นทาง LAN จริง (ไม่ใช่แค่ loopback) — ยิงผ่าน IP ของเครื่อง
$lanBaseUrl = Get-LanBaseUrl -ListenPort $Port
if ($lanBaseUrl) {
    foreach ($page in @("/login", "/dashboard")) {
        $total++
        $code = Test-Url "$lanBaseUrl$page"
        if ($code -eq 200) { $ok++; Write-Host "OK  LAN $lanBaseUrl$page -> 200" } else { Write-Host "FAIL LAN $lanBaseUrl$page -> $code" }
    }
} else {
    Write-Host "WARN no non-loopback IPv4 found - skipped LAN HTTP check"
}

foreach ($page in @("/login", "/dashboard")) {
    $total++
    $code = Test-Url "$hostUrl$page"
    if ($code -eq 200) { $ok++; Write-Host "OK  $page -> 200" } else { Write-Host "FAIL $page -> $code" }
}
$html = (Invoke-WebRequest -Uri "$hostUrl/dashboard" -UseBasicParsing -TimeoutSec 15).Content
$refs = [regex]::Matches($html, '/_next/static/[^"'']+\.(js|css)') | ForEach-Object { $_.Value } | Select-Object -Unique
foreach ($ref in $refs) {
    $total++
    $code = Test-Url "$hostUrl$ref"
    if ($code -eq 200) { $ok++ } else { Write-Host "FAIL asset $ref -> $code" }
}
foreach ($f in @("/logo.png", "/manifest.webmanifest", "/sw.js")) {
    $total++
    $code = Test-Url "$hostUrl$f"
    if ($code -eq 200) { $ok++ } else { Write-Host "FAIL $f -> $code" }
}

Write-Host ""
Write-Host "=== Deploy finished: $ok/$total checks passed ==="
if ($ok -ne $total) {
    Send-Telegram "[CMMS] DEPLOY FAIL :3001 ($ok/$total checks)"
    exit 1
}
Send-Telegram "[CMMS] DEPLOY OK :3001 BUILD_ID=$deployedBuildId ($ok/$total checks)"
