<#
.SYNOPSIS
    Aurora-Chat 一键部署脚本（Windows）。

.DESCRIPTION
    创建 Python 虚拟环境，安装后端和前端依赖，将运行时配置
    （backend/.env、frontend/.env.local）写入请求的端口，并（默认）构建
    生产环境前端。

    前端通过 Next.js 重写（参见 next.config.ts）与后端通信，
    因此对外仅暴露前端端口。写入 frontend/.env.local 的
    BACKEND_ORIGIN 告诉 Next.js 进程将 /api 和 /uploads 请求转发到哪里。

.PARAMETER BackendPort
    FastAPI 进程的端口。默认 8000。

.PARAMETER FrontendPort
    Next.js 进程的端口。默认 3000。仅此端口需要对外暴露。

.PARAMETER SkipBuild
    跳过 'npm run build'。当您后续将使用 dev.ps1 时使用此选项。

.PARAMETER Force
    从头覆盖 backend/.env（重新生成 SECRET_KEY）。如果不使用此标志，
    现有的 .env 将保留其值，仅修补 PORT 行。

.EXAMPLE
    .\scripts\deploy.ps1
    .\scripts\deploy.ps1 -BackendPort 9000 -FrontendPort 8080
    .\scripts\deploy.ps1 -SkipBuild           # 用于开发工作流
    .\scripts\deploy.ps1 -Force               # 轮换 SECRET_KEY 等
#>
[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [switch]$SkipBuild,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ── 端口配置 ──────────────────────────────────────────────────────────────────
$isInteractive = [Environment]::UserInteractive -and (-not $env:CI) -and ($host.Name -ne "NullHost")

if ($isInteractive) {
    $ExplicitFrontend = $MyInvocation.BoundParameters.ContainsKey('FrontendPort')
    $ExplicitBackend  = $MyInvocation.BoundParameters.ContainsKey('BackendPort')

    if (-not $ExplicitFrontend -or -not $ExplicitBackend) {
        Write-Host ""
        Write-Host "=== Aurora-Chat 端口自定义配置 ===" -ForegroundColor Yellow
        Write-Host "提示：已实现前后端合并。内网穿透或公网访问时，仅需开放前端端口！" -ForegroundColor Green
        Write-Host "直接回车即可保持默认值。"

        if (-not $ExplicitFrontend) {
            $inputFrontend = Read-Host "请输入前端端口 [默认: $FrontendPort]"
            if ($inputFrontend.Trim() -match '^\d+$') {
                $FrontendPort = [int]($inputFrontend.Trim())
            }
        }

        if (-not $ExplicitBackend) {
            $inputBackend = Read-Host "请输入后端端口 [默认: $BackendPort]"
            if ($inputBackend.Trim() -match '^\d+$') {
                $BackendPort = [int]($inputBackend.Trim())
            }
        }
        Write-Host "端口已更新：前端=$FrontendPort，后端=$BackendPort" -ForegroundColor Cyan
        Write-Host "====================================" -ForegroundColor Yellow
    }
}

# ── 路径 ───────────────────────────────────────────────────────────────────────
$Root        = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'
$VenvPython  = Join-Path $BackendDir '.venv\Scripts\python.exe'

# ── 辅助函数 ───────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Test-Cmd([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Assert-ExitCode([string]$what) {
    if ($LASTEXITCODE -ne 0) {
        throw "$what 失败（退出码 $LASTEXITCODE）"
    }
}

# 写入 UTF-8 无 BOM 文件。python-dotenv 和 Next.js 在某些配置下
# 都会因 BOM 而出错，而 WinPS 5.1 中的 Set-Content -Encoding utf8
# 会生成 BOM。使用 .NET writer 来避免此问题。
function Write-Utf8NoBom([string]$path, [string]$content) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $content, $enc)
}

function Update-EnvLine([string]$path, [string]$key, [string]$value) {
    $lines = @(Get-Content -LiteralPath $path)
    $found = $false
    $out = foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($key))\s*=") {
            $found = $true
            "$key=$value"
        } else {
            $line
        }
    }
    if (-not $found) { $out = @($out) + "$key=$value" }
    Write-Utf8NoBom $path (($out -join "`n") + "`n")
}

# ── 前置检查 ──────────────────────────────────────────────────────────────────
Write-Step "正在检查前置条件"

if (-not (Test-Cmd 'python')) {
    throw "未在 PATH 中找到 python。请从 https://www.python.org/ 安装 Python 3.10+ 并重新打开终端。"
}
if (-not (Test-Cmd 'node')) {
    throw "未在 PATH 中找到 node。请从 https://nodejs.org/ 安装 Node.js 18.18+ 并重新打开终端。"
}
if (-not (Test-Cmd 'npm')) {
    throw "未在 PATH 中找到 npm（应随 Node.js 一同安装）。"
}

$pyVersion   = (& python --version) -replace '^Python\s+',''
$nodeVersion = & node --version
Write-Host "  python : $pyVersion"
Write-Host "  node   : $nodeVersion"
Write-Host "  端口   : 后端=$BackendPort  前端=$FrontendPort"

# ── 后端：虚拟环境 + pip ───────────────────────────────────────────────────────
Write-Step "正在准备 Python 虚拟环境 (backend\.venv)"

$venvValid = $false
$pyvenvCfg = Join-Path $BackendDir '.venv\pyvenv.cfg'
if ((Test-Path $VenvPython) -and (Test-Path $pyvenvCfg)) {
    try {
        # 测试虚拟环境是否实际可用
        $check = & $VenvPython -c "print('ok')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $check.Trim() -eq 'ok') {
            $venvValid = $true
        }
    } catch {
        $venvValid = $false
    }
}

if (-not $venvValid) {
    Write-Host "  虚拟环境不存在或已损坏。正在重新创建虚拟环境..." -ForegroundColor Yellow
    $venvDir = Join-Path $BackendDir '.venv'
    if (Test-Path $venvDir) {
        Remove-Item -Recurse -Force $venvDir -ErrorAction SilentlyContinue
    }
    Push-Location $BackendDir
    try {
        & python -m venv .venv
        Assert-ExitCode 'python -m venv'
    } finally { Pop-Location }
} else {
    Write-Host "  发现完好的现有虚拟环境，直接复用" -ForegroundColor Green
}

Write-Step "正在安装后端依赖"
& $VenvPython -m pip install --upgrade pip
Assert-ExitCode 'pip 升级'
& $VenvPython -m pip install -r (Join-Path $BackendDir 'requirements.txt')
Assert-ExitCode 'pip 安装 requirements.txt'

# ── 后端：.env ─────────────────────────────────────────────────────────────────
Write-Step "正在写入 backend\.env"

$envFile     = Join-Path $BackendDir '.env'
$envExample  = Join-Path $BackendDir '.env.example'
$corsOrigins = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"

if ($Force -or -not (Test-Path $envFile)) {
    if (-not (Test-Path $envExample)) {
        throw "缺少 $envExample，无法初始化 backend\.env。"
    }
    # 随机生成 SECRET_KEY — 切勿使用 .env.example 中的占位符。
    $secret = & $VenvPython -c "import secrets; print(secrets.token_urlsafe(32))"
    Assert-ExitCode '密钥生成'
    $secret = $secret.Trim()

    $template = Get-Content -LiteralPath $envExample -Raw
    Write-Utf8NoBom $envFile $template

    Update-EnvLine $envFile 'HOST'          '127.0.0.1'
    Update-EnvLine $envFile 'PORT'          "$BackendPort"
    Update-EnvLine $envFile 'SECRET_KEY'    $secret
    Update-EnvLine $envFile 'CORS_ORIGINS'  $corsOrigins
    Update-EnvLine $envFile 'DEBUG'         'false'

    Write-Host "  已写入 $envFile（SECRET_KEY 已随机化，HOST=127.0.0.1）"
    Write-Host "  HOST=127.0.0.1 使 FastAPI 不暴露在公网 — 仅前端端口需要对外可达。"
} else {
    # 保留现有值，只修补重新部署时可能变化的部分。
    Update-EnvLine $envFile 'PORT' "$BackendPort"
    Update-EnvLine $envFile 'CORS_ORIGINS' $corsOrigins
    Write-Host "  $envFile 已存在；仅修补了 PORT 和 CORS_ORIGINS"
    Write-Host "  （使用 -Force 可重新生成 SECRET_KEY 并重置 DEBUG/HOST）"
}

# ── 前端：.env.local ──────────────────────────────────────────────────────────
Write-Step "正在写入 frontend\.env.local"

$frontendEnv = Join-Path $FrontendDir '.env.local'
$frontendEnvBody = @"
# 由 scripts\deploy.ps1 生成 — 每次重新部署时覆盖。
# BACKEND_ORIGIN 为 next.config.ts 重写提供后端地址：Next.js 进程将
# /api 和 /uploads 请求转发至此。由 @next/env 在 next.config.ts 运行前加载。
BACKEND_ORIGIN=http://127.0.0.1:$BackendPort
PORT=$FrontendPort
"@
Write-Utf8NoBom $frontendEnv ($frontendEnvBody + "`n")
Write-Host "  已写入 $frontendEnv"

# ── 前端：安装 + 构建 ─────────────────────────────────────────────────────────
Write-Step "正在安装前端依赖"
Push-Location $FrontendDir
try {
    & npm.cmd install
    Assert-ExitCode 'npm install'

    if (-not $SkipBuild) {
        Write-Step "正在构建前端（生产环境）"
        & npm.cmd run build
        Assert-ExitCode 'npm run build'
    } else {
        Write-Host ""
        Write-Host "  已指定 -SkipBuild；生产环境 start.ps1 在构建之前将无法运行。"
        Write-Host "  开发工作流请使用 dev.ps1。"
    }
} finally { Pop-Location }

# ── 完成 ──────────────────────────────────────────────────────────────────────
Write-Step "部署完成"
Write-Host "  后端   : 127.0.0.1:$BackendPort  （仅回环地址）"
Write-Host "  前端   : 0.0.0.0:$FrontendPort   （对外暴露此端口）"
Write-Host ""
Write-Host "启动服务栈：" -ForegroundColor Green
Write-Host "  .\scripts\start.ps1                # 生产环境"
Write-Host "  .\scripts\dev.ps1                  # 开发环境（热重载）"
Write-Host "  .\scripts\start.ps1 -BackendOnly   # 用于 MCSM 风格面板"
Write-Host "  .\scripts\start.ps1 -FrontendOnly"
