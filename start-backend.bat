@echo off
REM =====================================================================
REM  Egli2.0 - Backend Starter (Windows)
REM  Starts only the backend (FastAPI) server.
REM  Run this script from the project root directory.
REM =====================================================================

echo.
echo ==========================================
echo  Egli2.0 - Backend Server
echo ==========================================
echo.

REM ── Check Python ────────────────────────────────────────────────────
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found. Install Python 3.11+ and try again.
    exit /b 1
)
echo [OK] Python found

REM ── Activate venv ───────────────────────────────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
)
echo [INFO] Activating virtual environment...
call "%~dp0venv\Scripts\activate.bat"

REM ── Install dependencies ───────────────────────────────────────────
echo [INFO] Checking backend dependencies...
pip install -r "%~dp0backend\requirements.txt"

REM ── Start Backend ───────────────────────────────────────────────────
echo.
echo [INFO] Starting backend server on port 8000...
echo [INFO] API docs will be at http://localhost:8000/docs
echo.
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
