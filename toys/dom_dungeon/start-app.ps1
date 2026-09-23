# start-app.ps1
# Launch the standalone build of Tag Dungeon on Windows.
# Called by start-app.cmd. Do NOT double-click this file directly unless
# PowerShell execution policy allows it; the .cmd wrapper sets the policy.
#
# Usage: start-app.ps1 [dev|preview]   (default: dev)
#   dev     - start the Vite dev server (http://localhost:8000)
#   preview - build the production bundle, then serve dist/ on :8000

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

$mode = if ($args.Count -gt 0) { $args[0] } else { "dev" }

# Verify the toolchain is available.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found on PATH. Install Node 20+ (https://nodejs.org) and retry."
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found on PATH."
    exit 1
}

# Install dependencies on first run.
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules missing - running 'npm install'..."
    & npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
}

if ($mode -eq "preview") {
    Write-Host "Building production bundle (npm run build)..."
    & npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "build failed"; exit 1 }
    Write-Host "Serving production build at http://localhost:8000  (Ctrl+C to stop)"
    & npm run preview
} else {
    Write-Host "Starting dev server at http://localhost:8000  (Ctrl+C to stop)"
    & npm run dev
}
