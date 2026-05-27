<#
.SYNOPSIS
    Aurora-Chat 生产环境启动器。

.DESCRIPTION
    在当前 PowerShell 会话前台启动 FastAPI 后端（venv python run.py）和
    Next.js 前端（next start），使日志面板（MCSM、supervisord 风格包装器、
    简单 SSH 会话）可以捕获单一的合并 stdout 流。

    两个进程的输出交错显示在控制台上。Ctrl+C — 或任何触发 PowerShell
    finally 块的信号 — 都会通过 `taskkill /T /F` 停止两个子进程，
    避免留下孤立进程（npm/next 会生成子进程，普通的 Stop-Process 无法覆盖）。

    对于需要每个服务一个进程的面板部署，请分别使用 -BackendOnly 和
    -FrontendOnly 运行两个实例。

.PARAMETER BackendOnly
    仅启动 FastAPI 进程。

.PARAMETER FrontendOnly
    仅启动 Next.js 进程。

.EXAMPLE
    .\scripts\start.ps1
    .\scripts\start.ps1 -BackendOnly
    .\scripts\start.ps1 -FrontendOnly
#>
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = 'Stop'

# ── 路径 ───────────────────────────────────────────────────────────────────────
$Root        = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'
$VenvPython  = Join-Path $BackendDir '.venv\Scripts\python.exe'
$NextCmd     = Join-Path $FrontendDir 'node_modules\.bin\next.cmd'

if ($BackendOnly -and $FrontendOnly) {
    throw "-BackendOnly 和 -FrontendOnly 互斥，不能同时使用。"
}

# ── 辅助函数 ───────────────────────────────────────────────────────────────────
function Get-EnvValue([string]$path, [string]$key) {
    if (-not (Test-Path $path)) { return $null }
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match "^\s*$([regex]::Escape($key))\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Stop-Tree([System.Diagnostics.Process]$proc) {
    if (-not $proc) { return }
    if ($proc.HasExited) { return }
    # /T = 整个进程树，/F = 强制。npm.cmd → node → next 在 Windows 上
    # 是三层深的进程树；Stop-Process 只能杀掉包装器，其余进程会变成孤儿。
    & taskkill /PID $proc.Id /T /F *> $null
}

function Start-Backend {
    if (-not (Test-Path $VenvPython)) {
        throw "后端虚拟环境不存在：$VenvPython。请先运行 scripts\deploy.ps1。"
    }
    Write-Host "[start] 后端 → $VenvPython run.py" -ForegroundColor Cyan
    return Start-Process `
        -FilePath $VenvPython `
        -ArgumentList 'run.py' `
        -WorkingDirectory $BackendDir `
        -NoNewWindow -PassThru
}

function Start-Frontend {
    if (-not (Test-Path $NextCmd)) {
        throw "前端未安装：$NextCmd。请先运行 scripts\deploy.ps1。"
    }
    if (-not (Test-Path (Join-Path $FrontendDir '.next'))) {
        throw "未找到 .next/ 目录。在生产模式启动前，请先运行 scripts\deploy.ps1（不加 -SkipBuild）。"
    }
    Write-Host "[start] 前端 → next start -p $frontendPort" -ForegroundColor Cyan
    return Start-Process `
        -FilePath $NextCmd `
        -ArgumentList "start -p $frontendPort" `
        -WorkingDirectory $FrontendDir `
        -NoNewWindow -PassThru
}

# ── 启动信息 ──────────────────────────────────────────────────────────────────
$backendPort  = Get-EnvValue (Join-Path $BackendDir  '.env')       'PORT'
$frontendPort = Get-EnvValue (Join-Path $FrontendDir '.env.local') 'PORT'
if (-not $backendPort)  { $backendPort  = '8000' }
if (-not $frontendPort) { $frontendPort = '3000' }

Write-Host ""
Write-Host "Aurora-Chat（生产环境）" -ForegroundColor Green
if (-not $FrontendOnly) { Write-Host "  后端   : 127.0.0.1:$backendPort" }
if (-not $BackendOnly)  { Write-Host "  前端   : http://localhost:$frontendPort" }
Write-Host ""

# ── 运行 ───────────────────────────────────────────────────────────────────────
$procs = @{}
try {
    if (-not $FrontendOnly) { $procs['backend']  = Start-Backend }
    if (-not $BackendOnly)  { $procs['frontend'] = Start-Frontend }

    Write-Host "按 Ctrl+C 停止。" -ForegroundColor Yellow
    Write-Host ""

    # 循环检测，任一子进程退出时通过抛出异常来停止所有进程。
    while ($true) {
        Start-Sleep -Milliseconds 500
        foreach ($name in $procs.Keys) {
            $p = $procs[$name]
            if ($p.HasExited) {
                throw "$name 异常退出（退出码 $($p.ExitCode)）。正在停止其他进程。"
            }
        }
    }
} finally {
    foreach ($p in $procs.Values) { Stop-Tree $p }
}
