# Register the two zrok reserved-share tunnels as boot-time scheduled tasks (run as SYSTEM).
# Re-run as Administrator after moving the project or switching zrok account.
#   CMMS-zrok-tpt : cmms-tpt.shares.zrok.io      -> localhost:3001  (Next.js frontend)
#   CMMS-zrok-api : cmms-tpt-api.shares.zrok.io  -> localhost:8081  (PHP/IIS API)
$ErrorActionPreference = 'Stop'

$wrapper = Join-Path $PSScriptRoot 'run-share.cmd'

function New-ZrokTask([string]$name, [string]$argline) {
    $action    = New-ScheduledTaskAction -Execute $wrapper -Argument $argline -WorkingDirectory $PSScriptRoot
    $triggers  = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -AtLogOn)
    )
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
                    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "Registered $name -> $argline"
}

New-ZrokTask 'CMMS-zrok-tpt' '3001 cmms-tpt'
New-ZrokTask 'CMMS-zrok-api' '8081 cmms-tpt-api'

Get-ScheduledTask -TaskName 'CMMS-zrok-*' | Select-Object TaskName, State | Format-Table -AutoSize
