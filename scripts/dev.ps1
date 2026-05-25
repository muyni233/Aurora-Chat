<#
.SYNOPSIS
    Aurora-Chat 开发环境启动器。

.DESCRIPTION
    与 start.ps1 结构相同，但启动开发模式的对应进程：
      - FastAPI 以 DEBUG=true 运行（uvicorn --reload，参见 backend/run.py）
      - Next.js 以 `next dev` 运行（Turbopack 热模块替换）

    输出交错显示在当前 stdout 上 — 对日志面板和普通 SSH 均友好。
    Ctrl+C 可清理两个进程树。

.PARAMETER BackendOnly
    仅启动 FastAPI 开发进程。

.PARAMETER FrontendOnly
    仅启动 Next.js 开发进程。

.EXAMPLE
    .\scripts\dev.ps1
    .\scripts\dev.ps1 -BackendOnly
#>
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = 'Stop'

$Root        = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'
$VenvPython  = Join-Path $BackendDir '.venv\Scripts\python.exe'
$NextCmd     = Join-Path $FrontendDir 'node_modules\.bin\next.cmd'

if ($BackendOnly -and $FrontendOnly) {
    throw "-BackendOnly 和 -FrontendOnly 互斥，不能同时使用。"
}

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
    & taskkill /PID $proc.Id /T /F *> $null
}

function Start-Backend {
    if (-not (Test-Path $VenvPython)) {
        throw "后端虚拟环境不存在。请先运行 scripts\deploy.ps1。"
    }
    # 仅为本次运行覆盖 DEBUG=true — 保持磁盘上的 .env 不变，
    # 以免影响生产部署。uvicorn 从配置中获取 reload 设置。
    # 我们仅在 Start-Process 需要继承环境变量时短暂设置 $env:DEBUG，
    # 然后恢复 — 整体分配 ProcessStartInfo.EnvironmentVariables
    # 会覆盖 PATH/SystemRoot 导致子进程异常。
    Write-Host "[dev] 后端 → DEBUG=true python run.py" -ForegroundColor Cyan
    $prev = $env:DEBUG
    $env:DEBUG = 'true'
    try {
        return Start-Process `
            -FilePath $VenvPython `
            -ArgumentList 'run.py' `
            -WorkingDirectory $BackendDir `
            -NoNewWindow -PassThru
    } finally {
        if ($null -eq $prev) {
            Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
        } else {
            $env:DEBUG = $prev
        }
    }
}

function Start-Frontend {
    if (-not (Test-Path $NextCmd)) {
        throw "前端未安装。请先运行 scripts\deploy.ps1。"
    }
    Write-Host "[dev] 前端 → next dev -p $frontendPort" -ForegroundColor Cyan
    return Start-Process `
        -FilePath $NextCmd `
        -ArgumentList "dev -p $frontendPort" `
        -WorkingDirectory $FrontendDir `
        -NoNewWindow -PassThru
}

# ── 启动信息 ──────────────────────────────────────────────────────────────────
$backendPort  = Get-EnvValue (Join-Path $BackendDir  '.env')       'PORT'
$frontendPort = Get-EnvValue (Join-Path $FrontendDir '.env.local') 'PORT'
if (-not $backendPort)  { $backendPort  = '8000' }
if (-not $frontendPort) { $frontendPort = '3000' }

Write-Host ""
Write-Host "Aurora-Chat（开发环境）" -ForegroundColor Green
if (-not $FrontendOnly) { Write-Host "  后端   : 127.0.0.1:$backendPort  （自动重载）" }
if (-not $BackendOnly)  { Write-Host "  前端   : http://localhost:$frontendPort  （热模块替换）" }
Write-Host ""

# ── 运行 ───────────────────────────────────────────────────────────────────────
$procs = @{}
try {
    if (-not $FrontendOnly) { $procs['backend']  = Start-Backend }
    if (-not $BackendOnly)  { $procs['frontend'] = Start-Frontend }

    Write-Host "按 Ctrl+C 停止。" -ForegroundColor Yellow
    Write-Host ""

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
