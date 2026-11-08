# start.ps1 - launch the Cosmos Orrery dev server
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path node_modules)) {
    Write-Host 'Installing dependencies...'
    bun install
}
Write-Host 'Starting dev server at http://localhost:3000 ...'
bun run dev
