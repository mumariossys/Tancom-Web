@echo off
title TanCom Desktop Setup
color 0A
echo.
echo  =========================================
echo    TanCom Desktop  ^|  Windows Setup
echo  =========================================
echo.

REM ── Step 0: Check for Node.js ────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js is not installed.
    echo.
    echo  Please download and install Node.js from:
    echo    https://nodejs.org  ^(choose the LTS version^)
    echo.
    echo  After installing, run this setup script again.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found
echo.

REM ── Step 1: Install dependencies ─────────────────────────────────────────────
echo  [1/3] Installing dependencies...
echo        ^(first run may take 2-3 minutes^)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [!] Dependency install failed. See error above.
    pause
    exit /b 1
)
echo.

REM ── Step 2: Build the Windows installer ──────────────────────────────────────
echo  [2/3] Building TanCom-Setup.exe...
echo.
call npm run dist:win
if %errorlevel% neq 0 (
    echo.
    echo  [!] Build failed. See error above.
    pause
    exit /b 1
)
echo.

REM ── Step 3: Open the dist folder where the installer was built ──────────────
echo  [3/3] Done! Opening the dist folder...
echo.
if exist "dist\" (
    start "" "dist"
)

echo  =========================================
echo    TanCom Setup 1.0.0.exe is ready in
echo    the dist\ folder.
echo.
echo    Double-click it to install TanCom!
echo  =========================================
echo.
pause
