@echo off
title Hi Cream POS - Local

echo ================================
echo   Hi Cream POS - Modo Local
echo ================================
echo.

:: Arrancar Bridge
echo [1/3] Iniciando Bridge (puerto 3001)...
cd /d C:\HiCream\bridge
start "Hi Cream Bridge" cmd /k "node index.js"

:: Esperar 2 segundos
timeout /t 2 /noq >nul

:: Arrancar Sync (cada 5 min sube datos a Neon si hay internet)
echo [2/3] Iniciando Sync local - Neon...
cd /d C:\HiCream\bridge
start "Hi Cream Sync" cmd /k "npm run sync"

:: Arrancar Next.js
echo [3/3] Iniciando POS (puerto 3000)...
cd /d C:\HiCream\app
start "Hi Cream POS" cmd /k "npm start"

:: Esperar a que arranque
timeout /t 5 /noq >nul

:: Abrir navegador
echo.
echo Abriendo POS y KDS en el navegador...
start http://localhost:3000/pos
start http://localhost:3000/kds

echo.
echo ================================
echo   POS: http://localhost:3000/pos
echo   KDS: http://localhost:3000/kds
echo   Bridge: http://localhost:3001
echo   Sync: cada 5 min a Neon
echo ================================
echo.
echo Cierra esta ventana cuando quieras parar.
pause
