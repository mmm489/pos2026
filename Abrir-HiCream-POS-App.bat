@echo off
setlocal
title Hi Cream POS - App

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

set "NODE_EXE="
if exist "C:\HiCream\tools\node-v24.16.0-win-x64\node.exe" (
  set "NODE_EXE=C:\HiCream\tools\node-v24.16.0-win-x64\node.exe"
) else if exist "%APP_DIR%\..\tools\node-v24.16.0-win-x64\node.exe" (
  set "NODE_EXE=%APP_DIR%\..\tools\node-v24.16.0-win-x64\node.exe"
) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
) else (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%N"
  )
)

if not defined NODE_EXE (
  echo No se ha encontrado Node.js.
  echo Deja el Node portable en C:\HiCream\tools o instala Node.js.
  pause
  exit /b 1
)

set "NEXT_BIN=%APP_DIR%\node_modules\next\dist\bin\next"
if not exist "%NEXT_BIN%" (
  echo No se ha encontrado Next.js en:
  echo %NEXT_BIN%
  echo Ejecuta npm install antes de usar este lanzador.
  pause
  exit /b 1
)

set "SYNC_BIN=%APP_DIR%\bridge\sync\sync-runner.js"
set "SYNC_TASK=HiCream Dashboard Sync"
if exist "%SYNC_BIN%" (
  echo Comprobando sync del dashboard...
  powershell -NoProfile -Command "$needle = 'sync-runner.js'; $running = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $needle + '*') -and $_.CommandLine -like '*pos2026*' }; if ($running) { exit 0 } else { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo Iniciando sync del dashboard...
    schtasks /Query /TN "%SYNC_TASK%" >nul 2>nul
    if not errorlevel 1 (
      schtasks /Run /TN "%SYNC_TASK%" >nul 2>nul
      timeout /t 3 /nobreak >nul
    )
    powershell -NoProfile -Command "$needle = 'sync-runner.js'; $running = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $needle + '*') -and $_.CommandLine -like '*pos2026*' }; if ($running) { exit 0 } else { exit 1 }" >nul 2>nul
    if errorlevel 1 (
      start "Hi Cream Dashboard Sync" /min /D "%APP_DIR%\bridge" "%NODE_EXE%" "%SYNC_BIN%"
    )
  ) else (
    echo Sync del dashboard ya esta iniciado.
  )
) else (
  echo Aviso: no se ha encontrado el sync del dashboard:
  echo %SYNC_BIN%
)

set "CHROME_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else (
  for /f "delims=" %%C in ('where chrome 2^>nul') do (
    if not defined CHROME_EXE set "CHROME_EXE=%%C"
  )
)

if not defined CHROME_EXE (
  echo No se ha encontrado Google Chrome.
  pause
  exit /b 1
)

echo Comprobando POS en puerto 3005...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3005/pos' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Iniciando servidor POS en http://localhost:3005 ...
  start "Hi Cream POS Server" /min cmd /c "cd /d "%APP_DIR%" && set PORT=3005&& "%NODE_EXE%" "%NEXT_BIN%" start"
  timeout /t 5 /nobreak >nul
) else (
  echo POS ya esta iniciado.
)

echo Abriendo Chrome en modo app...
start "Hi Cream POS" "%CHROME_EXE%" --app=http://localhost:3005/pos

endlocal
