# ── Egli2.0 — FastAPI Backend ────────────────────────────────────────────
FROM python:3.11-slim

LABEL org.opencontainers.image.title="Egli2.0 Backend"
LABEL org.opencontainers.image.description="FastAPI backend for AI-powered infrastructure monitoring"
LABEL org.opencontainers.image.version="1.0.0"

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        snmp \
        snmp-mibs-downloader \
        gcc \
        && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt easysnmp

# Copy application code
COPY app/ ./app/

# Environment variables
ENV PYTHONPATH=/app:$PYTHONPATH
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
