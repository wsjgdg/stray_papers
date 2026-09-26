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
#   5. Open the browser at http://localhost:<port>.
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
        @{ exe = 'faster-whisper-server'; args = @() },
        @{ exe = 'speaches';              args = @() },
        @{ exe = 'python';                args = @('-m', 'faster_whisper_server') },
        @{ exe = 'python';                args = @('-m', 'speaches') },
        @{ exe = 'python3';               args = @('-m', 'faster_whisper_server') }
    )
    foreach ($c in $candidates) {
        if (-not (Get-Command $c.exe -ErrorAction SilentlyContinue)) { continue }
        $log = Join-Path $root 'whisper-service.log'
        Write-Host "Starting local Whisper ASR service ($($c.exe)) on port $whisperPort with CORS open..."
        try {
            $p = Start-Process -FilePath $c.exe -ArgumentList $c.args `
                -RedirectStandardOutput $log -RedirectStandardError $log `
                -PassThru -WindowStyle Hidden
            Write-Host "  (first run may download the Whisper model - can take a minute)"
            return $p
        } catch {
            Write-Host "Failed to launch $($c.exe): $_"
        }
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
try {
    # Bring up Whisper first so it claims port 8000; Vite will then pick 8001+.
    $whisperProc = Start-WhisperService

    $port = $startPort
    while ($port -le $maxPort) {
        if (Test-PortFree -port $port) { break }
        $port++
    }
    if ($port -gt $maxPort) {
        Write-Host 'ERROR: no free port between 8000 and 8100.'
        Read-Host 'Press Enter to exit'
        exit 1
    }

    Write-Host "Starting dev server on http://localhost:$port (host 0.0.0.0)"
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:$port"

    & $viteBin --port $port --host 0.0.0.0
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host "Dev server exited with code $code."
        Read-Host 'Press Enter to exit'
    }
} finally {
    if ($whisperProc -and -not $whisperProc.HasExited) {
        try { $whisperProc.Kill() } catch { }
    }
}
