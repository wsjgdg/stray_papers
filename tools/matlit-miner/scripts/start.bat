@echo off
setlocal EnableExtensions
title MatLit Miner - dev server

rem ===========================================================================
rem MatLit Miner - one-click local dev launcher
rem
rem Double-click this file. It installs dependencies on first run, prepares
rem the SQLite database, and starts the Next.js dev server on port 3000.
rem
rem TWO CONSTRAINTS THIS FILE HAS TO RESPECT:
rem
rem 1. ENCODING. Every string echoed below is deliberately ASCII-only. The
rem    Windows console may sit on any OEM codepage (936, 1252, 437, ...), and
rem    non-ASCII text renders as mojibake there. If you add a message, keep it
rem    in plain English. Do not add "chcp 65001" either: pure ASCII already
rem    renders on every codepage, and chcp can itself break batch parsing.
rem
rem 2. EVERY package-manager call MUST be prefixed with "call". Verified on
rem    Windows 10 + bun 1.4.2 and npm 11: a bare "%RUN% run <script>" exits
rem    and takes cmd.exe down with it, so every statement after it silently
rem    never runs - the launcher appeared to work, then quietly stopped after
rem    step 4. "call %RUN% run <script>" survives and the batch continues.
rem    Do not "clean up" the call keywords.
rem ===========================================================================

cd /d "%~dp0.."
if errorlevel 1 goto :fail

echo.
echo ==========================================================================
echo  MatLit Miner - local dev setup
echo  Project: %cd%
echo ==========================================================================
echo.

rem ---------------------------------------------------------------------------
rem 1. Pick a package manager: bun preferred, npm as fallback
rem ---------------------------------------------------------------------------
set "RUN="
where bun >nul 2>nul
if %errorlevel% equ 0 (
    set "RUN=bun"
    goto :have_pm
)
where npm >nul 2>nul
if %errorlevel% equ 0 (
    set "RUN=npm"
    echo [1/5] bun not found - using npm instead
    goto :have_pm
)
echo [ERROR] Neither bun nor npm was found on PATH.
echo         Install bun   : https://bun.sh
echo         or Node.js    : https://nodejs.org
goto :fail
:have_pm
if "%RUN%"=="bun" echo [1/5] Package manager: bun

echo.
rem ---------------------------------------------------------------------------
rem 2. Dependencies
rem ---------------------------------------------------------------------------
if exist "node_modules" (
    echo [2/5] node_modules found - skipping install
    goto :have_deps
)
echo [2/5] First run - installing dependencies with "%RUN% install"
echo      This takes a few minutes. Do not close this window.
call %RUN% install
if errorlevel 1 goto :fail
:have_deps
echo.
rem ---------------------------------------------------------------------------
rem 3. Environment file
rem ---------------------------------------------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        echo [3/5] No .env - creating it from .env.example
        copy /y ".env.example" ".env" >nul
        if errorlevel 1 goto :fail
        echo      Edit .env to add literature API keys and pick an LLM backend.
    ) else (
        echo [3/5] No .env and no .env.example - continuing without one
    )
) else (
    echo [3/5] .env found
)

rem Pin the SQLite path here. Prisma resolves relative SQLite paths from the
rem folder holding the schema (prisma/), not from the project root, so the
rem database at ^<project-root^>/db/custom.db is ../db/custom.db as seen from
rem prisma/schema.prisma. Exporting it as an OS variable overrides whatever
rem .env says, which also rescues a .env that still points at a stale
rem absolute path left over from another machine.
set "DATABASE_URL=file:../db/custom.db"
echo      DATABASE_URL pinned to %DATABASE_URL%
echo.
rem ---------------------------------------------------------------------------
rem 4. Prisma client, then the SQLite database
rem ---------------------------------------------------------------------------
rem Skip `prisma generate` when the client is already present. Running it while
rem the dev server holds the query-engine binary open makes the rename step
rem fail with EPERM and aborts the whole launcher; the existing client works
rem fine, so only regenerate from scratch when it is missing. To force a
rem regenerate after editing the schema, stop the server and run
rem `bun run db:generate` by hand.
if exist "node_modules\.prisma\client\index.js" (
    echo [4/5] Prisma Client already present - skipping generate
) else (
    echo [4/5] Generating Prisma Client
    call %RUN% run db:generate
    if errorlevel 1 goto :fail
)

if exist "db\custom.db" (
    echo [4/5] Database present at db\custom.db - leaving your data untouched
    goto :have_db
)
echo [4/5] No database found - creating db\custom.db from the schema
call %RUN% run db:push
if errorlevel 1 goto :fail
echo      Database created. Open the Materials tab and click "Seed defaults"
echo      to load the 60 default materials.
:have_db
echo.
rem ---------------------------------------------------------------------------
rem 5. Port check, then the dev server
rem ---------------------------------------------------------------------------
netstat -ano | findstr "LISTENING" | findstr ":3000 " >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Port 3000 is already in use. Stop the other server first, or
    echo        just open http://localhost:3000 and use that one.
    echo.
)
echo [5/5] Starting dev server at http://localhost:3000
echo.

rem ---------------------------------------------------------------------------
rem 5a. Optional realtime relay services (progress :3003, realtime :3004/:3005)
rem     Run in the SAME window as background jobs (start /b) so every log stays
rem     in one console. If a port is already taken (another instance running)
rem     the service just exits and that channel falls back to REST polling.
rem ---------------------------------------------------------------------------
if "%RUN%"=="bun" (
    for %%S in (progress-service realtime-service) do (
        if exist "mini-services\%%S\index.ts" (
            if not exist "mini-services\%%S\node_modules" (
                echo [5a] Installing %%S dependencies ...
                pushd "mini-services\%%S"
                call bun install
                popd
            )
            echo [5a] Starting %%S relay in same window
            pushd "mini-services\%%S"
            start /b bun --hot index.ts
            popd
        )
    )
)
echo.
echo ==========================================================================
echo  Keep this window open while you use the app. Ctrl+C stops the server.
echo  Realtime relays (progress :3003, realtime :3004/:3005) run in this same
echo  window as background jobs. Close the window to stop everything; without
echo  the relays the app automatically falls back to REST polling.
echo ==========================================================================
echo.

call %RUN% run dev
if errorlevel 1 goto :fail

echo.
echo Dev server stopped.
echo.
pause
exit /b 0

:fail
echo.
echo ==========================================================================
echo  STARTUP FAILED - see the messages above for the cause.
echo ==========================================================================
echo.
pause
exit /b 1
