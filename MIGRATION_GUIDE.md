# Migration Guide: CentOS 7.9 → Rocky Linux 9

## Egli2.0

> **Last updated:** May 2026
> **Target OS:** Rocky Linux 9.x (current: 9.7)
> **Supported until:** May 31, 2032

---

## Table of Contents

1. [Why Migrate?](#1-why-migrate)
2. [Migration Strategy Overview](#2-migration-strategy-overview)
3. [Option A: Fresh Install (Recommended)](#3-option-a-fresh-install-recommended)
4. [Option B: In-Place Migration (Advanced)](#4-option-b-in-place-migration-advanced)
5. [Data Migration](#5-data-migration)
6. [Post-Migration Verification](#6-post-migration-verification)
7. [Rollback Plan](#7-rollback-plan)
8. [Comparison: CentOS 7.9 vs Rocky Linux 9](#8-comparison-centos-79-vs-rocky-linux-9)

---

## 1. Why Migrate?

| Factor | CentOS 7.9 | Rocky Linux 9 |
|--------|-----------|---------------|
| **Support Status** | ❌ EOL (June 2024) | ✅ Supported until 2032 |
| **Security Updates** | ❌ None | ✅ Active |
| **Kernel** | 3.10.x (ancient) | 5.14.x (modern) |
| **Python** | 2.7 / 3.6 (outdated) | 3.9+ (via AppStream) |
| **Docker Support** | Unofficial, deprecated | Official support |
| **Systemd** | 219 | 252+ |
| **OpenSSL** | 1.0.2 | 3.0.7+ |
| **glibc** | 2.17 | 2.34+ |

**Bottom line:** Running modern software (Docker Compose, Python 3.11+, Node.js 20+) on CentOS 7 requires extensive workarounds. Rocky Linux 9 supports everything out of the box.

---

## 2. Migration Strategy Overview

There are two approaches:

| Approach | Downtime | Risk | Difficulty | Recommendation |
|----------|----------|------|------------|----------------|
| **A: Fresh Install** | ✅ Higher (hours) | 🟢 Low | Easy | **✅ Best for production** |
| **B: In-Place Upgrade** | ✅ Lower (minutes) | 🔴 High | Hard | ⚠️ Only for test/staging |

> **⚠️ IMPORTANT:** There is NO direct in-place upgrade path from CentOS 7 → Rocky Linux 9. You would need to go CentOS 7 → Rocky Linux 8 → Rocky Linux 9 using the [ELevate project](https://wiki.almalinux.org/elevate/), which is risky and not recommended for production.

---

## 3. Option A: Fresh Install (Recommended)

### Phase 1: Provision the New Server

**Step 1.1 — Download Rocky Linux 9**

```bash
# Download ISO
wget https://download.rockylinux.org/pub/rocky/9/isos/x86_64/Rocky-9-latest-x86_64-minimal.iso

# Verify checksum
wget https://download.rockylinux.org/pub/rocky/9/isos/x86_64/CHECKSUM
sha256sum -c CHECKSUM 2>/dev/null | grep "OK"
```

**Step 1.2 — Install Rocky Linux 9**

- Minimal installation is sufficient (no GUI needed)
- Enable `EPEL` during install or after
- Set static IP for your monitoring server
- Configure hostname: `hostnamectl set-hostname monitor.example.com`

### Phase 2: Initial Setup

**Step 2.1 — System Update & Repos**

```bash
# Update everything
sudo dnf update -y

# Install essential tools
sudo dnf install -y epel-release git curl wget vim htop

# Install kernel dev tools (for building if needed)
sudo dnf groupinstall -y "Development Tools"

# Reboot to latest kernel
sudo reboot
```

**Step 2.2 — Install Docker**

```bash
# Remove any old Docker packages (clean slate)
sudo dnf remove -y docker docker-client docker-client-latest \
  docker-common docker-latest docker-latest-logrotate \
  docker-logrotate docker-engine podman runc

# Install dnf-plugins-core
sudo dnf install -y dnf-plugins-core

# Add Docker CE repo (use RHEL repo — compatible with Rocky 9)
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/rhel/docker-ce.repo

# Install Docker Engine + Compose plugin
sudo dnf install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
sudo systemctl enable docker --now

# Add your user to the docker group (no sudo needed)
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

**Step 2.3 — Verify Docker**

```bash
docker --version
docker compose version
docker run hello-world
```

### Phase 3: Deploy Egli2.0

**Step 3.1 — Clone the Repository**

```bash
cd /opt
sudo git clone <your-repo-url> Egli2.0
sudo chown -R $USER:$USER Egli2.0
cd Egli2.0
```

**Step 3.2 — Configure Environment**

```bash
cp .env.example .env
# Edit .env with production values:
# - SECRET_KEY: Generate a random 256-bit key
# - INFLUXDB_TOKEN: Change to a secure token
# - Set production thresholds
# - OLLAMA_MODEL: Choose your model

# Generate a secure SECRET_KEY
openssl rand -hex 32
```

**Step 3.3 — Start the Stack**

```bash
# Pull images and start
docker compose up -d

# Check all services are healthy
docker compose ps

# Pull the LLM model (first time only)
docker compose --profile setup run ollama-setup

# Check logs if needed
docker compose logs backend
docker compose logs frontend
```

**Step 3.4 — Verify Everything is Running**

```bash
# Health check
curl http://localhost/api/health

# Check dashboard is serving
curl -s http://localhost | head -5

# Check metrics are flowing (if mock data is enabled)
curl http://localhost/api/servers
curl http://localhost/api/metrics
```

### Phase 4: Configure Firewall

Rocky Linux 9 uses `firewalld` by default:

```bash
# Allow HTTP/HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# Allow SSH (should already be enabled)
sudo firewall-cmd --permanent --add-service=ssh

# Reload to apply
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

### Phase 5: Swap DNS / Traffic

1. Update DNS records to point to the new server's IP
2. Or update load balancer / reverse proxy configuration
3. Wait for DNS propagation (or update your local hosts file for testing)

---

## 4. Option B: In-Place Migration (Advanced / High Risk)

> ⚠️ **Only attempt this if you fully understand the risks.** Always take a full VM snapshot or filesystem backup first.

This uses the [ELevate](https://wiki.almalinux.org/elevate/) project (from AlmaLinux) to perform a two-hop upgrade:

### Phase 1: Backup Everything

```bash
# Take a full VM snapshot in your hypervisor
# AND do a filesystem backup:

sudo tar -czf /root/centos7-full-backup-$(date +%Y%m%d).tar.gz \
  --exclude=/proc --exclude=/sys --exclude=/dev --exclude=/run \
  --exclude=/mnt --exclude=/media --exclude=/lost+found /
```

### Phase 2: Backup Egli2.0 Data

```bash
# Export InfluxDB data
docker exec egli2-influxdb influx backup /tmp/influx-backup
docker cp egli2-influxdb:/tmp/influx-backup ./influx-backup-$(date +%Y%m%d)

# Copy .env and config files
cp .env .env.backup
cp -r nginx/ nginx.backup
```

### Phase 3: CentOS 7 → Rocky Linux 8

```bash
# Install leapp and migration data
sudo yum install -y leapp-upgrade leapp-data-rocky

# Run pre-upgrade check
sudo leapp preupgrade

# Review the generated report
cat /var/log/leapp/leapp-report.txt

# Address any inhibitors (the report will tell you what to fix)
# Common fixes:
# - Remove packages that block upgrade
# - Ensure enough disk space
# - Remove conflicting kernel modules

# For repofiles check, you may need to edit:
# /etc/leapp/files/repomap.csv or /etc/leapp/files/repofiles/

# After fixing issues, run the upgrade
sudo leapp upgrade --reboot

# After reboot, verify you're on Rocky Linux 8
cat /etc/rocky-release
```

### Phase 4: Rocky Linux 8 → Rocky Linux 9

```bash
# Update leapp for EL9 migration
sudo dnf install -y leapp-upgrade-el8toel9 leapp-data-rocky

# Pre-upgrade check
sudo leapp preupgrade

# Review and fix any inhibitors
cat /var/log/leapp/leapp-report.txt

# Run upgrade
sudo leapp upgrade --reboot

# After reboot, verify
cat /etc/rocky-release
```

### Phase 5: Post-Migration Fixes

```bash
# Update all packages
sudo dnf update -y

# Reinstall Docker (Docker was likely removed during upgrade)
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker --now

# Rebuild and restart the Egli2.0 stack
cd /opt/Egli2.0
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 5. Data Migration

When moving from CentOS 7 to Rocky Linux 9 (fresh install), you'll want to migrate:

### 5.1 InfluxDB Metrics Data

| Method | Command | Notes |
|--------|---------|-------|
| **Option 1: Volume Copy** | Copy Docker volume from old to new server | Fastest for same-machine migration |
| **Option 2: InfluxDB Export/Import** | `influx backup` / `influx restore` | Best for cross-machine migration |
| **Option 3: Fresh Start** | Let mock data seed automatically | If historical data isn't critical |

**On the OLD server (CentOS 7):**

```bash
# Backup InfluxDB data
docker exec egli2-influxdb influx backup /tmp/backup
docker cp egli2-influxdb:/tmp/backup ./influxdb-backup/
tar -czf influxdb-backup.tar.gz ./influxdb-backup/

# Copy the backup to the new server
scp influxdb-backup.tar.gz user@new-server:/opt/Egli2.0/
```

**On the NEW server (Rocky Linux 9):**

```bash
cd /opt/Egli2.0
tar -xzf influxdb-backup.tar.gz

# Copy backup into the InfluxDB container
docker cp ./influxdb-backup egli2-influxdb:/tmp/backup

# Restore
docker exec egli2-influxdb influx restore /tmp/backup
```

### 5.2 Configuration Files to Migrate

| File | From | To | Notes |
|------|------|----|-------|
| `.env` | `/opt/Egli2.0/.env` | Same path | Secrets & configuration |
| `nginx/nginx.conf` | `/opt/Egli2.0/nginx/` | Same path | Custom proxy rules |
| `docker-compose.yml` | (modified version) | Git-tracked version | Compare for custom changes |

### 5.3 Ollama Models

```bash
# List models on old server
docker exec egli2-ollama ollama list

# On new server, pull them again
docker compose --profile setup run ollama-setup
# Or manually:
docker exec egli2-ollama ollama pull llama3.2
docker exec egli2-ollama ollama pull mistral

# Or copy the entire model cache (faster):
docker cp egli2-ollama:/root/.ollama /tmp/ollama-models
# Then on new server:
docker cp /tmp/ollama-models egli2-ollama:/root/.ollama
```

### 5.4 Registered Server List

If you registered real servers via the API, export/import them:

```bash
# On old server — dump via API
curl -s http://localhost/api/servers > servers-backup.json

# On new server — re-register
cat servers-backup.json | jq -c '.[]' | while read server; do
  curl -X POST http://localhost/api/servers \
    -H "Content-Type: application/json" \
    -d "$server"
done
```

---

## 6. Post-Migration Verification

Run these checks to confirm everything is working:

### 6.1 Service Health

```bash
# All containers running?
docker compose ps

# Expected output:
# NAME                   STATUS
# egli2-backend      Up (healthy)
# egli2-frontend     Up (healthy)
# egli2-influxdb     Up (healthy)
# egli2-ollama       Up (healthy)
# egli2-poller       Up (healthy)
```

### 6.2 API Endpoints

```bash
# Health check
curl -s http://localhost/api/health | python3 -m json.tool

# List servers (should show registered/mock servers)
curl -s http://localhost/api/servers | python3 -m json.tool

# Current metrics (should have live data)
curl -s http://localhost/api/metrics | python3 -m json.tool

# AI health
curl -s http://localhost/api/ai/health | python3 -m json.tool

# Dashboard loads
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# Should return 200
```

### 6.3 WebSocket Connectivity

```bash
# Test WebSocket using websocat or wscat
sudo dnf install -y npm
npm install -g wscat

wscat -c ws://localhost/ws/metrics
# Should receive live metric data every ~60 seconds
```

### 6.4 System Resources

```bash
# Docker resource usage
docker stats --no-stream

# Disk usage of Docker volumes
sudo du -sh /var/lib/docker/volumes/egli2-*/_data

# System resources
free -h
df -h
top -bn1 | head -5
```

---

## 7. Rollback Plan

If the migration fails or you encounter critical issues:

### 7.1 If Using Fresh Install (Option A)

```bash
# Point DNS back to the old CentOS 7 server IP
# The old server is untouched and still running
```

### 7.2 If Using In-Place (Option B)

```bash
# Restore from VM snapshot (fastest)
# OR reinstall CentOS 7 from scratch and restore filesystem backup:
sudo tar -xzf /root/centos7-full-backup-*.tar.gz -C /

# Then restore Docker volumes
docker compose up -d
```

### 7.3 Data Recovery

```bash
# If InfluxDB data was lost but you have the backup:
docker cp ./influxdb-backup egli2-influxdb:/tmp/backup
docker exec egli2-influxdb influx restore /tmp/backup
```

---

## 8. Comparison: CentOS 7.9 vs Rocky Linux 9

Here's what changes specifically for the Egli2.0:

| Aspect | CentOS 7.9 | Rocky Linux 9 | Impact |
|--------|-----------|---------------|--------|
| **Docker CE install** | Requires archived repo | Official Docker RHEL repo | ✅ Smooth on Rocky |
| **Docker Compose** | Must download binary manually | `docker-compose-plugin` via dnf | ✅ Built-in on Rocky |
| **Python 3.11** | Build from source (pyenv) | Via AppStream / SCL | ✅ Much simpler on Rocky |
| **Node.js 20** | Unofficial NodeSource builds | Official NodeSource or nvm | ✅ Simpler on Rocky |
| **OpenSSL** | 1.0.2 → needs 1.1.1 for Python 3.11 | 3.0.7 — fully compatible | ✅ Works OOTB on Rocky |
| **Kernel** | 3.10.x (Docker overhead) | 5.14.x (native container support) | ✅ Better performance on Rocky |
| **glibc** | 2.17 (may break modern images) | 2.34 (fully compatible) | ✅ No compatibility issues |
| **Systemd** | 219 | 252+ | ✅ Modern socket management |
| **firewalld** | 0.6.3 | 1.2.x | ✅ Better tooling on Rocky |
| **Security updates** | ❌ None | ✅ Until 2032 | ⭐ Most important reason |

---

## Quick Reference: One-Line Install on Rocky Linux 9

```bash
sudo dnf install -y epel-release && \
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo && \
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git && \
sudo systemctl enable docker --now && \
sudo usermod -aG docker $USER && \
git clone <your-repo> /opt/Egli2.0 && \
cd /opt/Egli2.0 && \
cp .env.example .env && \
docker compose up -d && \
echo "✅ Egli2.0 deployed at http://$(hostname -I | awk '{print $1}')"
```

---

> **Need help?** Open an issue on the repository or consult the [Rocky Linux documentation](https://docs.rockylinux.org/).
