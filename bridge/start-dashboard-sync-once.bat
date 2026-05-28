@echo off
setlocal
cd /d "%~dp0"
echo Hi Cream - Dashboard sync one-shot test
echo.
npm run sync:once
echo.
pause
