@echo off
REM =====================================================================
REM  Egli2.0 - Frontend Starter (Windows)
REM  Starts only the frontend (Vite) dev server.
REM  Run this script from the project root directory.
REM =====================================================================

echo.
echo ==========================================
echo  Egli2.0 - Frontend Dev Server
echo ==========================================
echo.

REM ── Check Node.js ───────────────────────────────────────────────────
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Install Node.js 18+ and try again.
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found. Install Node.js 18+ and try again.
    exit /b 1
)

echo [OK] Node.js and npm found

REM ── Check node_modules ──────────────────────────────────────────────
if not exist "%~dp0frontend\node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    cd /d "%~dp0frontend"
    npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] npm install failed. Check the errors above.
        cd /d "%~dp0"
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

REM ── Start Frontend ──────────────────────────────────────────────────
echo.
echo [INFO] Starting Vite dev server on port 3000...
echo [INFO] Dashboard will be at http://localhost:3000
echo.
cd /d "%~dp0frontend"
npm run dev
