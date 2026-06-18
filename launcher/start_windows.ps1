#Requires -Version 5.0
$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  HITGEAR OS — HITMANS VIP AFTER SPOT QUEST" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor DarkMagenta
Write-Host ""

# Check Node.js
try {
  $nodeVersion = & node --version 2>&1
  Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "  [ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
  Start-Process "https://nodejs.org"
  exit 1
}

$serverScript = Join-Path $PSScriptRoot "start_node_server.js"
$port = 3000
$url = "http://localhost:$port"

Write-Host "  Starting server on port $port..." -ForegroundColor Yellow
Write-Host ""

# Start server
$job = Start-Job -ScriptBlock {
  param($script)
  & node $script
} -ArgumentList $serverScript

# Wait for server to be ready
Start-Sleep -Seconds 2

# Open browser
Write-Host "  Opening $url in your browser..." -ForegroundColor Cyan
Start-Process $url

Write-Host "  Server is running. Close this window to stop." -ForegroundColor Green
Write-Host ""

# Keep running until window closed
try {
  Wait-Job $job
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -ErrorAction SilentlyContinue
}
