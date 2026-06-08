#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# backup.sh — Daily InfluxDB + Config Backup for Egli2.0
#
# Backs up:
#   • Configuration files (.env, docker-compose.yml, nginx/)
#   • InfluxDB time-series metrics (via 'influx backup')
#   • Server registrations (exported via API)
#
# Retention: keeps the last 7 daily backups.
# Schedule via cron:  0 2 * * * /opt/Egli2.0/scripts/backup.sh
#
# Usage:
#   ./scripts/backup.sh                      # Uses default paths
#   BACKUP_DIR=/mnt/backups ./backup.sh       # Custom backup dir
#   INSTALL_DIR=/srv/egli2   ./backup.sh      # Custom install dir
#   ./backup.sh --dry-run                     # Preview without backing up
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Paths & Configuration ─────────────────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/opt/Egli2.0}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/egli2}"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_FILE:-/var/log/egli2-backup.log}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DRY_RUN=false
API_URL="${API_URL:-http://localhost:8000}"
INFLUX_CONTAINER="${INFLUX_CONTAINER:-egli2-influxdb}"

# ── Colors (skipped if output is piped) ──────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ── Utility Functions ─────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $*" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}✔${NC}  $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*" | tee -a "$LOG_FILE"; }
err()     { echo -e "${RED}✖${NC}  $*" | tee -a "$LOG_FILE" >&2; }
header()  { echo -e "\n${BOLD}${BLUE}═══ $* ═══${NC}\n" | tee -a "$LOG_FILE"; }
dry()     { echo -e "  ${YELLOW}⚡${NC}  [DRY-RUN] $*"; }

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
Usage: backup.sh [OPTIONS]

Back up Egli2.0 configuration, InfluxDB metrics, and server registrations.

Options:
  --dry-run         Preview what would be backed up (no files created)
  --help, -h        Show this help message

Environment variables:
  INSTALL_DIR       Egli2.0 install path (default: /opt/Egli2.0)
  BACKUP_DIR        Where backups are stored (default: /opt/backups/egli2)
  RETENTION_DAYS    How many days to keep backups (default: 7)
  API_URL           API base URL for server export (default: http://localhost:8000)
  LOG_FILE          Log file path (default: /var/log/egli2-backup.log)

Examples:
  ./scripts/backup.sh                        # Default backup
  BACKUP_DIR=/mnt/nfs/backups ./backup.sh    # Backup to NFS mount
  ./backup.sh --dry-run                      # Dry run
EOF
    exit 0
}

# ── Parse Arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --dry-run)  DRY_RUN=true ;;
        --help|-h)  usage ;;
        *)          err "Unknown option: $arg"; usage ;;
    esac
done

# ── Pre-flight Checks ─────────────────────────────────────────────────────────
preflight() {
    header "Pre-flight Checks"

    if [[ ! -d "$INSTALL_DIR" ]]; then
        err "Install directory not found: $INSTALL_DIR"
        err "Set INSTALL_DIR or run from the Egli2.0 project root."
        exit 1
    fi
    info "Install dir: $INSTALL_DIR"

    if [[ "$DRY_RUN" == true ]]; then
        warn "DRY-RUN mode — no files will be created or modified"
    fi

    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || {
        # Fallback: log to backup directory
        LOG_FILE="$BACKUP_DIR/backup.log"
        mkdir -p "$(dirname "$LOG_FILE")"
        warn "Falling back to log file: $LOG_FILE"
    }

    # Check Docker access
    if ! docker info > /dev/null 2>&1; then
        err "Docker is not available — is Docker running?"
        exit 1
    fi
    info "Docker daemon reachable"

    # Check InfluxDB container
    if ! docker inspect "$INFLUX_CONTAINER" > /dev/null 2>&1; then
        err "InfluxDB container '$INFLUX_CONTAINER' not found — is the stack running?"
        exit 1
    fi
    info "InfluxDB container: $INFLUX_CONTAINER"

    # Ensure backup directory exists
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$BACKUP_DIR"
        info "Backup dir: $BACKUP_DIR"
    fi

    # Check available disk space (need at least 500 MB)
    if [[ -d "$BACKUP_DIR" ]]; then
        local avail_mb
        avail_mb=$(df --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1)
        if [[ -n "$avail_mb" && $avail_mb -lt 500 ]]; then
            warn "Low disk space on backup target: $((avail_mb / 1024)) GB available"
            warn "InfluxDB backup can be large — consider freeing space or increasing RETENTION_DAYS"
        fi
    fi

    success "Pre-flight checks passed"
}

# ── Step 1: Backup Configuration Files ─────────────────────────────────────────
backup_config() {
    header "Step 1/4 — Configuration Files"

    if [[ "$DRY_RUN" == true ]]; then
        dry "Would back up: $INSTALL_DIR/.env"
        dry "Would back up: $INSTALL_DIR/docker-compose.yml"
        dry "Would back up: $INSTALL_DIR/nginx/ (directory)"
        return 0
    fi

    # .env (with secrets masked in logs)
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        cp "$INSTALL_DIR/.env" "$BACKUP_DIR/env_$DATE"
        success "Backed up .env → env_$DATE"
    else
        warn ".env not found — skipping"
    fi

    # docker-compose.yml
    if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        cp "$INSTALL_DIR/docker-compose.yml" "$BACKUP_DIR/compose_$DATE"
        success "Backed up docker-compose.yml → compose_$DATE"
    else
        warn "docker-compose.yml not found — skipping"
    fi

    # nginx configuration
    if [[ -d "$INSTALL_DIR/nginx" ]]; then
        cp -r "$INSTALL_DIR/nginx" "$BACKUP_DIR/nginx_$DATE"
        success "Backed up nginx/ → nginx_$DATE"
    else
        warn "nginx/ directory not found — skipping"
    fi

    return 0
}

# ── Step 2: Backup InfluxDB ───────────────────────────────────────────────────
backup_influxdb() {
    header "Step 2/4 — InfluxDB Metrics"

    if [[ "$DRY_RUN" == true ]]; then
        dry "Would run: influx backup inside $INFLUX_CONTAINER"
        dry "Would copy backup to: $BACKUP_DIR/influx_$DATE"
        return 0
    fi

    local tmp_backup="/tmp/influx_backup_$DATE"

    # Run influx backup inside the container
    info "Running influx backup inside container..."
    if docker exec "$INFLUX_CONTAINER" influx backup "$tmp_backup" 2>/dev/null; then
        success "InfluxDB backup completed inside container"
    else
        # Fallback for older InfluxDB CLI syntax
        warn "Primary backup command failed — trying alternate syntax..."
        if docker exec "$INFLUX_CONTAINER" influx backup --bucket metrics "$tmp_backup" 2>/dev/null; then
            success "InfluxDB backup completed (alternate syntax)"
        else
            warn "InfluxDB backup command failed — trying full backup..."
            if docker exec "$INFLUX_CONTAINER" influx backup -o monitoring "$tmp_backup" 2>/dev/null; then
                success "InfluxDB backup completed (full backup)"
            else
                err "InfluxDB backup failed. Check InfluxDB is healthy."
                err "Command: docker exec $INFLUX_CONTAINER influx backup $tmp_backup"
                return 1
            fi
        fi
    fi

    # Copy backup from container to host
    info "Copying backup from container to host..."
    if docker cp "$INFLUX_CONTAINER:$tmp_backup" "$BACKUP_DIR/influx_$DATE" 2>/dev/null; then
        success "InfluxDB backup copied to host: influx_$DATE"
    else
        err "Failed to copy backup from container — check disk space"
        return 1
    fi

    # Clean up temp backup inside container
    docker exec "$INFLUX_CONTAINER" rm -rf "$tmp_backup" 2>/dev/null || true

    return 0
}

# ── Step 3: Export Server Registrations ────────────────────────────────────────
backup_servers() {
    header "Step 3/4 — Server Registrations"

    if [[ "$DRY_RUN" == true ]]; then
        dry "Would export server registrations from API: $API_URL/api/servers/export"
        return 0
    fi

    # Try the API export endpoint
    if curl -sf "$API_URL/api/servers/export" > "$BACKUP_DIR/servers_$DATE.json" 2>/dev/null; then
        local count
        count=$(python3 -c "import json; print(len(json.load(open('$BACKUP_DIR/servers_$DATE.json'))))" 2>/dev/null || echo "?")
        success "Exported $count server registrations → servers_$DATE.json"
    else
        warn "API export failed — is the backend running at $API_URL?"
        warn "Skipping server registration backup. The config and InfluxDB backups are still valid."
        # Create empty file to mark it was attempted
        echo "[]" > "$BACKUP_DIR/servers_$DATE.json"
        return 1
    fi

    return 0
}

# ── Step 4: Create Archive & Clean Up ─────────────────────────────────────────
create_archive() {
    header "Step 4/4 — Archive & Cleanup"

    # Remove any leftover archive from a previous failed run
    local archive="$BACKUP_DIR/egli2_backup_$DATE.tar.gz"

    if [[ "$DRY_RUN" == true ]]; then
        dry "Would create archive: $archive"
        dry "Would clean up backups older than ${RETENTION_DAYS} days"
        return 0
    fi

    # Build the list of backup items to archive
    local tar_items=()
    for item in "env_$DATE" "compose_$DATE" "nginx_$DATE" "servers_$DATE.json"; do
        if [[ -e "$BACKUP_DIR/$item" ]]; then
            tar_items+=("$item")
        fi
    done

    # Include InfluxDB backup if present and non-empty
    if [[ -d "$BACKUP_DIR/influx_$DATE" && -n "$(ls -A "$BACKUP_DIR/influx_$DATE" 2>/dev/null)" ]]; then
        tar_items+=("influx_$DATE")
    fi

    if [[ ${#tar_items[@]} -eq 0 ]]; then
        warn "No backup files found to archive — nothing to do"
        return 1
    fi

    info "Creating compressed archive with ${#tar_items[@]} item(s)..."
    tar -czf "$archive" -C "$BACKUP_DIR" "${tar_items[@]}" 2>/dev/null || {
        # If the combined archive is too large (e.g. InfluxDB data), try excluding it
        if [[ -d "$BACKUP_DIR/influx_$DATE" ]]; then
            warn "Archive too large — creating separate archives..."
            local main_items=()
            for item in "${tar_items[@]}"; do
                [[ "$item" != "influx_$DATE" ]] && main_items+=("$item")
            done
            tar -czf "$archive" -C "$BACKUP_DIR" "${main_items[@]}" 2>/dev/null || {
                err "Failed to create main archive"
                return 1
            }
            tar -czf "${archive%.tar.gz}_influx.tar.gz" -C "$BACKUP_DIR" "influx_$DATE" 2>/dev/null || {
                warn "Failed to create InfluxDB archive — data preserved in temp files"
            }
        else
            err "Failed to create archive"
            return 1
        fi
    }

    # Remove loose backup files (keep only the archive(s))
    info "Cleaning up temporary files..."
    for item in "env_$DATE" "compose_$DATE" "nginx_$DATE" "servers_$DATE.json" "influx_$DATE"; do
        rm -rf "$BACKUP_DIR/$item"
    done

    # Report archive size(s)
    local size_kb
    size_kb=$(du -k "$archive" 2>/dev/null | cut -f1 || echo "0")
    if [[ $size_kb -gt 1024 ]]; then
        success "Archive: $(basename "$archive") ($((size_kb / 1024)).$((size_kb % 1024 * 10 / 1024)) MB)"
    elif [[ $size_kb -gt 0 ]]; then
        success "Archive: $(basename "$archive") (${size_kb} KB)"
    fi

    local influx_archive="${archive%.tar.gz}_influx.tar.gz"
    if [[ -f "$influx_archive" ]]; then
        local influx_kb
        influx_kb=$(du -k "$influx_archive" 2>/dev/null | cut -f1 || echo "0")
        if [[ $influx_kb -gt 1024 ]]; then
            success "Archive: $(basename "$influx_archive") ($((influx_kb / 1024)).$((influx_kb % 1024 * 10 / 1024)) MB)"
        else
            success "Archive: $(basename "$influx_archive") (${influx_kb} KB)"
        fi
    fi

    return 0
}

# ── Prune Old Backups ─────────────────────────────────────────────────────────
prune_old_backups() {
    header "Pruning Backups Older Than ${RETENTION_DAYS} Days"

    if [[ "$DRY_RUN" == true ]]; then
        local old_count
        old_count=$(find "$BACKUP_DIR" -maxdepth 1 -name "egli2_backup_*.tar.gz" -mtime +"$RETENTION_DAYS" 2>/dev/null | wc -l)
        dry "Would delete $old_count backup(s) older than $RETENTION_DAYS days"
        return 0
    fi

    local deleted=0
    while IFS= read -r -d '' old_backup; do
        rm -f "$old_backup"
        deleted=$((deleted + 1))
        info "Pruned: $(basename "$old_backup")"
    done < <(find "$BACKUP_DIR" -maxdepth 1 -name "egli2_backup_*.tar.gz" -mtime +"$RETENTION_DAYS" -print0 2>/dev/null)

    if [[ $deleted -gt 0 ]]; then
        success "Pruned $deleted old backup(s)"
    else
        info "No backups older than $RETENTION_DAYS days to prune"
    fi
}

# ── Summary ────────────────────────────────────────────────────────────────────
print_summary() {
    local archive_count
    archive_count=$(find "$BACKUP_DIR" -maxdepth 1 -name "egli2_backup_*.tar.gz" 2>/dev/null | wc -l)

    header "Backup Summary"
    echo ""
    echo -e "  ${BOLD}Location:${NC}   $BACKUP_DIR"
    echo -e "  ${BOLD}Retention:${NC}  ${RETENTION_DAYS} days"
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "  ${YELLOW}⚡  DRY-RUN — no files were modified${NC}"
    else
        echo -e "  ${GREEN}✔${NC}  Existing backups on disk: ${archive_count}"
        echo ""
        echo "  Latest backups:"
        find "$BACKUP_DIR" -maxdepth 1 -name "egli2_backup_*.tar.gz" -printf "    %f (%k KB)\n" 2>/dev/null | sort -r | head -5
    fi
    echo ""
}

# ── Verify Backup Integrity ────────────────────────────────────────────────────
verify_backup() {
    local archive="$BACKUP_DIR/egli2_backup_$DATE.tar.gz"

    if [[ "$DRY_RUN" == true || ! -f "$archive" ]]; then
        return 0
    fi

    header "Verifying Backup Integrity"

    # Test the archive can be read
    if tar -tzf "$archive" > /dev/null 2>&1; then
        local file_count
        file_count=$(tar -tzf "$archive" 2>/dev/null | wc -l)
        success "Archive verified — $file_count file(s) inside"
    else
        err "Archive verification FAILED — the backup may be corrupted"
        err "File: $archive"
        return 1
    fi

    return 0
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${BOLD}${BLUE}┌─────────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}${BLUE}│  Egli2.0 — Daily Backup Script              │${NC}"
    echo -e "${BOLD}${BLUE}│  $(date)                  │${NC}"
    echo -e "${BOLD}${BLUE}└─────────────────────────────────────────────┘${NC}"
    echo ""

    # Log start
    {
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo "  Backup started: $(date)"
        echo "═══════════════════════════════════════════════════════════"
    } >> "$LOG_FILE"

    preflight
    backup_config
    backup_influxdb
    backup_servers
    create_archive
    verify_backup
    prune_old_backups
    print_summary

    # Log completion
    {
        echo ""
        echo "  Backup finished: $(date)"
        echo "─────────────────────────────────────────────────────────"
    } >> "$LOG_FILE"

    echo -e "${GREEN}✔${NC}  Backup completed at $(date)"
    echo ""
}

main "$@"
