# ---------------------------------------------------------------------------
#  para_visualizer - launcher (PowerShell)
#  Called by start.cmd; also runnable directly:
#    powershell -ExecutionPolicy Bypass -File start.ps1
#  Installs deps and starts the Next.js dev server.
#  Requires Node.js (>=18) and npm on PATH.
#
#  Port handling:
#    * PORT env (default 3000) selects the listen port; pass -Port to override.
#    * Before launching we detect whether that port is already occupied.
#      - If it is held by THIS project's own node process, we reuse it (already running).
#      - If it is held by a *stale* process (not from this launcher), we free it
#        ONLY when -ForceReclaim is passed, so we never kill something important.
#    * A background watchdog releases the port on Ctrl+C / window close, so an
#      ungraceful exit does not leave an orphaned listener behind.
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [int]    $Port         = $(if ($env:PORT) { [int]$env:PORT } else { 3000 }),
    [switch] $ForceReclaim
)

$ErrorActionPreference = 'Stop'

# Force ASCII console output so messages stay readable under any host codepage
# (e.g. GBK consoles) instead of turning into mojibake.
try { [Console]::OutputEncoding = [System.Text.Encoding]::ASCII } catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $ScriptDir

function Write-Step([string]$n, [string]$text) {
    Write-Host ''
    Write-Host '==========================================================================' -ForegroundColor Cyan
    Write-Host ('  [' + $n + '] ' + $text) -ForegroundColor Cyan
    Write-Host '==========================================================================' -ForegroundColor Cyan
}

function Pause-IfConsole {
    # Only pause when truly interactive: a real ConsoleHost whose input is NOT
    # redirected. Under start.cmd (double-click) this is true; under automation
    # (redirected stdout/stderr) it is false, so we never hang on ReadKey.
    try {
        if (($Host.Name -match 'ConsoleHost') -and -not [Console]::IsInputRedirected) {
            Write-Host ''
            Write-Host '  Press any key to exit...' -ForegroundColor DarkGray
            [void][System.Console]::ReadKey($true)
        }
    } catch {
        # If we cannot determine interactivity, skip the pause rather than hang.
    }
}

# Return the owning PID for a LISTENing TCP socket on $Port (null if free).
function Get-ListenerPid([int]$port) {
    $raw = netstat -ano | Select-String -Pattern "TCP.*:${port}\s+.*LISTEN"
    if (-not $raw) { return $null }
    foreach ($line in $raw) {
        # Last whitespace-delimited token is the PID (may carry trailing CR).
        $tokens = ($line.Line -split '\s+') | Where-Object { $_ -ne '' }
        $candidate = $tokens[-1].Trim()
        [int]$listenerPid = 0
        if ([int]::TryParse($candidate, [ref]$listenerPid)) { return $listenerPid }
    }
    return $null
}

function Get-ProcessName([int]$procId) {
    try {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        return if ($p) { $p.Name } else { $null }
    } catch {
        return $null
    }
}

# Returns $true if something is actually serving HTTP on the given port.
# Uses 127.0.0.1 (not 'localhost', which can resolve to ::1/IPv6 and miss an
# IPv4-bound Next dev server). This is the authoritative signal that "this port
# is our own running app", far more reliable than matching the process name.
# Retries a few times because a freshly-started Next dev server answers its
# first request slowly (lazy route compilation can exceed a short timeout).
function Test-PortServing([int]$port) {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            $r = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $port + "/") -TimeoutSec 6 `
                -UseBasicParsing -ErrorAction SilentlyContinue
            if ($null -ne $r -and $r.StatusCode -ge 200 -and $r.StatusCode -lt 600) {
                return $true
            }
        } catch {
            # Transient timeout/refused — fall through and retry.
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Global so the finally-block watchdog can clean up the child + reclaimed PIDs.
$script:ServerProc = $null
$script:Reclaimed  = @()

try {
    Write-Host ''
    Write-Host '  para_visualizer - starting...' -ForegroundColor Green
    Write-Host ('  Project dir: ' + $ScriptDir) -ForegroundColor DarkGray

    # 0) environment check
    Write-Step '0/3' 'Checking Node / npm'
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $npmCmd  = Get-Command npm  -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { throw 'node not found. Install Node.js (>=18) from https://nodejs.org' }
    if (-not $npmCmd)  { throw 'npm not found.' }

    $nodeVer = & node -v 2>$null
    $npmVer  = & npm -v 2>$null
    Write-Host ('  node: ' + $nodeVer + '   npm: ' + $npmVer)

    # 1) install dependencies
    Write-Step '1/3' 'Checking and installing dependencies (npm install)'
    if (-not (Test-Path 'node_modules')) {
        Write-Host '  node_modules not found, installing...'
        & npm install
        if ($LASTEXITCODE -ne 0) { throw ('npm install failed (exit ' + $LASTEXITCODE + ').') }
        Write-Host '  Dependencies installed.' -ForegroundColor Green
    } else {
        Write-Host '  node_modules already present, skipping install.' -ForegroundColor DarkGray
        Write-Host '  (To force an update, delete node_modules and package-lock.json first.)'
    }

    # 2) resolve port occupancy before launching
    Write-Step '2/3' "Resolving port :$Port"
    $owner = Get-ListenerPid $Port
    if ($null -ne $owner) {
        $name = Get-ProcessName $owner
        Write-Host ('  Port ' + $Port + ' is occupied by PID ' + $owner + ' (' + $name + ').')
        if (-not $ForceReclaim -and (Test-PortServing $Port)) {
            # A server is already answering on this port — treat it as our own
            # running instance and reuse it rather than erroring out.
            Write-Host ('  Already serving on :' + $Port + ' — reusing the running instance.') -ForegroundColor Yellow
            Write-Host ('  URL: http://localhost:' + $Port) -ForegroundColor Green
            Write-Host '  (Run with -ForceReclaim to kill it and start fresh.)'
            exit 0
        }
        if ($ForceReclaim) {
            Write-Host ('  ForceReclaim set: terminating stale listener PID ' + $owner + '...') -ForegroundColor Yellow
            Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
            $script:Reclaimed += $owner
            Start-Sleep -Seconds 2
            if ($null -ne (Get-ListenerPid $Port)) {
                throw ('Port ' + $Port + ' still occupied after reclaim. Free it manually.')
            }
            Write-Host '  Port freed.' -ForegroundColor Green
        } else {
            throw ('Port ' + $Port + ' already in use by PID ' + $owner + '. Pass -ForceReclaim to free it, or set -Port to an alternative.')
        }
    } else {
        Write-Host ('  Port ' + $Port + ' is free.') -ForegroundColor DarkGray
    }

    # 3) start dev server with the chosen PORT
    $env:PORT = "$Port"
    Write-Step '3/3' 'Starting dev server'
    Write-Host ('  URL: http://localhost:' + $Port)
    Write-Host '  (Press Ctrl+C to stop)'
    Write-Host '=========================================================================='

    # Launch in the SAME console (-NoNewWindow) so stdout is visible and Ctrl+C
    # propagates, but capture the PID so we can guarantee cleanup of the whole
    # tree (npm -> next -> node) on exit / window close.
    # NOTE: `npm` is a .cmd wrapper on Windows, which Start-Process cannot exec
    # directly, so resolve its real path (npm.cmd) or fall back to cmd /c.
    $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue).Source
    if ($npmCmd -and $npmCmd.EndsWith('.cmd')) {
        $script:ServerProc = Start-Process -FilePath $npmCmd -ArgumentList 'run','dev' `
            -WorkingDirectory $ScriptDir -NoNewWindow -PassThru
    } else {
        $script:ServerProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c',"cd /d `"$ScriptDir`" && npm run dev" `
            -NoNewWindow -PassThru
    }
    Write-Host ('  Dev server PID: ' + $script:ServerProc.Id)

    # Spawn a DETACHED watchdog that frees the port if THIS launcher is killed
    # (e.g. window closed) — a `finally` block cannot run on a hard kill, so
    # without this the child dev server would orphan and keep holding the port.
    try {
        $wdArgs = @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', (Join-Path $ScriptDir 'launcher-watchdog.ps1'),
            '-LauncherPid', $PID,
            '-ServerPid', $script:ServerProc.Id,
            '-Port', $Port
        )
        # Use the pwsh that launched us; prefer pwsh, fall back to powershell.
        $pwshExe = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
        if (-not $pwshExe) { $pwshExe = (Get-Command powershell -ErrorAction SilentlyContinue).Source }
        if ($pwshExe) {
            Start-Process -FilePath $pwshExe -ArgumentList $wdArgs -WorkingDirectory $ScriptDir `
                -WindowStyle Hidden -PassThru | Out-Null
            Write-Host '  Port watchdog armed (frees :' + $Port + ' if this window is closed).'
        }
    } catch {
        Write-Host '  [warn] Could not arm port watchdog; port may need manual freeing on hard exit.' -ForegroundColor DarkGray
    }

    # Wait until it is actually listening (or has died) so we can report failures.
    $listening = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ($script:ServerProc.HasExited) { break }
        if ($null -ne (Get-ListenerPid $Port)) { $listening = $true; break }
        Start-Sleep -Seconds 1
    }
    if ($script:ServerProc.HasExited -and -not $listening) {
        throw ('Dev server exited early (exit code ' + $script:ServerProc.ExitCode + '). See output above.')
    }
    Write-Host ''
    Write-Host ('  Ready: http://localhost:' + $Port) -ForegroundColor Green

    # Block until the user stops the server (Ctrl+C) or the process dies.
    try {
        while (-not $script:ServerProc.HasExited) { Start-Sleep -Seconds 1 }
    } catch [System.Management.Automation.PipelineStoppedException] {
        Write-Host ''
        Write-Host '  Ctrl+C received, shutting down...' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '  Dev server stopped.' -ForegroundColor Yellow
}
catch {
    Write-Host ''
    Write-Host ('  [ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('  at ' + $_.InvocationInfo.ScriptName + ':' + $_.InvocationInfo.ScriptLineNumber) -ForegroundColor Red
    Write-Host '  Startup failed. Check the message above and retry.' -ForegroundColor Red
    exit 1
}
finally {
    # Kill the server process tree so the port never leaks, including the
    # grandchild node that npm spawns. Also release any reclaimed listeners.
    if ($script:ServerProc -and -not $script:ServerProc.HasExited) {
        try { taskkill /PID $script:ServerProc.Id /T /F | Out-Null } catch {}
        try { Stop-Process -Id $script:ServerProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    # Safety net: anything still on our port gets freed.
    $stillUp = Get-ListenerPid $Port
    if ($null -ne $stillUp) {
        try { taskkill /PID $stillUp /T /F | Out-Null } catch {}
    }
    foreach ($reclaimedPid in $script:Reclaimed) {
        try { if (Get-Process -Id $reclaimedPid -ErrorAction SilentlyContinue) { Stop-Process -Id $reclaimedPid -Force } } catch {}
    }
    Pause-IfConsole
}
