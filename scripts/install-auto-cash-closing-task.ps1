param(
  [string]$TaskName = "HiCream Auto Cash Closing",
  [string]$At = "03:00"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $scriptDir "run-auto-cash-closing.ps1"

if (!(Test-Path -LiteralPath $runner)) {
  throw "No se ha encontrado $runner"
}

$time = [datetime]::ParseExact($At, "HH:mm", $null)
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""

$action = New-ScheduledTaskAction -Execute $powershell -Argument $argument
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -AllowStartIfOnBatteries `
  -DisallowStartOnRemoteAppSession
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Cierra la caja HiCream automaticamente cada dia a las 03:00 si hay movimientos nuevos." `
  -Force | Out-Null

Write-Host "Tarea programada instalada: $TaskName a las $At"
