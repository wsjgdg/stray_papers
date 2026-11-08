@echo off
chcp 65001 >nul 2>&1
:: ScrollOrchestra launcher: stable cmd window -> delegates to start.ps1
:: Double-click this file; it opens ONE cmd window and runs the dev server there.
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1"
endlocal
