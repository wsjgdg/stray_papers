# ---------------------------------------------------------------------------
#  launcher-watchdog.ps1 - port/process cleanup guardian for start.ps1
#
#  Problem: when the launcher (start.ps1) is hard-killed (window closed,
#  Task Manager, etc.) its `finally` block never runs, so the child dev
#  server (npm -> next -> node) is orphaned and keeps holding the port.
#
#  This script is spawned DETACHED by start.ps1. It watches the launcher's
#  PID; the moment that PID disappears, it kills the dev-server process tree
#  (and any stray listener on the port) so the port never leaks.
#
#  Usage: pwsh -File launcher-watchdog.ps1 -LauncherPid <pid> -ServerPid <pid> -Port <n>
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [int] $LauncherPid,
    [int] $ServerPid,
    [int] $Port
)

function Free-PortListeners([int]$port) {
    $raw = netstat -ano | Select-String -Pattern "TCP.*:${port}\s+.*LISTEN"
    foreach ($line in $raw) {
        if ($line.Line -match '(\d+)$') {
            try { taskkill /PID $matches[1] /T /F | Out-Null } catch {}
        }
    }
}

while ($true) {
    Start-Sleep -Seconds 2
    $launcherAlive = $false
    try {
        $launcherAlive = ((Get-Process -Id $LauncherPid -ErrorAction SilentlyContinue) -ne $null)
    } catch { $launcherAlive = $false }

    if (-not $launcherAlive) {
        # Launcher is gone (closed window / killed). Tear down the server tree.
        try { taskkill /PID $ServerPid /T /F | Out-Null } catch {}
        # Belt-and-suspenders: free anything still on the port.
        Free-PortListeners $Port
        break
    }
}

exit 0
