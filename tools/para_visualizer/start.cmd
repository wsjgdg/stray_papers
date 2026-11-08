@echo off
REM --------------------------------------------------------------------------
REM  para_visualizer launcher for Windows
REM  Double-click this file. It invokes start.ps1 (the real startup logic).
REM  -ExecutionPolicy Bypass  : runs even if script execution is restricted
REM  -NoExit                  : keeps the window open so errors are visible
REM  Prefers pwsh (PowerShell 7+), falls back to powershell.
REM --------------------------------------------------------------------------

SETLOCAL
SET "SCRIPT_DIR=%~dp0"
SET "PS1=%SCRIPT_DIR%start.ps1"

WHERE pwsh >NUL 2>NUL
IF %ERRORLEVEL%==0 (
    pwsh -NoExit -ExecutionPolicy Bypass -File "%PS1%"
) ELSE (
    WHERE powershell >NUL 2>NUL
    IF %ERRORLEVEL%==0 (
        powershell -NoExit -ExecutionPolicy Bypass -File "%PS1%"
    ) ELSE (
        echo [ERROR] PowerShell not found. Install PowerShell 7+ or Windows PowerShell.
        pause
        exit /b 1
    )
)
ENDLOCAL
