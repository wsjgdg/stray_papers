@echo off
chcp 65001 > nul
:: 设置控制台为 UTF-8 编码，防止 npm 输出中文日志时乱码

:: 【新增】使用 cmd /k 包裹主逻辑，防止 Ctrl+C 终止 npm 时直接关闭窗口
cmd /k "echo ============================== && echo 正在启动开发服务器... && echo ============================== && cd /d "C:\Users\sibop\Desktop\spot-visual" && (if %errorlevel% neq 0 (echo 目录切换失败，请检查路径是否正确！ && pause && exit /b)) && npm run dev && echo. && echo 服务已停止运行。 && pause"

:: 下面是备用的换行写法（如果你觉得上面一行太长不好阅读，可以删除上面的 cmd /k，使用下面的写法）
<# 
@echo off
chcp 65001 > nul
echo ==============================
echo 正在启动开发服务器...
echo ==============================

cd /d "C:\Users\sibop\Desktop\ZCodeProject\spot-visual"

if %errorlevel% neq 0 (
    echo 目录切换失败，请检查路径是否正确！
    pause
    exit /b  :: 【修改】加上 /b 参数，确保出错时退出当前脚本，而不是继续执行
)

npm run dev

echo.
echo 服务已停止运行。
pause
#>
