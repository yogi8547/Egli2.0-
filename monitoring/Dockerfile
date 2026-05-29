# ── Egli2.0 — SNMP Poller Microservice ───────────────────────────────────
FROM python:3.11-slim

LABEL org.opencontainers.image.title="Egli2.0 SNMP Poller"
LABEL org.opencontainers.image.description="Standalone SNMP polling microservice"
LABEL org.opencontainers.image.version="1.0.0"

# Install SNMP client tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        snmp \
        snmp-mibs-downloader \
        libsnmp-dev \
        gcc \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt easysnmp

# Copy application code
COPY backend/ ./backend/
COPY monitoring/ ./monitoring/

ENV PYTHONPATH=/app:$PYTHONPATH

# Health check (sends a query to the API's health endpoint)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import requests; requests.get('http://backend:8000/api/health', timeout=5)"

CMD ["python", "monitoring/poller.py", "--mock"]
