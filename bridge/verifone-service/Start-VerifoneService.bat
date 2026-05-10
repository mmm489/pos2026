@echo off
REM Launches the Verifone PowerShell service in 32-bit PowerShell.
REM The AxTpvpcPinPadWS COM class is only registered under WOW6432Node,
REM so 64-bit PowerShell can't load it.
title Hi Cream Verifone Service

"%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File "%~dp0verifone-service.ps1"

echo.
echo Service stopped. Press any key to close.
pause >nul
