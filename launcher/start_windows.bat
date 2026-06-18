@echo off
title HITGEAR OS Launcher
echo.
echo  ██╗  ██╗██╗████████╗ ██████╗ ███████╗ █████╗ ██████╗      ██████╗ ███████╗
echo  ██║  ██║██║╚══██╔══╝██╔════╝ ██╔════╝██╔══██╗██╔══██╗    ██╔═══██╗██╔════╝
echo  ███████║██║   ██║   ██║  ███╗█████╗  ███████║██████╔╝    ██║   ██║███████╗
echo  ██╔══██║██║   ██║   ██║   ██║██╔══╝  ██╔══██║██╔══██╗    ██║   ██║╚════██║
echo  ██║  ██║██║   ██║   ╚██████╔╝███████╗██║  ██║██║  ██║    ╚██████╔╝███████║
echo  ╚═╝  ╚═╝╚═╝   ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝     ╚═════╝ ╚══════╝
echo.
echo  HITMANS VIP AFTER SPOT QUEST
echo  --------------------------------
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js not found. Please install from https://nodejs.org
  echo  Press any key to open the download page...
  pause >nul
  start https://nodejs.org
  exit /b 1
)

echo  Starting server on port 3000...
echo.

:: Start the Node server in background and open browser
start "" /B node "%~dp0start_node_server.js"

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open in default browser
start "" "http://localhost:3000"

echo  Game is running at http://localhost:3000
echo  Close this window to stop the server.
echo.
pause
