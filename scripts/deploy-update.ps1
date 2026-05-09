# Hi Cream POS - Update script
#
# Pull dels canvis de master, reinstal·la dependències si cal, recompila i avisa de reiniciar.
# Pensat per executar al PC del mostrador des de C:\HiCream\pos2026.
#
# Ús:
#   cd C:\HiCream\pos2026
#   .\scripts\deploy-update.ps1
#
# Si vols saltar la compilació (per fer-la després manualment):
#   .\scripts\deploy-update.ps1 -SkipBuild

param(
  [switch]$SkipBuild,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Hi Cream POS - Update ===" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host ""

Set-Location $repoRoot

# --- 1) Comprovar que no hi ha canvis locals -----------------------------

$status = git status --porcelain
if ($status) {
  Write-Host "⚠️  Hi ha canvis locals sense commit:" -ForegroundColor Yellow
  Write-Host $status
  $resp = Read-Host "Continuar amb 'git pull' (els teus canvis es poden perdre)? [s/N]"
  if ($resp -ne "s" -and $resp -ne "S") {
    Write-Host "Aturat. Resol primer els canvis locals." -ForegroundColor Red
    exit 1
  }
}

# --- 2) Recordar quins fitxers controlen dependencies abans de pull ------

$rootLockBefore = if (Test-Path package-lock.json) { (Get-FileHash package-lock.json).Hash } else { "" }
$bridgeLockBefore = if (Test-Path bridge\package-lock.json) { (Get-FileHash bridge\package-lock.json).Hash } else { "" }

# --- 3) Pull -------------------------------------------------------------

Write-Host "→ git pull origin master" -ForegroundColor Green
git pull origin master
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ git pull ha fallat. Revisa l'error i torna-ho a provar." -ForegroundColor Red
  exit 1
}

# --- 4) npm install si cal -----------------------------------------------

if (-not $SkipInstall) {
  $rootLockAfter = if (Test-Path package-lock.json) { (Get-FileHash package-lock.json).Hash } else { "" }
  $bridgeLockAfter = if (Test-Path bridge\package-lock.json) { (Get-FileHash bridge\package-lock.json).Hash } else { "" }

  if ($rootLockBefore -ne $rootLockAfter) {
    Write-Host "→ npm install (root)" -ForegroundColor Green
    npm install
  } else {
    Write-Host "  npm install (root) - saltat (sense canvis)" -ForegroundColor Gray
  }

  if ($bridgeLockBefore -ne $bridgeLockAfter) {
    Write-Host "→ npm install (bridge)" -ForegroundColor Green
    Push-Location bridge
    npm install
    Pop-Location
  } else {
    Write-Host "  npm install (bridge) - saltat (sense canvis)" -ForegroundColor Gray
  }
}

# --- 5) Recompilar -------------------------------------------------------

if (-not $SkipBuild) {
  Write-Host "→ npm run build" -ForegroundColor Green
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ La compilació ha fallat. Revisa l'error abans de reiniciar." -ForegroundColor Red
    exit 1
  }
}

# --- 6) Comprovacions finals --------------------------------------------

Write-Host ""
Write-Host "✓ Update completat" -ForegroundColor Green
Write-Host ""
Write-Host "Pendent perquè els canvis surtin:" -ForegroundColor Yellow
Write-Host "  1. Tanca les finestres CMD obertes (Hi Cream Bridge, Hi Cream POS, Hi Cream Sync)"
Write-Host "  2. Doble-clic a C:\HiCream\start-local.bat"
Write-Host ""
Write-Host "Pots verificar a:" -ForegroundColor Cyan
Write-Host "  POS:    http://localhost:3000/pos"
Write-Host "  Bridge: http://localhost:3006/health"
