#!/usr/bin/env bash
# =============================================================================
#  Egli2.0 — Failure Notification Script
#
#  Called by systemd's OnFailure= directive when the egli2 service unit
#  fails.  Logs the failure, sends email / webhook alerts, and captures
#  relevant diagnostic context (journald logs, container states).
#
#  Invoked as:
#    egli2-notify.sh <failed-unit-name> <install-directory>
# =============================================================================

set -uo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
FAILED_UNIT="${1:-unknown}"
INSTALL_DIR="${2:-/opt/Egli2.0}"
ALERT_CONFIG="$INSTALL_DIR/systemd/egli2-alert.env"
NOTIFY_LOG_TAG="egli2-notify"

# ── Load alert config ────────────────────────────────────────────────────────
ALERT_TO=""
ALERT_FROM=""
ALERT_METHOD=""
ALERT_WEBHOOK_URL=""

if [[ -f "$ALERT_CONFIG" ]]; then
    # shellcheck source=/dev/null
    source "$ALERT_CONFIG"
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { echo "[egli2-notify] $1"; logger -t "$NOTIFY_LOG_TAG" "$1"; }

send_email() {
    local subject="$1" body="$2"
    if [[ -z "$ALERT_TO" || -z "$ALERT_METHOD" ]]; then
        return 0
    fi
    case "$ALERT_METHOD" in
        mail)
            echo "$body" | mail -s "$subject" "$ALERT_TO" 2>/dev/null && return 0 ;;
        msmtp)
            echo -e "Subject: $subject\nFrom: $ALERT_FROM\nTo: $ALERT_TO\n\n$body" | \
                msmtp "$ALERT_TO" 2>/dev/null && return 0 ;;
        sendmail)
            echo -e "Subject: $subject\nFrom: $ALERT_FROM\nTo: $ALERT_TO\n\n$body" | \
                sendmail "$ALERT_TO" 2>/dev/null && return 0 ;;
    esac
    log "WARNING: Failed to send email via '$ALERT_METHOD'"
    return 1
}

send_webhook() {
    local subject="$1" body="$2"
    if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
        return 0
    fi
    local payload
    payload=$(cat <<EOF
{
  "text": "*[Egli2.0] ${subject}*\\n\\n${body}",
  "source": "egli2-notify"
}
EOF
)
    curl -s -X POST -H "Content-Type: application/json" \
        -d "$payload" "$ALERT_WEBHOOK_URL" > /dev/null 2>&1 && return 0
    log "WARNING: Failed to send webhook"
    return 1
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    log "Service failure detected: $FAILED_UNIT at $timestamp"

    # ── Gather diagnostics ──────────────────────────────────────────────────
    local journal_snippet=""
    journal_snippet=$(journalctl -u "$FAILED_UNIT" --since "5 min ago" --no-pager -n 50 2>/dev/null || echo "(journal unavailable)")

    local docker_status=""
    if command -v docker &> /dev/null; then
        docker_status=$(docker ps -a --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "(docker unavailable)")
    else
        docker_status="(docker not available)"
    fi

    local hostname_str
    hostname_str=$(hostname -f 2>/dev/null || hostname)

    # ── Build alert message ─────────────────────────────────────────────────
    local subject="[Egli2.0] SERVICE FAILURE: ${FAILED_UNIT} on ${hostname_str}"
    local body="${subject}\n"
    body+="Time: ${timestamp}\n"
    body+="Host: ${hostname_str}\n"
    body+="\n"
    body+="────────────────────────────────────────\n"
    body+="Recent journald logs from ${FAILED_UNIT}:\n"
    body+="────────────────────────────────────────\n"
    body+="${journal_snippet}\n"
    body+="\n"
    body+="────────────────────────────────────────\n"
    body+="Container status:\n"
    body+="────────────────────────────────────────\n"
    body+="${docker_status}\n"
    body+="\n"
    body+="Investigate: journalctl -u ${FAILED_UNIT} -f\n"
    body+="Restart:     systemctl start ${FAILED_UNIT}\n"

    # ── Send notifications ──────────────────────────────────────────────────
    send_email "$subject" "$body"
    send_webhook "$subject" "$body"

    # Also log prominently
    logger -t "$NOTIFY_LOG_TAG" "ALERT: $subject"
    echo "$body"
}

main
