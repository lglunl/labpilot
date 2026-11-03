@echo off
REM LabPilot - Node web server (static files + /api/agent/summarize)
cd /d "%~dp0.."
set PORT=8080
set LOG=%~dp0..\.workbuddy\logs\server.log
echo [%date% %time%] starting node server >> "%LOG%"
node server\index.js >> "%LOG%" 2>&1
echo [%date% %time%] node server exited with code %ERRORLEVEL% >> "%LOG%"
