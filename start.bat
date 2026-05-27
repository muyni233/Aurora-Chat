@echo off
cd /d "%~dp0"
rem Aurora-Chat production launcher -- forwards to scripts\start.ps1.
rem Arguments: start.bat -BackendOnly | -FrontendOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
