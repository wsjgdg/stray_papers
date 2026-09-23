@echo off
REM pl1.cmd - launch the Cosmos Orrery dev server (delegates to start.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
