#!/usr/bin/env bash
# =============================================================================
#  Egli2.0 — Health Check Script
#
#  Validates the entire stack:
#    1. Docker daemon is running
#    2. Each compose service is "running" or "healthy"
#    3. API health endpoint responds 200
#
#  On failure, logs to journald and optionally sends email / webhook alerts.
#
#  Designed to be run by systemd timer (egli2-health.timer) or manually:
#    sudo ./systemd/egli2-health.sh /opt/Egli2.0
# =============================================================================

set -uo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
INSTALL_DIR="${1:-/opt/Egli2.0}"
ALERT_CONFIG="$INSTALL_DIR/systemd/egli2-alert.env"
HEALTH_LOG_TAG="egli2-health"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── State ────────────────────────────────────────────────────────────────────
FAILURES=()
WARNINGS=()
OVERALL_EXIT=0

# ── Load alert config (if it exists) ─────────────────────────────────────────
ALERT_TO=""
ALERT_FROM=""
ALERT_METHOD=""
ALERT_SEVERITY="warning"
ALERT_WEBHOOK_URL=""

if [[ -f "$ALERT_CONFIG" ]]; then
    # shellcheck source=/dev/null
    source "$ALERT_CONFIG"
fi

# ── Logging ──────────────────────────────────────────────────────────────────
log_info()   { echo -e "  ${GREEN}[OK]${NC} $1"; logger -t "$HEALTH_LOG_TAG" "[OK] $1"; }
log_warn()   { echo -e "  ${YELLOW}[WARN]${NC} $1"; logger -t "$HEALTH_LOG_TAG" "[WARN] $1"; }
log_fail()   { echo -e "  ${RED}[FAIL]${NC} $1"; logger -t "$HEALTH_LOG_TAG" "[FAIL] $1"; }

# ── Alerting ─────────────────────────────────────────────────────────────────

send_alert_email() {
    local subject="$1"
    local body="$2"

    if [[ -z "$ALERT_TO" || -z "$ALERT_METHOD" ]]; then
        return 0  # Email not configured
    fi

    case "$ALERT_METHOD" in
        mail)
            echo "$body" | mail -s "$subject" "$ALERT_TO" 2>/dev/null && return 0
            ;;
        msmtp)
            echo -e "Subject: $subject\nFrom: $ALERT_FROM\nTo: $ALERT_TO\n\n$body" | \
                msmtp "$ALERT_TO" 2>/dev/null && return 0
            ;;
        sendmail)
            echo -e "Subject: $subject\nFrom: $ALERT_FROM\nTo: $ALERT_TO\n\n$body" | \
                sendmail "$ALERT_TO" 2>/dev/null && return 0
            ;;
    esac
    log_warn "Failed to send alert email via '$ALERT_METHOD'"
    return 1
}

send_webhook() {
    local subject="$1"
    local body="$2"

    if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
        return 0
    fi

    local payload
    payload=$(cat <<EOF
{
  "text": "*${subject}*\\n\\n${body}",
  "source": "egli2-health"
}
EOF
)
    curl -s -X POST -H "Content-Type: application/json" \
        -d "$payload" "$ALERT_WEBHOOK_URL" > /dev/null 2>&1 && return 0

    log_warn "Failed to send webhook alert to $ALERT_WEBHOOK_URL"
    return 1
}

send_alerts() {
    local subject="$1"
    local body="$2"

    send_alert_email "$subject" "$body"
    send_webhook "$subject" "$body"
}

# ── Checks ───────────────────────────────────────────────────────────────────

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_fail "Docker is not installed"
        FAILURES+=("Docker not installed")
        return 1
    fi

    if ! docker info &> /dev/null; then
        log_fail "Docker daemon is not running or not accessible"
        FAILURES+=("Docker daemon not running")
        return 1
    fi
    log_info "Docker daemon is running"
    return 0
}

check_compose_file() {
    if [[ ! -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        log_fail "docker-compose.yml not found in $INSTALL_DIR"
        FAILURES+=("docker-compose.yml not found")
        return 1
    fi
    log_info "docker-compose.yml found"
    return 0
}

check_containers() {
    local all_healthy=true

    if ! cd "$INSTALL_DIR" 2>/dev/null; then
        log_fail "Cannot change to $INSTALL_DIR"
        FAILURES+=("Cannot access install directory")
        return 1
    fi

    # Get list of services defined in the compose file
    local services
    if ! services=$(docker compose config --services 2>/dev/null); then
        log_fail "Cannot read compose configuration — stack may not be started"
        FAILURES+=("Cannot read compose configuration")
        return 1
    fi

    if [[ -z "$services" ]]; then
        log_fail "No services found in compose configuration — stack may not be started"
        FAILURES+=("No compose services defined")
        return 1
    fi

    while IFS= read -r svc; do
        [[ -z "$svc" ]] && continue

        local container_name
        container_name=$(docker compose ps --format '{{.Name}}' "$svc" 2>/dev/null || true)

        if [[ -z "$container_name" ]]; then
            log_fail "Container for service '$svc' is not running"
            FAILURES+=("Service '$svc' not running")
            all_healthy=false
            continue
        fi

        # Check container state
        local state
        state=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

        if [[ "$state" != "running" ]]; then
            log_fail "Service '$svc' is $state (expected: running)"
            FAILURES+=("Service '$svc' is $state")
            all_healthy=false
            continue
        fi

        # Check health status (if healthcheck is configured)
        local health
        health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
            "$container_name" 2>/dev/null || echo "none")

        case "$health" in
            healthy)
                log_info "Service '$svc' — running, healthy"
                ;;
            none)
                log_info "Service '$svc' — running (no healthcheck)"
                ;;
            starting)
                log_warn "Service '$svc' — running, health check still starting"
                WARNINGS+=("Service '$svc' health check starting")
                ;;
            unhealthy)
                log_fail "Service '$svc' — running but UNHEALTHY"
                FAILURES+=("Service '$svc' is unhealthy")
                all_healthy=false
                ;;
        esac
    done <<< "$services"

    $all_healthy && return 0 || return 1
}

check_api_health() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
        http://localhost/api/health 2>/dev/null || echo "failed")

    if [[ "$status" == "200" ]]; then
        log_info "API health endpoint — HTTP 200"
        return 0
    else
        log_fail "API health endpoint — HTTP $status (expected 200)"
        FAILURES+=("API health check failed: HTTP $status")
        return 1
    fi
}

check_dashboard() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
        http://localhost/ 2>/dev/null || echo "failed")

    if [[ "$status" == "200" || "$status" == "301" || "$status" == "302" ]]; then
        log_info "Dashboard — HTTP $status"
        return 0
    else
        log_warn "Dashboard — HTTP $status (may still be starting)"
        WARNINGS+=("Dashboard returned HTTP $status")
        return 0  # Non-critical, don't fail
    fi
}

check_resource_usage() {
    # Warn if disk or memory is critically low
    local avail_disk_mb
    avail_disk_mb=$(df --output=avail "$INSTALL_DIR" 2>/dev/null | tail -1)

    if [[ -n "$avail_disk_mb" && $avail_disk_mb -lt 1024 ]]; then
        log_warn "Critically low disk space: $((avail_disk_mb / 1024)) GB available"
        WARNINGS+=("Low disk space: $((avail_disk_mb / 1024)) GB")
    elif [[ -n "$avail_disk_mb" && $avail_disk_mb -lt 5120 ]]; then
        log_warn "Low disk space: $((avail_disk_mb / 1024)) GB available"
        WARNINGS+=("Low disk space: $((avail_disk_mb / 1024)) GB")
    fi

    local total_mem_mb
    total_mem_mb=$(awk '/MemTotal/ {printf "%d", $2 / 1024}' /proc/meminfo 2>/dev/null)
    local avail_mem_mb
    avail_mem_mb=$(awk '/MemAvailable/ {printf "%d", $2 / 1024}' /proc/meminfo 2>/dev/null)

    if [[ -n "$avail_mem_mb" && $avail_mem_mb -lt 512 ]]; then
        log_warn "Low available memory: ${avail_mem_mb} MB / ${total_mem_mb} MB"
        WARNINGS+=("Low memory: ${avail_mem_mb} MB available")
    fi
}

# ── Remediation ──────────────────────────────────────────────────────────────

remediate_failures() {
    local needed=false

    # Don't attempt remediation if Docker is not accessible
    if ! command -v docker &> /dev/null || ! docker info &> /dev/null; then
        log_warn "Docker not available — skipping remediation"
        return
    fi

    cd "$INSTALL_DIR" 2>/dev/null || return

    # Get services; skip if compose isn't working
    local services
    if ! services=$(docker compose config --services 2>/dev/null); then
        log_warn "Cannot read compose config — skipping remediation"
        return
    fi
    [[ -z "$services" ]] && return

    while IFS= read -r svc; do
        [[ -z "$svc" ]] && continue
        local container_name
        container_name=$(docker compose ps --format '{{.Name}}' "$svc" 2>/dev/null || true)

        if [[ -z "$container_name" ]]; then
            log_warn "Attempting to start service '$svc'..."
            docker compose up -d --no-deps "$svc" 2>/dev/null || true
            needed=true
        else
            local health
            health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' \
                "$container_name" 2>/dev/null || echo "running")

            if [[ "$health" == "unhealthy" ]]; then
                log_warn "Restarting unhealthy container '$svc'..."
                docker compose up -d --no-deps "$svc" 2>/dev/null || true
                needed=true
            fi
        fi
    done <<< "$(docker compose config --services 2>/dev/null)"

    if $needed; then
        log_info "Remediation applied — some containers were restarted"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Egli2.0 — Health Check at $timestamp"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""

    check_docker
    check_compose_file
    check_containers
    check_api_health
    check_dashboard
    check_resource_usage

    echo ""

    # ── Summary ─────────────────────────────────────────────────────────────
    local failure_count=${#FAILURES[@]}
    local warning_count=${#WARNINGS[@]}

    if [[ $failure_count -eq 0 && $warning_count -eq 0 ]]; then
        echo -e "  ${GREEN}All checks passed. Stack is healthy.${NC}"
        logger -t "$HEALTH_LOG_TAG" "All checks passed — stack healthy"
        OVERALL_EXIT=0
    elif [[ $failure_count -eq 0 ]]; then
        echo -e "  ${YELLOW}All critical checks passed — ${warning_count} warning(s).${NC}"
        for w in "${WARNINGS[@]}"; do
            echo -e "    ${YELLOW}⚠${NC} $w"
        done
        logger -t "$HEALTH_LOG_TAG" "Healthy with $warning_count warnings"
        OVERALL_EXIT=0
    else
        echo -e "  ${RED}${failure_count} failure(s), ${warning_count} warning(s).${NC}"
        for f in "${FAILURES[@]}"; do
            echo -e "    ${RED}✘${NC} $f"
        done
        for w in "${WARNINGS[@]}"; do
            echo -e "    ${YELLOW}⚠${NC} $w"
        done
        logger -t "$HEALTH_LOG_TAG" "FAILED: $failure_count failures, $warning_count warnings"

        # ── Attempt remediation ────────────────────────────────────────────
        echo ""
        echo "  ── Auto-remediation ──"
        remediate_failures
        echo ""

        # ── Send alerts ────────────────────────────────────────────────────
        local subject="[Egli2.0] Stack health check FAILED on $(hostname)"
        local body="Egli2.0 health check FAILED at $timestamp\n\n"
        body+="Failures:\n"
        for f in "${FAILURES[@]}"; do
            body+="  ✘ $f\n"
        done
        body+="\nWarnings:\n"
        for w in "${WARNINGS[@]}"; do
            body+="  ⚠ $w\n"
        done
        body+="\nInvestigate: journalctl -u egli2-health.service -f\n"
        send_alerts "$subject" "$body"

        OVERALL_EXIT=1
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""

    exit $OVERALL_EXIT
}

main
