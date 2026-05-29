#!/usr/bin/env bash
# =============================================================================
#  Egli2.0 — systemd Service Install/Uninstall Helper
#
#  Installs all systemd units:
#    • egli2.service            — Main stack manager (Docker Compose)
#    • egli2-health.service     — Health check runner (on demand)
#    • egli2-health.timer       — Periodic health check (every 5 min)
#    • egli2-notify@.service    — Failure notification (email/webhook)
#
#  Usage:
#    sudo ./install.sh                        # Install to /opt/Egli2.0
#    sudo ./install.sh /custom/path           # Custom install directory
#    sudo ./install.sh --uninstall            # Remove ALL systemd units
#    sudo ./install.sh --status               # Check service + health status
#    sudo ./install.sh --configure-alerts     # Interactive alert config
# =============================================================================

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CHECK="\xE2\x9C\x85"
CROSS="\xE2\x9D\x8C"
ARROW="\xE2\x9E\x9C"
INFO="\xE2\x84\xB9\xEF\xB8\x8F"
WARN="\xE2\x9A\xA0\xEF\xB8\x8F"

# ── Configuration ────────────────────────────────────────────────────────────
SERVICE_NAME="egli2"
SYSTEMD_DIR="/etc/systemd/system"

# All units to install/manage
UNITS=(
    "egli2.service"
    "egli2-health.service"
    "egli2-health.timer"
    "egli2-notify@.service"
)

SCRIPTS=(
    "egli2-health.sh"
    "egli2-notify.sh"
)

CONFIG_FILES=(
    "egli2-alert.env"
)

# Parse arguments
ACTION="install"
INSTALL_DIR=""

for arg in "$@"; do
    case "$arg" in
        --uninstall|-u|remove)  ACTION="uninstall" ;;
        --status|-s)            ACTION="status" ;;
        --configure-alerts|-c)  ACTION="configure-alerts" ;;
        --help|-h)
            echo "Usage: sudo ./install.sh [path] [command]"
            echo ""
            echo "Commands:"
            echo "  (none)                 Install all systemd units + enable health timer"
            echo "  --uninstall, -u        Remove all systemd units"
            echo "  --status, -s           Check service + health status"
            echo "  --configure-alerts, -c Configure email/webhook alert settings"
            echo ""
            echo "  path        Install directory (default: /opt/Egli2.0)"
            exit 0
            ;;
        *)
            if [[ -z "$INSTALL_DIR" ]]; then
                INSTALL_DIR="$arg"
            fi
            ;;
    esac
done

INSTALL_DIR="${INSTALL_DIR:-/opt/Egli2.0}"

# ── Utility Functions ─────────────────────────────────────────────────────────
log()  { echo -e "  ${GREEN}${CHECK}${NC} $1"; }
info() { echo -e "  ${BLUE}${INFO}${NC}  $1"; }
warn() { echo -e "  ${YELLOW}${WARN}${NC}  $1"; }
err()  { echo -e "  ${RED}${CROSS}${NC} $1"; }

get_script_dir() {
    cd "$(dirname "$0")" && pwd
}

# ── Install / Uninstall Helpers ──────────────────────────────────────────────

install_unit() {
    local unit_file="$1"
    local source_path="$2"
    local temp_unit
    temp_unit=$(mktemp)

    sed "s|/opt/Egli2.0|$INSTALL_DIR|g" \
        "$source_path/$unit_file" > "$temp_unit"

    cp "$temp_unit" "$SYSTEMD_DIR/$unit_file"
    rm -f "$temp_unit"
    chmod 644 "$SYSTEMD_DIR/$unit_file"
    log "Installed: $unit_file"
}

remove_unit() {
    local unit_file="$1"
    if [[ -f "$SYSTEMD_DIR/$unit_file" ]]; then
        rm -f "$SYSTEMD_DIR/$unit_file"
        log "Removed: $unit_file"
    fi
}

install_script() {
    local script="$1"
    local dest="$INSTALL_DIR/systemd/$script"
    local src="$script_dir/$script"
    if [[ -f "$src" ]]; then
        cp "$src" "$dest"
        chmod 755 "$dest"
        log "Installed script: $script"
    fi
}

# ── Actions ──────────────────────────────────────────────────────────────────

do_install() {
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│  ${BOLD}Egli2.0 — systemd Service Install${NC}                   ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        err "This script must be run as root (use sudo)."
        exit 1
    fi

    # Validate install directory
    if [[ ! -d "$INSTALL_DIR" ]]; then
        err "Install directory does not exist: $INSTALL_DIR"
        info "Run deploy-ubuntu.sh first, or verify the path."
        exit 1
    fi
    if [[ ! -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        err "No docker-compose.yml found in $INSTALL_DIR"
        info "Make sure the Egli2.0 is deployed to that directory."
        exit 1
    fi
    log "Found Egli2.0 at: $INSTALL_DIR"

    script_dir=$(get_script_dir)

    # Ensure systemd/ subdirectory exists in INSTALL_DIR
    mkdir -p "$INSTALL_DIR/systemd"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        err "Docker is not installed. Run deploy-ubuntu.sh first."
        exit 1
    fi
    if ! systemctl is-active --quiet docker; then
        err "Docker service is not running."
        exit 1
    fi
    log "Docker is running"

    # ── Install scripts (health check + notification) ─────────────────────
    echo ""
    echo -e "  ${BOLD}Installing helper scripts...${NC}"
    for s in "${SCRIPTS[@]}"; do
        install_script "$s"
    done

    # ── Install alert config (if not already present) ─────────────────────
    if [[ ! -f "$INSTALL_DIR/systemd/egli2-alert.env" ]]; then
        if [[ -f "$script_dir/egli2-alert.env" ]]; then
            cp "$script_dir/egli2-alert.env" "$INSTALL_DIR/systemd/egli2-alert.env"
            chmod 644 "$INSTALL_DIR/systemd/egli2-alert.env"
            log "Installed alert config: egli2-alert.env"
        fi
    else
        info "Alert config already exists — keeping your settings"
    fi

    # ── Install all systemd unit files ────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}Installing systemd units...${NC}"
    for unit in "${UNITS[@]}"; do
        if [[ -f "$script_dir/$unit" ]]; then
            install_unit "$unit" "$script_dir"
        else
            warn "Unit file not found: $unit (skipping)"
        fi
    done

    # ── Reload systemd ────────────────────────────────────────────────────
    systemctl daemon-reload
    log "systemd daemon reloaded"

    # ── Enable and start main service ─────────────────────────────────────
    systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
    log "Main service enabled (starts on boot)"

    systemctl start "$SERVICE_NAME" > /dev/null 2>&1 || true
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Main service started successfully"
    else
        warn "Main service installed but not yet active — check 'systemctl status $SERVICE_NAME'"
    fi

    # ── Enable health timer (starts after main service) ───────────────────
    systemctl enable "egli2-health.timer" > /dev/null 2>&1
    log "Health check timer enabled (checks stack every 5 minutes)"

    systemctl start "egli2-health.timer" > /dev/null 2>&1 || true
    log "Health check timer started"

    # ── Summary ───────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}Installed units:${NC}"
    echo ""
    echo -e "    ${ARROW}  egli2.service            ${INFO}Main stack manager${NC}"
    echo -e "    ${ARROW}  egli2-health.service     ${INFO}Health check (one-shot)${NC}"
    echo -e "    ${ARROW}  egli2-health.timer       ${INFO}Health check every 5 min${NC}"
    echo -e "    ${ARROW}  egli2-notify@.service    ${INFO}Failure alerts (email/webhook)${NC}"
    echo ""
    echo -e "  ${BOLD}Management commands:${NC}"
    echo ""
    echo -e "    ${ARROW}  systemctl status egli2               ${INFO}Stack status${NC}"
    echo -e "    ${ARROW}  systemctl start | stop | restart egli2${INFO}Control stack${NC}"
    echo -e "    ${ARROW}  systemctl status egli2-health.timer   ${INFO}Health timer status${NC}"
    echo -e "    ${ARROW}  systemctl list-timers --all | grep monitor ${INFO}Next health check${NC}"
    echo -e "    ${ARROW}  journalctl -u egli2-health -f         ${INFO}Health check logs${NC}"
    echo -e "    ${ARROW}  sudo ./install.sh --configure-alerts        ${INFO}Set up email alerts${NC}"
    echo ""
    log "Egli2.0 health monitoring is ACTIVE!"
    echo ""
}

do_uninstall() {
    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  ${BOLD}Egli2.0 — systemd Service Uninstall${NC}                 ${YELLOW}│${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        err "This script must be run as root (use sudo)."
        exit 1
    fi

    # ── Stop and disable main service first ───────────────────────────────
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        info "Stopping the Egli2.0 stack..."
        systemctl stop "$SERVICE_NAME" > /dev/null 2>&1 || true
    fi
    systemctl disable "$SERVICE_NAME" > /dev/null 2>&1 || true
    log "Main service stopped + disabled"

    # ── Stop and disable health timer ─────────────────────────────────────
    if systemctl is-active --quiet "egli2-health.timer" 2>/dev/null; then
        systemctl stop "egli2-health.timer" > /dev/null 2>&1 || true
    fi
    systemctl disable "egli2-health.timer" > /dev/null 2>&1 || true
    log "Health timer stopped + disabled"

    # ── Remove all unit files ─────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}Removing unit files...${NC}"
    local found=false
    for unit in "${UNITS[@]}"; do
        if [[ -f "$SYSTEMD_DIR/$unit" ]]; then
            remove_unit "$unit"
            found=true
        fi
    done

    if ! $found; then
        warn "No Egli2.0 systemd units found — nothing to remove."
        exit 0
    fi

    systemctl daemon-reload
    log "systemd daemon reloaded"

    echo ""
    log "All Egli2.0 systemd units removed."
    info "The Docker Compose stack is still available for manual use:"
    info "  cd $INSTALL_DIR && docker compose up -d"
    echo ""
}

do_status() {
    echo ""
    echo -e "${BLUE}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${BLUE}│  ${BOLD}Egli2.0 — Service Status${NC}                              ${BLUE}│${NC}"
    echo -e "${BLUE}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""

    # ── Systemd unit status ───────────────────────────────────────────────
    echo -e "  ${BOLD}─ systemd Units ─${NC}"
    echo ""

    local any_installed=false
    for unit in "${UNITS[@]}"; do
        if [[ -f "$SYSTEMD_DIR/$unit" ]]; then
            any_installed=true
            local active_state
            local enabled_state
            active_state=$(systemctl is-active "$unit" 2>/dev/null || echo "inactive")
            enabled_state=$(systemctl is-enabled "$unit" 2>/dev/null || echo "disabled")

            local icon="$CHECK"
            local color="$GREEN"
            if [[ "$active_state" != "active" && "$active_state" != "waiting" ]]; then
                icon="$CROSS"
                color="$RED"
            fi

            echo -e "  ${color}${icon}${NC} ${BOLD}$unit${NC}"
            echo -e "       Active:  ${color}${active_state}${NC}"
            echo -e "       Enabled: ${BLUE}${enabled_state}${NC}"
            echo ""
        fi
    done

    if ! $any_installed; then
        warn "No Egli2.0 systemd units are installed."
        info "Install with: sudo $0"
        exit 0
    fi

    # ── Docker Compose container status ───────────────────────────────────
    echo -e "  ${BOLD}─ Docker Containers ─${NC}"
    echo ""
    if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        (cd "$INSTALL_DIR" && docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}") 2>&1 || true
    else
        warn "No docker-compose.yml found at $INSTALL_DIR"
    fi
    echo ""

    # ── Health timer info ─────────────────────────────────────────────────
    echo -e "  ${BOLD}─ Health Check Schedule ─${NC}"
    echo ""
    if systemctl is-active --quiet "egli2-health.timer" 2>/dev/null; then
        systemctl list-timers --all --no-pager 2>/dev/null | grep -i monitor || \
            echo "    No pending executions (timer may be idle)"
    else
        echo "    Health check timer is not active"
    fi
    echo ""

    # ── Alert config summary ──────────────────────────────────────────────
    echo -e "  ${BOLD}─ Alert Configuration ─${NC}"
    echo ""
    if [[ -f "$INSTALL_DIR/systemd/egli2-alert.env" ]]; then
        local alert_to
        alert_to=$(grep "^ALERT_TO=" "$INSTALL_DIR/systemd/egli2-alert.env" 2>/dev/null | cut -d= -f2 || echo "")
        local alert_method
        alert_method=$(grep "^ALERT_METHOD=" "$INSTALL_DIR/systemd/egli2-alert.env" 2>/dev/null | cut -d= -f2 || echo "")
        local webhook
        webhook=$(grep "^ALERT_WEBHOOK_URL=" "$INSTALL_DIR/systemd/egli2-alert.env" 2>/dev/null | cut -d= -f2 || echo "")

        if [[ -n "$alert_to" ]]; then
            echo -e "    ${CHECK} Email alerts: enabled → ${BLUE}$alert_to${NC} (via $alert_method)"
        else
            echo -e "    ${INFO}  Email alerts: not configured"
        fi
        if [[ -n "$webhook" ]]; then
            echo -e "    ${CHECK} Webhook alerts: enabled"
        else
            echo -e "    ${INFO}  Webhook alerts: not configured"
        fi
        echo ""
        info "Edit: $INSTALL_DIR/systemd/egli2-alert.env"
        info "Re-run: sudo ./install.sh --configure-alerts"
    else
        echo "    Alert config not found"
    fi
    echo ""
}

do_configure_alerts() {
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│  ${BOLD}Egli2.0 — Alert Configuration${NC}                        ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""

    local config_file="$INSTALL_DIR/systemd/egli2-alert.env"

    # Source existing config if present
    if [[ -f "$config_file" ]]; then
        # shellcheck source=/dev/null
        source "$config_file"
        info "Current configuration loaded from $config_file"
    else
        warn "No existing config found — will create new one"
    fi

    echo ""
    echo -e "  ${BOLD}Email alert settings (leave blank to skip):${NC}"
    echo ""

    # ── Prompt for settings ───────────────────────────────────────────────
    read -r -p "    Recipient email address [${ALERT_TO:-}]: " input_to
    ALERT_TO="${input_to:-$ALERT_TO}"

    read -r -p "    Email method (mail/msmtp/sendmail) [${ALERT_METHOD:-}]: " input_method
    ALERT_METHOD="${input_method:-$ALERT_METHOD}"

    read -r -p "    Minimum severity (warning/critical) [${ALERT_SEVERITY:-warning}]: " input_sev
    ALERT_SEVERITY="${input_sev:-${ALERT_SEVERITY:-warning}}"

    echo ""
    echo -e "  ${BOLD}Webhook settings (optional):${NC}"
    echo ""
    read -r -p "    Webhook URL (Slack/Discord) [${ALERT_WEBHOOK_URL:-}]: " input_webhook
    ALERT_WEBHOOK_URL="${input_webhook:-$ALERT_WEBHOOK_URL}"

    # ── Write config ──────────────────────────────────────────────────────
    mkdir -p "$(dirname "$config_file")"
    cat > "$config_file" <<ALERTCONFIG
# Egli2.0 — Alert Configuration
# Generated by install.sh --configure-alerts on $(date '+%Y-%m-%d %H:%M:%S')

ALERT_TO="${ALERT_TO}"
ALERT_FROM="egli2@$(hostname -f 2>/dev/null || hostname)"
ALERT_METHOD="${ALERT_METHOD}"
ALERT_SEVERITY="${ALERT_SEVERITY}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL}"
ALERTCONFIG

    chmod 644 "$config_file"
    echo ""
    log "Configuration saved to $config_file"

    if [[ -n "$ALERT_TO" && -n "$ALERT_METHOD" ]]; then
        # Quick test
        echo ""
        info "Sending test notification..."
        local subject="[Egli2.0] Test notification from $(hostname)"
        local body="This is a test notification from the Egli2.0.\n\n"
        body+="Alert method: ${ALERT_METHOD}\n"
        body+="If you receive this, email alerts are working correctly.\n"

        case "$ALERT_METHOD" in
            mail)
                echo -e "$body" | mail -s "$subject" "$ALERT_TO" 2>/dev/null && \
                    log "Test email sent to $ALERT_TO" || \
                    warn "Test email failed — check $ALERT_METHOD setup"
                ;;
            msmtp)
                echo -e "Subject: $subject\nFrom: egli2@$(hostname)\nTo: $ALERT_TO\n\n$body" | \
                    msmtp "$ALERT_TO" 2>/dev/null && \
                    log "Test email sent to $ALERT_TO" || \
                    warn "Test email failed — check msmtp config"
                ;;
            sendmail)
                echo -e "Subject: $subject\n\n$body" | sendmail "$ALERT_TO" 2>/dev/null && \
                    log "Test email sent to $ALERT_TO" || \
                    warn "Test email failed — check sendmail setup"
                ;;
        esac
    fi

    if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
        local payload
        payload=$(cat <<EOF
{
  "text": "*[Egli2.0] Test notification from $(hostname)*\n\nAlert webhook configured successfully."
}
EOF
)
        curl -s -X POST -H "Content-Type: application/json" \
            -d "$payload" "$ALERT_WEBHOOK_URL" > /dev/null 2>&1 && \
            log "Test webhook sent" || \
            warn "Test webhook failed — check URL"
    fi

    echo ""
    log "Alert configuration complete!"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────

case "$ACTION" in
    install)          do_install          ;;
    uninstall)        do_uninstall        ;;
    status)           do_status           ;;
    configure-alerts) do_configure_alerts ;;
esac
