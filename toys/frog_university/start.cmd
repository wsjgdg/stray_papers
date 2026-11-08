@echo off
REM ============================================================
REM  Naiwa University - one-click dev launcher (cmd thin shim)
REM
REM  This file does exactly one thing: hand control to
REM  scripts\start.ps1. All real logic lives in the PowerShell
REM  script, where it is far easier to maintain.
REM
REM  Why PowerShell instead of .bat:
REM    Set-StrictMode, Get-NetTCPConnection and structured error
REM    handling only exist in PowerShell. Doing this in .bat means
REM    goto chains and echo soup.
REM
REM  Single-window guarantee:
REM    No `start ""` here. PowerShell and Vite both run in the
REM    FOREGROUND of this same console, so Ctrl+C stops everything
REM    and no second terminal window is ever opened.
REM
REM  NOTE: this file is deliberately pure ASCII. cmd.exe reads
REM  batch files using the console code page (GBK on zh-CN), so
REM  non-ASCII here would render as mojibake. All Chinese output
REM  lives in start.ps1, which is saved as UTF-8 with BOM.
REM
REM  Usage:
REM    start.cmd                 start dev server
REM    start.cmd -Preview        serve dist/ instead of dev server
REM    start.cmd -Port 5200      preferred port (auto +1 if taken)
REM    start.cmd -NoBrowser      do not open a browser
REM    start.cmd -SkipInstall    skip the dependency check
REM ============================================================

setlocal

REM cd to the script's own directory (double-clicking from Explorer
REM leaves the CWD somewhere else entirely).
cd /d "%~dp0"

REM -NoProfile      : skip the user profile so its aliases/functions
REM                   cannot change how this script behaves.
REM -ExecutionPolicy Bypass : a self-contained local script should not
REM                   be blocked by machine policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1" %*

set "EXITCODE=%ERRORLEVEL%"

REM Pause only on failure. On a clean exit (Ctrl+C) the window should
REM just close, not linger as an empty prompt.
if not "%EXITCODE%"=="0" (
  echo.
  echo [startup failed] exit code %EXITCODE%
  pause
)

endlocal & exit /b %EXITCODE%
