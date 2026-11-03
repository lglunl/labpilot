@echo off
REM ============================================================
REM  LabPilot launcher: starts supervisor which keeps
REM  Ollama + Web(8080) + Cloudflare tunnel alive.
REM  Close the window to stop all services.
REM ============================================================
cd /d "%~dp0"
title LabPilot server - do not close this window
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\supervise.ps1"
