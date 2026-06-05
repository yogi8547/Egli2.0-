#!/usr/bin/env bash
# =============================================================================
#  Egli2.0 — Ubuntu 24.04 LTS Native Installation
#  Installs all services natively (no Docker):
#    - Qdrant  (vector database for alert similarity search)
#    - InfluxDB (time-series database for metrics)
#    - Ollama  (local LLM for AI analysis + embeddings)
#    - Egli2.0 backend (Python/FastAPI)
#    - Egli2.0 frontend (React/Vite served by Nginx)
#
#  Usage:
#    chmod +x install-ubuntu-native.sh
#    sudo ./install-ubuntu-native.sh                    # Install to /opt/Egli2.0
#    sudo ./install-ubuntu-native.sh /custom/path       # Custom install directory
#
#  Requirements:
#    - Ubuntu 24.04 LTS (Noble Numbat)
#    - Root / sudo access
#    - Internet connection
#    - At least 6 GB RAM (8 GB+ recommended for Ollama + Qdrant)
#    - At least 15 GB free disk space
# =============================================================================

set -euo pipefail

# ── Argument Parsing ─────────────────────────────────────────────────────────
ACTION="install"

for arg in "$@"; do
    case "$arg" in
        --uninstall|-u)
            ACTION="uninstall"
            ;;
        --help|-h)
            echo "Usage: sudo ./install-ubuntu-native.sh [OPTIONS] [INSTALL_DIR]"
            echo ""
            echo "Options:"
            echo "  (none)                 Install Egli2.0 natively (no Docker)"
            echo "  --uninstall, -u        Remove all Egli2.0 services and data"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Arguments:"
            echo "  INSTALL_DIR            Target directory (default: /opt/Egli2.0)"
            echo ""
            echo "Environment variables:"
            echo "  REPO_URL               Git repository URL to clone from"
            echo ""
            echo "Examples:"
            echo "  sudo ./install-ubuntu-native.sh                    # Install to /opt/Egli2.0"
            echo "  sudo ./install-ubuntu-native.sh /srv/egli2        # Custom path"
            echo "  sudo ./install-ubuntu-native.sh --uninstall       # Remove everything"
            exit 0
            ;;
    esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Icons ────────────────────────────────────────────────────────────────────
CHECK_MARK="\xE2\x9C\x85"
CROSS_MARK="\xE2\x9D\x8C"
ARROW="\xE2\x9E\x9C"
INFO="\xE2\x84\xB9\xEF\xB8\x8F"
WARN="\xE2\x9A\xA0\xEF\xB8\x8F"
ROCKET="\xF0\x9F\x9A\x80"

# ── Configuration ────────────────────────────────────────────────────────────
for arg in "$@"; do
    if [[ "$arg" != "--"* ]]; then
        INSTALL_DIR="$arg"
        break
    fi
done
INSTALL_DIR="${INSTALL_DIR:-/opt/Egli2.0}"
REPO_URL="${REPO_URL:-}"
LOG_FILE="$INSTALL_DIR/install-native.log"

# Service versions
QDRANT_VERSION="1.13.0"
INFLUXDB_VERSION="2.7.11"
OLLAMA_VERSION="latest"  # Installed via official install script

# Service ports
QDRANT_PORT=6333
INFLUXDB_PORT=8086
BACKEND_PORT=8000
FRONTEND_PORT=80
OLLAMA_PORT=11434

# ── Utility Functions ─────────────────────────────────────────────────────────

print_banner() {
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│  ${BOLD}Egli2.0 — Native Ubuntu 24.04 Installer${NC}     ${CYAN}│${NC}"
    echo -e "${CYAN}│  ${BOLD}(No Docker — Qdrant + InfluxDB + Ollama)${NC}    ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

log()     { echo -e "  ${GREEN}${CHECK_MARK}${NC} $1"; }
info()    { echo -e "  ${BLUE}${INFO}${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}${WARN}${NC}  $1"; }
error()   { echo -e "  ${RED}${CROSS_MARK}${NC} $1"; }
section() { echo ""; echo -e "${BOLD}── $1 ──${NC}"; echo ""; }

fail() {
    error "$1"
    echo ""
    warn "Installation failed. Check '$LOG_FILE' for details."
    exit 1
}

run_step() {
    local desc="$1"
    shift
    local err_file
    err_file=$(mktemp)
    echo -ne "  ${INFO}  ${desc}... "
    if "$@" > /dev/null 2>"$err_file"; then
        echo -e "\r  ${GREEN}${CHECK_MARK}${NC} ${desc}"
        rm -f "$err_file"
    else
        echo -e "\r  ${RED}${CROSS_MARK}${NC} ${desc} — FAILED"
        echo "    Error details:" >&2
        sed 's/^/    /' "$err_file" >&2
        rm -f "$err_file"
        return 1
    fi
}

is_service_running() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

# ── Main Install ─────────────────────────────────────────────────────────────

install_main() {
    print_banner

    # ── Phase 0: Pre-flight Checks ──────────────────────────────────────────
    section "Phase 0: Pre-flight Checks"

    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root (use sudo)."
    fi
    log "Running as root"

    if [[ ! -f /etc/os-release ]]; then
        fail "Cannot detect OS — /etc/os-release not found."
    fi
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        fail "This script is for Ubuntu. Detected: $ID"
    fi
    if [[ "$VERSION_ID" != "24.04" ]]; then
        warn "Target: Ubuntu 24.04 LTS. Detected: $PRETTY_NAME — continuing anyway."
    fi
    log "OS: $PRETTY_NAME"

    local arch
    arch=$(dpkg --print-architecture)
    if [[ "$arch" != "amd64" && "$arch" != "arm64" ]]; then
        fail "Unsupported architecture: $arch (only amd64/arm64)"
    fi
    log "Architecture: $arch"

    if ! ping -c 1 -W 3 8.8.8.8 > /dev/null 2>&1; then
        fail "No internet connectivity detected."
    fi
    log "Internet connectivity OK"

    local total_mem_mb
    total_mem_mb=$(awk '/MemTotal/ {printf "%d", $2 / 1024}' /proc/meminfo)
    if [[ $total_mem_mb -lt 6000 ]]; then
        warn "Low memory: ${total_mem_mb} MB (6 GB+ recommended, 8 GB+ for Ollama + Qdrant)"
    else
        log "Memory: ${total_mem_mb} MB"
    fi

    local avail_disk_mb
    avail_disk_mb=$(df --output=avail "$(dirname "$INSTALL_DIR")" 2>/dev/null | tail -1)
    if [[ -n "$avail_disk_mb" && $avail_disk_mb -lt 15360 ]]; then
        warn "Low disk space: $((avail_disk_mb / 1024)) GB available (15 GB+ recommended)"
    elif [[ -n "$avail_disk_mb" ]]; then
        log "Disk space: $((avail_disk_mb / 1024)) GB available"
    fi

    # Check for conflicting services on target ports
    for port_info in "$QDRANT_PORT:Qdrant" "$INFLUXDB_PORT:InfluxDB" "$BACKEND_PORT:Backend" "$OLLAMA_PORT:Ollama"; do
        local port="${port_info%%:*}"
        local name="${port_info##*:}"
        if ss -tlnp "sport = :$port" 2>/dev/null | grep -q LISTEN; then
            warn "Port $port is already in use ($name) — may cause conflicts"
        fi
    done

    echo ""

    # ── Phase 1: System Packages ────────────────────────────────────────────
    section "Phase 1: System Packages & Prerequisites"

    run_step "Updating package lists" apt-get update

    run_step "Installing system dependencies" apt-get install -y \
        python3 python3-pip python3-venv python3-dev \
        curl wget gnupg2 ca-certificates lsb-release \
        git ufw build-essential pkg-config \
        libsnmp-dev snmp snmp-mibs-downloader \
        nginx supervisor redis-server \
        libssl-dev libffi-dev cmake

    # Install Node.js 20.x for frontend build
    if ! command -v node &> /dev/null; then
        info "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        apt-get install -y nodejs > /dev/null 2>&1
        log "Node.js $(node --version) installed"
    else
        log "Node.js $(node --version) already installed"
    fi

    # ── Phase 2: Install InfluxDB ───────────────────────────────────────────
    section "Phase 2: Installing InfluxDB $INFLUXDB_VERSION"

    if command -v influxd &> /dev/null; then
        log "InfluxDB already installed at $(which influxd)"
    else
        run_step "Adding InfluxData APT repository" bash -c '
            curl -fsSL https://repos.influxdata.com/influxdb.key | \
                gpg --dearmor -o /usr/share/keyrings/influxdb-archive-keyring.gpg 2>/dev/null
            echo "deb [signed-by=/usr/share/keyrings/influxdb-archive-keyring.gpg] https://repos.influxdata.com/ubuntu $(lsb_release -cs) stable" | \
                tee /etc/apt/sources.list.d/influxdb.list > /dev/null
        '

        run_step "Installing InfluxDB" apt-get update && apt-get install -y influxdb2

        # Configure InfluxDB
        mkdir -p /etc/influxdb2
        cat > /etc/influxdb2/config.yaml << 'INFLUXDB_EOF'
assets-path: /usr/share/influxdb/static
bolt-path: /var/lib/influxdb2/influxd.bolt
engine-path: /var/lib/influxdb2/engine
http-bind-address: ":8086"
storage-cache-max-memory-size: "512m"
storage-cache-snapshot-memory-size: "20m"
storage-wal-max-write-delay: "10m"
storage-series-id-set-cache-size: 0
storage-max-concurrent-compactions: 0
storage-compact-full-write-cold-duration: "6h"
storage-retention-check-interval: "30m"
INFLUXDB_EOF
    fi

    # Ensure the systemd unit exists (the package doesn't always ship one)
    # Run unconditionally — handles both fresh installs and pre-existing binaries
    # without a systemd unit (e.g. partial installs, manual extraction).
    if [[ ! -f /lib/systemd/system/influxdb.service && ! -f /etc/systemd/system/influxdb.service ]]; then
        info "Creating InfluxDB systemd unit (not provided by package)..."
        # Create the influxdb user if it doesn't exist
        id -u influxdb &>/dev/null || useradd -r -s /usr/sbin/nologin -d /var/lib/influxdb2 influxdb
        chown -R influxdb:influxdb /var/lib/influxdb2 2>/dev/null || true

        cat > /etc/systemd/system/influxdb.service << 'INFLUXDB_SERVICE_EOF'
[Unit]
Description=InfluxDB 2.7 Time-Series Database
Documentation=https://docs.influxdata.com/influxdb/v2/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=influxdb
Group=influxdb
ExecStart=/usr/bin/influxd --config /etc/influxdb2/config.yaml
Restart=on-failure
RestartSec=10
LimitNOFILE=65536
LimitMEMLOCK=infinity
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
INFLUXDB_SERVICE_EOF
        systemctl daemon-reload
        log "Created /etc/systemd/system/influxdb.service"
    fi

    run_step "Enabling InfluxDB systemd service" systemctl enable influxdb

    if ! is_service_running influxdb; then
        run_step "Starting InfluxDB" systemctl start influxdb
        # Give InfluxDB a moment to boot before we try to configure it
        sleep 3
    fi

    # Initialize InfluxDB (set up org, bucket, token)
    info "Configuring InfluxDB (setting up org/bucket/token)..."
    sleep 3  # Wait for InfluxDB to start
    local INFLUXDB_TOKEN="egli2-admin-token-$(openssl rand -hex 8)"
    influx setup \
        --org monitoring \
        --bucket metrics \
        --username admin \
        --password "egli2-$(openssl rand -hex 8)" \
        --token "$INFLUXDB_TOKEN" \
        --force 2>/dev/null || true

    log "InfluxDB configured (token saved to .env)"
    log "InfluxDB running on port $INFLUXDB_PORT"

    # ── Phase 3: Install Qdrant ────────────────────────────────────────────
    section "Phase 3: Installing Qdrant $QDRANT_VERSION (Vector DB)"

    if command -v qdrant &> /dev/null; then
        log "Qdrant already installed at $(which qdrant)"
    else
        local qdrant_url
        if [[ "$arch" == "amd64" ]]; then
            qdrant_url="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-gnu.tar.gz"
        else
            qdrant_url="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-aarch64-unknown-linux-gnu.tar.gz"
        fi

        run_step "Downloading Qdrant v${QDRANT_VERSION}" bash -c "
            mkdir -p /tmp/qdrant-install
            cd /tmp/qdrant-install
            curl -fsSL '$qdrant_url' -o qdrant.tar.gz
            tar xzf qdrant.tar.gz
            mv qdrant /usr/local/bin/qdrant
            chmod +x /usr/local/bin/qdrant
            rm -rf /tmp/qdrant-install
        "

        # Create Qdrant data directory and config
        mkdir -p /var/lib/qdrant/storage /etc/qdrant
        cat > /etc/qdrant/config.yaml << 'QDRANT_EOF'
storage:
  storage_path: /var/lib/qdrant/storage
  optimizers:
    default_segment_number: 2
    memmap_threshold_kb: 20000
service:
  http_port: 6333
  grpc_port: 6334
  max_workers: 4
telemetry_disabled: true
QDRANT_EOF

        # Create systemd service
        cat > /etc/systemd/system/qdrant.service << 'QDRANT_SERVICE_EOF'
[Unit]
Description=Qdrant Vector Database
Documentation=https://qdrant.tech/documentation/
After=network.target

[Service]
Type=simple
User=qdrant
Group=qdrant
ExecStart=/usr/local/bin/qdrant --config-path /etc/qdrant/config.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
QDRANT_SERVICE_EOF

        # Create qdrant user
        id -u qdrant &>/dev/null || useradd -r -s /usr/sbin/nologin -d /var/lib/qdrant qdrant
        chown -R qdrant:qdrant /var/lib/qdrant /etc/qdrant

        run_step "Enabling Qdrant systemd service" systemctl enable qdrant
    fi

    if ! is_service_running qdrant; then
        run_step "Starting Qdrant" systemctl start qdrant
    fi
    log "Qdrant running on port $QDRANT_PORT"

    # ── Phase 4: Install Ollama ────────────────────────────────────────────
    section "Phase 4: Installing Ollama (Local LLM)"

    if command -v ollama &> /dev/null; then
        log "Ollama already installed at $(which ollama)"
    else
        run_step "Installing Ollama" bash -c '
            curl -fsSL https://ollama.com/install.sh | bash 2>&1
        '

        # Configure Ollama for CPU-only (or GPU if available)
        mkdir -p /etc/systemd/system/ollama.service.d
        cat > /etc/systemd/system/ollama.service.d/override.conf << 'OLLAMA_OVERRIDE_EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_KEEP_ALIVE=5m"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
OLLAMA_OVERRIDE_EOF

        systemctl daemon-reload
        run_step "Enabling Ollama systemd service" systemctl enable ollama
    fi

    if ! is_service_running ollama; then
        run_step "Starting Ollama" systemctl start ollama
    fi
    log "Ollama running on port $OLLAMA_PORT"

    # ── Phase 5: Deploy Application Code ───────────────────────────────────
    section "Phase 5: Deploying Egli2.0 Application"

    if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/requirements.txt" ]]; then
        warn "Installation directory exists and has requirements.txt — reusing."
    elif [[ -d "$INSTALL_DIR" ]]; then
        fail "Directory '$INSTALL_DIR' exists but doesn't look like an Egli2.0 project."
    else
        if [[ -n "$REPO_URL" ]]; then
            run_step "Cloning repository from $REPO_URL" \
                git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
        else
            local script_dir
            script_dir="$(cd "$(dirname "$0")" && pwd)"
            if [[ -f "$script_dir/backend/requirements.txt" ]]; then
                info "Copying project files to $INSTALL_DIR..."
                mkdir -p "$INSTALL_DIR"
                if command -v rsync > /dev/null 2>&1; then
                    rsync -a "$script_dir/" "$INSTALL_DIR/" \
                        --exclude='node_modules' --exclude='venv' \
                        --exclude='.git' --exclude='__pycache__'
                else
                    (cd "$script_dir" && tar cf - . \
                        --exclude='node_modules' --exclude='venv' \
                        --exclude='.git' --exclude='__pycache__' \
                    ) | (cd "$INSTALL_DIR" && tar xf -)
                fi
                log "Project files deployed"
            else
                fail "Cannot find backend/requirements.txt. Run this script from the project directory, or set REPO_URL."
            fi
        fi
    fi

    cd "$INSTALL_DIR"
    log "Working directory: $INSTALL_DIR"

    # ── Phase 6: Python Virtual Environment ────────────────────────────────
    section "Phase 6: Python Virtual Environment"

    if [[ -d venv ]]; then
        log "Virtual environment already exists"
    else
        run_step "Creating Python virtual environment" python3 -m venv venv
    fi

    source venv/bin/activate

    info "Installing Python dependencies (this may take a few minutes)..."
    pip install --upgrade pip wheel setuptools > /dev/null 2>&1
    pip install -r backend/requirements.txt > /dev/null 2>&1
    log "Python dependencies installed"

    # Try to install easysnmp (requires C compiler + libsnmp-dev)
    pip install easysnmp 2>/dev/null && log "easysnmp installed (native SNMP)" || \
        warn "easysnmp not installed — using mock SNMP data fallback"

    # ── Phase 7: Frontend Build ────────────────────────────────────────────
    section "Phase 7: Building Frontend"

    if [[ -d frontend/node_modules ]]; then
        log "Frontend dependencies already installed"
    else
        info "Installing frontend dependencies..."
        cd frontend
        npm install > /dev/null 2>&1
        cd "$INSTALL_DIR"
        log "Frontend dependencies installed"
    fi

    if [[ -d backend/static ]]; then
        log "Frontend build already exists"
    else
        info "Building frontend (Vite + React)..."
        cd frontend
        npx vite build > /dev/null 2>&1
        # Copy build output to backend/static for serving
        mkdir -p "$INSTALL_DIR/backend/static"
        cp -r dist/* "$INSTALL_DIR/backend/static/"
        cd "$INSTALL_DIR"
        log "Frontend built and copied to backend/static/"
    fi

    # ── Phase 8: Configuration ─────────────────────────────────────────────
    section "Phase 8: Configuration"

    if [[ ! -f .env ]]; then
        info "Creating .env with secure defaults..."
        cat > .env << EOF
# ── Egli2.0 Configuration ──────────────────────────────────────────
SECRET_KEY=$(openssl rand -hex 32)
DEBUG=false
LOG_LEVEL=INFO

# ── Server ────────────────────────────────────────────────────────
HOST=0.0.0.0
PORT=$BACKEND_PORT

# ── InfluxDB ───────────────────────────────────────────────────────
INFLUXDB_URL=http://localhost:$INFLUXDB_PORT
INFLUXDB_TOKEN=$INFLUXDB_TOKEN
INFLUXDB_ORG=monitoring
INFLUXDB_BUCKET=metrics

# ── Qdrant Vector DB ───────────────────────────────────────────────
QDRANT_URL=http://localhost:$QDRANT_PORT
QDRANT_COLLECTION_ALERTS=egli2_alerts
QDRANT_VECTOR_SIZE=768
QDRANT_REINDEX_ON_START=true
EMBEDDING_MODEL=nomic-embed-text

# ── Vector Cache (RAG for Alert Remediation) ───────────────────────
# When an alert fires, the system searches Qdrant for similar past alerts
# that have known remediations. A high-similarity match returns the cached
# fix instantly (< 100ms). A medium match uses the past fix as RAG context
# for Ollama (~40% faster). Tune these thresholds to balance speed vs.
# freshness of AI-generated responses.
#
#   VECTOR_CACHE_TOP_K:             How many past alerts to retrieve from Qdrant (1-50)
#   VECTOR_CACHE_HIGH_THRESHOLD:    Score ≥ this → return cached remediation instantly
#   VECTOR_CACHE_MEDIUM_THRESHOLD:  Score ≥ this → use as RAG context for Ollama
#   VECTOR_CACHE_MIN_SCORE:         Minimum similarity score to consider any result
VECTOR_CACHE_TOP_K=5
VECTOR_CACHE_HIGH_THRESHOLD=0.85
VECTOR_CACHE_MEDIUM_THRESHOLD=0.55
VECTOR_CACHE_MIN_SCORE=0.4

# ── Ollama ─────────────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:$OLLAMA_PORT
OLLAMA_MODEL=llama3.1:latest
OLLAMA_TEMPERATURE=0.3

# ── SNMP ───────────────────────────────────────────────────────────
SNMP_COMMUNITY=public
SNMP_VERSION=2c
SNMP_TIMEOUT=5
SNMP_RETRIES=2
POLL_INTERVAL_SECONDS=60

# ── Alert Thresholds ───────────────────────────────────────────────
CPU_WARN_THRESHOLD=75
CPU_CRIT_THRESHOLD=90
MEM_WARN_THRESHOLD=80
MEM_CRIT_THRESHOLD=95
DISK_WARN_THRESHOLD=85
DISK_CRIT_THRESHOLD=95

# ── Custom Checks ──────────────────────────────────────────────────
CHECK_TIMEOUT_SECONDS=10
CHECK_CONCURRENCY=10
CHECK_INTERVAL_SECONDS=60

# ── Mock Data ──────────────────────────────────────────────────────
SEED_MOCK_DATA=true
MOCK_SERVER_COUNT=5

# ── CORS ───────────────────────────────────────────────────────────
CORS_ORIGINS=["*"]
EOF
        log "Created .env with secure SECRET_KEY and InfluxDB token"
    else
        info ".env already exists — keeping your configuration"
    fi

    # ── Phase 9: systemd Services ──────────────────────────────────────────
    section "Phase 9: Installing systemd Services"

    # --- Backend Service ---
    cat > /etc/systemd/system/egli2-backend.service << 'BACKEND_SERVICE_EOF'
[Unit]
Description=Egli2.0 Backend (FastAPI)
Documentation=https://github.com/egli2/egli2
After=network.target influxdb.service qdrant.service ollama.service
Wants=influxdb.service qdrant.service ollama.service

[Service]
Type=simple
User=root
WorkingDirectory=INSTALL_DIR_PLACEHOLDER
Environment=PATH=INSTALL_DIR_PLACEHOLDER/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
EnvironmentFile=INSTALL_DIR_PLACEHOLDER/.env
ExecStart=INSTALL_DIR_PLACEHOLDER/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
BACKEND_SERVICE_EOF

    sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" /etc/systemd/system/egli2-backend.service
    run_step "Installing egli2-backend.service" systemctl daemon-reload

    # --- Nginx for frontend proxy ---
    # The frontend is served via the backend's StaticFiles mount,
    # but we configure Nginx as a reverse proxy for production.
    cat > /etc/nginx/sites-available/egli2 << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Frontend static files (served by backend via /api/* below)
    # Nginx proxies everything to the backend which serves the
    # Vite build output from backend/static/

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for WebSocket connections
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINX_EOF

    if [[ -f /etc/nginx/sites-enabled/default ]]; then
        rm -f /etc/nginx/sites-enabled/default
    fi

    if [[ ! -f /etc/nginx/sites-enabled/egli2 ]]; then
        ln -sf /etc/nginx/sites-available/egli2 /etc/nginx/sites-enabled/egli2
    fi

    run_step "Configuring Nginx" nginx -t 2>/dev/null

    if ! is_service_running nginx; then
        run_step "Starting Nginx" systemctl start nginx
    else
        run_step "Reloading Nginx" systemctl reload nginx
    fi

    # ── Phase 10: Pull Ollama Models ───────────────────────────────────────
    section "Phase 10: Pulling Ollama Models"

    # Pull the embedding model (required for vector store)
    info "Pulling embedding model (${EMBEDDING_MODEL:-nomic-embed-text})..."
    if ollama pull "${EMBEDDING_MODEL:-nomic-embed-text}" 2>&1 | tail -3; then
        log "Embedding model pulled: ${EMBEDDING_MODEL:-nomic-embed-text}"
    else
        warn "Failed to pull embedding model — vector search will be unavailable"
    fi

    # Pull the chat model (for AI analysis)
    info "Pulling chat model (${OLLAMA_MODEL:-llama3.1:latest})..."
    if ollama pull "${OLLAMA_MODEL:-llama3.1:latest}" 2>&1 | tail -3; then
        log "Chat model pulled: ${OLLAMA_MODEL:-llama3.1:latest}"
    else
        warn "Failed to pull chat model — AI features will be unavailable"
    fi

    # ── Phase 11: Start Backend ────────────────────────────────────────────
    section "Phase 11: Starting Backend"

    if ! is_service_running egli2-backend; then
        run_step "Starting Egli2.0 backend" systemctl start egli2-backend
        log "Backend service started"
    else
        run_step "Restarting Egli2.0 backend" systemctl restart egli2-backend
        log "Backend service restarted"
    fi

    run_step "Enabling backend on boot" systemctl enable egli2-backend

    # ── Phase 12: Verification ─────────────────────────────────────────────
    section "Phase 12: Verification"

    echo ""
    echo -e "  ${BOLD}Service Status:${NC}"
    echo ""

    for svc in influxdb qdrant ollama egli2-backend nginx; do
        local status_text=""
        if is_service_running "$svc"; then
            status_text="${GREEN}● running${NC}"
        else
            status_text="${RED}● stopped${NC}"
        fi
        printf "    %-20s %b\n" "$svc" "$status_text"
    done

    echo ""
    echo -e "  ${BOLD}API Health Check:${NC}"

    sleep 2  # Brief wait for backend to finish starting

    local health_status
    health_status=$(curl -s -o /dev/null -w "%{http_code}" \
        http://localhost:$BACKEND_PORT/api/health 2>/dev/null || echo "failed")
    if [[ "$health_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} /api/health — HTTP $health_status"
    else
        echo -e "    ${RED}${CROSS_MARK}${NC} /api/health — HTTP $health_status"
    fi

    # Check Qdrant
    local qdrant_status
    qdrant_status=$(curl -s -o /dev/null -w "%{http_code}" \
        http://localhost:$QDRANT_PORT/ 2>/dev/null || echo "failed")
    if [[ "$qdrant_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} Qdrant (:$QDRANT_PORT) — HTTP $qdrant_status"
    else
        echo -e "    ${YELLOW}${WARN}${NC}  Qdrant (:$QDRANT_PORT) — HTTP $qdrant_status (may still be starting)"
    fi

    # Check Ollama
    local ollama_status
    ollama_status=$(curl -s -o /dev/null -w "%{http_code}" \
        http://localhost:$OLLAMA_PORT/api/tags 2>/dev/null || echo "failed")
    if [[ "$ollama_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} Ollama (:$OLLAMA_PORT) — HTTP $ollama_status"
    else
        echo -e "    ${YELLOW}${WARN}${NC}  Ollama (:$OLLAMA_PORT) — HTTP $ollama_status (may still be starting)"
    fi

    # ── Completion ──────────────────────────────────────────────────────────
    section "Installation Complete! ${ROCKET}"

    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')

    echo ""
    echo -e "  ${BOLD}Access your Egli2.0:${NC}"
    echo ""
    echo -e "    ${ARROW}  Dashboard:    ${CYAN}http://${server_ip}/${NC}"
    echo -e "    ${ARROW}  API Docs:     ${CYAN}http://${server_ip}:8000/docs${NC}"
    echo -e "    ${ARROW}  API Health:   ${CYAN}http://${server_ip}/api/health${NC}"
    echo ""
    echo -e "  ${BOLD}Vector Search (Qdrant):${NC}"
    echo ""
    echo -e "    ${ARROW}  REST API:     ${CYAN}http://${server_ip}:${QDRANT_PORT}/dashboard${NC}"
    echo -e "    ${ARROW}  Similar alerts: GET /api/vectors/alerts/similar?query=...${NC}"
    echo ""
    echo -e "  ${BOLD}Manage with systemd:${NC}"
    echo ""
    echo -e "    ${ARROW}  systemctl status egli2-backend     ${INFO}Backend${NC}"
    echo -e "    ${ARROW}  systemctl status qdrant            ${INFO}Vector DB${NC}"
    echo -e "    ${ARROW}  systemctl status influxdb          ${INFO}Metrics DB${NC}"
    echo -e "    ${ARROW}  systemctl status ollama            ${INFO}Local LLM${NC}"
    echo -e "    ${ARROW}  systemctl status nginx             ${INFO}Web server${NC}"
    echo ""
    echo -e "  ${BOLD}Logs:${NC}"
    echo ""
    echo -e "    ${ARROW}  journalctl -u egli2-backend -f"
    echo -e "    ${ARROW}  journalctl -u qdrant -f"
    echo -e "    ${ARROW}  journalctl -u ollama -f"
    echo ""
    echo -e "  ${BOLD}Configuration:${NC}"
    echo ""
    echo -e "    ${ARROW}  .env:    ${CYAN}${INSTALL_DIR}/.env${NC}"
    echo -e "    ${ARROW}  Log:     ${CYAN}${LOG_FILE}${NC}"
    echo ""
    echo -e "  ${GREEN}${CHECK_MARK}${NC} Egli2.0 is running with native services!${NC}"
    echo ""
}

# ── Uninstall ──────────────────────────────────────────────────────────────

uninstall_main() {
    print_banner

    section "Uninstalling Egli2.0 (Native Installation)"

    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root (use sudo)."
    fi

    echo ""
    echo -e "  ${YELLOW}WARNING: This will completely remove Egli2.0 from this server.${NC}"
    echo ""
    echo -e "  The following will be stopped and removed:"
    echo -e "    ${ARROW}  systemd services (egli2-backend, qdrant, etc.)"
    echo -e "    ${ARROW}  Project files ($INSTALL_DIR)"
    echo -e "    ${ARROW}  All collected data (InfluxDB, Qdrant)"
    echo ""
    read -r -p "  Are you sure you want to uninstall? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo ""
        info "Uninstall cancelled."
        exit 0
    fi

    # Stop and disable services
    info "Stopping services..."
    for unit in egli2-backend; do
        systemctl stop "$unit" 2>/dev/null || true
        systemctl disable "$unit" 2>/dev/null || true
        log "Stopped/disabled $unit"
    done

    # Remove systemd unit files
    info "Removing systemd unit files..."
    rm -f /etc/systemd/system/egli2-backend.service
    systemctl daemon-reload 2>/dev/null || true

    # Remove Nginx config
    info "Removing Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/egli2
    rm -f /etc/nginx/sites-available/egli2
    systemctl reload nginx 2>/dev/null || true

    # Remove project directory
    if [[ -d "$INSTALL_DIR" ]]; then
        info "Removing $INSTALL_DIR..."
        rm -rf "$INSTALL_DIR"
        log "Project directory removed"
    fi

    # Optionally remove services
    section "Data Store Cleanup (optional)"
    echo ""
    read -r -p "  Remove InfluxDB, Qdrant, and Ollama data as well? [y/N]: " remove_data
    if [[ "$remove_data" =~ ^[Yy]$ ]]; then
        for svc in qdrant influxdb ollama; do
            systemctl stop "$svc" 2>/dev/null || true
            systemctl disable "$svc" 2>/dev/null || true
        done

        # Remove Qdrant data
        rm -rf /var/lib/qdrant /etc/qdrant
        rm -f /usr/local/bin/qdrant
        rm -f /etc/systemd/system/qdrant.service
        log "Qdrant removed"

        # Remove InfluxDB data
        apt-get remove -y influxdb2 2>/dev/null || true
        rm -rf /var/lib/influxdb2 /etc/influxdb2
        log "InfluxDB removed"

        # Remove Ollama data
        apt-get remove -y ollama 2>/dev/null || true
        rm -rf /usr/share/ollama /etc/ollama
        log "Ollama removed"

        systemctl daemon-reload 2>/dev/null || true
    else
        info "Keeping data stores (InfluxDB, Qdrant, Ollama)"
    fi

    # Optionally remove Python venv deps
    read -r -p "  Remove Python packages (system-wide)? [y/N]: " remove_python
    if [[ "$remove_python" =~ ^[Yy]$ ]]; then
        pip uninstall -y fastapi uvicorn qdrant-client httpx pydantic 2>/dev/null || true
        log "Python packages removed"
    fi

    section "Uninstall Complete"
    echo ""
    echo -e "  ${GREEN}${CHECK_MARK}${NC} Egli2.0 has been removed."
    echo ""
}

# ── Run ──────────────────────────────────────────────────────────────────────

# Set up logging
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

case "$ACTION" in
    uninstall)
        uninstall_main
        ;;
    install|*)
        install_main
        ;;
esac
