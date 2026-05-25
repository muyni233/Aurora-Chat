<#
.SYNOPSIS
    Aurora-Chat 一键卸载脚本（Windows）。

.DESCRIPTION
    停止正在运行的前端/后端进程，清理依赖、构建文件和配置。
    可选择保留或删除 SQLite 数据库和上传文件。

.PARAMETER KeepData
    保留用户数据（数据库和上传文件）。

.PARAMETER Force
    跳过交互式确认提示。
#>
[CmdletBinding()]
param(
    [switch]$KeepData,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ── 路径 ───────────────────────────────────────────────────────────────────────
$Root        = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'

# ── 辅助函数 ───────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
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

function Stop-ProcessOnPort([int]$port) {
    if (-not $port) { return }
    $netstat = netstat -ano | Select-String -Pattern "LISTENING" | Select-String -Pattern ":$port\s+"
    $pids = @()
    foreach ($line in $netstat) {
        if ($line -match '\s+(\d+)\s*$') {
            $pids += [int]$Matches[1]
        }
    }
    $pids = $pids | Select-Object -Unique
    foreach ($pid in $pids) {
        Write-Host "  正在终止占用端口 $port 的进程 (PID: $pid)..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        # 备用 taskkill
        taskkill /PID $pid /T /F *> $null
    }
}

# ── 数据删除提示 ──────────────────────────────────────────────────────────────
$isInteractive = [Environment]::UserInteractive -and (-not $env:CI) -and ($host.Name -ne "NullHost")
$deleteData = $false

if (-not $KeepData) {
    if ($isInteractive) {
        Write-Host ""
        Write-Host "=== Aurora-Chat 反部署（卸载）提示 ===" -ForegroundColor Red
        Write-Host "该操作将停止运行的服务器，并清除所有依赖项与编译缓存。"

        $inputChoice = Read-Host "是否保留用户数据（包含 SQLite 数据库及上传的壁纸、头像等）？ [Y/n]（默认：保留）"
        if ($inputChoice.Trim() -eq 'n' -or $inputChoice.Trim() -eq 'no' -or $inputChoice.Trim() -eq 'N') {
            $deleteData = $true
            Write-Host "警告：您选择了【不保留】，所有聊天记录、用户数据和上传文件将被永久删除！" -ForegroundColor Red
        } else {
            Write-Host "选择保留用户数据（数据库与上传资产）。" -ForegroundColor Green
        }
    }
}

# ── 停止正在运行的进程 ────────────────────────────────────────────────────────
Write-Step "正在检测并终止正在运行的服务进程..."
$backendPort  = Get-EnvValue (Join-Path $BackendDir  '.env')       'PORT'
$frontendPort = Get-EnvValue (Join-Path $FrontendDir '.env.local') 'PORT'

if ($backendPort) { Stop-ProcessOnPort ([int]$backendPort) } else { Stop-ProcessOnPort 8000 }
if ($frontendPort) { Stop-ProcessOnPort ([int]$frontendPort) } else { Stop-ProcessOnPort 3000 }

# ── 清理后端 ───────────────────────────────────────────────────────────────────
Write-Step "清理后端文件及虚拟环境..."

$venvDir = Join-Path $BackendDir '.venv'
if (Test-Path $venvDir) {
    Write-Host "  正在删除 Python 虚拟环境 (backend\.venv)..."
    Remove-Item -Recurse -Force $venvDir -ErrorAction SilentlyContinue
}

$backendEnv = Join-Path $BackendDir '.env'
if (Test-Path $backendEnv) {
    if ($deleteData) {
        Write-Host "  正在删除后端配置文件 (backend\.env)..."
        Remove-Item -Force $backendEnv -ErrorAction SilentlyContinue
    } else {
        Write-Host "  保留后端配置文件 (backend\.env) 以用于保留 SECRET_KEY" -ForegroundColor Green
    }
}

$dbFile = Join-Path $BackendDir 'aurora_chat.db'
if (Test-Path $dbFile) {
    if ($deleteData) {
        Write-Host "  正在删除数据库文件 (backend\aurora_chat.db)..." -ForegroundColor Red
        Remove-Item -Force $dbFile -ErrorAction SilentlyContinue
    } else {
        Write-Host "  保留数据库文件 (backend\aurora_chat.db)" -ForegroundColor Green
    }
}

$uploadsDir = Join-Path $BackendDir 'uploads'
if (Test-Path $uploadsDir) {
    if ($deleteData) {
        Write-Host "  正在删除上传资产文件夹 (backend\uploads)..." -ForegroundColor Red
        Remove-Item -Recurse -Force $uploadsDir -ErrorAction SilentlyContinue
    } else {
        Write-Host "  保留上传资产文件夹 (backend\uploads)" -ForegroundColor Green
    }
}

# ── 清理前端 ───────────────────────────────────────────────────────────────────
Write-Step "清理前端构建及依赖文件..."

$nodeModules = Join-Path $FrontendDir 'node_modules'
if (Test-Path $nodeModules) {
    Write-Host "  正在删除前端依赖文件夹 (frontend\node_modules)..."
    Remove-Item -Recurse -Force $nodeModules -ErrorAction SilentlyContinue
}

$nextDir = Join-Path $FrontendDir '.next'
if (Test-Path $nextDir) {
    Write-Host "  正在删除 Next.js 构建缓存 (frontend\.next)..."
    Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
}

$frontendEnv = Join-Path $FrontendDir '.env.local'
if (Test-Path $frontendEnv) {
    Write-Host "  正在删除前端本地配置 (frontend\.env.local)..."
    Remove-Item -Force $frontendEnv -ErrorAction SilentlyContinue
}

Write-Step "反部署（卸载）完成！"
if ($deleteData) {
    Write-Host "  已完全清除整个应用及所有用户数据。" -ForegroundColor Cyan
} else {
    Write-Host "  依赖和构建已清理完毕。数据库和上传资源已安全保留！重新运行 .\deploy.bat 可再次一键部署。" -ForegroundColor Cyan
}
