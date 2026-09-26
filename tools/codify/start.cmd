@echo off
setlocal
rem Launches the standalone dev server via PowerShell.
rem Port-fallback + install-if-needed logic lives in start.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
endlocal
