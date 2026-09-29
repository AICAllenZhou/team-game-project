@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer on this hosting computer first.
 pause
 exit /b 1
)
echo Keep this window open while friends play. Press Ctrl+C to stop.
node server.mjs
pause
