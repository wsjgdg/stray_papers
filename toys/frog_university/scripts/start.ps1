<#
.SYNOPSIS
  奶蛙大学 · 本地开发服务器启动器（PowerShell 实现）。

.DESCRIPTION
  由根目录 start.cmd 转调而来。也可直接运行：
      powershell -ExecutionPolicy Bypass -File scripts\start.ps1

  设计要点：
  - 单窗口前台运行。Vite 作为子进程跑在同一个控制台里，Ctrl+C 一并退出；
    不使用 Start-Process / start / & 后台化，避免开出第二个终端窗口。
  - 类型检查放后台并行跑，不阻塞服务启动：280 个源文件的 tsc -b --force 要十几秒，
    串行会把启动拖住十几秒（实测 22 秒还没 listen，curl 直接拿到 502）。
    结果在服务器退出时打印。
  - 端口被占用时自动 +1 试，最多试 10 个；strictPort 由脚本自己兜住，
    vite.config.ts 里已设为 false，双保险。
  - 强制 UTF-8 输出：cmd 默认代码页是 GBK，不设置的话中文全是乱码。

.PARAMETER Port
  首选端口。默认 5173（Vite 默认）。

.PARAMETER Preview
  起 preview 服务器（跑 dist/ 产物）而不是 dev server。

.PARAMETER SkipInstall
  跳过依赖安装（node_modules 缺失时才提示）。

.PARAMETER SkipTypecheck
  跳过启动时的后台类型检查。

.PARAMETER NoBrowser
  不自动打开浏览器。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Port 5200 -Preview
#>

[CmdletBinding()]
param(
  [int]    $Port        = 5173,
  [switch] $Preview,
  [switch] $SkipInstall,
  [switch] $SkipTypecheck,
  [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# 脚本所在目录 = <repo>/scripts，回退两级拿到仓库根
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir

if (-not $Root) { $Root = (Get-Location).Path }

# ---------------------------------------------------------------- 控制台编码
# 必须放在「任何」输出之前，否则前面那几行 banner 已经按 GBK 写出去了。
# 本脚本源文件是 UTF-8 with BOM，PS 5.1 能正确解码；但写回控制台时用的是
# [Console]::OutputEncoding，cmd 默认给的是 GBK(936)，于是「奶蛙大学」被按
# GBK 解读 UTF-8 字节 -> 乱码（实测："���ܴ�ѧ��"）。
# 两步都要做：chcp 让 cmd 的代码页切到 UTF-8，OutputEncoding 让 PS 按 UTF-8 写出。
try { & chcp.com 65001 2>&1 | Out-Null } catch { }
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Step  { param([string]$Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "    $Msg" -ForegroundColor Green }
function Write-Warn2 { param([string]$Msg) Write-Host "    $Msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$Msg) Write-Host "    $Msg" -ForegroundColor Red }

function Exit-Fail {
  param([string]$Msg)
  Write-Err $Msg
  Write-Host ''
  # 双击运行时 cmd 会一闪而过，停一下让用户看清
  if ($env:WORKBUDDY_QUICK_LAUNCH -ne '1' -and -not $Host.Name) { Start-Sleep -Seconds 2 }
  exit 1
}

Write-Host ''
Write-Host '  奶蛙大学 · Naiwa University' -ForegroundColor White
Write-Host '  校园文字冒险 | 十条线 · 30 种结局' -ForegroundColor DarkGray
Write-Host ''

# ---------------------------------------------------------------- 1. Node 检查
Write-Step '检查运行环境'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Exit-Fail '找不到 node。请先安装 Node.js 20.19+ 或 22.12+：https://nodejs.org'
}

$nodeVersionRaw = (& node --version) 2>$null
if ($LASTEXITCODE -ne 0 -or -not $nodeVersionRaw) {
  Exit-Fail 'node 命令存在但无法执行，PATH 可能坏了。'
}

# "v22.22.2" -> 22.22.2
$nodeVersion = $nodeVersionRaw.TrimStart('v').Trim()
Write-Ok "Node $nodeVersion"

$major = [int]($nodeVersion.Split('.')[0])
$minor = [int]($nodeVersion.Split('.')[1])
# engines: ^20.19.0 || >=22.12.0
$versionOk = ($major -eq 20 -and $minor -ge 19) -or ($major -gt 20 -and $major -lt 22) -or $major -ge 22
if (-not $versionOk) {
  Write-Warn2 "Node $nodeVersion 低于项目要求（20.19+ / 22.12+），可能装不上依赖或构建失败。"
}
elseif ($major -eq 21) {
  Write-Warn2 'Node 21 非 LTS，建议用 20 或 22。'
}

# ---------------------------------------------------------------- 2. 包管理器
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  $pmName = 'pnpm'
  $pmVersion = (& pnpm --version) 2>$null
  Write-Ok "pnpm $pmVersion"
}
else {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) { Exit-Fail '找不到 pnpm 也没有 npm。装 Node.js 时勾选「包管理器」即可。' }
  $pmName = 'npm'
  Write-Ok "npm $((& npm --version) 2>$null)（未找到 pnpm）"
}

# ---------------------------------------------------------------- 3. 依赖
if (-not $SkipInstall) {
  $hasModules = Test-Path (Join-Path $Root 'node_modules')
  $hasVite    = Test-Path (Join-Path $Root 'node_modules\vite')

  if ($hasModules -and $hasVite) {
    Write-Ok '依赖已就位，跳过安装'
  }
  else {
    Write-Step "安装依赖（$pmName install）—— 首次约需 1-3 分钟"
    Push-Location $Root
    try {
      & $pmName install
      if ($LASTEXITCODE -ne 0) { Exit-Fail "$pmName install 失败，看上方输出。" }
    }
    finally { Pop-Location }
    Write-Ok '依赖安装完成'
  }
}

# ---------------------------------------------------------------- 4. 找空闲端口
function Test-PortInUse {
  param([int]$Port)
  try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return ($null -ne $listener)
  }
  catch {
    # Get-NetTCPConnection 不可用（Win7/精简系统）时退回 netstat
    $out = & netstat -ano 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
    return ($null -ne $out)
  }
}

Write-Step '选择端口'
$chosen = $Port
for ($i = 0; $i -lt 10; $i++) {
  if (-not (Test-PortInUse $chosen)) { break }
  $next = $Port + $i + 1
  Write-Warn2 "端口 $chosen 被占用，试 $next"
  $chosen = $next
}
if (Test-PortInUse $chosen) {
  Exit-Fail "端口 $Port..$($Port + 9) 都被占用。手动指定：start.cmd -Port 5300"
}

# preview 走 vite.config.ts 里的 4173；dev 走本次选定的端口
$mode = if ($Preview) { 'preview' } else { 'dev'      }
$url  = "http://127.0.0.1:$chosen/"
Write-Ok "$mode → $url"

# ---------------------------------------------------------------- 5. 启动
Write-Step $mode
Write-Host ''
Write-Host '    ----------------------------------------------' -ForegroundColor DarkGray
Write-Host "     奶蛙大学  $url" -ForegroundColor White
Write-Host '    ----------------------------------------------' -ForegroundColor DarkGray
Write-Host '     Ctrl+C 停止服务器' -ForegroundColor DarkGray
Write-Host ''

# 类型检查放后台并行跑：280 个源文件的 tsc -b --force 要十几秒，
# 串行会把服务启动硬生生拖住十几秒（实测 22 秒还没起来，curl 拿到 502）。
# 类型错误由 Vite 的 esbuild 转译阶段另行暴露，不依赖这一步兜底——
# tsc 报的是类型错，浏览器白屏报的是语法错，两者不是一回事。
$typecheck = $null
if (-not $SkipTypecheck) {
  Write-Warn2 '类型检查在后台并行跑，结果稍后打印（不阻塞启动）'
  $typecheck = Start-Job -ScriptBlock {
    param($repoRoot)
    Set-Location $repoRoot
    & node 'node_modules\typescript\bin\tsc' -b --force 2>&1
    $LASTEXITCODE
  } -ArgumentList $Root
}


if (-not $NoBrowser) {
  # 延迟打开：等 vite 真正 listen 之后再开，否则会先撞一次连接失败页
  Start-Job -ScriptBlock {
    param($target)
    Start-Sleep -Seconds 4
    try { Start-Process $target } catch { }
  } -ArgumentList $url | Out-Null
}

Push-Location $Root
try {
  # 前台阻塞运行 —— 保持单窗口。不要改成 Start-Process / & / start，
  # 那会开出第二个终端窗口，或让本脚本提前退出把 vite 变成孤儿进程。
  if ($Preview) {
    & node 'node_modules\vite\bin\vite.js' preview --port $chosen
  }
  else {
    & node 'node_modules\vite\bin\vite.js' --port $chosen
  }
}
finally {
  Pop-Location

  # 收尾：Ctrl+C 之后把后台 job 一并清掉，不留孤儿进程
  if ($typecheck) {
    Write-Host ''
    Write-Step '类型检查结果'
    try {
      $result = Receive-Job -Job $typecheck -Wait -ErrorAction Stop
      $code = @($result)[-1]
      if ($code -eq 0) { Write-Ok '类型检查通过' }
      else { Write-Warn2 "类型检查未通过（exit $code）—— 构建产物仍可用，但类型层面有问题。" }
    }
    catch {
      Write-Warn2 "类型检查未完成：$($_.Exception.Message)"
    }
    finally {
      Remove-Job -Job $typecheck -Force -ErrorAction SilentlyContinue
    }
  }

  Get-Job -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Running' } |
    Remove-Job -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host '服务器已停止。' -ForegroundColor DarkGray
