@echo off
REM LabPilot - stop all containers (data and models are kept)
cd /d "%~dp0"
echo.
echo Stopping LabPilot containers...
docker compose down
echo.
echo Done. Models are preserved in the ollama-models volume.
echo To delete models too, run: docker compose down -v
echo.
pause
