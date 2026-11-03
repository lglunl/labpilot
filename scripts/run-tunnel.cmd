@echo off
REM LabPilot - Cloudflare quick tunnel for port 8080
REM Console output is redirected to tunnel.log by this wrapper only.
REM (Do NOT also pass --logfile: two writers clobber each other's lines.)
cd /d "%~dp0.."
set "SYS=%SystemRoot%\System32"
set LOG=%~dp0..\.workbuddy\logs\tunnel.log

:retry
echo [%date% %time%] starting cloudflared >> "%LOG%"
".workbuddy\cloudflared.exe" tunnel --url http://127.0.0.1:8080 --no-autoupdate --protocol http2 >> "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
echo [%date% %time%] cloudflared exited with code %RC%, retry in 60s >> "%LOG%"
"%SYS%\ping.exe" -n 61 127.0.0.1 >nul 2>&1
goto retry
