# Standalone dev launcher for the meeting-notes workbench.
# ASCII-only on purpose: PowerShell 5.1 on Chinese Windows defaults to GBK,
# and a UTF-8-no-BOM script would be misdecoded. Keep comments in English.
#
# What it does:
#   1. If node_modules is missing, run pnpm install (hoisted layout) first.
#   2. Start a LOCAL Whisper ASR service (faster-whisper-server / speaches) on
#      port 8000 with CORS open, so the app's default "local-whisper" engine
#      works out of the box. Best-effort: if not installed, prints a one-time
#      install hint and continues (the app still runs; only ASR needs it).
#   3. Probe ports starting at 8000; pick the first one that is free for Vite.
#   4. Start Vite (directly via node_modules/.bin/vite) bound to that port.
#   5. Open the browser ONLY after Vite is confirmed serving (avoids a black page).
#   6. If Vite exits with an error, the window STAYS OPEN so you can read it
#      (no more flash-close / "闪退"). On exit we stop the Whisper service too.
#
# Invoked by start.cmd. Safe to double-click.

$root = $PSScriptRoot
Set-Location $root

$startPort = 8000
$maxPort   = 8100
$whisperPort = 8000

function Test-PortFree {
    param([int]$port)
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(500)) { return $true }
        try { $tcp.EndConnect($result) | Out-Null; return $false } catch { return $true }
    } catch { return $true } finally { if ($tcp -ne $null) { try { $tcp.Close() } catch { } } }
}

function Wait-ForPortTaken {
    param([int]$port, [int]$timeoutSec = 15)
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-PortFree -port $port)) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# Kill a process and its whole tree (Vite is launched via vite.cmd -> node child).
function Stop-ProcessTree {
    param([int]$pid)
    if ($pid -le 0) { return }
    try { taskkill.exe /F /T /PID $pid 2>$null | Out-Null } catch { }
}

# Best-effort launch of a local OpenAI-compatible Whisper service with CORS open.
# Returns the Process object we started (so we can stop it later), or $null.
function Start-WhisperService {
    if (-not (Test-PortFree -port $whisperPort)) {
        Write-Host "Local Whisper ASR service already listening on port $whisperPort - skipping launch."
        return $null
    }
    # CORS: allow the dev-origin browser to call the service directly.
    $env:ALLOW_ORIGINS = '["*"]'
    $env:CORS_ORIGINS   = '["*"]'

    $candidates = @(
        @{ exe = 'faster-whisper-server'; args = @();                module = $null },
        @{ exe = 'speaches';              args = @();                module = $null },
        @{ exe = 'python';  args = @('-m', 'faster_whisper_server'); module = 'faster_whisper_server' },
        @{ exe = 'python';  args = @('-m', 'speaches');              module = 'speaches' },
        @{ exe = 'python3'; args = @('-m', 'faster_whisper_server'); module = 'faster_whisper_server' }
    )
    foreach ($c in $candidates) {
        if (-not (Get-Command $c.exe -ErrorAction SilentlyContinue)) { continue }
        # For python -m, verify the module is importable before launching a doomed process.
        if ($c.module) {
            try { & $c.exe -c ("import " + $c.module) 2>$null } catch { }
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  skip $($c.exe) -m $($c.module): module not installed"
                continue
            }
        }
        $logOut = Join-Path $root 'whisper-service.out.log'
        $logErr = Join-Path $root 'whisper-service.err.log'
        Write-Host "Starting local Whisper ASR service ($($c.exe)) on port $whisperPort with CORS open..."
        try {
            $p = Start-Process -FilePath $c.exe -ArgumentList $c.args `
                -RedirectStandardOutput $logOut -RedirectStandardError $logErr `
                -PassThru -WindowStyle Hidden
        } catch {
            Write-Host "Failed to launch $($c.exe): $_"
            continue
        }
        # Confirm it actually bound the port (uvicorn binds before loading the model).
        $up = Wait-ForPortTaken -port $whisperPort -timeoutSec 15
        if ($up) {
            Write-Host "  Whisper ASR service is up on port $whisperPort."
            Write-Host "  (first transcription may download the model - can take a minute)"
            return $p
        }
        if ($p.HasExited) {
            Write-Host "  $($c.exe) exited without binding port $whisperPort - trying next option."
            $tail = Get-Content $logErr -Tail 5 -ErrorAction SilentlyContinue
            if ($tail) { Write-Host "  last error log:"; $tail | ForEach-Object { Write-Host ("    " + $_) } }
            continue
        }
        # Process alive but port not yet bound: likely still loading the model. Let it run.
        Write-Host "  service process running but not yet bound to port $whisperPort (loading model?) - continuing."
        Write-Host "  (first transcription may download the model - can take a minute)"
        return $p
    }
    # Docker fallback (detached; survives this script's exit).
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Starting local Whisper ASR service via Docker (fedirz/faster-whisper-server:latest-cpu) on port $whisperPort with CORS open..."
        try {
            docker run -d --rm -e "ALLOW_ORIGINS=[\"*\"]" -p "${whisperPort}:8000" `
                fedirz/faster-whisper-server:latest-cpu 2>&1 | Out-Null
            return $null
        } catch {
            Write-Host "Docker launch failed: $_"
        }
    }
    Write-Host "WARN: local Whisper ASR service NOT started."
    Write-Host "      Install once:  pip install faster-whisper-server"
    Write-Host "      Then re-run this launcher; it will auto-start the service (model 'base', port 8000, CORS open)."
    Write-Host "      (The app still runs - only realtime/paste transcription needs the service.)"
    return $null
}

$viteBin = Join-Path $root 'node_modules\.bin\vite.cmd'
if (-not (Test-Path $viteBin)) {
    Write-Host 'Dependencies missing - installing with pnpm (node-linker=hoisted)...'
    & pnpm install --config.node-linker=hoisted
    if (-not (Test-Path $viteBin)) {
        Write-Host 'ERROR: vite not found after install. Make sure pnpm/node are installed and on PATH.'
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

$whisperProc = $null
$watchProc   = $null
try {
    # Bring up Whisper first so it claims port 8000; Vite will then pick 8001+.
    $whisperProc = Start-WhisperService

    # If a Whisper process is running it targets port 8000 - keep Vite off it.
    $port = if ($whisperProc) { 8001 } else { $startPort }
    while ($port -le $maxPort) {
        if (Test-PortFree -port $port) { break }
        $port++
    }
    if ($port -gt $maxPort) {
        Write-Host 'ERROR: no free port between 8000 and 8100.'
        Read-Host 'Press Enter to exit'
        exit 1
    }

    Write-Host "Starting dev server on http://localhost:$port (host 0.0.0.0)..."
    # Single-window model: Vite runs in THIS window (foreground) so there is
    # exactly one terminal. A detached, hidden watcher opens the browser only
    # after Vite is confirmed serving - that prevents the black page (a browser
    # opened before Vite is ready just shows a connection error).
    $watchScript = @"
`$p = $port
`$max = 180; `$i = 0
while (`$i -lt `$max) {
  `$i++
  try {
    `$r = Invoke-WebRequest -Uri "http://127.0.0.1:`$p/" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if (`$r.StatusCode -eq 200) { Start-Process "http://localhost:`$p"; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
"@
    $watchPath = Join-Path $root '.vite-ready-watcher.ps1'
    Set-Content -Path $watchPath -Value $watchScript -Encoding ascii
    $watchProc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$watchPath -WindowStyle Hidden -PassThru

    & $viteBin --port $port --host 0.0.0.0
    $code = $LASTEXITCODE
    if ($code -ne 0) { Write-Host "Dev server exited with code $code."; Read-Host 'Press Enter to exit' }
} finally {
    if ($watchProc -and -not $watchProc.HasExited) { Stop-ProcessTree -pid $watchProc.Id }
    if ($whisperProc -and -not $whisperProc.HasExited) { Stop-ProcessTree -pid $whisperProc.Id }
    $watchFile = Join-Path $root '.vite-ready-watcher.ps1'
    if (Test-Path $watchFile) { Remove-Item $watchFile -Force -ErrorAction SilentlyContinue }
}
