# ---------------------------------------------------------------------------
#  para_visualizer - launcher (PowerShell)
#  Called by start.cmd; also runnable directly:
#    powershell -ExecutionPolicy Bypass -File start.ps1
#  Installs deps and starts the Next.js dev server (http://localhost:3000).
#  Requires Node.js (>=18) and npm on PATH.
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $ScriptDir

function Write-Step([string]$n, [string]$text) {
    Write-Host ''
    Write-Host '==========================================================================' -ForegroundColor Cyan
    Write-Host ('  [' + $n + '] ' + $text) -ForegroundColor Cyan
    Write-Host '==========================================================================' -ForegroundColor Cyan
}

function Pause-IfConsole {
    if ($Host.Name -match 'ConsoleHost') {
        Write-Host ''
        Write-Host '  Press any key to exit...' -ForegroundColor DarkGray
        [void][System.Console]::ReadKey($true)
    }
}

try {
    Write-Host ''
    Write-Host '  para_visualizer - starting...' -ForegroundColor Green
    Write-Host ('  Project dir: ' + $ScriptDir) -ForegroundColor DarkGray

    # 0) environment check
    Write-Step '0/2' 'Checking Node / npm'
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $npmCmd  = Get-Command npm  -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { throw 'node not found. Install Node.js (>=18) from https://nodejs.org' }
    if (-not $npmCmd)  { throw 'npm not found.' }

    $nodeVer = & node -v 2>$null
    $npmVer  = & npm -v 2>$null
    Write-Host ('  node: ' + $nodeVer + '   npm: ' + $npmVer)

    # 1) install dependencies
    Write-Step '1/2' 'Checking and installing dependencies (npm install)'
    if (-not (Test-Path 'node_modules')) {
        Write-Host '  node_modules not found, installing...'
        & npm install
        if ($LASTEXITCODE -ne 0) { throw ('npm install failed (exit ' + $LASTEXITCODE + ').') }
        Write-Host '  Dependencies installed.' -ForegroundColor Green
    } else {
        Write-Host '  node_modules already present, skipping install.' -ForegroundColor DarkGray
        Write-Host '  (To force an update, delete node_modules and package-lock.json first.)'
    }

    # 2) start dev server
    Write-Step '2/2' 'Starting dev server'
    Write-Host '  URL: http://localhost:3000'
    Write-Host '  (Press Ctrl+C to stop)'
    Write-Host '=========================================================================='
    & npm run dev

    Write-Host ''
    Write-Host '  Dev server stopped.' -ForegroundColor Yellow
}
catch {
    Write-Host ''
    Write-Host ('  [ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '  Startup failed. Check the message above and retry.' -ForegroundColor Red
    exit 1
}
finally {
    Pause-IfConsole
}
