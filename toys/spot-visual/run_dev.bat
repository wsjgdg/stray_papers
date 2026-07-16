@echo off
cd /d "C:\Users\sibop\Desktop\ZCodeProject\spot-visual"
echo Current directory: %cd%

echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process %%a ...
    taskkill /PID %%a /F 2>nul
)
timeout /t 1 /nobreak >nul

echo Removing .next folder...
if exist .next (
    takeown /f .next /r /d y >nul 2>&1
    icacls .next /grant everyone:F /t /q >nul 2>&1
    rmdir /s /q .next
)

echo Starting Next.js dev server...
call npm run dev
pause