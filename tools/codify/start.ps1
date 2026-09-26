# Standalone dev launcher for the meeting-notes workbench.
# ASCII-only on purpose: PowerShell 5.1 on Chinese Windows defaults to GBK,
# and a UTF-8-no-BOM script would be misdecoded. Keep comments in English.
#
# What it does:
#   1. If node_modules is missing, run pnpm install (hoisted layout) first.
#   2. Probe ports starting at 8000; pick the first one that is free.
#   3. Start Vite (directly via node_modules/.bin/vite) bound to that port.
#   4. Open the browser at http://localhost:<port>.
#   5. If Vite exits with an error, the window STAYS OPEN so you can read it
#      (no more flash-close / "闪退").
#
# Invoked by start.cmd. Safe to double-click.

$root = $PSScriptRoot
Set-Location $root

$startPort = 8000
$maxPort   = 8100

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
