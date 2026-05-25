@echo off
rem Aurora-Chat 生产环境启动器 — 转发至 scripts\start.ps1。
rem 参数透传：start.bat -BackendOnly | -FrontendOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
