@echo off
cd /d "%~dp0"
rem Aurora-Chat dev launcher -- forwards to scripts\dev.ps1 (HMR + uvicorn auto-reload).
rem Arguments: dev.bat -BackendOnly | -FrontendOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" %*
