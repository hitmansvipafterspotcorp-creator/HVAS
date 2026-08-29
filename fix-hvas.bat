@echo off
title HVAS - Repair
cd /d "%~dp0"

echo ============================================
echo   HITMANS VIP After Spot - Repair
echo ============================================
echo.
echo This puts the venue back on the official code.
echo.
echo Your members, entries, money and staff codes are NOT touched -
echo those live in server\data and server\.env, which this never opens.
echo.
pause

echo.
echo [1/5] Stopping anything still running...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo      done.

echo.
echo [2/5] Saving a copy of anything edited on this laptop...
if not exist "server\data" mkdir "server\data"
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set STAMP=%%i
set BACKUP=server\data\clobbered-%STAMP%
git diff --name-only HEAD > "%TEMP%\hvas-dirty.txt" 2>nul
for /f "usebackq delims=" %%f in ("%TEMP%\hvas-dirty.txt") do (
  echo      saving %%f
  powershell -NoProfile -Command "$d=Split-Path -Parent '%BACKUP%\%%f'; if($d){New-Item -ItemType Directory -Force -Path $d ^| Out-Null}; Copy-Item -Force '%%f' '%BACKUP%\%%f'" >nul 2>&1
)
if exist "%BACKUP%" (echo      copies kept in %BACKUP%) else (echo      nothing was edited - nothing to save.)

echo.
echo [3/5] Putting the code files back the way they should be...
git reset --hard HEAD
if errorlevel 1 goto :gitfail

echo.
echo [4/5] Getting the latest version...
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo      branch: %BRANCH%
git pull origin %BRANCH%
if errorlevel 1 goto :netfail

echo.
echo [5/5] Checking it actually works before we open the doors...
cd /d "%~dp0server"
node test-gate.mjs
if errorlevel 1 goto :testfail
cd /d "%~dp0"

echo.
echo ============================================
echo   FIXED. Everything passed.
echo ============================================
echo.
echo Now double-click start-hvas.bat to open the venue.
echo.
pause
exit /b 0

:gitfail
echo.
echo Could not reset the code files. Take a photo of this window.
pause
exit /b 1

:netfail
echo.
echo Could not reach the internet to get the latest version.
echo Check your wifi and run this again.
echo.
echo The code files are already back to normal, so start-hvas.bat
echo should work right now even without this step.
pause
exit /b 1

:testfail
echo.
echo The code came down but the checks did not pass.
echo Do NOT open the doors on this. Take a photo of this window.
pause
exit /b 1
