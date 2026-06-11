# Standard Operating Procedure (SOP)
## Egli2.0 — AI-Powered Infrastructure Monitoring Platform

| Field | Value |
|-------|-------|
| **Document ID** | SOP-EGLI2-001 |
| **Version** | 1.0 |
| **Effective Date** | June 2, 2026 |
| **Author** | Egli2.0 Operations Team |
| **Review Cycle** | Quarterly |
| **Classification** | Internal Use Only |

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Roles & Responsibilities](#3-roles--responsibilities)
4. [Prerequisites & System Requirements](#4-prerequisites--system-requirements)
5. [SOP-01: Initial Installation & Deployment](#5-sop-01-initial-installation--deployment)
6. [SOP-02: Daily Operations & Monitoring](#6-sop-02-daily-operations--monitoring)
7. [SOP-03: Server Management (Add/Remove/Update)](#7-sop-03-server-management-addremoveupdate)
8. [SOP-04: Alert Management & Response](#8-sop-04-alert-management--response)
9. [SOP-05: AI Features & LLM Management](#9-sop-05-ai-features--llm-management)
10. [SOP-06: Backup & Recovery](#10-sop-06-backup--recovery)
11. [SOP-07: Updates & Patching](#11-sop-07-updates--patching)
12. [SOP-08: Troubleshooting Guide](#12-sop-08-troubleshooting-guide)
13. [SOP-09: Emergency Procedures](#13-sop-09-emergency-procedures)
14. [SOP-10: Security Hardening](#14-sop-10-security-hardening)
15. [Appendix A: API Reference Quick Card](#appendix-a-api-reference-quick-card)
16. [Appendix B: Configuration Reference](#appendix-b-configuration-reference)
17. [Appendix C: Contact & Escalation Matrix](#appendix-c-contact--escalation-matrix)

---

## 1. Purpose & Scope

### 1.1 Purpose

This Standard Operating Procedure provides step-by-step instructions for deploying, operating, maintaining, and troubleshooting the Egli2.0 infrastructure monitoring platform. It ensures consistent, repeatable processes across all environments (development, staging, production).

### 1.2 Scope

This SOP covers:

- **Deployment** — Fresh installation on Ubuntu 24.04 LTS servers
- **Operations** — Daily monitoring, alert response, and health checks
- **Management** — Server registration, configuration changes, and LLM model management
- **Maintenance** — Backups, updates, patching, and capacity planning
- **Recovery** — Disaster recovery, rollback, and emergency procedures
- **Security** — Hardening, access control, and compliance

### 1.3 Out of Scope

- Application code development (see CONTRIBUTING.md)
- Network infrastructure setup (firewall rules at the network level)
- Cloud provider provisioning (varies by environment)

### 1.4 Audience

| Role | Sections Relevant |
|------|-------------------|
| System Administrators | All sections |
| DevOps Engineers | Sections 5, 6, 7, 11, 12, 13 |
| NOC Operators | Sections 6, 8 |
| Security Team | Sections 10, 14 |
| Management | Sections 1, 3, 6 (summary) |

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Egli2.0 Platform                                │
│                                                                         │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌─────────────────┐  │
│  │ Frontend  │──▶│ Backend   │──▶│ InfluxDB  │   │ Ollama (LLM)   │  │
│  │ React/Vite│   │ FastAPI   │   │ Time-Series│   │ llama3.2       │  │
│  │ Port 80   │   │ Port 8000 │   │ Port 8086 │   │ Port 11434     │  │
│  └─────┬─────┘   └─────┬─────┘   └───────────┘   └────────┬────────┘  │
│        │               │                                    │           │
│        │    ┌──────────▼──────────┐                         │           │
│        └────│   WebSocket (WS)    │◀────────────────────────┘           │
│             │   Real-time Updates │   AI Analysis & Chat                │
│             └──────────┬──────────┘                                     │
│                        │                                                │
│             ┌──────────▼──────────┐                                    │
│             │   SNMP Poller       │                                    │
│             │   Background Task   │                                    │
│             │   Polls servers     │                                    │
│             │   every 60 seconds  │                                    │
│             └──────────┬──────────┘                                    │
│                        │                                                │
└────────────────────────┼────────────────────────────────────────────────┘
                         │
                         ▼ SNMP (UDP/161)
            ┌────────────────────────┐
            │   Managed Servers      │
            │   (1 - 200+ servers)   │
            └────────────────────────┘
```

### 2.2 Component Summary

| Service | Technology | Container Name | Port | Purpose |
|---------|-----------|---------------|------|---------|
| Frontend | React 18 + Vite + Tailwind | egli2-frontend | 80, 443 | NOC dashboard with real-time WebSocket updates |
| Backend | Python FastAPI | egli2-backend | 8000 | REST API, WebSocket, alert evaluation, AI integration |
| Database | InfluxDB 2.7 | egli2-influxdb | 8086 | Time-series metric storage |
| LLM | Ollama (llama3.2) | egli2-ollama | 11434 | Local AI inference — zero cloud dependencies |
| Poller | Python (easysnmp) | egli2-poller | — | Background SNMP metric collection |
| Proxy | Nginx Alpine | (in frontend) | 80 | Reverse proxy + static file serving |

### 2.3 Data Flow

```
1. SNMP Poller queries managed servers every 60 seconds
2. Metrics stored in InfluxDB (time-series)
3. Backend evaluates metrics against thresholds → triggers alerts
4. WebSocket broadcasts live metrics + alerts to all connected dashboards
5. AI (Ollama) analyzes alerts on-demand for root cause analysis
6. Frontend renders real-time dashboard with charts, alerts, and AI chat
```

### 2.4 Network Requirements

| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 22 | TCP | Inbound | SSH access for administration |
| 80 | TCP | Inbound | HTTP (dashboard access) |
| 443 | TCP | Inbound | HTTPS (if SSL configured) |
| 161 | UDP | Outbound | SNMP polling to managed servers |
| 8086 | TCP | Internal | InfluxDB (not exposed externally) |
| 11434 | TCP | Internal | Ollama LLM (not exposed externally) |

---

## 3. Roles & Responsibilities

### 3.1 RACI Matrix

| Activity | System Admin | DevOps | NOC Operator | Security |
|----------|:-----------:|:------:|:------------:|:--------:|
| Initial deployment | R/A | C | I | C |
| Daily health monitoring | I | C | R/A | I |
| Server registration | R | A | R | I |
| Alert response (P1/P2) | R | A | R | I |
| Alert response (P3/P4) | I | C | R/A | I |
| Backup execution | A | R | I | C |
| Recovery procedures | R/A | R | I | I |
| Security hardening | C | R | I | A |
| System updates/patching | R | A | I | C |
| LLM model management | C | R/A | I | I |
| Capacity planning | R/A | R | I | I |

*R = Responsible, A = Accountable, C = Consulted, I = Informed*

### 3.2 On-Call Responsibilities

- **P1 (Critical)**: Dashboard down, data loss → Immediate response (< 15 min)
- **P2 (High)**: Multiple alerts failing, Ollama down → Response (< 1 hour)
- **P3 (Medium)**: Single server unreachable, degraded performance → Next business day
- **P4 (Low)**: Cosmetic issues, minor warnings → Scheduled maintenance window

---

## 4. Prerequisites & System Requirements

### 4.1 Server Requirements

| Scale | Servers | RAM | CPU | Storage | Network |
|-------|---------|-----|-----|---------|---------|
| Small | 1–10 | 8 GB | 2 vCPU | 20 GB SSD | 100 Mbps |
| Medium | 10–50 | 16 GB | 4 vCPU | 50 GB SSD | 1 Gbps |
| Large | 50–200 | 32 GB | 8 vCPU | 100 GB SSD | 1 Gbps |

### 4.2 Software Requirements

| Component | Minimum Version | Recommended |
|-----------|----------------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | 24.0 | Latest stable |
| Docker Compose | 2.0 | Latest stable |
| Python | 3.11 | 3.12 |
| Node.js | 18 | 20 LTS |
| Git | 2.30 | Latest |

### 4.3 Managed Server Requirements (SNMP Targets)

| Requirement | Details |
|-------------|---------|
| SNMP daemon | `snmpd` installed and running |
| SNMP version | v2c (community string) or v3 (auth/priv) |
| UDP port | 161 open and reachable from monitoring server |
| OIDs | Standard UCD-SNMP-MIB (CPU, memory, disk, network) |

### 4.4 Account Requirements

| Account | Permissions Needed |
|---------|-------------------|
| Deployment user | `sudo` on the monitoring server |
| Docker group | Added to `docker` group (no sudo for docker commands) |
| Git access | Read access to the Egli2.0 repository |

---

## 5. SOP-01: Initial Installation & Deployment

### 5.1 Objective

Deploy a fresh Egli2.0 instance on an Ubuntu 24.04 LTS server.

### 5.2 Estimated Time

- **Fresh install**: 15–30 minutes
- **With Ollama model pull**: +10–20 minutes (CPU) or +2–5 minutes (GPU)

### 5.3 Procedure

#### Step 1: Prepare the Server

```bash
# SSH into the Ubuntu server
ssh root@<SERVER_IP>

# Update the system
apt-get update && apt-get upgrade -y

# Verify system meets requirements
free -h          # Need 8 GB+ RAM
df -h            # Need 20 GB+ free disk
uname -m         # Need amd64 or arm64
```

#### Step 2: Clone the Repository

```bash
# Clone to /opt (standard location)
cd /opt
git clone https://github.com/yogi8547/Egli2.0-.git Egli2.0
cd Egli2.0
```

#### Step 3: Run the Deploy Script

```bash
# Make executable and run
chmod +x deploy-ubuntu.sh
sudo ./deploy-ubuntu.sh
```

**What the script does (10 phases):**

| Phase | Action | Time |
|-------|--------|------|
| 0 | Pre-flight checks (root, OS, arch, memory, disk, internet) | ~5s |
| 1 | System update & prerequisites (git, curl, ufw) | ~30s |
| 2 | Docker Engine installation | ~60s |
| 3 | Docker configuration (DNS, buildkit, systemd) | ~5s |
| 4 | Firewall (UFW — SSH, HTTP, HTTPS) | ~5s |
| 5 | Project deployment (copy or git clone) | ~10s |
| 6 | Configuration (.env with secure random keys) | ~5s |
| 7 | Service startup with health check verification | ~60s |
| 8 | systemd services (auto-start, health timer, alerts) | ~10s |
| 9 | Ollama LLM model pull (llama3.2) | ~300s (CPU) |
| 10 | Full verification (containers, API, dashboard) | ~10s |

#### Step 4: Verify Deployment

```bash
# Check all containers are running
docker compose ps

# Expected output — all should show "Up (healthy)":
# egli2-backend     Up (healthy)
# egli2-frontend    Up (healthy)
# egli2-influxdb    Up (healthy)
# egli2-ollama      Up (healthy)
# egli2-poller      Up (healthy)

# Test the API
curl http://localhost/api/health
# Expected: {"status":"ok","version":"1.0.0","influxdb_connected":true,"ollama_connected":true}

# Test the dashboard
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# Expected: 200
```

#### Step 5: Access the Dashboard

- **Dashboard**: `http://<SERVER_IP>/`
- **API Docs**: `http://<SERVER_IP>:8000/docs`
- **API Health**: `http://<SERVER_IP>/api/health`

#### Step 6: (Optional) Configure Alerts

```bash
sudo ./systemd/install.sh --configure-alerts
```

### 5.4 Custom Installation Path

```bash
# Install to a custom directory
sudo ./deploy-ubuntu.sh /srv/egli2

# Clone from a specific Git repository
REPO_URL=https://github.com/your-org/Egli2.0.git sudo ./deploy-ubuntu.sh
```

### 5.5 Rollback (If Deployment Fails)

```bash
# Uninstall completely
sudo ./deploy-ubuntu.sh --uninstall

# Or manually
cd /opt/Egli2.0
docker compose down -v
sudo rm -rf /opt/Egli2.0
```

---

## 6. SOP-02: Daily Operations & Monitoring

### 6.1 Objective

Ensure the monitoring platform itself is healthy and providing accurate data.

### 6.2 Daily Health Check Routine

Perform at the start of each business day:

```bash
# 1. Check all services are healthy
docker compose ps

# 2. Check API health
curl -s http://localhost/api/health | python3 -m json.tool

# 3. Check active alerts
curl -s http://localhost/api/alerts/active | python3 -m json.tool

# 4. Check registered servers
curl -s http://localhost/api/servers | python3 -m json.tool

# 5. Check disk usage
df -h /opt/Egli2.0

# 6. Check system resources
docker stats --no-stream

# 7. Check recent logs for errors
docker compose logs --tail=50 backend | grep -i error
docker compose logs --tail=50 poller | grep -i error
```

### 6.3 Automated Health Monitoring

The platform includes an automated health check that runs every 5 minutes via systemd timer:

```bash
# Check health timer status
systemctl status egli2-health.timer

# View health check logs
journalctl -u egli2-health.service --since "1 hour ago"

# Manually trigger a health check
sudo ./systemd/egli2-health.sh /opt/Egli2.0
```

**Health checks performed:**

| Check | Failure Action |
|-------|---------------|
| Docker daemon running | Alert sent |
| All containers running | Auto-restart unhealthy containers |
| API health endpoint (HTTP 200) | Alert sent |
| Dashboard accessible | Warning logged |
| Disk space (< 1 GB) | Warning logged |
| Available memory (< 512 MB) | Warning logged |

### 6.4 Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold | Check Command |
|--------|-------------------|-------------------|---------------|
| Disk usage | > 80% | > 95% | `df -h` |
| Memory usage | > 80% | > 95% | `free -h` |
| Docker container count | > 20 | — | `docker ps -q \| wc -l` |
| InfluxDB disk usage | > 5 GB | > 10 GB | `docker exec egli2-influxdb du -sh /var/lib/influxdb2` |
| API response time | > 2s | > 5s | `curl -o /dev/null -s -w '%{time_total}' http://localhost/api/health` |
| Ollama model load time | > 10s | > 30s | Check Ollama logs |

### 6.5 Log Locations

| Component | Log Command |
|-----------|-------------|
| Backend | `docker compose logs backend` |
| Frontend | `docker compose logs frontend` |
| InfluxDB | `docker compose logs influxdb` |
| Ollama | `docker compose logs ollama` |
| Poller | `docker compose logs poller` |
| Health checks | `journalctl -u egli2-health.service` |
| Main service | `journalctl -u egli2 -f` |
| Deployment | `cat /opt/Egli2.0/deploy-ubuntu.log` |

---

## 7. SOP-03: Server Management (Add/Remove/Update)

### 7.1 Objective

Register, update, and remove monitored servers in the Egli2.0 platform.

### 7.2 Prerequisites

- SNMP daemon installed and running on target servers
- Network connectivity (UDP port 161) from Egli2.0 server to targets
- API access (curl or the `scripts/add-server.sh` helper)

### 7.3 Adding a Single Server (SNMPv2c)

#### Option A: Using the Helper Script (Recommended)

```bash
cd /opt/Egli2.0
./scripts/add-server.sh single \
    --id web-01 \
    --name "Production Web 01" \
    --host 192.168.1.101 \
    --community mySecretString \
    --test \
    --tags env=prod,type=web
```

#### Option B: Using curl

```bash
curl -X POST http://localhost/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "web-01",
    "name": "Production Web 01",
    "host": "192.168.1.101",
    "snmp_version": "2c",
    "snmp_community": "mySecretString",
    "tags": {"environment": "production", "type": "web"}
  }'
```

### 7.4 Adding a Server with SNMPv3

```bash
./scripts/add-server.sh single \
    --id secure-db-01 \
    --name "Secure Database" \
    --host 10.0.1.50 \
    --version 3 \
    --username monitor \
    --auth-proto SHA \
    --auth-pass "authKey123" \
    --priv-proto AES \
    --priv-pass "privKey456" \
    --test
```

### 7.5 Bulk Import from CSV

#### Step 1: Prepare the CSV File

Create `servers.csv`:

```csv
id,name,host,port,snmp_version,snmp_community,snmp_username,snmp_auth_protocol,snmp_auth_password,snmp_priv_protocol,snmp_priv_password,tags
web-01,Web Server 01,192.168.1.101,161,2c,public,,,,,env=prod;type=web
web-02,Web Server 02,192.168.1.102,161,2c,public,,,,,env=prod;type=web
db-01,Database Primary,10.0.1.50,161,3,,dbmon,SHA,authPass123,AES,privPass456,env=prod;type=db
```

#### Step 2: Import

```bash
./scripts/add-server.sh bulk --file servers.csv --skip-duplicates
```

### 7.6 Updating a Server

```bash
curl -X PUT http://localhost/api/servers/web-01 \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.201",
    "snmp_community": "newCommunity"
  }'
```

### 7.7 Testing SNMP Connection

```bash
# Test after registration
./scripts/add-server.sh list
curl -X POST http://localhost/api/servers/web-01/test-connection
```

**Expected success response:**

```json
{
  "success": true,
  "message": "SNMP connected successfully to Web Server 01",
  "sys_name": "web-01.example.com",
  "uptime_seconds": 864000,
  "duration_ms": 45.2
}
```

### 7.8 Removing a Server

```bash
curl -X DELETE http://localhost/api/servers/web-01
```

### 7.9 Exporting Server Configuration (Backup)

```bash
curl -s http://localhost/api/servers/export | python3 -m json.tool > servers-backup.json
```

---

## 8. SOP-04: Alert Management & Response

### 8.1 Objective

Ensure timely detection, triage, and resolution of infrastructure alerts.

### 8.2 Alert Severity Levels

| Level | Color | Response Time | Description |
|-------|-------|---------------|-------------|
| **Critical** | 🔴 Red | < 15 minutes | Server down, CPU > 90%, disk > 95%, memory > 95% |
| **Warning** | 🟡 Yellow | < 1 hour | CPU > 75%, disk > 85%, memory > 80% |
| **Info** | 🔵 Blue | Next business day | Informational, non-urgent |

### 8.3 Default Thresholds

| Metric | Warning | Critical | Configurable Via |
|--------|---------|----------|-----------------|
| CPU | 75% | 90% | `.env` → `CPU_WARN`, `CPU_CRIT` |
| Memory | 80% | 95% | `.env` → `MEM_WARN`, `MEM_CRIT` |
| Disk | 85% | 95% | `.env` → `DISK_WARN`, `DISK_CRIT` |

### 8.4 Alert Response Procedure

#### Step 1: Acknowledge the Alert

```bash
# View active alerts
curl -s http://localhost/api/alerts/active | python3 -m json.tool

# Acknowledge a specific alert
curl -X POST http://localhost/api/alerts/<ALERT_ID>/acknowledge
```

#### Step 2: Get AI-Powered Analysis

```bash
# Get predefined remediation actions (instant)
curl -X POST "http://localhost/api/alerts/<ALERT_ID>/remediation-actions"

# Get AI deep analysis (may take 10–30 seconds)
curl -X POST "http://localhost/api/alerts/<ALERT_ID>/remediate?deep=true"
```

#### Step 3: Execute Remediation (If Applicable)

```bash
# List available actions
curl -X POST http://localhost/api/alerts/<ALERT_ID>/remediation-actions

# Execute a specific action
curl -X POST "http://localhost/api/alerts/<ALERT_ID>/execute-action?action=kill_top_cpu_process"
```

#### Step 4: Resolve the Alert

```bash
curl -X POST http://localhost/api/alerts/<ALERT_ID>/resolve
```

### 8.5 Alert Escalation Matrix

| Scenario | Initial Action | Escalation |
|----------|---------------|------------|
| Single server high CPU | AI analysis → remediate | If unresolved in 30 min → escalate to team lead |
| Multiple servers critical | Immediate investigation | Page on-call engineer |
| Dashboard/backend down | Restart service | If down > 15 min → escalate to management |
| Data loss / InfluxDB failure | Restore from backup | Page infrastructure team |

### 8.6 False Positive Handling

If an alert is determined to be a false positive:

1. Resolve the alert
2. Adjust thresholds if needed:
   ```bash
   # Edit .env
   nano /opt/Egli2.0/.env
   # Change: CPU_WARN=75 → CPU_WARN=85
   # Restart backend
   docker compose restart backend
   ```

---

## 9. SOP-05: AI Features & LLM Management

### 9.1 Objective

Manage the local Ollama LLM that powers AI analysis, chat, and remediation suggestions.

### 9.2 Default Model

- **Model**: `llama3.2` (2B parameters)
- **Runtime**: CPU (no GPU required)
- **RAM Usage**: ~2 GB
- **Response Time**: 5–15 seconds

### 9.3 Changing the LLM Model

```bash
# Step 1: Pull a new model
docker exec egli2-ollama ollama pull mistral

# Step 2: Update .env
cd /opt/Egli2.0
sed -i 's/OLLAMA_MODEL=llama3.2/OLLAMA_MODEL=mistral/' .env

# Step 3: Restart backend
docker compose restart backend

# Step 4: Verify
curl -s http://localhost/api/ai/models
```

### 9.4 Available Models

| Model | Parameters | RAM | Speed | Quality |
|-------|-----------|-----|-------|---------|
| llama3.2 | 2B | ~2 GB | Fast | Good |
| mistral | 7B | ~5 GB | Medium | Better |
| deepseek-r1:7b | 7B | ~5 GB | Medium | Best for analysis |

### 9.5 GPU Acceleration (Optional)

If NVIDIA GPU is available:

```bash
# Install NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Edit docker-compose.yml — uncomment the deploy.resources block under ollama
# Restart
docker compose up -d ollama
```

### 9.6 Testing AI Features

```bash
# Test AI health report
curl -s http://localhost/api/ai/health

# Test AI chat
curl -X POST http://localhost/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the overall health of my infrastructure?"}'
```

---

## 10. SOP-06: Backup & Recovery

### 10.1 Objective

Protect against data loss and enable recovery from failures.

### 10.2 What to Backup

| Component | Data | Location | Priority |
|-----------|------|----------|----------|
| Configuration | `.env`, `docker-compose.yml` | `/opt/Egli2.0/` | **Critical** |
| InfluxDB | All metric data | Docker volume `egli2-influxdb-data` | **Critical** |
| Ollama | Model files | Docker volume `egli2-ollama-data` | Medium |
| Application | Source code | `/opt/Egli2.0/` | Low (in Git) |

### 10.3 Backup Procedure

#### Daily Backup (Automated)

Create `/opt/Egli2.0/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/backups/egli2"
DATE=$(date +%Y%m%d_%H%M%S)
INSTALL_DIR="/opt/Egli2.0"

mkdir -p "$BACKUP_DIR"

echo "[1/4] Backing up configuration..."
cp "$INSTALL_DIR/.env" "$BACKUP_DIR/env_$DATE"
cp "$INSTALL_DIR/docker-compose.yml" "$BACKUP_DIR/compose_$DATE"
cp -r "$INSTALL_DIR/nginx/" "$BACKUP_DIR/nginx_$DATE"

echo "[2/4] Backing up InfluxDB..."
docker exec egli2-influxdb influx backup /tmp/backup_$DATE
docker cp egli2-influxdb:/tmp/backup_$DATE "$BACKUP_DIR/influx_$DATE"
docker exec egli2-influxdb rm -rf /tmp/backup_$DATE

echo "[3/4] Backing up server registrations..."
curl -s http://localhost/api/servers/export > "$BACKUP_DIR/servers_$DATE.json"

echo "[4/4] Creating archive..."
tar -czf "$BACKUP_DIR/egli2_backup_$DATE.tar.gz" \
    "$BACKUP_DIR/env_$DATE" \
    "$BACKUP_DIR/compose_$DATE" \
    "$BACKUP_DIR/nginx_$DATE" \
    "$BACKUP_DIR/influx_$DATE" \
    "$BACKUP_DIR/servers_$DATE.json"

# Cleanup old backups (keep 7 days)
find "$BACKUP_DIR" -name "egli2_backup_*.tar.gz" -mtime +7 -delete

echo "Backup complete: $BACKUP_DIR/egli2_backup_$DATE.tar.gz"
```

Set up a daily cron job:

```bash
chmod +x /opt/Egli2.0/scripts/backup.sh
echo "0 2 * * * /opt/Egli2.0/scripts/backup.sh >> /var/log/egli2-backup.log 2>&1" | crontab -
```

### 10.4 Recovery Procedure

#### Restore InfluxDB from Backup

```bash
# On the new/restored server
BACKUP_FILE="/opt/backups/egli2/influx_20260602_020000"

# Copy backup into container
docker cp "$BACKUP_FILE" egli2-influxdb:/tmp/restore

# Restore
docker exec egli2-influxdb influx restore /tmp/restore

# Verify
curl -s http://localhost/api/metrics | python3 -m json.tool
```

#### Restore Server Registrations

```bash
curl -s http://localhost/api/servers/export > /dev/null 2>&1  # Verify API is up
cat servers-backup.json | python3 -c "
import sys, json, requests
servers = json.load(sys.stdin)
for s in servers:
    r = requests.post('http://localhost/api/servers', json=s)
    print(f'{s[\"id\"]}: {r.status_code}')
"
```

#### Full Disaster Recovery

```bash
# 1. Provision a new Ubuntu 24.04 server
# 2. Clone the repository
cd /opt
git clone https://github.com/yogi8547/Egli2.0-.git Egli2.0
cd Egli2.0

# 3. Restore configuration
cp /path/to/backup/env_* .env
cp /path/to/backup/compose_* docker-compose.yml
cp -r /path/to/backup/nginx_* nginx/

# 4. Start services (without InfluxDB data)
docker compose up -d

# 5. Restore InfluxDB data
docker cp /path/to/backup/influx_* egli2-influxdb:/tmp/restore
docker exec egli2-influxdb influx restore /tmp/restore

# 6. Verify
curl http://localhost/api/health
curl http://localhost/api/servers
curl http://localhost/api/metrics
```

---

## 11. SOP-07: Updates & Patching

### 11.1 Objective

Keep the Egli2.0 platform updated with security patches and feature improvements.

### 11.2 Update Procedure

#### Step 1: Create a Backup

```bash
/opt/Egli2.0/scripts/backup.sh
```

#### Step 2: Pull Latest Changes

```bash
cd /opt/Egli2.0
git stash  # Save any local changes
git pull origin master
```

#### Step 3: Rebuild and Restart

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

#### Step 4: Verify

```bash
docker compose ps
curl http://localhost/api/health
curl -s http://localhost/api/servers | python3 -m json.tool
```

#### Step 5: (Optional) Update LLM Model

```bash
docker exec egli2-ollama ollama pull llama3.2
docker compose restart backend
```

### 11.3 Rollback Update

```bash
# Revert to previous version
git log --oneline -5  # Find the commit hash
git checkout <previous-commit-hash>

# Rebuild
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 11.4 Scheduled Maintenance Window

| Activity | Frequency | Window | Downtime |
|----------|-----------|--------|----------|
| OS security patches | Monthly | Sunday 02:00–04:00 UTC | None (live patching) |
| Docker updates | Quarterly | Sunday 02:00–04:00 UTC | 5–10 minutes |
| Egli2.0 updates | As released | Business hours (low traffic) | 5–10 minutes |
| LLM model updates | As available | Business hours | None (hot swap) |

---

## 12. SOP-08: Troubleshooting Guide

### 12.1 Common Issues & Solutions

#### Issue: Backend Container Won't Start

```bash
# Check logs
docker compose logs backend --tail=100

# Common causes:
# 1. InfluxDB not ready — wait and retry
# 2. Port 8000 already in use
# 3. Missing .env file

# Fix: Restart InfluxDB first, then backend
docker compose restart influxdb
sleep 10
docker compose up -d backend
```

#### Issue: No Metrics Appearing

```bash
# Check if poller is running
docker compose logs poller --tail=50

# Check InfluxDB connectivity
docker exec egli2-backend python -c "
from app.database import influx_client
print(influx_client.health())
"

# Check registered servers
curl -s http://localhost/api/servers | python3 -m json.tool

# Manually seed mock data if needed
docker exec egli2-backend python mock_data/seed.py
```

#### Issue: Ollama AI Not Responding

```bash
# Check if Ollama is running
docker compose ps ollama

# Check model availability
docker exec egli2-ollama ollama list

# If model is missing, pull it
docker exec egli2-ollama ollama pull llama3.2

# Test AI endpoint
curl -s http://localhost/api/ai/health
```

#### Issue: SNMP Polling Fails

```bash
# Test SNMP from the monitoring server
snmpwalk -v2c -c public <TARGET_IP> 1.3.6.1.2.1.1

# If timeout, check:
# 1. Target server has snmpd running: systemctl status snmpd
# 2. Firewall allows UDP 161: ufw status
# 3. Community string matches: cat /etc/snmp/snmpd.conf
```

#### Issue: Dashboard Shows Blank

```bash
# Check frontend container
docker compose logs frontend --tail=50

# Check if backend API is accessible from frontend
docker exec egli2-frontend wget -qO- http://backend:8000/api/health

# Rebuild frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

### 12.2 Log Analysis Commands

```bash
# Find errors in all services
docker compose logs 2>&1 | grep -i error | tail -20

# Check last 100 lines of backend logs
docker compose logs --tail=100 backend

# Follow logs in real-time
docker compose logs -f backend

# Check systemd service logs
journalctl -u egli2 --since "1 hour ago" --no-pager

# Check Docker resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

---

## 13. SOP-09: Emergency Procedures

### 13.1 Emergency: Complete Platform Down

**Severity**: P1 — Immediate response required

```bash
# Step 1: Check if Docker is running
systemctl status docker

# Step 2: Check all containers
docker compose ps

# Step 3: Restart everything
cd /opt/Egli2.0
docker compose down
docker compose up -d

# Step 4: Verify health
sleep 15
curl http://localhost/api/health

# Step 5: If still down, check logs
docker compose logs --tail=50
```

### 13.2 Emergency: Data Loss / InfluxDB Corruption

```bash
# Step 1: Stop the stack
docker compose down

# Step 2: Remove corrupted data
docker volume rm egli2-influxdb-data

# Step 3: Restart (fresh InfluxDB)
docker compose up -d influxdb
sleep 15

# Step 4: Restore from backup
docker cp /path/to/backup/influx_* egli2-influxdb:/tmp/restore
docker exec egli2-influxdb influx restore /tmp/restore

# Step 5: Start remaining services
docker compose up -d

# Step 6: Re-seed mock data if needed
docker exec egli2-backend python mock_data/seed.py
```

### 13.3 Emergency: Security Breach Response

```bash
# Step 1: Isolate the server
sudo ufw deny all
sudo ufw allow ssh  # Keep SSH access

# Step 2: Check for unauthorized access
last -20
sudo cat /var/log/auth.log | grep "Failed password" | tail -20
docker compose logs backend | grep -i "unauthorized"

# Step 3: Rotate all secrets
openssl rand -hex 32  # New SECRET_KEY
openssl rand -hex 16  # New INFLUXDB_TOKEN
# Update .env with new values

# Step 4: Restart with new credentials
docker compose down
docker compose up -d

# Step 5: Notify security team and document incident
```

### 13.4 Emergency: Uninstall / Clean Removal

```bash
sudo ./deploy-ubuntu.sh --uninstall
# Or with custom path:
sudo ./deploy-ubuntu.sh --uninstall /opt/Egli2.0
```

---

## 14. SOP-10: Security Hardening

### 14.1 Post-Installation Security Checklist

| # | Task | Command | Status |
|---|------|---------|--------|
| 1 | Change default SECRET_KEY | `sed -i 's/change-me/$(openssl rand -hex 32)/' .env` | ☐ |
| 2 | Change InfluxDB token | `sed -i 's/admin-token/$(openssl rand -hex 16)/' .env` | ☐ |
| 3 | Use SNMPv3 instead of v2c | Update server registrations | ☐ |
| 4 | Enable UFW firewall | `ufw enable && ufw status` | ☐ |
| 5 | Restrict API access | Configure Nginx allow rules | ☐ |
| 6 | Enable HTTPS | Add SSL certificates to Nginx | ☐ |
| 7 | Disable InfluxDB external access | Ensure port 8086 is not exposed | ☐ |
| 8 | Disable Ollama external access | Ensure port 11434 is not exposed | ☐ |
| 9 | Set up log rotation | `logrotate -d /etc/logrotate.conf` | ☐ |
| 10 | Enable automatic security updates | `sudo unattended-upgrades --dry-run` | ☐ |

### 14.2 SNMPv3 Configuration

SNMPv3 provides authentication and encryption. Use it for all production servers:

```bash
# On target server — configure snmpd for SNMPv3
sudo nano /etc/snmp/snmpd.conf

# Add:
# createUser monitor SHA authPassword123 AES privPassword456
# rwuser monitor

sudo systemctl restart snmpd

# Register in Egli2.0 with SNMPv3
curl -X POST http://localhost/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "prod-web-01",
    "name": "Production Web 01",
    "host": "192.168.1.101",
    "snmp_version": "3",
    "snmp_username": "monitor",
    "snmp_auth_protocol": "SHA",
    "snmp_auth_password": "authPassword123",
    "snmp_priv_protocol": "AES",
    "snmp_priv_password": "privPassword456"
  }'
```

### 14.3 HTTPS/SSL Setup

```bash
# 1. Obtain SSL certificate (Let's Encrypt example)
sudo apt-get install certbot
sudo certbot certonly --standalone -d monitor.example.com

# 2. Copy certificates
sudo mkdir -p /opt/Egli2.0/certs
sudo cp /etc/letsencrypt/live/monitor.example.com/fullchain.pem /opt/Egli2.0/certs/
sudo cp /etc/letsencrypt/live/monitor.example.com/privkey.pem /opt/Egli2.0/certs/

# 3. Update Nginx config (nginx/nginx.conf)
# Add SSL server block

# 4. Restart
docker compose restart frontend
```

### 14.4 Automated Security Updates

```bash
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Appendix A: API Reference Quick Card

### Server Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/servers` | List all servers |
| `POST` | `/api/servers` | Register a server |
| `GET` | `/api/servers/{id}` | Get server details |
| `PUT` | `/api/servers/{id}` | Update a server |
| `DELETE` | `/api/servers/{id}` | Remove a server |
| `POST` | `/api/servers/{id}/test-connection` | Test SNMP connectivity |
| `POST` | `/api/servers/bulk-import` | Import multiple servers |
| `GET` | `/api/servers/export` | Export all servers as JSON |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metrics` | Current metrics for all servers |
| `GET` | `/api/metrics/{server}` | Metrics for a specific server |
| `GET` | `/api/metrics/history/{server}/{measurement}` | Historical data |
| `GET` | `/api/overview` | Dashboard overview stats |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/alerts` | List all alerts |
| `GET` | `/api/alerts/active` | Active alerts only |
| `POST` | `/api/alerts/{id}/acknowledge` | Acknowledge an alert |
| `POST` | `/api/alerts/{id}/resolve` | Resolve an alert |
| `POST` | `/api/alerts/{id}/remediation-actions` | Get predefined fixes |
| `POST` | `/api/alerts/{id}/execute-action` | Execute a fix |
| `POST` | `/api/alerts/{id}/remediate` | Get AI remediation |

### AI & Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/chat` | Natural language query |
| `POST` | `/api/ai/chat/stream` | Streaming chat (SSE) |
| `POST` | `/api/ai/analyze` | AI data analysis |
| `GET` | `/api/ai/health` | AI health report |
| `GET` | `/api/ai/models` | List Ollama models |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `WS` | `/ws/metrics` | Live metric streaming |

---

## Appendix B: Configuration Reference

### Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | Application secret key |
| `OLLAMA_MODEL` | `llama3.2` | LLM model name |
| `POLL_INTERVAL` | `60` | SNMP poll interval (seconds) |
| `SEED_MOCK` | `true` | Seed mock data on startup |
| `SNMP_COMMUNITY` | `public` | Default SNMP community string |
| `CPU_WARN` | `75` | CPU warning threshold (%) |
| `CPU_CRIT` | `90` | CPU critical threshold (%) |
| `MEM_WARN` | `80` | Memory warning threshold (%) |
| `MEM_CRIT` | `95` | Memory critical threshold (%) |
| `DISK_WARN` | `85` | Disk warning threshold (%) |
| `DISK_CRIT` | `95` | Disk critical threshold (%) |

### Key File Locations

| File | Path | Purpose |
|------|------|---------|
| Main config | `/opt/Egli2.0/.env` | Environment variables |
| Docker Compose | `/opt/Egli2.0/docker-compose.yml` | Service definitions |
| Nginx config | `/opt/Egli2.0/nginx/nginx.conf` | Reverse proxy |
| Deploy script | `/opt/Egli2.0/deploy-ubuntu.sh` | Installation/uninstall |
| Server script | `/opt/Egli2.0/scripts/add-server.sh` | Server management |
| Health check | `/opt/Egli2.0/systemd/egli2-health.sh` | Health monitoring |
| Alert config | `/opt/Egli2.0/systemd/egli2-alert.env` | Email/webhook alerts |
| Deploy log | `/opt/Egli2.0/deploy-ubuntu.log` | Installation log |

---

## Appendix C: Contact & Escalation Matrix

| Priority | Response Time | Escalation Path |
|----------|---------------|-----------------|
| P1 — Critical | < 15 minutes | NOC → DevOps Lead → Management |
| P2 — High | < 1 hour | NOC → DevOps → Management (if > 2 hours) |
| P3 — Medium | Next business day | NOC → DevOps |
| P4 — Low | Scheduled maintenance | DevOps |

### Useful Commands Quick Reference

```bash
# Service management
systemctl start egli2          # Start stack
systemctl stop egli2           # Stop stack
systemctl restart egli2        # Restart stack
systemctl status egli2         # Check status

# Docker Compose
docker compose ps              # Container status
docker compose logs -f         # Follow all logs
docker compose down            # Stop all
docker compose up -d           # Start all
docker compose build --no-cache # Rebuild

# Health monitoring
systemctl status egli2-health.timer  # Health timer
journalctl -u egli2-health -f        # Health logs
sudo ./systemd/egli2-health.sh       # Manual health check

# Server management
./scripts/add-server.sh list         # List servers
./scripts/add-server.sh single ...   # Add server
curl -X DELETE http://localhost/api/servers/<id>  # Remove

# Backup
/opt/Egli2.0/scripts/backup.sh       # Manual backup

# Emergency
sudo ./deploy-ubuntu.sh --uninstall  # Full removal
```

---

*End of SOP Document*

*For questions or updates, contact the Egli2.0 Operations Team.*
