@echo off
REM ---------------------------------------------------------------------------
REM  para_visualizer - 启动脚本 (Windows)
REM  用法: 双击本文件，或在项目根目录执行 start.cmd
REM  说明: 安装依赖并启动 Next.js 开发服务器 (http://localhost:3000)
REM        本机需已安装 Node.js (>=18) 与 npm。
REM ---------------------------------------------------------------------------

SETLOCAL ENABLEEXTENSIONS
cd /d "%~dp0"

echo ==========================================================================
echo  para_visualizer - 启动中...
echo  项目目录: %CD%
echo ==========================================================================

REM 1) 安装依赖 (首次运行或依赖变更时)
echo.
echo [1/2] 检查并安装依赖 (npm install)...
IF NOT EXIST "node_modules" (
    echo     未检测到 node_modules，执行完整安装...
    call npm install
    IF ERRORLEVEL 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络与 Node/npm 版本后重试。
        goto :fail
    )
) ELSE (
    echo     已存在 node_modules，跳过安装 (如需强制更新请先删除 node_modules 目录)。
)

REM 2) 启动开发服务器
echo.
echo [2/2] 启动开发服务器...
echo      访问地址: http://localhost:3000
echo      (按 Ctrl+C 停止服务器)
echo ==========================================================================
call npm run dev

goto :eof

:fail
echo.
echo 启动失败，脚本退出。
ENDLOCAL
exit /b 1
