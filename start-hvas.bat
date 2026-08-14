@echo off
title HVAS - Starting Venue
cd /d "%~dp0"

echo ============================================
echo   HITMANS VIP After Spot - Starting Venue
echo ============================================
echo.

if not exist "server\.env" (
  echo No server\.env found - create one first with your staff/host codes.
  echo See server\SELF_HOST.md, step 3.
  pause
  exit /b 1
)

echo Starting backend server in a new window...
start "HVAS Server" "%~dp0server\run-server.bat"

echo Waiting a few seconds for it to come up...
timeout /t 4 /nobreak >nul

echo Starting your public link...
echo (this window IS the tunnel - keep it open all night, same as the server window)
echo.
cd /d "%~dp0server"
node start-tunnel.mjs

echo.
pause
