@echo off
REM LabPilot - ngrok tunnel with fixed static domain (config in .workbuddy\ngrok.yml)
cd /d "%~dp0.."
set "SYS=%SystemRoot%\System32"
set LOG=%~dp0..\.workbuddy\logs\ngrok.log

:retry
echo [%date% %time%] starting ngrok >> "%LOG%"
".workbuddy\ngrok.exe" start labpilot --config "%~dp0..\.workbuddy\ngrok.yml" --log stdout >> "%LOG%" 2>&1
echo [%date% %time%] ngrok exited with code %ERRORLEVEL%, retry in 60s >> "%LOG%"
"%SYS%\ping.exe" -n 61 127.0.0.1 >nul 2>&1
goto retry
