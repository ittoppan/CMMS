# tunnel-ngrok.ps1 - PRIMARY tunnel: ngrok static domain -> http://localhost:3001
#   powershell -ExecutionPolicy Bypass -File tunnel-ngrok.ps1
#
# ngrok Static Domain (urltable) เปลี่ยนไมไดตอน restart -> ใชกบ LINE Webhook / LINE Login callback
#
# Output:
#   logs\tunnel-url.txt   <- public URL (ใชกบ LINE webhook / QR / ลิงกภายนอก)
#   logs\tunnel-ngrok.log
#
# exit codes: 0 = ready / 1 = ยังไมพรอม (ทนง URL ok แลว แต web ไมตอบ)

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Continue"
$root      = "C:\inetpub\wwwroot\cmms-tpt"
$ngrokExe  = "C:\ngrok\ngrok.exe"
$tunnelName = "cmms-tpt"                 # ตองตรงกับ tunnels.<name> ใน ngrok config
$logDir    = Join-Path $root "logs"
$log       = Join-Path $logDir "tunnel-ngrok.log"
$urlFile   = Join-Path $logDir "tunnel-url.txt"
$apiUrl    = "http://127.0.0.1:4040/api/tunnels"

if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $log -Value "$ts $msg" -Encoding utf8 } catch {}
}

if (-not (Test-Path -LiteralPath $ngrokExe)) {
    Write-Host "!! ngrok.exe not found at $ngrokExe" -ForegroundColor Red
    exit 1
}

function Get-NgrokUrl {
    try {
        $r = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3 -ErrorAction Stop
        foreach ($t in @($r.tunnels)) {
            if ($t.public_url -and $t.public_url -match "ngrok-free\.app") { return ([string]$t.public_url).Trim() }
        }
    } catch {}
    return ""
}

function Get-NgrokStaticHint {
    $cfg = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
    if (Test-Path -LiteralPath $cfg) {
        try {
            $raw = Get-Content -LiteralPath $cfg -Raw
            if ($raw -match "domain:\s*([^\r\n]+)") {
                $d = $Matches[1].Trim()
                if ($d -match "^https?://") { return $d }
                return "https://$d"
            }
        } catch {}
    }
    return ""
}

# ---- ถามันรันอยูแลว เอา URL มากอน ----
$publicUrl = Get-NgrokUrl

if (-not $publicUrl) {
    # ยังไมรัน -> เปด fresh (static URL เดิมเสมอ ไมมผลตอ external link)
    if (-not $publicUrl) { $publicUrl = Get-NgrokStaticHint }
    Write-Log "ngrok not running - starting tunnel $tunnelName"
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    try {
        Start-Process -FilePath $ngrokExe -ArgumentList @("start", $tunnelName) -WindowStyle Hidden
    } catch {
        Write-Log "start ngrok FAILED: $_"
    }
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        $u = Get-NgrokUrl
        if ($u) { $publicUrl = $u; break }
    }
}

if (-not $publicUrl -or -not $publicUrl -match "\.ngrok-free\.app") {
    Write-Host "!! ngrok not ready / no public_url - see ngrok logs" -ForegroundColor Red
    if ($publicUrl) { $publicUrl | Out-File -FilePath $urlFile -Encoding ascii }
    exit 1
}

$publicUrl | Out-File -FilePath $urlFile -Encoding ascii
Write-Host "==> Tunnel URL: $publicUrl" -ForegroundColor Green
Write-Host "    (saved to logs\tunnel-url.txt)" -ForegroundColor DarkGray
Write-Log "ready -> $publicUrl"

# ---- probe จริง (ngrok skip-warning header) ----
$reachable = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "$publicUrl/login" -UseBasicParsing -TimeoutSec 8 -Headers @{ "ngrok-skip-browser-warning" = "1" }
        if ([int]$resp.StatusCode -eq 200) { $reachable = $true; break }
    } catch {}
}
if ($reachable) {
    Write-Host "    URL responding (HTTP 200)" -ForegroundColor Green
} else {
    Write-Host "    URL not responding yet - node may still be starting; watchdog will retry" -ForegroundColor Yellow
}
exit 0