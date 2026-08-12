# ensure-next.ps1 - ตรวจว่า Next.js production server (พอร์ต 3001) ตอบสนองหรือไม่
# ถ้าไม่รัน -> สตาร์ท standalone server + รอจนกว่า HTTP จะตอบ 200 (มี log)
# ใช้ร่วมกับ Scheduled Task "CMMS-NextJS" (boot) และ watchdog "CMMS-Watchdog"
#
#   powershell -ExecutionPolicy Bypass -File ensure-next.ps1 [-Port 3001]
#   exit 0 = รันอยู่/สตาร์ทสำเร็จ, exit 1 = ยังไม่พร้อม (จะได้แจ้งเตือนต่อ)

param(
    [int]$Port = 3001,
    [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"
$root       = "C:\inetpub\wwwroot\cmms-tpt"
$standalone = Join-Path $root "frontend\.next\standalone"
$nodeExe    = "C:\Program Files\nodejs\node.exe"
$logDir     = Join-Path $root "logs"
$log        = Join-Path $logDir "ensure-next.log"
$pidFile    = Join-Path $logDir "nextjs.pid"

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

function Get-NextPid {
    $procs = Get-Process node -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
            if ($cmd -match "server\.js") { return $p.Id }
        } catch {}
    }
    return $null
}

function Start-Next {
    if (-not (Test-Path -LiteralPath (Join-Path $standalone "server.js"))) {
        Write-Log "ERROR server.js not found at $standalone — deploy ยังไม่เสร็จ"
        return $false
    }
    $env:PORT = "$Port"
    $p = Start-Process -FilePath $nodeExe -ArgumentList "server.js" `
        -WorkingDirectory $standalone -WindowStyle Hidden -PassThru
    $p.Id | Out-File -FilePath $pidFile -Encoding ascii
    Write-Log "Started node PID $($p.Id) (PORT=$Port)"
    return $true
}

# 1) ถ้าตอบ 200 แล้ว -> จบ
$code = Test-Url "http://127.0.0.1:$Port/login"
if ($code -eq 200) {
    Write-Log "OK server responding on :$Port"
    exit 0
}

# 2) ยังไม่ตอบ -> สตาร์ทถ้ายังไม่มี process
$pid = Get-NextPid
if (-not $pid) {
    Write-Log "Not running — starting..."
    [void](Start-Next)
} else {
    Write-Log "Process alive (PID $pid) but not responding — waiting for readiness"
}

# 3) รอจนกว่าจะตอบ 200
for ($i = 0; $i -lt $WaitSeconds; $i += 3) {
    Start-Sleep -Seconds 3
    if ((Test-Url "http://127.0.0.1:$Port/login") -eq 200) {
        Write-Log "Ready after ~$($i+3)s on :$Port"
        exit 0
    }
}

Write-Log "FAIL server not ready on :$Port within ${WaitSeconds}s"
exit 1
