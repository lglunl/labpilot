@echo off
REM LabPilot - show current public tunnel URL
cd /d "%~dp0"
echo.
echo Searching tunnel log for public URL...
echo.
docker logs labpilot-tunnel 2>&1 | findstr /i "trycloudflare.com"
echo.
echo ------------------------------------------------------------
echo If nothing shown above, the tunnel may still be starting.
echo Wait 20 seconds and run this again.
echo ------------------------------------------------------------
pause
