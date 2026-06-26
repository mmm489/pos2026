param(
  [switch]$DryRun,
  [switch]$NoPrint,
  [switch]$AllowOutsideWindow,
  [switch]$RecoverMissed,
  [string]$Until
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$scriptPath = Join-Path $scriptDir "auto-cash-closing.cjs"

function Find-Node {
  $candidates = @(
    "C:\HiCream\tools\node-v24.16.0-win-x64\node.exe",
    "C:\Program Files\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
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

if (!(Test-Path -LiteralPath $scriptPath)) {
  throw "No se ha encontrado $scriptPath"
}

$node = Find-Node
$arguments = @($scriptPath)

if ($DryRun) {
  $arguments += "--dry-run"
} else {
  $arguments += "--execute"
}

if ($NoPrint) {
  $arguments += "--no-print"
}

if ($AllowOutsideWindow) {
  $arguments += "--allow-outside-window"
}

if ($RecoverMissed) {
  $arguments += "--recover-missed"
}

if ($Until) {
  $arguments += @("--until", $Until)
}

Push-Location $repoRoot
try {
  & $node @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
