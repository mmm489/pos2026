@echo off
setlocal
title HiCream POS - Pruebas

set "APP_DIR=C:\HiCream\pos2026"
set "CONNECTOR_EXE=C:\Cashlogy\CashlogyConnectorPlus\CashlogyConnectorPlus.exe"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NEXT_BIN=%APP_DIR%\node_modules\next\dist\bin\next"

if not exist "%APP_DIR%" (
  echo No existe %APP_DIR%
  pause
  exit /b 1
)

if not exist "%NODE_EXE%" (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%N"
  )
)

if not exist "%NODE_EXE%" (
  echo No se ha encontrado Node.js.
  pause
  exit /b 1
)

if not exist "%NEXT_BIN%" (
  echo No se ha encontrado Next.js en %NEXT_BIN%
  echo Ejecuta npm install/build si hace falta.
  pause
  exit /b 1
)

echo ========================================
echo   HiCream POS - modo pruebas
echo ========================================
echo.
echo IMPORTANTE: para probar Cashlogy, BDP debe estar cerrado.
echo Este lanzador NO arranca ni modifica BDP.
echo.

echo [1/5] Comprobando Cashlogy ConnectorPlus...
if exist "%CONNECTOR_EXE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-Process CashlogyConnectorPlusCore -ErrorAction SilentlyContinue)) { Start-Process -FilePath '%CONNECTOR_EXE%'; Start-Sleep -Seconds 8 }"
) else (
  echo No se encontro ConnectorPlus en %CONNECTOR_EXE%
)

echo [2/5] Comprobando bridge en puerto 3006...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:3006/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Iniciando bridge...
  start "HiCream Bridge" /min /D "%APP_DIR%\bridge" "%NODE_EXE%" index.js
  timeout /t 3 /nobreak >nul
) else (
  echo Bridge ya esta iniciado.
)

echo [3/5] Comprobando sync del dashboard...
set "SYNC_BIN=%APP_DIR%\bridge\sync\sync-runner.js"
if exist "%SYNC_BIN%" (
  powershell -NoProfile -Command "$needle = 'sync-runner.js'; $running = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $needle + '*') -and $_.CommandLine -like '*pos2026*' }; if ($running) { exit 0 } else { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo Iniciando sync del dashboard...
    start "Hi Cream Dashboard Sync" /min /D "%APP_DIR%\bridge" "%NODE_EXE%" "%SYNC_BIN%"
  ) else (
    echo Sync del dashboard ya esta iniciado.
  )
) else (
  echo Aviso: no se ha encontrado el sync del dashboard:
  echo %SYNC_BIN%
)

echo [4/5] Comprobando POS en puerto 3005...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:3005/pos' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Iniciando POS...
  start "HiCream POS Server" /min /D "%APP_DIR%" "%NODE_EXE%" "%NEXT_BIN%" start -p 3005
  timeout /t 6 /nobreak >nul
) else (
  echo POS ya esta iniciado.
)

echo [5/5] Abriendo Chrome en modo app...
set "CHROME_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE for /f "delims=" %%C in ('where chrome 2^>nul') do if not defined CHROME_EXE set "CHROME_EXE=%%C"

if defined CHROME_EXE (
  start "HiCream POS" "%CHROME_EXE%" --app=http://localhost:3005/pos
) else (
  start http://localhost:3005/pos
)

echo.
echo Listo.
echo POS: http://localhost:3005/pos
echo Bridge: http://localhost:3006/health
echo.
echo Puedes cerrar esta ventana.
timeout /t 8 /nobreak >nul
endlocal
