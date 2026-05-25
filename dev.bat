@echo off
rem Aurora-Chat 开发启动器 — 转发至 scripts\dev.ps1（HMR + uvicorn 自动重载）。
rem 参数透传：dev.bat -BackendOnly | -FrontendOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" %*
