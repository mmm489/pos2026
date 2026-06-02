$ErrorActionPreference = "Stop"

$appDir = "C:\HiCream\pos2026"
$workDir = Join-Path $appDir "bridge"
$syncScript = Join-Path $workDir "sync\sync-runner.js"
$logDir = Join-Path $workDir "sync"
$logFile = Join-Path $logDir "sync-runner.log"
$errFile = Join-Path $logDir "sync-runner.err.log"

function Find-Node {
  $candidates = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\HiCream\tools\node-v24.16.0-win-x64\node.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Node.js no encontrado"
}

if (!(Test-Path -LiteralPath $syncScript)) {
  throw "No se ha encontrado $syncScript"
}

if (!(Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$needle = $syncScript.Replace("\", "\\")
$running = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*$syncScript*" -or
      $_.CommandLine -like "*$needle*" -or
      $_.CommandLine -like "*sync-runner.js*"
    )
  }

if ($running) {
  exit 0
}

$node = Find-Node
$stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
Add-Content -Path $logFile -Value "[$stamp] [SyncWatchdog] sync parado, arrancando"

$arguments = "/c cd /d `"$workDir`" && `"$node`" `"$syncScript`" >> `"$logFile`" 2>> `"$errFile`""
Start-Process -FilePath "$env:ComSpec" -ArgumentList $arguments -WindowStyle Hidden
