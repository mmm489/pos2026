@echo off
setlocal
title HiCream KDS Cocina

set "KDS_URL=http://192.168.1.141:3005/kds"
set "KDS_PROFILE=%LOCALAPPDATA%\HiCream\KDSChrome"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%KDS_URL%' -UseBasicParsing -TimeoutSec 4 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo No se puede conectar con el KDS en:
  echo %KDS_URL%
  echo.
  echo Comprueba que el PC principal del POS este encendido.
  pause
  exit /b 1
)

rem Cierra solo la sesion exclusiva del KDS para que Chrome no ignore
rem los parametros de pantalla completa al reutilizar una ventana anterior.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*HiCream\KDSChrome*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

set "BROWSER_EXE="
set "BROWSER_KIND="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
  set "BROWSER_KIND=chrome"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  set "BROWSER_KIND=chrome"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  set "BROWSER_KIND=edge"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  set "BROWSER_KIND=edge"
)

if not defined BROWSER_EXE (
  echo No se ha encontrado Google Chrome ni Microsoft Edge.
  pause
  exit /b 1
)

if "%BROWSER_KIND%"=="edge" (
  start "HiCream KDS" "%BROWSER_EXE%" --user-data-dir="%KDS_PROFILE%" --kiosk "%KDS_URL%" --edge-kiosk-type=fullscreen --no-first-run
) else (
  start "HiCream KDS" "%BROWSER_EXE%" --user-data-dir="%KDS_PROFILE%" --app="%KDS_URL%" --kiosk --start-fullscreen --no-first-run --disable-session-crashed-bubble --disable-features=TranslateUI
)

endlocal
