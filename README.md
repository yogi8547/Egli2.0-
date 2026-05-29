# Egli2.0

**Self-hosted, AI-powered infrastructure monitoring with zero cloud dependencies.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](docker-compose.yml)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python)](backend/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](frontend/)

A complete, production-ready infrastructure monitoring platform that collects server metrics via SNMP, stores them in InfluxDB, displays live dashboards with real-time WebSocket updates, and provides an AI-powered natural language interface powered by local Ollama LLM inference.

**No external API calls. No cloud dependencies. Runs completely offline.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Stack                          │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ Frontend │───▶│ Backend  │───▶│ InfluxDB │    │ SNMP Poller  │  │
│  │ (React)  │    │ (FastAPI)│    │ (TSDB)   │    │ (Background) │  │
│  └────┬─────┘    └────┬─────┘    └──────────┘    └──────┬───────┘  │
│       │               │                                  │          │
│       │    ┌──────────▼──────────┐                       │          │
│       └────│   Ollama (LLM)     │◀───────────────────────┘          │
│            │  (llama3.2/mistral) │   SNMP queries                    │
│            └─────────────────────┘   to managed servers              │
│                                                                     │
│  All communication is internal via Docker networks (bridge)         │ └─────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Service | Technology | Purpose |
|---------|-----------|---------|
| **Frontend** | React 18 + TailwindCSS + Recharts | NOC-style dark dashboard with live WebSocket updates |
| **Backend** | Python FastAPI + WebSockets | REST API, real-time data streaming, alert evaluation |
| **InfluxDB** | InfluxDB 2.7 | Time-series metric storage with Flux queries |
| **Ollama** | Ollama (llama3.2) | Local LLM inference — no external API calls |
| **SNMP Poller** | Python (easysnmp) | Background metric collection via SNMP v2c/v3 |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/servers` | List all monitored servers |
| `POST` | `/api/servers` | Register a new server |
| `GET` | `/api/servers/{id}` | Get server details |
| `DELETE` | `/api/servers/{id}` | Remove a server |
| `GET` | `/api/metrics` | Get current metrics for all servers |
| `GET` | `/api/metrics/{server}` | Get current metrics for a specific server |
| `GET` | `/api/metrics/history/{server}/{measurement}` | Historical metric data |
| `GET` | `/api/alerts` | List all alerts (filterable by status/server) |
| `GET` | `/api/alerts/active` | Get active alerts only |
| `POST` | `/api/alerts/{id}/acknowledge` | Acknowledge an alert |
| `POST` | `/api/alerts/{id}/resolve` | Resolve an alert |
| `POST` | `/api/alerts/{id}/remediate` | Get AI-powered remediation |
| `POST` | `/api/ai/analyze` | Send data for AI analysis |
| `POST` | `/api/ai/chat` | Natural language query |
| `POST` | `/api/ai/chat/stream` | Streaming chat (SSE) |
| `GET` | `/api/ai/health` | AI-generated health report |
| `GET` | `/api/ai/models` | List available Ollama models |
| `GET` | `/api/overview` | Dashboard overview stats |
| `GET` | `/api/health` | Health check |
| `WS` | `/ws/metrics` | Live metric streaming (WebSocket) |

---

## Quick Start (5 minutes)

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/ubuntu/) (v24+) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- Python 3.11+ (for local development)
- Node.js 20+ (for frontend development)
- **Optional:** NVIDIA GPU + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) for GPU-accelerated LLM inference

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/Egli2.0.git
cd Egli2.0

# Optional: Create .env with custom settings
cp .env.example .env
```

### 2. Start All Services

```bash
docker compose up -d
```

This starts: InfluxDB, Ollama, Backend (FastAPI), Frontend (Nginx+React), SNMP Poller

### 3. Pull the LLM Model (First Time)

```bash
docker compose --profile setup run ollama-setup
```

This pulls `llama3.2` (2B parameters — runs on CPU/RAM) into the Ollama container. For better results with larger models:

```bash
# After Ollama is running, pull a different model:
docker exec -it egli2-ollama ollama pull mistral
docker exec -it egli2-ollama ollama pull deepseek-r1:7b

# Then update .env: OLLAMA_MODEL=mistral
# And restart: docker compose restart backend
```

### 4. Open the Dashboard

```
http://localhost
```

The dashboard will auto-populate with 5 mock servers and live-updating metric data.

---

## Project Structure

```
Egli2.0/
├── backend/                          # Python FastAPI backend
│   ├── app/
│   │   ├── main.py                   # App entry point, middleware, routes
│   │   ├── config.py                 # Pydantic settings (env-based)
│   │   ├── database.py               # InfluxDB connection manager
│   │   ├── models/
│   │   │   └── schemas.py            # All Pydantic data models
│   │   ├── api/
│   │   │   ├── servers.py            # Server CRUD endpoints
│   │   │   ├── metrics.py            # Metrics retrieval endpoints
│   │   │   ├── alerts.py             # Alert management endpoints
│   │   │   ├── ai.py                 # AI analysis & chat endpoints
│   │   │   └── ws.py                 # WebSocket broadcast manager
│   │   └── services/
│   │       ├── snmp_poller.py        # SNMP polling with mock fallback
│   │       ├── alert_engine.py       # Threshold-based alert evaluation
│   │       └── ai_service.py         # Ollama integration for AI features
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                         # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx            # Main shell with sidebar + header
│   │   │   ├── SystemOverview.jsx    # Dashboard overview with stats
│   │   │   ├── ServerCard.jsx        # Server status card + metrics
│   │   │   ├── MetricChart.jsx       # Reusable chart component
│   │   │   ├── AlertPanel.jsx        # Alert list + management
│   │   │   └── AIChat.jsx            # AI chat interface
│   │   ├── App.jsx                   # Root app with WebSocket hook
│   │   ├── main.jsx                  # React entry point
│   │   └── index.css                 # Tailwind + custom styles
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
├── monitoring/                       # Standalone SNMP poller service
│   ├── poller.py
│   └── Dockerfile
├── nginx/
│   └── nginx.conf                    # Nginx config with proxy + WebSocket
├── mock_data/
│   └── seed.py                       # Historical mock data generator
├── docker-compose.yml                # Multi-service orchestration
├── .env.example                      # All configurable environment vars
└── README.md                         # This file
```

---

## Dashboard Features

### Overview Page
- **Stat Cards**: Live aggregate metrics (servers, CPU, memory, disk)
- **Trend Charts**: Animated CPU and memory area charts (last hour)
- **Server Status**: Visual breakdown of online/degraded/offline servers
- **Alert Summary**: Recent active alerts with severity indicators

### Servers View
- **Server Cards**: Per-server real-time gauges for CPU, memory, disk, network
- **Expanded Details**: Click to expand and view metric history sparklines
- **Status Indicators**: Color-coded health status with uptime info

### Alerts View
- **Filterable List**: Filter by all/active/critical alerts
- **Severity Badges**: Color-coded critical/warning/info indicators
- **Alert Management**: Acknowledge, resolve, and request AI remediation
- **Expanded Details**: AI-generated root cause analysis and fix suggestions

### AI Assistant
- **Natural Language Queries**: Ask about infrastructure in plain English
- **Streaming Responses**: Real-time token-by-token streaming via SSE
- **Suggested Queries**: Quick-click example questions
- **Server Filter**: Scope questions to a specific server
- **Markdown Rendering**: Rich text responses with code blocks

### Example AI Queries

```
"Why is server-01 CPU utilization high?"
"Which servers have low available disk space?"
"Summarize overall infrastructure health."
"Explain this SNMP alert and suggest fixes."
"Show me memory trends across all servers."
"What's the current network traffic pattern?"
```

---

## SNMP Configuration

### Adding Real Servers (SNMP v2c)

1. Ensure SNMP is enabled on target servers:
   ```bash
   # On Ubuntu/Debian target:
   sudo apt-get install snmpd
   sudo systemctl enable snmpd --now
   ```

2. Configure SNMP community:
   ```bash
   sudo nano /etc/snmp/snmpd.conf
   rocommunity public 192.168.1.0/24
   sudo systemctl restart snmpd
   ```

3. Register the server via the API:
   ```bash
   curl -X POST http://localhost/api/servers \
     -H "Content-Type: application/json" \
     -d '{
       "id": "prod-web-01",
       "name": "Production Web 01",
       "host": "192.168.1.100",
       "snmp_community": "public",
       "snmp_version": "2c"
     }'
   ```

### SNMP v3 Support

For production environments, use SNMPv3 with authentication:

```bash
curl -X POST http://localhost/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "secure-db-01",
    "name": "Secure Database",
    "host": "10.0.1.50",
    "snmp_version": "3",
    "snmp_community": "",
    "snmp_username": "monitor",
    "snmp_auth_protocol": "SHA",
    "snmp_auth_password": "your-auth-key",
    "snmp_priv_protocol": "AES",
    "snmp_priv_password": "your-priv-key"
  }'
```

---

## Development

### Local Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or: venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to `localhost:8000`.

### Seeding Historical Data

```bash
# Seed 24 hours of data at 5-minute intervals (default)
python mock_data/seed.py

# Seed 7 days of data
python mock_data/seed.py --hours 168 --interval 10

# Seed for 50 servers
python mock_data/seed.py --servers 50 --hours 48
```

---

## Production Deployment

### Security Recommendations

1. **Change default secrets** in `.env`:
   - `SECRET_KEY`: Generate a random 256-bit key
   - `INFLUXDB_TOKEN`: Change the default token
   - `SNMP_COMMUNITY`: Use SNMPv3 with auth/priv in production

2. **Firewall configuration:**
   ```bash
   # Allow only needed ports
   sudo ufw allow 22/tcp        # SSH
   sudo ufw allow 80/tcp        # HTTP (behind Nginx)
   sudo ufw allow 443/tcp       # HTTPS (with SSL)
   sudo ufw deny 8086           # InfluxDB — internal only
   sudo ufw deny 11434          # Ollama — internal only
   ```

3. **Add SSL/TLS** (place certificates in `./certs/`):
   ```nginx
   # In nginx/nginx.conf, add SSL block:
   server {
       listen 443 ssl;
       ssl_certificate /certs/fullchain.pem;
       ssl_certificate_key /certs/privkey.pem;
       # ...
   }
   ```
   Then mount certs in docker-compose:
   ```yaml
   volumes:
     - ./certs:/certs:ro
   ```

### Scaling Recommendations

| Scale | Servers | RAM | CPU | Storage |
|-------|---------|-----|-----|---------|
| Small | 1-10 | 8 GB | 2 vCPU | 20 GB |
| Medium | 10-50 | 16 GB | 4 vCPU | 50 GB |
| Large | 50-200 | 32 GB | 8 vCPU | 100 GB |

For multi-server deployments:
- Run InfluxDB on dedicated storage with SSD
- Use Ollama with GPU acceleration for larger models
- Consider Redis for alert deduplication at scale
- Set up InfluxDB retention policies to auto-expire old data

### Monitoring the Monitor

The platform health check is available at `/api/health`:
```bash
curl http://localhost/api/health
# {"status":"ok","version":"1.0.0","uptime_seconds":3600,...}
```

---

## Troubleshooting

### Ollama Connection Refused

```
Error: Cannot connect to Ollama at http://ollama:11434
```

**Solutions:**
1. Ensure Ollama container is running: `docker compose ps | grep ollama`
2. Check Ollama logs: `docker compose logs ollama`
3. Ensure the model is pulled: `docker compose --profile setup run ollama-setup`
4. For non-Docker setups, ensure `ollama serve` is running on the host

### No Metrics Appearing

```
The dashboard shows "No data available" on charts
```

**Solutions:**
1. Mock data should auto-seed on first startup. Check backend logs: `docker compose logs backend | grep seed`
2. Manually trigger a poll cycle via WebSocket or wait for the next poll interval
3. Seed historical data: `python mock_data/seed.py`
4. Check InfluxDB connectivity in the backend logs

### SNMP Polling Fails

```
SNMP poll failed for server-01: No response from 192.168.1.101
```

**Solutions:**
1. Verify SNMP is enabled on the target: `snmpwalk -v2c -c public <target-ip> 1.3.6.1.2.1.1`
2. Check firewall rules on the target server (UDP port 161)
3. Verify the target IP/hostname is correct in the server registration
4. The platform gracefully falls back to mock data — check logs for "falling back to mock"

### Frontend Shows Blank Page

**Solutions:**
1. Check browser console for errors (F12)
2. Verify the backend is accessible: `curl http://localhost/api/health`
3. Clear browser cache or open in incognito mode
4. Rebuild the frontend: `cd frontend && npm run build`

### Docker Compose Services Fail to Start

```bash
# Check service logs
docker compose logs backend
docker compose logs frontend
docker compose logs influxdb

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

---

## OIDs and Metrics Collected

| OID | Metric | Description |
|-----|--------|-------------|
| `.1.3.6.1.2.1.1.5.0` | sysName | System hostname |
| `.1.3.6.1.2.1.1.3.0` | sysUptime | System uptime (timeticks) |
| `.1.3.6.1.4.1.2021.10.1.3.1` | cpuLoad | CPU load (1-minute average) |
| `.1.3.6.1.4.1.2021.11.9.0` | cpuUser | CPU user percentage |
| `.1.3.6.1.4.1.2021.4.5.0` | memTotalReal | Total physical memory |
| `.1.3.6.1.4.1.2021.4.6.0` | memAvailReal | Available memory |
| `.1.3.6.1.4.1.2021.9.1.6.1` | diskSize | Total disk space |
| `.1.3.6.1.4.1.2021.9.1.8.1` | diskUsed | Used disk space |
| `.1.3.6.1.2.1.2.2.1.10` | ifInOctets | Interface input bytes |
| `.1.3.6.1.2.1.2.2.1.16` | ifOutOctets | Interface output bytes |

---

## Extending the Platform

### Adding New Metric Types

1. Add the OID to the `OID` dict in `services/snmp_poller.py`
2. Add the field to `MetricSnapshot` in `models/schemas.py`
3. Write the value to InfluxDB in `snmp_poller._write_to_influxdb()`
4. Add a gauge to `ServerCard.jsx` for display

### Adding Custom Alert Rules

1. Add threshold settings in `config.py`
2. Add evaluation logic in `services/alert_engine.py`
3. The alert will automatically appear in the dashboard

### Adding New Frontend Views

1. Create a new component in `frontend/src/components/`
2. Add a nav item in `Layout.jsx`
3. Add the view routing in `App.jsx`

---

## Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11 | Backend runtime |
| FastAPI | 0.104+ | REST API + WebSocket framework |
| InfluxDB | 2.7 | Time-series metrics database |
| Ollama | Latest | Local LLM inference |
| React | 18 | Frontend UI framework |
| Vite | 5 | Frontend build tool |
| TailwindCSS | 3.4 | Utility-first CSS framework |
| Recharts | 2.10 | React charting library |
| Nginx | Alpine | Reverse proxy + static file serving |
| Docker Compose | 2.x | Service orchestration |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or PR on the repository.

---

*Built with ❤️ — Egli2.0: AI-powered infrastructure monitoring.*
