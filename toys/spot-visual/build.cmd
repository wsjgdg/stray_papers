@echo off
chcp 65001 >nul
rem 一键构建：双击即可（等价于 node scripts/build-all.mjs）
cd /d "%~dp0"
node scripts\build-all.mjs %*
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  exit /b 1
)
echo.
echo BUILD OK
