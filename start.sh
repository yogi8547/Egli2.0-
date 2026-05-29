#!/usr/bin/env bash
# =====================================================================
#  Egli2.0 - Local Development Starter
#  Starts the backend (FastAPI) and frontend (Vite) without Docker.
#  Run: bash start.sh
# =====================================================================

set -e

echo ""
echo "=========================================="
echo " Egli2.0 - Starting Up"
echo "=========================================="
echo ""

# ── Check prerequisites ──────────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || { echo "[ERROR] Python not found"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js not found"; exit 1; }
echo "[OK] Python and Node.js found"

# ── Activate venv ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "[INFO] Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
echo "[OK] Virtual environment activated"

# ── Ensure deps are installed ───────────────────────────────────────
echo "[INFO] Checking backend dependencies..."
pip install -q -r backend/requirements.txt 2>&1 | tail -2

if [ ! -d "frontend/node_modules" ]; then
    echo "[INFO] Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# ── Start Backend ───────────────────────────────────────────────────
echo ""
echo "[INFO] Starting backend server on port 8000..."
cd backend
PYTHONPATH="$SCRIPT_DIR/backend" python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# ── Start Frontend ──────────────────────────────────────────────────
echo "[INFO] Starting frontend dev server on port 3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo " Services Running"
echo "=========================================="
echo ""
echo " Backend API:  http://localhost:8000"
echo " API Docs:     http://localhost:8000/docs"
echo " Dashboard:    http://localhost:3000"
echo ""
echo " Press Ctrl+C to stop all services"
echo "=========================================="
echo ""

# Trap Ctrl+C to kill both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Services stopped.'; exit 0" SIGINT SIGTERM

# Wait for background processes
wait
