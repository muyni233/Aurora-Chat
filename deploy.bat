@echo off
rem Aurora-Chat 部署启动器 — 转发至 scripts\deploy.ps1。
rem 绕过执行策略，使全新安装的 Windows 无需手动设置 Set-ExecutionPolicy。
rem 所有参数均透传，例如：
rem   deploy.bat -BackendPort 9000 -FrontendPort 8080
rem   deploy.bat -SkipBuild -Force
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
