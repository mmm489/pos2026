@echo off
setlocal
cd /d "%~dp0"
echo Hi Cream - Dashboard sync
echo.
echo This keeps copying POS local data to the cloud dashboard database.
echo Leave this window open if you started it manually.
echo.

set "NODE_EXE="
if exist "C:\HiCream\tools\node-v24.16.0-win-x64\node.exe" (
  set "NODE_EXE=C:\HiCream\tools\node-v24.16.0-win-x64\node.exe"
) else if exist "%~dp0..\..\tools\node-v24.16.0-win-x64\node.exe" (
  set "NODE_EXE=%~dp0..\..\tools\node-v24.16.0-win-x64\node.exe"
) else (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%N"
  )
)

if not defined NODE_EXE (
  echo Node.js was not found.
  pause
  exit /b 1
)

"%NODE_EXE%" "%~dp0sync\sync-runner.js"
