@echo off
REM LabPilot - one click start with Docker
cd /d "%~dp0"

docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Docker is not running or not installed.
  echo Please start Docker Desktop and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Building and starting LabPilot containers...
echo First run downloads the 7B model, this can take several minutes.
echo.
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo [ERROR] docker compose failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Waiting for services to become ready...
timeout /t 12 /nobreak >nul
docker compose ps

echo.
echo ------------------------------------------------------------
echo  Local URL : http://localhost:8080
echo  API check : http://localhost:8080/api/health
echo  For the public tunnel URL, run: docker-tunnel-url.cmd
echo ------------------------------------------------------------
echo.
pause
