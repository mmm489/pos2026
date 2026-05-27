@echo off
setlocal
title Hi Cream POS - Local

echo ================================
echo   Hi Cream POS - Modo Local
echo ================================
echo.

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

if exist "C:\HiCream\tools\node-v24.16.0-win-x64\node.exe" (
  set "PATH=C:\HiCream\tools\node-v24.16.0-win-x64;%PATH%"
) else if exist "%APP_DIR%\..\tools\node-v24.16.0-win-x64\node.exe" (
  set "PATH=%APP_DIR%\..\tools\node-v24.16.0-win-x64;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo No se ha encontrado Node.js. Instala Node.js o deja el portable en C:\HiCream\tools.
  pause
  exit /b 1
)

:: Arrancar Bridge
echo [1/3] Iniciando Bridge (puerto 3006)...
cd /d "%APP_DIR%\bridge"
start "Hi Cream Bridge" cmd /k "node index.js"

:: Esperar 2 segundos
timeout /t 2 /nobreak >nul

:: Arrancar Sync (cada 5 min sube datos a Neon si hay internet)
echo [2/3] Iniciando Sync local - Neon...
cd /d "%APP_DIR%\bridge"
start "Hi Cream Sync" cmd /k "npm run sync"

:: Arrancar Next.js
echo [3/3] Iniciando POS (puerto 3000)...
cd /d "%APP_DIR%"
start "Hi Cream POS" cmd /k "npm start"

:: Esperar a que arranque
timeout /t 5 /nobreak >nul

:: Abrir navegador
echo.
echo Abriendo POS y KDS en el navegador...
start http://localhost:3000/pos
start http://localhost:3000/kds

echo.
echo ================================
echo   POS: http://localhost:3000/pos
echo   KDS: http://localhost:3000/kds
echo   Bridge: http://localhost:3006
echo   Sync: cada 5 min a Neon
echo ================================
echo.
echo Cierra esta ventana cuando quieras parar.
pause
