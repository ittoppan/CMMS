# nextjs-service.ps1 - Start/stop/restart the CMMS-TPT Next.js production server.
# Used by Scheduled Task "CMMS-NextJS" (boot trigger, runs as SYSTEM) and for manual ops.
#
#   .\nextjs-service.ps1 -Action start|stop|restart|status
#
# The server runs the Next.js standalone build with PORT=3001.
# It must run from the standalone folder because `node server.js` resolves
# relative paths (public/, .next/) from its CWD.

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$root        = "C:\inetpub\wwwroot\cmms-tpt"
$standalone  = Join-Path $root "frontend\.next\standalone"
$nodeExe     = "C:\Program Files\nodejs\node.exe"
$port        = 3001
$logDir      = "C:\inetpub\wwwroot\cmms-tpt\logs"
$outLog      = Join-Path $logDir "nextjs.out.log"
$errLog      = Join-Path $logDir "nextjs.err.log"
$pidFile     = Join-Path $logDir "nextjs.pid"

function Get-NextPid {
    # Find the node process running the standalone server.js (never the script itself)
    $procs = Get-Process node -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
            if ($cmd -match "server\.js" -and $cmd -notmatch "nextjs-service") {
                return $p.Id
            }
        } catch {}
    }
    return $null
}

function Start-Next {
    $existing = Get-NextPid
    if ($existing) {
        Write-Host "Already running (PID $existing)"
        return
    }
    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath (Join-Path $standalone "server.js"))) {
        throw "server.js not found at $standalone - run scripts\deploy-next.ps1 first"
    }
    # PORT must be inherited by node via the environment (server.js reads process.env.PORT)
    $env:PORT = "$port"
    $p = Start-Process -FilePath $nodeExe -ArgumentList "server.js" `
        -WorkingDirectory $standalone -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $p.Id | Out-File -FilePath $pidFile -Encoding ascii
    Write-Host "Started node PID $($p.Id) (PORT=$port)"
}

function Stop-Next {
    $existing = Get-NextPid
    if ($existing) {
        Stop-Process -Id $existing -Force
        Write-Host "Stopped PID $existing"
    } else {
        Write-Host "Not running"
    }
}

switch ($Action) {
    "start"   { Start-Next; exit 0 }
    "stop"    { Stop-Next;  exit 0 }
    "restart" {
        Stop-Next
        Start-Sleep -Seconds 2
        Start-Next
        exit 0
    }
    "status"  {
        $existing = Get-NextPid
        if ($existing) {
            Write-Host "RUNNING (PID $existing)"
            $listening = netstat -ano | Select-String ":$port" | Select-String "LISTENING"
            if ($listening) { Write-Host "Listening on port $port" } else { Write-Host "WARNING: process alive but not listening on $port" }
            exit 0
        } else {
            Write-Host "NOT RUNNING"
            exit 1
        }
    }
}
