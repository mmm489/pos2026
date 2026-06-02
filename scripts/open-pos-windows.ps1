param(
  [Parameter(Mandatory = $true)]
  [string]$ChromeExe,

  [Parameter(Mandatory = $true)]
  [string]$PosUrl,

  [Parameter(Mandatory = $true)]
  [string]$ClientUrl
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$screens = [System.Windows.Forms.Screen]::AllScreens
$primary = $screens | Where-Object { $_.Primary } | Select-Object -First 1
if (-not $primary) {
  $primary = $screens | Select-Object -First 1
}

$clientScreen = $screens |
  Where-Object { -not $_.Primary } |
  Sort-Object { $_.Bounds.X }, { $_.Bounds.Y } |
  Select-Object -First 1

if (-not $clientScreen) {
  $fallback = [System.Drawing.Rectangle]::new(
    ($primary.Bounds.X + $primary.Bounds.Width),
    $primary.Bounds.Y,
    $primary.Bounds.Width,
    $primary.Bounds.Height
  )
  $clientBounds = $fallback
} else {
  $clientBounds = $clientScreen.Bounds
}

$posBounds = $primary.WorkingArea
$profileRoot = Join-Path $env:LOCALAPPDATA "HiCream"
$clientProfile = Join-Path $profileRoot "ChromeCliente"
New-Item -ItemType Directory -Force $clientProfile | Out-Null

# Avoid leaving old customer-facing windows behind when reopening the POS.
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*pantalla-cliente*" -or
      $_.CommandLine -like ("*" + $clientProfile.Replace("\", "\\") + "*") -or
      $_.CommandLine -like ("*" + $clientProfile + "*")
    )
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

$clientArgs = @(
  "--new-window",
  "--app=$ClientUrl",
  "--user-data-dir=$clientProfile",
  "--no-first-run",
  "--disable-session-crashed-bubble",
  "--window-position=$($clientBounds.X),$($clientBounds.Y)",
  "--window-size=$($clientBounds.Width),$($clientBounds.Height)"
)

$posArgs = @(
  "--new-window",
  "--app=$PosUrl",
  "--no-first-run",
  "--disable-session-crashed-bubble",
  "--window-position=$($posBounds.X),$($posBounds.Y)",
  "--window-size=$($posBounds.Width),$($posBounds.Height)"
)

Write-Host "Pantalla POS: $($posBounds.X),$($posBounds.Y) $($posBounds.Width)x$($posBounds.Height)"
Write-Host "Pantalla cliente: $($clientBounds.X),$($clientBounds.Y) $($clientBounds.Width)x$($clientBounds.Height)"

Start-Process -FilePath $ChromeExe -ArgumentList $clientArgs
Start-Sleep -Seconds 2
Start-Process -FilePath $ChromeExe -ArgumentList $posArgs
