# Triggers GitHub Actions paper-scan via workflow_dispatch.
$ErrorActionPreference = "Stop"

$repo = "E:\Codex Project\Finding chance\polymarket-calendar-sim"
Set-Location $repo

$env:Path = "C:\Program Files\GitHub CLI;C:\Program Files\Git\bin;C:\Program Files\nodejs;" + $env:Path

$logDir = Join-Path $repo "data"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "windows-scan-trigger.log"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("s"), $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

try {
  $gh = Get-Command gh -ErrorAction Stop
  Write-Log ("using gh at {0}" -f $gh.Source)
  & $gh.Source workflow run paper-scan.yml --ref main
  if ($LASTEXITCODE -ne 0) {
    throw "gh workflow run failed with exit $LASTEXITCODE"
  }
  Write-Log "dispatched paper-scan.yml"
  exit 0
} catch {
  Write-Log ("ERROR: {0}" -f $_.Exception.Message)
  exit 1
}
