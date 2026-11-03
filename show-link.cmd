@echo off
chcp 65001 >nul
title LabPilot - current public URL
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\current-url.ps1"
echo.
pause
