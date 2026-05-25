@echo off
rem Aurora-Chat 卸载启动器 — 转发至 scripts\undeploy.ps1。
rem 绕过执行策略，使全新安装的 Windows 无需手动设置 Set-ExecutionPolicy。
rem 所有参数均透传，例如：
rem   undeploy.bat -KeepData
rem   undeploy.bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\undeploy.ps1" %*
