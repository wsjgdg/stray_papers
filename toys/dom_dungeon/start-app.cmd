@echo off
rem Launch Tag Dungeon (standalone build) on Windows.
rem This is a thin cmd wrapper that delegates to start-app.ps1 (PowerShell).
rem Usage: start-app.cmd [dev|preview]   (default: dev)
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-app.ps1" %*
endlocal
