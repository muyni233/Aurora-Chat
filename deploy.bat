@echo off
cd /d "%~dp0"
chcp 65001 >nul 2>nul
rem Bypass ExecutionPolicy so fresh Windows installs work without manual setup.
rem All arguments are forwarded, e.g.:
rem   deploy.bat -BackendPort 9000 -FrontendPort 8080
rem   deploy.bat -SkipBuild -Force
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
