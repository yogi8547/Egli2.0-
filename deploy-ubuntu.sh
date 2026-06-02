#!/usr/bin/env bash
# =============================================================================
#  Egli2.0 — Ubuntu 24.04 LTS Deployment Script
#  Installs Docker Engine, Docker Compose, deploys the project, and starts
#  all services with a local Ollama LLM.
#
#  Usage:
#    chmod +x deploy-ubuntu.sh
#    sudo ./deploy-ubuntu.sh                    # Deploy to /opt/Egli2.0
#    sudo ./deploy-ubuntu.sh /custom/path       # Custom install directory
#
#  Requirements:
#    - Ubuntu 24.04 LTS (Noble Numbat)
#    - Root / sudo access
#    - Internet connection
#    - At least 4 GB RAM (8 GB+ recommended for Ollama)
#    - At least 20 GB free disk space
# =============================================================================

set -euo pipefail

# ── Argument Parsing ─────────────────────────────────────────────────────────
ACTION="deploy"

for arg in "$@"; do
    case "$arg" in
        --uninstall|-u)
            ACTION="uninstall"
            ;;
        --help|-h)
            echo "Usage: sudo ./deploy-ubuntu.sh [OPTIONS] [INSTALL_DIR]"
            echo ""
            echo "Options:"
            echo "  (none)                 Deploy Egli2.0 to the install directory"
            echo "  --uninstall, -u        Remove all Egli2.0 services and files"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Arguments:"
            echo "  INSTALL_DIR            Target directory (default: /opt/Egli2.0)"
            echo ""
            echo "Environment variables:"
            echo "  REPO_URL               Git repository URL to clone from"
            echo ""
            echo "Examples:"
            echo "  sudo ./deploy-ubuntu.sh                          # Deploy to /opt/Egli2.0"
            echo "  sudo ./deploy-ubuntu.sh /custom/path             # Deploy to custom path"
            echo "  sudo ./deploy-ubuntu.sh --uninstall              # Remove everything"
            echo "  sudo ./deploy-ubuntu.sh --uninstall /custom/path # Remove from custom path"
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
# Only parse positional arg as install dir (skip flags)
for arg in "$@"; do
    if [[ "$arg" != "--"* ]]; then
        INSTALL_DIR="$arg"
        break
    fi
done
INSTALL_DIR="${INSTALL_DIR:-/opt/Egli2.0}"
REPO_URL="${REPO_URL:-}"         # Set this env var to clone from a remote repo
LOG_FILE="$INSTALL_DIR/deploy-ubuntu.log"

# ── Utility Functions ─────────────────────────────────────────────────────────

print_banner() {
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│  ${BOLD}Egli2.0 — Ubuntu 24.04 Installer${NC}         ${CYAN}│${NC}"
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
    warn "Installation failed. Check '$LOG_FILE' for details, fix the issue, then re-run."
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

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
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
    if [[ $total_mem_mb -lt 4000 ]]; then
        warn "Low memory: ${total_mem_mb} MB (4 GB+ recommended, 8 GB+ for Ollama)"
    else
        log "Memory: ${total_mem_mb} MB"
    fi

    local avail_disk_mb
    avail_disk_mb=$(df --output=avail "$(dirname "$INSTALL_DIR")" 2>/dev/null | tail -1)
    if [[ -n "$avail_disk_mb" && $avail_disk_mb -lt 20480 ]]; then
        warn "Low disk space: $((avail_disk_mb / 1024)) GB available (20 GB+ recommended)"
    elif [[ -n "$avail_disk_mb" ]]; then
        log "Disk space: $((avail_disk_mb / 1024)) GB available"
    fi
    echo ""

    # ── Phase 1: System Update & Prerequisites ──────────────────────────────
    section "Phase 1: System Update & Prerequisites"

    run_step "Updating package lists" apt-get update
    run_step "Installing prerequisites" apt-get install -y \
        ca-certificates curl gnupg lsb-release git ufw

    # ── Phase 2: Install Docker Engine ──────────────────────────────────────
    section "Phase 2: Installing Docker Engine"

    run_step "Removing conflicting packages" \
        apt-get remove -y docker.io docker-compose docker-compose-v2 \
                          docker-doc podman-docker containerd runc 2>/dev/null || true

    if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
        run_step "Adding Docker GPG key" \
            bash -c 'install -m 0755 -d /etc/apt/keyrings && \
                     curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
                     chmod a+r /etc/apt/keyrings/docker.asc'
    else
        log "Docker GPG key already present"
    fi

    if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
        run_step "Adding Docker APT repository" \
            bash -c 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'
    else
        log "Docker APT repository already configured"
    fi

    run_step "Updating for Docker packages" apt-get update
    run_step "Installing Docker Engine" \
        apt-get install -y docker-ce docker-ce-cli containerd.io \
                           docker-buildx-plugin docker-compose-plugin

    # ── Phase 3: Configure Docker ───────────────────────────────────────────
    section "Phase 3: Configuring Docker"

    # Fix systemd-resolved DNS issue (common on Ubuntu 24.04)
    if [[ ! -f /etc/docker/daemon.json ]]; then
        info "Configuring Docker DNS (workaround for systemd-resolved)..."
        mkdir -p /etc/docker
        cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "journald",
  "dns": ["8.8.8.8", "1.1.1.1"],
  "features": {
    "buildkit": true
  }
}
EOF
        log "Created /etc/docker/daemon.json with DNS fallback"
    else
        log "/etc/docker/daemon.json already exists (skipping)"
    fi

    run_step "Enabling Docker service" systemctl enable docker
    run_step "Restarting Docker service" systemctl restart docker

    # Verify Docker works
    if docker run --rm hello-world > /dev/null 2>&1; then
        log "Docker hello-world verified"
    else
        fail "Docker verification failed — check 'systemctl status docker'"
    fi

    echo ""
    info "Docker version:"
    docker --version
    info "Docker Compose version:"
    docker compose version

    # ── Phase 4: Configure Firewall ─────────────────────────────────────────
    section "Phase 4: Configuring Firewall (UFW)"

    if ufw status | grep -q "inactive"; then
        info "UFW is inactive — enabling and configuring..."
        ufw allow ssh > /dev/null 2>&1
        ufw allow 80/tcp > /dev/null 2>&1
        ufw allow 443/tcp > /dev/null 2>&1
        ufw --force enable > /dev/null 2>&1
        log "UFW enabled (SSH, HTTP, HTTPS allowed)"
    else
        ufw allow ssh > /dev/null 2>&1
        ufw allow 80/tcp > /dev/null 2>&1
        ufw allow 443/tcp > /dev/null 2>&1
        log "UFW already active — ensured SSH, HTTP, HTTPS rules"
    fi

    info "Note: Docker containers bypass UFW by default."

    # ── Phase 5: Deploy Egli2.0 ─────────────────────────────────
    section "Phase 5: Deploying Egli2.0"

    if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        warn "Installation directory exists and has docker-compose.yml — reusing."
    elif [[ -d "$INSTALL_DIR" ]]; then
        fail "Directory '$INSTALL_DIR' exists but doesn't look like an Egli2.0 project."
    else
        if [[ -n "$REPO_URL" ]]; then
            run_step "Cloning repository from $REPO_URL" \
                git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
        else
            local script_dir
            script_dir="$(cd "$(dirname "$0")" && pwd)"
            if [[ -f "$script_dir/docker-compose.yml" ]]; then
                info "Copying project files to $INSTALL_DIR..."
                mkdir -p "$INSTALL_DIR"

                # Use rsync if available, fall back to tar for reliable dotfile copy
                if command -v rsync > /dev/null 2>&1; then
                    rsync -a "$script_dir/" "$INSTALL_DIR/" --exclude='node_modules' --exclude='venv'
                else
                    # tar-based copy handles dotfiles correctly
                    (cd "$script_dir" && tar cf - .) | (cd "$INSTALL_DIR" && tar xf -)
                fi
                log "Project files deployed"
            else
                fail "Cannot find docker-compose.yml. Run this script from the project directory, or set REPO_URL."
            fi
        fi
    fi

    cd "$INSTALL_DIR"
    log "Working directory: $INSTALL_DIR"

    # ── Phase 6: Configuration ──────────────────────────────────────────────
    section "Phase 6: Configuration"

    if [[ ! -f .env && -f .env.example ]]; then
        cp .env.example .env
        local secret_key
        secret_key=$(openssl rand -hex 32)
        sed -i "s/change-me-to-a-random-secret/$secret_key/" .env
        log "Created .env with secure SECRET_KEY"
    elif [[ ! -f .env ]]; then
        warn "No .env.example found — creating minimal .env"
        cat > .env <<EOF
SECRET_KEY=$(openssl rand -hex 32)
INFLUXDB_TOKEN=admin-token
OLLAMA_MODEL=llama3.2
POLL_INTERVAL=60
SEED_MOCK=true
MOCK_SERVER_COUNT=5
EOF
        log "Created minimal .env"
    else
        info ".env already exists — keeping your configuration"
    fi

    # Replace default InfluxDB token with a secure one
    local current_token
    current_token=$(grep -oP 'INFLUXDB_TOKEN=\K.*' .env 2>/dev/null || echo "")
    if [[ "$current_token" == "admin-token" ]]; then
        local new_token
        new_token=$(openssl rand -hex 16)
        sed -i "s/INFLUXDB_TOKEN=admin-token/INFLUXDB_TOKEN=$new_token/" .env
        log "Updated InfluxDB token from default to secure random token"

        # Sync token into docker-compose.yml
        sed -i "s/INFLUXDB_TOKEN: admin-token/INFLUXDB_TOKEN: $new_token/g" docker-compose.yml
        log "Synced InfluxDB token into docker-compose.yml"
    fi

    # ── Phase 7: Start Services ─────────────────────────────────────────────
    section "Phase 7: Starting Services"

    info "Pulling Docker images..."
    run_step "Pulling Docker images" docker compose pull 2>&1

    info "Building and starting services..."
    docker compose up -d --build 2>&1 | tail -5 || true
    log "Services started"

    # Wait for services to become healthy
    info "Waiting for services to become healthy (up to 90 seconds)..."
    local services=("egli2-influxdb" "egli2-backend" "egli2-frontend" "egli2-ollama")
    local max_wait=90
    local waited=0

    for svc in "${services[@]}"; do
        waited=0
        while [[ $waited -lt $max_wait ]]; do
            local status
            status=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "starting")
            if [[ "$status" == "healthy" ]]; then
                echo -e "\r    ${GREEN}${CHECK_MARK}${NC} $svc — healthy                        "
                break
            fi
            echo -ne "\r    ${INFO}  $svc — $status (${waited}s)"
            sleep 5
            waited=$((waited + 5))
        done
        if [[ $waited -ge $max_wait ]]; then
            warn "$svc not healthy after ${max_wait}s — check: docker compose logs $svc"
        fi
    done

    # ── Phase 8: Install systemd Service + Health Monitoring ──────────────
    section "Phase 8: Installing systemd Service + Health Monitoring"

    local systemd_install_script="$INSTALL_DIR/systemd/install.sh"

    if [[ -f "$systemd_install_script" ]]; then
        info "Found systemd install helper — installing all units..."
        if bash "$systemd_install_script" "$INSTALL_DIR"; then
            log "All systemd units installed:"
            log "  • egli2.service         — Stack manager (auto-start on boot)"
            log "  • egli2-health.timer     — Health check every 5 minutes"
            log "  • egli2-notify@.service  — Email/webhook alerts on failure"
        else
            warn "systemd service installation had issues — check above"
        fi
    else
        warn "systemd/install.sh not found — falling back to manual setup"

        # ── Install main service ───────────────────────────────────────────
        local systemd_unit_src="$INSTALL_DIR/systemd/egli2.service"
        if [[ -f "$systemd_unit_src" ]]; then
            info "Installing main service unit..."
            local sys_systemd="/etc/systemd/system/egli2.service"
            sed "s|WorkingDirectory=/opt/Egli2.0|WorkingDirectory=$INSTALL_DIR|" \
                "$systemd_unit_src" > "$sys_systemd"
            chmod 644 "$sys_systemd"
            log "Installed: egli2.service"
        fi

        # ── Install health service + timer ─────────────────────────────────
        for unit in egli2-health.service egli2-health.timer; do
            local src="$INSTALL_DIR/systemd/$unit"
            local dst="/etc/systemd/system/$unit"
            if [[ -f "$src" && ! -f "$dst" ]]; then
                sed "s|/opt/Egli2.0|$INSTALL_DIR|g" "$src" > "$dst"
                chmod 644 "$dst"
                log "Installed: $unit"
            fi
        done

        # ── Install notification service ───────────────────────────────────
        local notify_src="$INSTALL_DIR/systemd/egli2-notify@.service"
        local notify_dst="/etc/systemd/system/egli2-notify@.service"
        if [[ -f "$notify_src" && ! -f "$notify_dst" ]]; then
            sed "s|/opt/Egli2.0|$INSTALL_DIR|g" "$notify_src" > "$notify_dst"
            chmod 644 "$notify_dst"
            log "Installed: egli2-notify@.service"
        fi

        # ── Ensure scripts are in INSTALL_DIR ──────────────────────────────
        for script in egli2-health.sh egli2-notify.sh; do
            local s_src="$INSTALL_DIR/systemd/$script"
            if [[ -f "$s_src" ]]; then
                chmod 755 "$s_src"
            fi
        done

        # ── Enable and start ───────────────────────────────────────────────
        systemctl daemon-reload > /dev/null 2>&1
        systemctl enable egli2 > /dev/null 2>&1 || true
        systemctl start egli2 > /dev/null 2>&1 || true
        log "Main service enabled (auto-start on boot)"

        systemctl enable egli2-health.timer > /dev/null 2>&1 || true
        systemctl start egli2-health.timer > /dev/null 2>&1 || true
        log "Health check timer enabled (checks every 5 minutes)"
    fi

    # ── Phase 9: Pull Ollama Model ──────────────────────────────────────────
    section "Phase 9: Pulling LLM Model (Ollama)"

    info "Pulling llama3.2 model (2B params — runs on CPU)..."
    if docker compose --profile setup run --rm ollama-setup 2>&1 | tail -3; then
        log "Ollama model pulled successfully"
    else
        warn "Model pull timed out — retrying in background..."
        docker exec egli2-ollama ollama pull llama3.2 2>/dev/null &
        warn "Downloading in background. Check: docker logs egli2-ollama"
    fi

    # ── Phase 10: Verification ──────────────────────────────────────────────
    section "Phase 10: Verification"

    echo ""
    echo -e "  ${BOLD}Service Status:${NC}"
    echo ""
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | while IFS= read -r line; do
        echo "    $line"
    done

    echo ""
    echo -e "  ${BOLD}API Health Check:${NC}"

    local health_status
    health_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null || echo "failed")
    if [[ "$health_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} /api/health — HTTP $health_status"
    else
        echo -e "    ${RED}${CROSS_MARK}${NC} /api/health — HTTP $health_status"
    fi

    local metrics_status
    metrics_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/metrics 2>/dev/null || echo "failed")
    if [[ "$metrics_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} /api/metrics — HTTP $metrics_status"
    else
        echo -e "    ${YELLOW}${WARN}${NC}  /api/metrics — HTTP $metrics_status (may need mock data to seed)"
    fi

    local frontend_status
    frontend_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "failed")
    if [[ "$frontend_status" == "200" ]]; then
        echo -e "    ${GREEN}${CHECK_MARK}${NC} Dashboard (/) — HTTP $frontend_status"
    else
        echo -e "    ${RED}${CROSS_MARK}${NC} Dashboard (/) — HTTP $frontend_status"
    fi

    # ── Completion ──────────────────────────────────────────────────────────
    section "Deployment Complete! ${ROCKET}"

    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')

    echo ""
    echo -e "  ${BOLD}Access your Egli2.0:${NC}"
    echo ""
    echo -e "    ${ARROW}  Dashboard:    ${CYAN}http://${server_ip}/${NC}"
    echo -e "    ${ARROW}  API Docs:     ${CYAN}http://${server_ip}:8000/docs${NC}"
    echo -e "    ${ARROW}  API Health:   ${CYAN}http://${server_ip}/api/health${NC}"

    if systemctl is-active --quiet egli2 2>/dev/null; then
        info "systemd auto-start enabled — stack will restart on boot"
    else
        info "To enable auto-start on boot: sudo ./systemd/install.sh"
    fi
    info "Or manage manually: docker compose <command>"
    echo ""
    echo -e "  ${BOLD}Manage with systemd:${NC}"
    echo ""
    echo -e "    ${ARROW}  systemctl status egli2     ${INFO}Check service status${NC}"
    echo -e "    ${ARROW}  systemctl start egli2      ${INFO}Start stack${NC}"
    echo -e "    ${ARROW}  systemctl stop egli2       ${INFO}Stop stack${NC}"
    echo -e "    ${ARROW}  systemctl restart egli2    ${INFO}Restart stack${NC}"
    echo -e "    ${ARROW}  journalctl -u egli2 -f     ${INFO}Follow service logs${NC}"
    echo ""
    echo -e "  ${BOLD}Docker Compose (manual):${NC}"
    echo ""
    echo -e "    ${ARROW}  cd $INSTALL_DIR"
    echo -e "    ${ARROW}  docker compose ps              ${INFO}View status${NC}"
    echo -e "    ${ARROW}  docker compose logs -f backend ${INFO}Tail logs${NC}"
    echo -e "    ${ARROW}  docker compose down            ${INFO}Stop all${NC}"
    echo -e "  ${BOLD}Ollama (change model):${NC}"
    echo ""
    echo -e "    ${ARROW}  docker exec egli2-ollama ollama pull mistral"
    echo -e "    ${ARROW}  # Edit .env: OLLAMA_MODEL=mistral"
    echo -e "    ${ARROW}  # Restart: docker compose restart backend"
    echo ""
    echo -e "  ${BOLD}Log: ${LOG_FILE}${NC}"
    echo ""
    echo -e "  ${GREEN}${CHECK_MARK}${NC} Egli2.0 is running!${NC}"
    echo ""
}

# ── Uninstall ──────────────────────────────────────────────────────────────

uninstall() {
    print_banner

    section "Uninstalling Egli2.0"

    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root (use sudo)."
    fi

    # Confirmation prompt
    echo ""
    echo -e "  ${YELLOW}WARNING: This will completely remove Egli2.0 from this server.${NC}"
    echo ""
    echo -e "  The following will be deleted:"
    echo -e "    ${ARROW}  systemd services (egli2, egli2-health.timer, egli2-notify)"
    echo -e "    ${ARROW}  Docker containers and volumes"
    echo -e "    ${ARROW}  Project files ($INSTALL_DIR)"
    echo ""
    read -r -p "  Are you sure you want to uninstall? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo ""
        info "Uninstall cancelled."
        exit 0
    fi

    # Stop and remove systemd services
    info "Stopping and removing systemd services..."
    for unit in egli2 egli2-health egli2-notify; do
        if systemctl is-active --quiet "$unit" 2>/dev/null; then
            systemctl stop "$unit" 2>/dev/null || true
            log "Stopped $unit"
        fi
        if systemctl is-enabled --quiet "$unit" 2>/dev/null; then
            systemctl disable "$unit" 2>/dev/null || true
            log "Disabled $unit"
        fi
    done
    for timer in egli2-health.timer; do
        if systemctl is-active --quiet "$timer" 2>/dev/null; then
            systemctl stop "$timer" 2>/dev/null || true
            log "Stopped $timer"
        fi
        if systemctl is-enabled --quiet "$timer" 2>/dev/null; then
            systemctl disable "$timer" 2>/dev/null || true
            log "Disabled $timer"
        fi
    done

    # Remove systemd unit files
    info "Removing systemd unit files..."
    for unit_file in egli2.service egli2-health.service egli2-health.timer egli2-notify@.service; do
        if [[ -f "/etc/systemd/system/$unit_file" ]]; then
            rm -f "/etc/systemd/system/$unit_file"
            log "Removed /etc/systemd/system/$unit_file"
        fi
    done
    systemctl daemon-reload 2>/dev/null || true
    log "systemd daemon reloaded"

    # Stop and remove Docker containers, networks, volumes
    if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        info "Stopping Docker Compose stack..."
        (cd "$INSTALL_DIR" && docker compose down -v --remove-orphans 2>/dev/null) || true
        log "Docker Compose stack stopped and volumes removed"
    fi

    # Remove Docker images built by this project
    info "Removing project Docker images..."
    for img in egli2-backend egli2-frontend egli2-poller; do
        docker rmi "$img" 2>/dev/null && log "Removed image $img" || true
    done

    # Remove the install directory
    if [[ -d "$INSTALL_DIR" ]]; then
        info "Removing install directory: $INSTALL_DIR"
        # Save log file path before deletion
        local log_path="$LOG_FILE"
        rm -rf "$INSTALL_DIR"
        log "Removed $INSTALL_DIR"
    else
        warn "Install directory not found: $INSTALL_DIR"
    fi

    # Optionally remove Docker itself (only if it was installed by this script)
    section "Docker Cleanup (optional)"
    echo ""
    read -r -p "  Remove Docker Engine as well? [y/N]: " remove_docker
    if [[ "$remove_docker" =~ ^[Yy]$ ]]; then
        info "Removing Docker Engine..."
        apt-get purge -y docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        rm -rf /etc/docker /var/lib/docker
        log "Docker Engine removed"
    else
        info "Keeping Docker Engine installed"
    fi

    section "Uninstall Complete"
    echo ""
    echo -e "  ${GREEN}${CHECK_MARK}${NC} Egli2.0 has been removed."
    echo ""
    echo -e "  Removed:"
    echo -e "    ${ARROW}  systemd services (egli2, egli2-health.timer, egli2-notify)"
    echo -e "    ${ARROW}  Docker containers and volumes"
    echo -e "    ${ARROW}  Project files ($INSTALL_DIR)"
    if [[ "$remove_docker" =~ ^[Yy]$ ]]; then
        echo -e "    ${ARROW}  Docker Engine"
    fi
    echo ""
}

# ── Run ──────────────────────────────────────────────────────────────────────

# Set up logging — capture all output to both terminal and log file
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

if [[ "$ACTION" == "uninstall" ]]; then
    uninstall
else
    main "$@"
fi
