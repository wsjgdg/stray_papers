@echo off
REM ---------------------------------------------------------------------------
REM  para_visualizer - 启动器 (Windows)
REM  双击本文件即可：它会调用 start.ps1（真正的启动逻辑）。
REM  使用 -ExecutionPolicy Bypass 以兼容默认禁止脚本执行的 PowerShell 策略。
REM  使用 -NoExit 防止窗口闪退，便于查看启动日志与报错。
REM ---------------------------------------------------------------------------

SETLOCAL
SET "SCRIPT_DIR=%~dp0"
SET "PS1=%SCRIPT_DIR%start.ps1"

REM 优先使用 pwsh (PowerShell 7+)，否则回退到 powershell
WHERE pwsh >NUL 2>NUL
IF %ERRORLEVEL%==0 (
    pwsh -NoExit -ExecutionPolicy Bypass -File "%PS1%"
) ELSE (
    WHERE powershell >NUL 2>NUL
    IF %ERRORLEVEL%==0 (
        powershell -NoExit -ExecutionPolicy Bypass -File "%PS1%"
    ) ELSE (
        echo [错误] 未检测到 PowerShell。请安装 PowerShell 7+ 或 Windows PowerShell。
        pause
        exit /b 1
    )
)
ENDLOCAL
