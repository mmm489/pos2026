$ErrorActionPreference = "SilentlyContinue"

# Let the HTTP response reach the browser before stopping the local server.
Start-Sleep -Milliseconds 1200

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $scriptDir
$repoNeedle = $repo.ToLowerInvariant()
$logFile = Join-Path $scriptDir "shutdown-pos.log"
$localHiCream = Join-Path $env:LOCALAPPDATA "HiCream"
$profiles = @(
  (Join-Path $localHiCream "ChromePOS"),
  (Join-Path $localHiCream "ChromeCliente")
)

function Write-Log($message) {
  $stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  Add-Content -Path $logFile -Value "[$stamp] $message"
}

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

function Stop-ProcessTree($processId, $label) {
  if (-not $processId) { return }
  Write-Log "Stopping $label pid=$processId"
  & "$env:SystemRoot\System32\taskkill.exe" /PID $processId /T /F | Out-Null
}

Write-Log "Shutdown requested"

Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
  Where-Object { Test-HiCreamChrome $_.CommandLine } |
  ForEach-Object {
    Stop-ProcessTree $_.ProcessId "Chrome HiCream"
  }

# The dashboard sync is intentionally left alive. It runs in the background and
# is protected by its watchdog so the cloud dashboard keeps updating even when
# the cashier closes the visible POS.
Write-Log "Stopping POS scheduled task only"
Stop-ScheduledTask -TaskName "HiCream POS Server"

$processNames = @("node.exe", "cmd.exe", "powershell.exe")
Get-CimInstance Win32_Process |
  Where-Object {
    if ($processNames -notcontains $_.Name) { $false }
    elseif (-not $_.CommandLine) { $false }
    elseif ($_.ProcessId -eq $PID) { $false }
    elseif ($_.CommandLine.ToLowerInvariant().Contains("sync-runner.js")) { $false }
    else {
      $commandLine = $_.CommandLine.ToLowerInvariant()
      $belongsToRepo = $commandLine.Contains($repoNeedle) -or $commandLine.Contains("c:\hicream\pos2026")

      $belongsToRepo -and (
        $commandLine.Contains("next\dist\bin\next") -or
        $commandLine.Contains("next/dist/bin/next") -or
        $commandLine.Contains("next start") -or
        $commandLine.Contains("bridge\index.js") -or
        $commandLine.Contains("bridge/index.js") -or
        $commandLine.Contains("node index.js")
      )
    }
  } |
  ForEach-Object {
    Stop-ProcessTree $_.ProcessId $_.Name
  }

Write-Log "Shutdown script finished"
