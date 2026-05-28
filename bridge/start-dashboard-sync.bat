@echo off
setlocal
cd /d "%~dp0"
echo Hi Cream - Dashboard sync
echo.
echo This keeps copying POS local data to the cloud dashboard database.
echo Leave this window open, or install it later as a background task.
echo.
npm run sync
pause
