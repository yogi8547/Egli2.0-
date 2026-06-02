@echo off
REM =====================================================================
REM  Egli2.0 - Local Development Starter (Windows)
REM  Starts the backend (FastAPI) and frontend (Vite) without Docker.
REM  Run this script from the project root directory.
REM =====================================================================

echo.
echo ==========================================
echo  Egli2.0 - Starting Up
echo ==========================================
echo.

REM ── Check prerequisites ──────────────────────────────────────────────
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found. Install Python 3.11+ and try again.
    exit /b 1
)

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

echo [OK] Python, Node.js, and npm found
echo.

REM ── Check dependencies ──────────────────────────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Dependencies not found. Running install-deps.bat...
    call "%~dp0install-deps.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Dependency installation failed. See errors above.
        exit /b 1
    )
) else if not exist "%~dp0frontend\node_modules" (
    echo [INFO] Frontend dependencies not found. Running install-deps.bat...
    call "%~dp0install-deps.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Dependency installation failed. See errors above.
        exit /b 1
    )
) else (
    echo [OK] All dependencies already installed
)
echo.

REM ── Activate venv ───────────────────────────────────────────────────
echo [INFO] Activating virtual environment...

REM ── Start Backend ───────────────────────────────────────────────────
echo.
echo [INFO] Starting backend server on port 8000...
echo [INFO] API docs will be at http://localhost:8000/docs
echo.
start "Egli2.0 - Backend" cmd /c "%~dp0venv\Scripts\activate.bat && cd %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM ── Start Frontend ──────────────────────────────────────────────────
echo [INFO] Starting frontend dev server on port 3000...
echo [INFO] Dashboard will be at http://localhost:3000
echo.
start "Egli2.0 - Frontend" cmd /c "cd %~dp0frontend && npm run dev"

echo.
echo ==========================================
echo  Services Starting Up
echo ==========================================
echo.
echo  Backend API:  http://localhost:8000
echo  API Docs:     http://localhost:8000/docs
echo  Dashboard:    http://localhost:3000
echo.
echo  Close the terminal windows to stop the servers.
echo ==========================================
echo.
