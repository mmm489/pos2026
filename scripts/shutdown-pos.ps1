$ErrorActionPreference = "SilentlyContinue"

# Let the HTTP response reach the browser before stopping the local server.
Start-Sleep -Milliseconds 1200

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $scriptDir
$repoNeedle = $repo.ToLowerInvariant()
$localHiCream = Join-Path $env:LOCALAPPDATA "HiCream"
$profiles = @(
  (Join-Path $localHiCream "ChromePOS"),
  (Join-Path $localHiCream "ChromeCliente")
)

function Test-HiCreamChrome($commandLine) {
  if (-not $commandLine) { return $false }
  if ($commandLine -like "*localhost:3005/pos*") { return $true }
  if ($commandLine -like "*127.0.0.1:3005/pos*") { return $true }
  if ($commandLine -like "*pantalla-cliente*") { return $true }

  foreach ($profile in $profiles) {
    if ($commandLine -like ("*" + $profile + "*")) { return $true }
    if ($commandLine -like ("*" + $profile.Replace("\", "\\") + "*")) { return $true }
  }

  return $false
}

Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
  Where-Object { Test-HiCreamChrome $_.CommandLine } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }

# The dashboard sync is intentionally left alive. It runs in the background and
# is protected by its watchdog so the cloud dashboard keeps updating even when
# the cashier closes the visible POS.
Stop-ScheduledTask -TaskName "HiCream POS Server"

$processNames = @("node.exe", "cmd.exe", "powershell.exe")
Get-CimInstance Win32_Process |
  Where-Object {
    if ($processNames -notcontains $_.Name) { return $false }
    if (-not $_.CommandLine) { return $false }
    if ($_.ProcessId -eq $PID) { return $false }

    $commandLine = $_.CommandLine.ToLowerInvariant()
    $belongsToRepo = $commandLine.Contains($repoNeedle) -or $commandLine.Contains("c:\hicream\pos2026")
    if (-not $belongsToRepo) { return $false }

    return (
      $commandLine.Contains("next\dist\bin\next") -or
      $commandLine.Contains("next/dist/bin/next") -or
      $commandLine.Contains("next start") -or
      $commandLine.Contains("bridge\index.js") -or
      $commandLine.Contains("bridge/index.js") -or
      $commandLine.Contains("node index.js")
    )
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
