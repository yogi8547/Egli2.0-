#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# add-server.sh — Register servers in Egli2.0 monitoring platform
#
# Supports:
#   • Interactive mode (prompts for all fields)
#   • CLI flags (non-interactive, scriptable)
#   • Bulk import from CSV file
#   • SNMPv2c and SNMPv3 authentication
#   • Optional connection test before registering
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
API_URL="${EGLI_API_URL:-http://localhost:8000}"
SNMP_PORT=161
SNMP_VERSION="2c"
SNMP_COMMUNITY="public"
SNMP_USERNAME=""
AUTH_PROTO=""
AUTH_PASS=""
PRIV_PROTO=""
PRIV_PASS=""
TEST_BEFORE_ADD=false
VERBOSE=false

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
err()     { echo -e "${RED}✖${NC}  $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
Usage: add-server.sh [OPTIONS] [COMMAND]

Commands:
  interactive       Register a server interactively (default if no flags)
  single            Register a single server (requires --id, --name, --host)
  bulk              Bulk import from a CSV file (requires --file)
  list              List all registered servers

Options:
  -a, --api-url URL        API base URL (default: http://localhost:8000)
  -i, --id ID              Server unique identifier (hostname or IP)
  -n, --name NAME          Display name
  -H, --host HOST          SNMP host address
  -p, --port PORT          SNMP port (default: 161)
  -V, --version VER        SNMP version: 2c or 3 (default: 2c)
  -c, --community STRING   SNMP community string for v2c (default: public)
  -u, --username USER      SNMPv3 username
      --auth-proto PROTO   SNMPv3 auth protocol: MD5 or SHA
      --auth-pass PASS     SNMPv3 auth password
      --priv-proto PROTO   SNMPv3 privacy protocol: DES or AES
      --priv-pass PASS     SNMPv3 privacy password
  -t, --tags KEY=VAL       Tag (repeatable): -t env=prod -t type=web
  -T, --test               Test SNMP connection before adding
  -f, --file FILE          CSV file for bulk import
      --skip-duplicates    Skip servers that already exist (bulk mode)
  -v, --verbose            Show raw API responses
  -h, --help               Show this help

Examples:
  # Interactive mode
  ./scripts/add-server.sh

  # Quick add via CLI flags
  ./scripts/add-server.sh single --id web-06 --name "Web 06" --host 10.0.0.6

  # SNMPv3 with connection test
  ./scripts/add-server.sh single --id db-01 --name "DB Primary" --host 10.0.1.10 \
    --version 3 --username monitor --auth-proto SHA --auth-pass secret123 \\
    --priv-proto AES --priv-pass privsecret --test

  # Bulk import from CSV
  ./scripts/add-server.sh bulk --file servers.csv --skip-duplicates

  # List all servers
  ./scripts/add-server.sh list

CSV Format (for bulk import):
  id,name,host,port,snmp_version,snmp_community,snmp_username,snmp_auth_protocol,snmp_auth_password,snmp_priv_protocol,snmp_priv_password,tags
  web-01,Web Server 01,192.168.1.101,161,2c,public,,,,,env=prod;type=web
EOF
}

# ── Parse CLI arguments ───────────────────────────────────────────────────────
COMMAND=""
SERVER_ID=""
SERVER_NAME=""
SERVER_HOST=""
TAGS=""
TAG_PAIRS=()
FILE=""
SKIP_DUPES=false

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            interactive|single|bulk|list)
                COMMAND="$1"; shift ;;
            -a|--api-url)   API_URL="$2"; shift 2 ;;
            -i|--id)        SERVER_ID="$2"; shift 2 ;;
            -n|--name)      SERVER_NAME="$2"; shift 2 ;;
            -H|--host)      SERVER_HOST="$2"; shift 2 ;;
            -p|--port)      SNMP_PORT="$2"; shift 2 ;;
            -V|--version)   SNMP_VERSION="$2"; shift 2 ;;
            -c|--community) SNMP_COMMUNITY="$2"; shift 2 ;;
            -u|--username)  SNMP_USERNAME="$2"; shift 2 ;;
            --auth-proto)   AUTH_PROTO="$2"; shift 2 ;;
            --auth-pass)    AUTH_PASS="$2"; shift 2 ;;
            --priv-proto)   PRIV_PROTO="$2"; shift 2 ;;
            --priv-pass)    PRIV_PASS="$2"; shift 2 ;;
            -t|--tags)      TAG_PAIRS+=("$2"); shift 2 ;;
            -T|--test)      TEST_BEFORE_ADD=true; shift ;;
            -f|--file)      FILE="$2"; shift 2 ;;
            --skip-duplicates) SKIP_DUPES=true; shift ;;
            -v|--verbose)   VERBOSE=true; shift ;;
            -h|--help)      usage; exit 0 ;;
            *)              err "Unknown option: $1"; usage; exit 1 ;;
        esac
    done
}

# ── Check API health ──────────────────────────────────────────────────────────
check_api() {
    if ! curl -sf "${API_URL}/health" > /dev/null 2>&1; then
        err "Cannot reach Egli2.0 API at ${API_URL}"
        err "Make sure the backend is running: docker compose up -d"
        exit 1
    fi
    success "API is reachable at ${API_URL}"
}

# ── Test SNMP connection ─────────────────────────────────────────────────────
test_connection() {
    local server_id="$1"
    info "Testing SNMP connection to ${server_id}..."

    local response
    response=$(curl -sf -X POST "${API_URL}/api/servers/${server_id}/test-connection" 2>&1)

    local success_flag
    success_flag=$(echo "$response" | grep -o '"success":[[:space:]]*true' || true)

    if [[ -n "$success_flag" ]]; then
        local sys_name uptime
        sys_name=$(echo "$response" | grep -o '"sys_name":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        uptime=$(echo "$response" | grep -o '"uptime_seconds":[0-9.]*' | cut -d: -f2 || echo "N/A")
        success "SNMP connected — sysName: ${sys_name}, uptime: ${uptime}s"
        return 0
    else
        local error
        error=$(echo "$response" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 || echo "unknown error")
        warn "SNMP connection failed — ${error}"
        return 1
    fi
}

# ── Register a single server ─────────────────────────────────────────────────
register_server() {
    local id="$1" name="$2" host="$3"
    local port="${4:-161}" version="${5:-2c}" community="${6:-public}"
    local username="${7:-}" auth_proto="${8:-}" auth_pass="${9:-}"
    local priv_proto="${10:-}" priv_pass="${11:-}"
    shift 11

    # Build tags JSON
    local tags_json="{}"
    if [[ $# -gt 0 ]]; then
        tags_json="{"
        local first=true
        for tag in "$@"; do
            local key="${tag%%=*}"
            local val="${tag#*=}"
            if [[ "$first" == true ]]; then
                first=false
            else
                tags_json+=","
            fi
            tags_json+="\"${key}\":\"${val}\""
        done
        tags_json+="}"
    fi

    # Build JSON payload
    local json="{\"id\":\"${id}\",\"name\":\"${name}\",\"host\":\"${host}\""
    json+=",\"port\":${port}"
    json+=",\"snmp_version\":\"${version}\""
    json+=",\"snmp_community\":\"${community}\""

    if [[ -n "$username" ]]; then
        json+=",\"snmp_username\":\"${username}\""
    fi
    if [[ -n "$auth_proto" ]]; then
        json+=",\"snmp_auth_protocol\":\"${auth_proto}\""
        json+=",\"snmp_auth_password\":\"${auth_pass}\""
    fi
    if [[ -n "$priv_proto" ]]; then
        json+=",\"snmp_priv_protocol\":\"${priv_proto}\""
        json+=",\"snmp_priv_password\":\"${priv_pass}\""
    fi

    json+=",\"tags\":${tags_json}}"

    if [[ "$VERBOSE" == true ]]; then
        info "Payload: ${json}"
    fi

    local response http_code
    response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/servers" \
        -H "Content-Type: application/json" \
        -d "${json}" 2>&1)

    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
        success "Registered ${name} (${id}) → ${host}"
        if [[ "$VERBOSE" == true ]]; then
            echo "$body" | head -5
        fi
        return 0
    else
        local detail
        detail=$(echo "$body" | grep -o '"detail":"[^"]*"' | cut -d'"' -f4 || echo "$body")
        err "Failed to register ${name} (${id}): ${detail}"
        return 1
    fi
}

# ── Interactive mode ──────────────────────────────────────────────────────────
interactive_mode() {
    header "Register a New Server"

    read -r -p "Server ID (hostname or IP): " SERVER_ID
    [[ -z "$SERVER_ID" ]] && { err "Server ID is required"; exit 1; }

    read -r -p "Display name: " SERVER_NAME
    [[ -z "$SERVER_NAME" ]] && SERVER_NAME="$SERVER_ID"

    read -r -p "SNMP host address: " SERVER_HOST
    [[ -z "$SERVER_HOST" ]] && SERVER_HOST="$SERVER_ID"

    read -r -p "SNMP port [${SNMP_PORT}]: " input
    SNMP_PORT="${input:-$SNMP_PORT}"

    read -r -p "SNMP version (2c or 3) [${SNMP_VERSION}]: " input
    SNMP_VERSION="${input:-$SNMP_VERSION}"
    # Reset v3 fields if switching versions
    SNMP_USERNAME="" AUTH_PROTO="" AUTH_PASS="" PRIV_PROTO="" PRIV_PASS=""

    if [[ "$SNMP_VERSION" == "3" ]]; then
        read -r -p "SNMPv3 username: " SNMP_USERNAME
        read -r -p "Auth protocol (MD5 or SHA, or enter to skip): " AUTH_PROTO
        if [[ -n "$AUTH_PROTO" ]]; then
            read -r -sp "Auth password: " AUTH_PASS; echo
            read -r -p "Privacy protocol (DES or AES, or enter to skip): " PRIV_PROTO
            if [[ -n "$PRIV_PROTO" ]]; then
                read -r -sp "Privacy password: " PRIV_PASS; echo
            fi
        fi
    else
        read -r -p "Community string [${SNMP_COMMUNITY}]: " input
        SNMP_COMMUNITY="${input:-$SNMP_COMMUNITY}"
    fi

    echo ""
    read -r -p "Tags (key=value, comma-separated, or enter to skip): " tags_input
    if [[ -n "$tags_input" ]]; then
        IFS=',' read -ra tag_parts <<< "$tags_input"
        for tp in "${tag_parts[@]}"; do
            TAG_PAIRS+=("$(echo "$tp" | xargs)")
        done
    fi

    read -r -p "Test SNMP connection before adding? [y/N]: " test_input
    [[ "$test_input" =~ ^[Yy]$ ]] && TEST_BEFORE_ADD=true

    echo ""
    echo -e "${BOLD}Summary:${NC}"
    echo "  ID:       ${SERVER_ID}"
    echo "  Name:     ${SERVER_NAME}"
    echo "  Host:     ${SERVER_HOST}"
    echo "  Port:     ${SNMP_PORT}"
    echo "  SNMP v:   ${SNMP_VERSION}"
    if [[ "$SNMP_VERSION" != "3" ]]; then
        echo "  Community: ${SNMP_COMMUNITY}"
    fi
    echo "  Tags:     ${TAG_PAIRS[*]:-none}"
    echo ""

    read -r -p "Register this server? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        warn "Aborted."
        exit 0
    fi

    register_server "$SERVER_ID" "$SERVER_NAME" "$SERVER_HOST" \
        "$SNMP_PORT" "$SNMP_VERSION" "$SNMP_COMMUNITY" \
        "${SNMP_USERNAME:-}" "${AUTH_PROTO:-}" "${AUTH_PASS:-}" \
        "${PRIV_PROTO:-}" "${PRIV_PASS:-}" \
        "${TAG_PAIRS[@]}"
}

# ── Bulk CSV import ───────────────────────────────────────────────────────────
bulk_import() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        err "File not found: ${file}"
        exit 1
    fi

    header "Bulk Import from ${file}"

    local total=0 created=0 failed=0 skipped=0
    local line_num=0

    while IFS= read -r line || [[ -n "$line" ]]; do
        line_num=$((line_num + 1))

        # Skip header row
        [[ "$line_num" -eq 1 ]] && continue
        # Skip empty lines
        [[ -z "$line" ]] && continue

        # Parse CSV (handles simple comma-separated values)
        IFS=',' read -r csv_id csv_name csv_host csv_port csv_version csv_community \
            csv_username csv_auth_proto csv_auth_pass csv_priv_proto csv_priv_pass csv_tags <<< "$line"

        # Trim whitespace
        csv_id=$(echo "$csv_id" | xargs)
        csv_name=$(echo "$csv_name" | xargs)
        csv_host=$(echo "$csv_host" | xargs)
        csv_port=$(echo "${csv_port:-161}" | xargs)
        csv_version=$(echo "${csv_version:-2c}" | xargs)
        csv_community=$(echo "${csv_community:-public}" | xargs)
        csv_tags=$(echo "${csv_tags:-}" | xargs)

        # Skip rows with empty required fields
        if [[ -z "$csv_id" || -z "$csv_name" || -z "$csv_host" ]]; then
            warn "Line ${line_num}: Skipping — missing id, name, or host"
            skipped=$((skipped + 1))
            continue
        fi

        # Convert tag format: "env=prod;type=web" → "env=prod" "type=web"
        local tag_args=()
        if [[ -n "$csv_tags" ]]; then
            IFS=';' read -ra tag_parts <<< "$csv_tags"
            for tp in "${tag_parts[@]}"; do
                tag_args+=("$(echo "$tp" | xargs)")
            done
        fi

        total=$((total + 1))

        if register_server "$csv_id" "$csv_name" "$csv_host" \
            "$csv_port" "$csv_version" "$csv_community" \
            "${csv_username}" "${csv_auth_proto}" "${csv_auth_pass}" \
            "${csv_priv_proto}" "${csv_priv_pass}" \
            "${tag_args[@]}" 2>/dev/null; then
            created=$((created + 1))
        else
            failed=$((failed + 1))
        fi

    done < "$file"

    echo ""
    header "Import Summary"
    echo "  Total:     ${total}"
    echo -e "  ${GREEN}Created:${NC}   ${created}"
    echo -e "  ${YELLOW}Skipped:${NC}   ${skipped}"
    if [[ $failed -gt 0 ]]; then
        echo -e "  ${RED}Failed:${NC}    ${failed}"
    fi
}

# ── List servers ──────────────────────────────────────────────────────────────
list_servers() {
    header "Registered Servers"

    local response
    response=$(curl -sf "${API_URL}/api/servers" 2>&1)

    local total
    total=$(echo "$response" | grep -o '"total":[0-9]*' | cut -d: -f2 || echo "0")

    echo -e "${BOLD}Total servers: ${total}${NC}\n"

    # Parse and display in a table
    echo -e "${BOLD}ID              NAME                HOST                STATUS    SNMP${NC}"
    echo "─────────────── ─────────────────── ─────────────────── ───────── ────"

    # Try python3 first, fall back to jq, then to grep-based parsing
    if command -v python3 &>/dev/null; then
        echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('servers', []):
    sid = s['id'][:15].ljust(15)
    name = s['name'][:19].ljust(19)
    host = s['host'][:19].ljust(19)
    status = s.get('status', 'unknown')
    status_map = {'online': '\033[0;32monline\033[0m', 'offline': '\033[0;31moffline\033[0m', 'degraded': '\033[0;33mdegraded\033[0m'}
    status_str = status_map.get(status, status)
    snmp = 'v' + s.get('snmp_version', '2c')
    print(f'{sid} {name} {host} {status_str:<20s} {snmp}')
"
    elif command -v jq &>/dev/null; then
        echo "$response" | jq -r '.servers[] | "\(.id | .[0:15])  \(.name | .[0:19])  \(.host | .[0:19])  \(.status)  v\(.snmp_version)"'
    else
        warn "Install python3 or jq for formatted output"
        echo "$response" | grep -o '"id":"[^"]*"\|"name":"[^"]*"\|"host":"[^"]*"\|"status":"[^"]*"' | paste - - - - | sed 's/"id":"//;s/","name":"/  /;s/","host":"/  /;s/","status":"/  /;s/"//g'
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    parse_args "$@"

    # Default to interactive if no command given
    [[ -z "$COMMAND" ]] && COMMAND="interactive"

    check_api

    case "$COMMAND" in
        interactive)
            interactive_mode
            ;;
        single)
            if [[ -z "$SERVER_ID" || -z "$SERVER_NAME" || -z "$SERVER_HOST" ]]; then
                err "single mode requires --id, --name, and --host"
                usage
                exit 1
            fi
            if [[ "$TEST_BEFORE_ADD" == true ]]; then
                # We can't test before the server is registered, so register first
                register_server "$SERVER_ID" "$SERVER_NAME" "$SERVER_HOST" \
                    "$SNMP_PORT" "$SNMP_VERSION" "$SNMP_COMMUNITY" \
                    "${SNMP_USERNAME:-}" "${AUTH_PROTO:-}" "${AUTH_PASS:-}" \
                    "${PRIV_PROTO:-}" "${PRIV_PASS:-}" \
                    "${TAG_PAIRS[@]}" && test_connection "$SERVER_ID"
            else
                register_server "$SERVER_ID" "$SERVER_NAME" "$SERVER_HOST" \
                    "$SNMP_PORT" "$SNMP_VERSION" "$SNMP_COMMUNITY" \
                    "${SNMP_USERNAME:-}" "${AUTH_PROTO:-}" "${AUTH_PASS:-}" \
                    "${PRIV_PROTO:-}" "${PRIV_PASS:-}" \
                    "${TAG_PAIRS[@]}"
            fi
            ;;
        bulk)
            if [[ -z "$FILE" ]]; then
                err "bulk mode requires --file <path>"
                usage
                exit 1
            fi
            bulk_import "$FILE"
            ;;
        list)
            list_servers
            ;;
        *)
            err "Unknown command: ${COMMAND}"
            usage
            exit 1
            ;;
    esac
}

main "$@"
