@echo off
cd /d "%~dp0"
rem Aurora-Chat uninstall launcher -- forwards to scripts\undeploy.ps1.
rem Bypass ExecutionPolicy so fresh Windows installs work without manual setup.
rem All arguments are forwarded, e.g.:
rem   undeploy.bat -KeepData
rem   undeploy.bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\undeploy.ps1" %*
