@echo off
REM LabPilot - Ollama service (called by start.cmd)
set OLLAMA_HOST=127.0.0.1:11434
set OLLAMA_IGPU_ENABLE=1
set OLLAMA_VULKAN=1
set OLLAMA_MAX_LOADED_MODELS=1
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_KEEP_ALIVE=30m
if "%OLLAMA_MODELS%"=="" set OLLAMA_MODELS=C:\Users\wangy\Documents\Codex\2026-10-29\w-x\work\ollama\models

set LOG=%~dp0..\.workbuddy\logs\ollama.log
echo [%date% %time%] starting ollama >> "%LOG%"
"C:\Users\wangy\AppData\Local\Programs\Ollama\ollama.exe" serve >> "%LOG%" 2>&1
echo [%date% %time%] ollama exited with code %ERRORLEVEL% >> "%LOG%"
