@echo off
REM =====================================================================
REM  Egli2.0 - Dependency Installer (Windows)
REM  Installs backend (Python) and frontend (Node.js) dependencies.
REM  Run this script from the project root directory.
REM =====================================================================

echo.
echo ==========================================
echo  Egli2.0 - Installing Dependencies
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

REM ── Backend dependencies ─────────────────────────────────────────────
echo ==========================================
echo  Backend (Python)
echo ==========================================
echo.

if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    echo [OK] Virtual environment created
)

echo [INFO] Activating virtual environment...
call "%~dp0venv\Scripts\activate.bat"

echo [INFO] Installing backend dependencies from requirements.txt...
pip install -r "%~dp0backend\requirements.txt"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Backend dependency installation failed.
    echo         Check the errors above and try again.
    exit /b 1
)
echo [OK] Backend dependencies installed
echo.

REM ── Frontend dependencies ────────────────────────────────────────────
echo ==========================================
echo  Frontend (Node.js)
echo ==========================================
echo.

if not exist "%~dp0frontend\node_modules" (
    echo [INFO] Installing frontend dependencies via npm...
    cd /d "%~dp0frontend"
    npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] Frontend dependency installation failed.
        echo         Check the errors above and try again.
        cd /d "%~dp0"
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK] Frontend dependencies installed
) else (
    echo [INFO] node_modules already exists, skipping install
    echo         Run "cd frontend && npm install" to update if needed
)

echo.
echo ==========================================
echo  All Dependencies Installed!
echo ==========================================
echo.
echo  Backend:   %~dp0venv\Lib\site-packages
echo  Frontend:  %~dp0frontend\node_modules
echo.
echo  You can now run start.bat or start-backend.bat
echo  to start the application.
echo ==========================================
echo.
