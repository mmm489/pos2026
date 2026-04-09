@echo off
title Hi Cream Bridge + Verifone
cd /d "%~dp0"

echo ========================================
echo   Hi Cream Bridge - Arrancant...
echo ========================================

REM Variables REDSYS per VerifoneService
for /f "tokens=1,* delims==" %%a in (.env) do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" (
        set "%%a=%%b" 2>nul
    )
)

REM Activar expansión retardada para el filtro de comentarios
setlocal enabledelayedexpansion
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" (
        if not "%%b"=="" (
            endlocal
            set "%%a=%%b"
            setlocal enabledelayedexpansion
        )
    )
)
endlocal

echo.
echo [1/2] Arrancant VerifoneService (port 3007)...
start "VerifoneService" /min "%~dp0verifone-service\VerifoneService.exe"

REM Esperar 2 segons perquè el servei arranqui
timeout /t 2 /nobreak >nul

echo [2/2] Arrancant Bridge Node.js (port 3006)...
node index.js
