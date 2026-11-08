# ScrollOrchestra one-click launcher (PowerShell)
# Run from a normal cmd window:
#   powershell -ExecutionPolicy Bypass -File start.ps1

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }
Set-Location -Path $root

Write-Host "[scroll-orchestra] one-click launch"

if (-not (Test-Path -Path node_modules)) {
    Write-Host "[scroll-orchestra] dependencies missing, installing (npm install --legacy-peer-deps)..."
    npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[scroll-orchestra] npm install failed. Check network / node version." -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit 1
    }
}

Write-Host "[scroll-orchestra] starting dev server at http://localhost:8000"
try { Start-Process -FilePath "http://localhost:8000" -ErrorAction Stop }
catch { Write-Host "[scroll-orchestra] could not auto-open browser; open http://localhost:8000 manually." }

# Single foreground process in THIS window (no extra windows spawned)
npm run dev

# Keep the window open after the dev server stops (prevents flash-close)
Read-Host "Dev server stopped. Press Enter to close"
