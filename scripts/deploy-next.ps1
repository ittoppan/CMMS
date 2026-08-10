# deploy-next.ps1 - Build Next.js PWA, stage standalone output, restart node server, verify.
# Usage: powershell -ExecutionPolicy Bypass -File deploy-next.ps1 [-SkipBuild] [-Port 3001]
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
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = "C:\inetpub\wwwroot\cmms-tpt"
$frontend = Join-Path $root "frontend"
$standalone = Join-Path $frontend ".next\standalone"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$logDir = "C:\Users\ADMINI~1.MAJ\AppData\Local\Temp\opencode"

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
    Write-Host "Starting node server (PORT=$Port) from $standalone ..."
    # PORT must be inherited by node via the environment (server.js reads process.env.PORT)
    $env:PORT = "$Port"
    $proc = Start-Process -FilePath $nodeExe -ArgumentList "server.js" `
        -WorkingDirectory $standalone -WindowStyle Hidden -PassThru
    $pidFile = Join-Path $logDir "nextjs.pid"
    $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
    Write-Host "Started PID $($proc.Id) (saved to $pidFile)"
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

Write-Host "=== CMMS-TPT Next.js deploy ==="

# 1. stop current server (releases the standalone folder lock)
Stop-NextServer

if (-not $SkipBuild) {
    # 2. clean + build
    Remove-Item -Recurse -Force -LiteralPath (Join-Path $frontend ".next") -ErrorAction SilentlyContinue
    Write-Host "Building (npm run build)..."
    Push-Location $frontend
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

# 3. stage standalone: copy .next/static + public (Next standalone does NOT do this)
Write-Host "Staging standalone output..."
Copy-Item -Recurse -Force -LiteralPath (Join-Path $frontend ".next\static") -Destination (Join-Path $standalone ".next\static")
Copy-Item -Recurse -Force -LiteralPath (Join-Path $frontend "public")  -Destination (Join-Path $standalone "public")

# sanity: server.js must exist at standalone root (Next 16 with turbopack.root set)
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
    throw "server.js not found at $standalone - check next.config turbopack.root / output layout"
}

# 4. start server
Start-NextServer

# 5. verify (wait until the server actually starts listening)
Write-Host "Waiting for server to be ready..."
if (-not (Wait-ServerReady)) {
    Write-Host "FAIL server did not become ready on port $Port within 30s"
    exit 1
}
$hostUrl = "http://localhost:$Port"
$ok = 0; $total = 0
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
if ($ok -ne $total) { exit 1 }
