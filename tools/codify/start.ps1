# Standalone dev launcher for the meeting-notes workbench.
# ASCII-only on purpose: PowerShell 5.1 on Chinese Windows defaults to GBK,
# and a UTF-8-no-BOM script would be misdecoded. Keep comments in English.
#
# What it does:
#   1. Probe ports starting at 8000; pick the first one that is free.
#   2. Start Vite (pnpm dev) bound to that port.
#   3. Open the browser at http://localhost:<port>.
#
# Invoked by start.cmd. Safe to double-click.

$ErrorActionPreference = 'Stop'

$startPort = 8000
$maxPort   = 8100

function Test-PortFree {
    param([int]$port)
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(500)) {
            # Timed out: port is filtered/free.
            return $true
        }
        # Completed: refused => free, accepted => busy.
        try {
            $tcp.EndConnect($result) | Out-Null
            return $false
        } catch {
            return $true
        }
    } catch {
        return $true
    } finally {
        if ($tcp -ne $null) { try { $tcp.Close() } catch { } }
    }
}

$port = $startPort
while ($port -le $maxPort) {
    if (Test-PortFree -port $port) { break }
    $port++
}
if ($port -gt $maxPort) {
    Write-Host "ERROR: no free port between $startPort and $maxPort."
    exit 1
}

Write-Host "Starting dev server on http://localhost:$port (host 0.0.0.0)"

# Open browser now; it will keep retrying / user can refresh if Vite is still booting.
Start-Process "http://localhost:$port"

# Run the dev server in the foreground (Ctrl-C stops it).
& pnpm dev -- --port $port
