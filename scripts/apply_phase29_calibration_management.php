$ErrorActionPreference = "Stop"
$root = "C:\inetpub\wwwroot\cmms-tpt"

#### PHASE 27/28 (asset reliability / RCA / failure / OOT) exclusion tokens (ASCII only)
$rel = @(
  'asset_reliab','asset-reliab','reliab','mtbf','mttr','rca','oot_event','oot_events','oot_eventid',
  'oot_track','oot_report','oot_dash','oot_mobile','oot_common','oot_oot','oot_config','oot_dataq',
  'failure_','failure','asset_lifecycl','lifecycle','criticality','critical_asset','criticalassets',
  'overhaul','asset_overhaul','asset_life','asset_aging','asset_registry_reliab','asset_criticality',
  'oot_oot','oot_management','oot_oot_events','asset_relationships','asset_components','asset_lifecycle',
  'asset_replacement','asset_reliability','rca_','oot_','mtbf_','mttr_','reliability','reliable',
  'oot_report','oot_reports','oot_e2e','oot_inspect','oot_instruments','reliab'
)
#### Phase 29 calibration tokens (ASCII)
$cal = @(
  'calib','calibrat','cal_','สอบเทียบ' -ne 'x','certificate','certificat','cal_instrument','cal_instruments',
  'cal_plan','cal_plans','cal_run','cal_runs','cal_oot','cal_cert','cal_certificate','cal_standard','cal_standards',
  'cal_proced','cal_procedure','cal_schedule','cal_sched','cal_dash','cal_data','cal_mobile','cal_config',
  'cal_report','cal_reports','cal_tracking','cal_track','cal_po','cal_dq','cal_dashboard','oot_event',
  'certification','traceab','traceability','standard_save','standard','procedures','procedure','สอบเทียบ'
)

function Split-Hunks($diff) {
  $hunks = New-Object System.Collections.Generic.List[object]
  $cur = New-Object System.Collections.Generic.List[string]
  foreach ($line in $diff) {
    if ($line -like '@@*') {
      if ($cur.Count -gt 0) { $hunks.Add(@($cur.ToArray())) }
      $cur = New-Object System.Collections.Generic.List[string]
    }
    $cur.Add($line)
  }
  if ($cur.Count -gt 0) { $hunks.Add(@($cur.ToArray())) }
  return ,$hunks
}

function Hunk-Class($hunk) {
  $body = ($hunk | Where-Object { $_ -match '^[+-]' -and $_ -notmatch '^(\+\+\+|---)' }) -join "`n"
  $hasCal = $false; $hasRel = $false
  foreach ($t in $cal) { if ($body -match [regex]::Escape($t)) { $hasCal = $true; break } }
  foreach ($t in $rel) { if ($body -match [regex]::Escape($t)) { $hasRel = $true; break } }
  if ($hasCal -and $hasRel) { return 'MIXED' }
  if ($hasCal) { return 'CAL' }
  if ($hasRel) { return 'REL' }
  return 'NONE'
}

function Get-Patch($hunks) {
  $out = @()
  foreach ($h in $hunks) { foreach ($l in $h) { $out += $l } }
  return $out
}

# Files that are calibration-DOMAIN (pure phase 29) — stage whole file
$calDomain = @(
  'public/api/v1/calibration.php',
  'public/api/v1/calibration_tracking.php',
  'public/api/v1/calibration_management.php',
  'src/helpers/calibration.php',
  'scripts/apply_phase29_calibration_management.php',
  'frontend/app/(dashboard)/calibration'
)

# Shared files where ONLY calibration hunks should be staged
$shared = @(
  'src/menu_catalog.php',
  'src/config/settings_defaults.php',
  'src/helpers/permissions.php',
  'frontend/lib/i18n.ts',
  'frontend/components/dashboard/sidebar-nav.tsx',
  'frontend/app/(dashboard)/layout.tsx',
  'frontend/app/(dashboard)/budget/page.tsx',
  'frontend/app/(dashboard)/cost/page.tsx',
  'frontend/app/scan/page.tsx',
  'public/api/v1/upload.php',
  'scripts/notification_engine.php',
  'src/services/NotificationCenterService.php',
  'frontend/tsconfig.json'
)

$rootGit = git -C $root rev-parse --git-dir
$rootDot = git -C $root rev-parse --show-toplevel

Write-Output "=== STAGE WHOLE FILE (pure calibration) ==="
foreach ($p in $calDomain) {
  $full = Join-Path $root $p
  if (Test-Path -LiteralPath $full) {
    git -C $root add -- $p
    Write-Output "staged(whole) $p"
  }
}

Write-Output "=== HUNK-LEVEL STAGING for shared files ==="
foreach ($p in $shared) {
  $full = Join-Path $root $p
  if (-not (Test-Path -LiteralPath $full)) { continue }
  $baseContent = git -C $root show "HEAD:$p" 2>$null
  if (-not $baseContent) { Write-Output "noHEAD(untracked?) $p"; continue }
  $diff = git -C $root diff --unified=1 -- $p
  if (-not $diff) { continue }

  $hunks = Split-Hunks $diff
  $calHunk = New-Object System.Collections.Generic.List[object]
  foreach ($h in $hunks) {
    $cls = Hunk-Class $h
    if ($cls -eq 'CAL') { $calHunk.Add($h) }
  }
  if ($calHunk.Count -eq 0) { Write-Output "SKIP(no cal hunk) $p"; continue }

  # Only stage the CAL hunks by applying patch sections to the index
  $patch = Get-Patch ($calHunk.ToArray())
  $tmpId = [guid]::NewGuid().ToString("N")
  $tmpPatch = Join-Path $env:TEMP ("p29_cal_" + $tmpId + ".patch")
  $dump = New-Object System.Collections.Generic.List[string]
  $header = git -C $root diff --unified=1 -- $p | Select-Object -First 1
  $headerLines = New-Object System.Collections.Generic.List[string]
  # capture file header lines (diff --git + index + ---/+++ before first @@)
  $capture = $true
  foreach ($line in $diff) {
    if ($line -like '@@*') { $capture = $false }
    if ($capture) { $headerLines.Add($line) }
  }
  $all = New-Object System.Collections.Generic.List[string]
  foreach ($l in $headerLines) { $all.Add($l) }
  foreach ($h in $calHunk.ToArray()) { foreach ($l in $h) { $all.Add($l) } }
  $all.ToArray() | Set-Content -LiteralPath $tmpPatch -Encoding ASCII
  $res = git -C $root apply --cached --whitespace=nowarn -- $tmpPatch 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Output ("STAGED(cal-hunk-only) {0}  [{1}/{2} hunks cal]" -f $p, $calHunk.Count, $hunks.Count)
  } else {
    Write-Output "APPLY-FAIL $p : $res"
  }
  Remove-Item -LiteralPath $tmpPatch -Force -ErrorAction SilentlyContinue
}

Write-Output "=== verify staged calibration-only (no rel tokens) ==="
$stagedDiff = git -C $root diff --cached
$relHits = @()
foreach ($t in $rel) {
  if ($stagedDiff -match [regex]::Escape($t)) { $relHits += $t }
}
if ($relHits.Count) { Write-Output "FAIL: staged content contains rel tokens: $($relHits -join ', ')" }
else { Write-Output "OK: staged content has no phase-27/28 (rel/rca/oot) tokens" }

Write-Output "=== staged file list ==="
git -C $root diff --cached --name-only
