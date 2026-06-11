# Egli2.0 — Technical Requirements & Design Document (TRD)

> **Document Version:** 1.0  
> **Date:** June 8, 2026  
> **Status:** Approved  
> **Author:** Egli2.0 Engineering Team  

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Specifications](#2-component-specifications)
3. [Data Models](#3-data-models)
4. [API Specifications](#4-api-specifications)
5. [Data Flow](#5-data-flow)
6. [State Management](#6-state-management)
7. [Algorithm & Service Design](#7-algorithm--service-design)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Security Design](#9-security-design)
10. [Performance Design](#10-performance-design)
11. [Testing Strategy](#11-testing-strategy)
12. [Technical Debt & Future Considerations](#12-technical-debt--future-considerations)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Docker Compose Stack                         │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────┐    │
│  │  Frontend   │───▶│   Backend   │───▶│      InfluxDB       │    │
│  │  Nginx+React│    │   FastAPI   │    │   2.7 TSDB (8086)   │    │
│  │  Port 80/443│    │  Port 8000  │    │                      │    │
│  └──────┬──────┘    └──────┬──────┘    └──────────────────────┘    │
│         │                  │                                        │
│         │        ┌─────────▼─────────┐     ┌──────────────────┐    │
│         │        │      Ollama       │     │     Qdrant       │    │
│         └───────▶│  LLM (11434)     │     │  Vector DB (6333)│    │
│         WS       │  llama3.2/mistral│     │  Alert Embeddings │    │
│                  └───────────────────┘     └──────────────────┘    │
│                         │                                        │
│                  ┌──────▼──────┐                                  │
│                  │ SNMP Poller │                                  │
│                  │ Background  │──▶ Managed Servers (UDP/161)    │
│                  └─────────────┘                                  │
│                                                                     │
│  All communication is internal via Docker bridge network           │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-01 | **FastAPI** over Flask/Django | Async native, WebSocket support, auto-docs, Pydantic validation |
| AD-02 | **React 18 + Vite** over Next.js | Simpler static deployment via Nginx; no SSR needed for real-time dashboard |
| AD-03 | **InfluxDB** over TimescaleDB/Prometheus | Purpose-built for time-series, simple Flux queries, easy Docker setup |
| AD-04 | **Ollama** over OpenAI API | Zero cloud dependency, runs locally, supports many models, MIT license |
| AD-05 | **Qdrant** over Pinecone/Milvus | Lightweight, Docker-native, good enough for <50K vectors, no external service |
| AD-06 | **In-memory state** over Redis | Simpler deployment (no extra service), data is ephemeral anyway |
| AD-07 | **WebSocket** over polling | True real-time updates for dashboard, lower latency, lower bandwidth |
| AD-08 | **APScheduler** over Celery | Lighter weight, no message broker needed, good enough for periodic polling |
| AD-09 | **Singleton pattern** for services | Clear ownership of shared state (alerts, servers, metrics) — all services are stateless except for their in-memory stores |

### 1.3 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.2 | UI framework |
| **Frontend** | Vite | 5.x | Build tool + dev server |
| **Frontend** | TailwindCSS | 3.4 | Utility CSS framework |
| **Frontend** | Recharts | 2.10 | Charting library |
| **Frontend** | Lucide React | 0.294 | Icons |
| **Backend** | Python | 3.11 | Runtime |
| **Backend** | FastAPI | 0.104+ | Web framework |
| **Backend** | Uvicorn | 0.24+ | ASGI server |
| **Backend** | Pydantic | 2.5+ | Data validation |
| **Backend** | InfluxDB Client | 1.40+ | TSDB driver |
| **Backend** | Qdrant Client | 1.9+ | Vector DB driver |
| **Backend** | APScheduler | 3.10+ | Poll scheduling |
| **Backend** | httpx | 0.25+ | Async HTTP (Ollama) |
| **Backend** | loguru | 0.7+ | Structured logging |
| **Database** | InfluxDB | 2.7-alpine | Time-series storage |
| **Vector DB** | Qdrant | latest | Vector embeddings |
| **LLM** | Ollama | latest | Local LLM inference |
| **Proxy** | Nginx | alpine | Reverse proxy + static files |
| **Orchestration** | Docker Compose | 2.x | Service orchestration |

---

## 2. Component Specifications

### 2.1 Backend Components

#### 2.1.1 Application Entry Point (`app/main.py`)

| Property | Value |
|----------|-------|
| **File** | `backend/app/main.py` |
| **Framework** | FastAPI with lifespan context manager |
| **Purpose** | Initialize services, register routes, handle lifecycle |

**Startup sequence:**
1. Connect to InfluxDB (fall back to mock mode if unavailable)
2. Seed mock servers (if `SEED_MOCK=true`)
3. Link WebSocket manager to servers dictionary
4. Re-index existing alerts into Qdrant (if `QDRANT_REINDEX_ON_START=true`)
5. Record start time for uptime tracking

**Shutdown sequence:**
1. Close InfluxDB connection
2. Log shutdown complete

**Middleware stack:**
- CORS (configurable origins)
- Request logging (method, path, status, duration)
- Global exception handler (returns 500 with error type)

#### 2.1.2 Configuration (`app/config.py`)

| Property | Value |
|----------|-------|
| **File** | `backend/app/config.py` |
| **Base class** | `pydantic_settings.BaseSettings` |
| **Config source** | Environment variables / `.env` file |

**Configuration categories:**

| Category | Variables | Defaults |
|----------|-----------|----------|
| General | `app_name`, `debug`, `log_level` | Egli2.0, false, INFO |
| Server | `host`, `port` | 0.0.0.0, 8000 |
| InfluxDB | `url`, `token`, `org`, `bucket` | localhost:8086, admin-token, monitoring, metrics |
| SNMP | `community`, `version`, `timeout`, `retries`, `poll_interval` | public, 2c, 5s, 2, 60s |
| Ollama | `base_url`, `model`, `temperature` | localhost:11434, llama3.1:latest, 0.3 |
| Thresholds | `cpu_warn`, `cpu_crit`, `mem_warn`, `mem_crit`, `disk_warn`, `disk_crit` | 75/90, 80/95, 85/95 |
| Custom Checks | `timeout`, `concurrency`, `interval` | 10s, 10, 60s |
| Qdrant | `url`, `collection`, `vector_size`, `reindex` | localhost:6333, egli2_alerts, 768, true |
| Cache | `high_threshold`, `medium_threshold`, `min_score`, `top_k` | 0.85, 0.55, 0.4, 3 |
| Embedding | `model` | nomic-embed-text |
| CORS | `origins` | ["*"] |
| Mock | `seed`, `server_count` | true, 5 |

#### 2.1.3 InfluxDB Manager (`app/database.py`)

| Property | Value |
|----------|-------|
| **Class** | `InfluxDBManager` |
| **Pattern** | Singleton |

**Modes:**
- **Real mode**: Uses `influxdb-client` for actual InfluxDB operations
- **Mock mode**: In-memory dict-based storage when InfluxDB unavailable

**Key methods:**

| Method | Description | Time Complexity |
|--------|-------------|-----------------|
| `connect()` | Try real InfluxDB, fall back to mock | O(1) |
| `write_metric(measurement, tags, fields, time)` | Write single metric point | O(1) |
| `write_metrics_batch(points)` | Write multiple points atomically | O(n) |
| `query_metrics(measurement, server, hours, limit)` | Query historical metrics | O(m log m) sorted |
| `get_latest_metrics(server)` | Get most recent snapshot | O(1) |
| `is_connected()` | Check connectivity | O(1) |
| `close()` | Tear down connection | O(n) |

**Mock storage limits:**
- Max 10,000 points per measurement
- Pruned to last 5,000 when exceeded
- Latest value cached per server+measurement

#### 2.1.4 Router Registrations

| Module | Prefix | Tags | Key Endpoints |
|--------|--------|------|---------------|
| `api/servers.py` | None | servers | CRUD, bulk import/export, test connection |
| `api/metrics.py` | None | metrics | Current metrics, historical data, overview |
| `api/alerts.py` | None | alerts | List, active, acknowledge, resolve, remediate |
| `api/ai.py` | None | ai | Chat, chat/stream, analyze, health, models |
| `api/remediation.py` | None | remediation | Actions, execute, logs |
| `api/custom_checks.py` | None | checks | Run checks, get results |
| `api/vector_search.py` | None | vectors | Status, cache stats, search |
| `api/ws.py` | None | — | WebSocket `/ws/metrics` |

### 2.2 Frontend Components

#### 2.2.1 Component Hierarchy

```
App
├── ToastProvider
├── ParticleBackground
├── Layout
│   ├── Sidebar (nav items + connection status)
│   ├── Header (theme toggle, clock, connection dot, AI Ops toggle)
│   ├── AIOpsPanel (slide-over AI assistant)
│   └── <Content Area>
│       ├── SystemOverview (overview)
│       │   ├── CachePerformance
│       │   └── MetricChart (trend charts)
│       ├── ServerGrid (servers view)
│       │   ├── AddServerModal
│       │   ├── ImportServersModal
│       │   └── ServerCard (per-server)
│       │       └── MetricChart (sparklines)
│       ├── NetworkTopology (network view)
│       ├── AlertPanel (alerts view)
│       ├── AnomalyDetection (anomalies view)
│       │   ├── AnomalySkeleton
│       │   ├── SummaryCards
│       │   ├── AnomalyTimeline
│       │   └── BaselineTable
│       ├── SelfHealingPanel (self-healing view)
│       ├── ForecastView (forecasts view)
│       │   └── ForecastCard (per-server forecasts)
│       └── AIChat (AI assistant view)
```

#### 2.2.2 State Management

| State | Type | Source | Update Method |
|-------|------|--------|---------------|
| `activeView` | string | User navigation | `onNavigate` callback |
| `servers` | array | REST GET `/api/servers` | Initial fetch + WebSocket events |
| `metrics` | object | WebSocket | Real-time `metrics_update` messages |
| `alerts` | array | REST + WebSocket | Initial fetch + WebSocket updates |
| `customChecks` | array | WebSocket | `metrics_update` payload |
| `metricHistory` | object | REST on-demand | `fetchHistory` per server+measurement |
| `overview` | object | REST GET `/api/overview` | Initial fetch |
| `cacheStats` | object | REST GET `/api/vectors/cache-stats` | Every 30s + manual |
| `connected` | boolean | WebSocket lifecycle | `onopen` / `onclose` events |

#### 2.2.3 WebSocket Client

| Property | Value |
|----------|-------|
| **URL** | `ws://<host>/ws/metrics` |
| **Protocol** | `wss://` when page is HTTPS |
| **Reconnect delay** | 5 seconds (fixed) |
| **Message format** | JSON |

**Message types:**

| Type | Description | Payload |
|------|-------------|---------|
| `metrics_update` | New poll cycle data | `{metrics, alerts, new_alerts, custom_check_results}` |
| `server_update` | Single server metric | `{server, metrics}` |
| `server_event` | CRUD notification | `{event: 'added'|'updated'|'deleted', server}` |
| `server_status_change` | Status transition | `{server_id, old_status, new_status}` |

#### 2.2.4 Key UX Patterns

| Pattern | Implementation |
|---------|---------------|
| **Loading skeleton** | CSS `animate-pulse` with shape-matching placeholder elements |
| **Empty state** | Icon + message + suggestion (e.g., "No servers — click Add Server") |
| **Toast notifications** | Global `ToastProvider` with `useToast()` hook, exposed via `window.__toast` |
| **Auto-refresh** | `setInterval(30000)` with cleanup in `useEffect` return |
| **Theme toggle** | `ThemeContext` with CSS custom properties, spin animation on toggle |
| **Tag filtering** | Client-side filter with pill-style buttons showing key=value:count |

---

## 3. Data Models

### 3.1 Pydantic Schemas (`app/models/schemas.py`)

#### 3.1.1 Enums

```python
class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

class AlertStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"

class ServerStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"

class MetricType(str, Enum):
    CPU = "cpu"
    MEMORY = "memory"
    DISK = "disk"
    NETWORK = "network"

class RemediationAction(str, Enum):
    KILL_TOP_CPU = "kill_top_cpu_process"
    CLEAN_TEMP_FILES = "clean_temp_files"
    COMPRESS_LOGS = "compress_logs"
    RESTART_SERVICE = "restart_service"
    CLEAR_CACHE = "clear_cache"
    NOTIFY_ONLY = "notify_only"

class RemediationStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
```

#### 3.1.2 Server Models

```python
class ServerBase(BaseModel):
    id: str                          # Unique server identifier
    name: str                        # Display name
    host: str                        # SNMP host address
    port: int = 161                  # SNMP port
    snmp_version: str = "2c"         # 2c or 3
    snmp_community: str = "public"   # v2c community string
    # v3 auth fields (all Optional)
    snmp_username: Optional[str]
    snmp_auth_protocol: Optional[SNMPAuthProtocol]  # MD5 | SHA
    snmp_auth_password: Optional[str]
    snmp_priv_protocol: Optional[SNMPPrivProtocol]   # DES | AES
    snmp_priv_password: Optional[str]

class ServerCreate(ServerBase):
    tags: dict[str, str] = {}
    custom_checks: list[CustomCheckConfig] = []

class ServerUpdate(BaseModel):
    # All fields Optional — partial updates
    name: Optional[str]
    host: Optional[str]
    port: Optional[int]
    # ... other fields
    tags: Optional[dict[str, str]]
    custom_checks: Optional[list[CustomCheckConfig]]

class ServerResponse(ServerBase):
    status: ServerStatus = ServerStatus.UNKNOWN
    tags: dict[str, str] = {}
    custom_checks: list[CustomCheckConfig] = []
    last_seen: Optional[datetime]
    created_at: datetime
```

#### 3.1.3 Metric Models

```python
class MetricPoint(BaseModel):
    time: str
    measurement: str
    field: str
    value: float
    server: str

class MetricSnapshot(BaseModel):
    server: str
    timestamp: str
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    memory_used_gb: float = 0.0
    memory_total_gb: float = 0.0
    disk_percent: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    network_rx_bytes: float = 0.0
    network_tx_bytes: float = 0.0
    uptime_seconds: float = 0.0
```

#### 3.1.4 Alert Models

```python
class Alert(BaseModel):
    id: str = ""
    server: str
    metric: str                    # cpu | memory | disk | connectivity | service_*
    value: float
    threshold: float
    severity: AlertSeverity = WARNING
    status: AlertStatus = ACTIVE
    message: str
    remediation: str = ""
    created_at: str = (auto UTC ISO)
    resolved_at: Optional[str] = None
```

#### 3.1.5 Custom Check Models

```python
class CustomCheckConfig(BaseModel):
    name: str                      # e.g. "tomcat", "opensip"
    check_type: str                # tcp_port | http | process | custom_snmp | script
    target: Optional[str]          # defaults to server host
    port: Optional[int]
    url: Optional[str]
    expect_status: Optional[int] = 200
    process_name: Optional[str]
    oid: Optional[str]
    warn_threshold: Optional[float]
    crit_threshold: Optional[float]
    interval_seconds: int = 60
    timeout_seconds: int = 10
    tags: dict[str, str] = {}

class CustomCheckResult(BaseModel):
    name: str
    check_type: str
    server: str
    success: bool
    status: str                    # online | offline | degraded
    value: Optional[float]
    message: str
    response_time_ms: float
    timestamp: str
    error: Optional[str]
```

### 3.2 In-Memory Data Structures

#### 3.2.1 Server Storage

```
Stored in: servers.py module-level dict
Key: server_id (string)
Value: ServerResponse dict
Access: Direct dict lookup (O(1))
```

#### 3.2.2 Alert Storage

```
Stored in: alert_engine._alerts dict
Key: alert UUID (string)
Value: Alert model instance
Access: Dict lookup (O(1))
Cooldown: 5-minute configurable window per server+metric
```

#### 3.2.3 Anomaly Baselines

```
Stored in: anomaly_detector._baselines dict
Key: "server:metric:hour" (string)
Value: MetricBaseline instance
  - values: list[float] (sliding window, max 30)
  - mean: float
  - stddev: float
  - anomaly_count: int
  - baseline_established: bool
Z-score threshold: 2.5 (configurable)
Cooldown: 15 minutes per server+metric
```

#### 3.2.4 Forecast History

```
Stored in: forecaster._history dict
Key: "server:metric" (string)
Value: list[(datetime, float)] (sliding window, 7 days)
Min data points for forecast: 5
```

#### 3.2.5 Remediation Logs

```
Stored in: remediation_engine._logs list
Type: list[RemediationLog]
Max entries: unbounded (bounded only by memory)
```

---

## 4. API Specifications

### 4.1 Server Endpoints

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| GET | `/api/servers` | — | `ServerListResponse` | List all servers |
| POST | `/api/servers` | `ServerCreate` | `ServerResponse` | Register new server |
| GET | `/api/servers/{id}` | — | `ServerResponse` | Get server details |
| PUT | `/api/servers/{id}` | `ServerUpdate` | `ServerResponse` | Update server |
| DELETE | `/api/servers/{id}` | — | `{"status":"deleted"}` | Remove server |
| POST | `/api/servers/bulk-import` | `BulkImportRequest` | `BulkImportResponse` | Import multiple servers |
| GET | `/api/servers/export` | — | `list[ServerResponse]` | Export all as JSON |
| POST | `/api/servers/{id}/test-connection` | — | `TestConnectionResult` | Test SNMP connectivity |

### 4.2 Metric Endpoints

| Method | Endpoint | Query Params | Response | Description |
|--------|----------|-------------|----------|-------------|
| GET | `/api/metrics` | — | `MetricsResponse` | Current metrics (all servers) |
| GET | `/api/metrics/{server}` | — | `MetricSnapshot` | Current metrics (single server) |
| GET | `/api/metrics/history/{server}/{measurement}` | `hours` (default: 1), `limit` | `{"points": [MetricPoint]}` | Historical data |

### 4.3 Alert Endpoints

| Method | Endpoint | Query Params | Response | Description |
|--------|----------|-------------|----------|-------------|
| GET | `/api/alerts` | `status`, `server`, `severity` | `AlertListResponse` | List alerts |
| GET | `/api/alerts/active` | — | `AlertListResponse` | Active alerts only |
| POST | `/api/alerts/{id}/acknowledge` | — | `Alert` | Acknowledge alert |
| POST | `/api/alerts/{id}/resolve` | — | `Alert` | Resolve alert |
| POST | `/api/alerts/{id}/remediate` | `deep` (bool) | `{"remediation", "source", ...}` | AI remediation |
| GET | `/api/alerts/{id}/remediation-actions` | — | `list[Action]` | Predefined actions |
| POST | `/api/alerts/{id}/execute-action` | `action` | Action result | Execute predefined action |

### 4.4 AI Endpoints

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| POST | `/api/ai/chat` | `ChatRequest` | `ChatResponse` | Natural language query |
| POST | `/api/ai/chat/stream` | `ChatRequest` | SSE stream | Streaming response |
| POST | `/api/ai/analyze` | `AnalyzeRequest` | `AnalyzeResponse` | Data analysis |
| GET | `/api/ai/health` | — | Text report | AI-generated health report |
| GET | `/api/ai/models` | — | `list[Model]` | List Ollama models |

### 4.5 WebSocket Endpoint

| Path | Description | Frame Format |
|------|-------------|--------------|
| `/ws/metrics` | Real-time metric streaming | JSON per frame |

**Server → Client frames:**

```json
// Metrics update (every poll cycle)
{
  "type": "metrics_update",
  "metrics": [MetricSnapshot],
  "alerts": [Alert],
  "new_alerts": [Alert],
  "custom_check_results": [CustomCheckResult]
}

// Server CRUD event
{
  "type": "server_event",
  "event": "added|updated|deleted",
  "server": ServerResponse
}

// Status change
{
  "type": "server_status_change",
  "server_id": "web-01",
  "old_status": "online",
  "new_status": "offline"
}
```

### 4.6 Vector Cache Endpoints

| Method | Endpoint | Response | Description |
|--------|----------|----------|-------------|
| GET | `/api/vectors/status` | Collection stats | Qdrant connection + collection status |
| GET | `/api/vectors/cache-stats` | Cache performance | Hit/miss rates, savings |
| POST | `/api/vectors/search` | Similar alerts | Semantic search |

### 4.7 Custom Check Endpoints

| Method | Endpoint | Response | Description |
|--------|----------|----------|-------------|
| GET | `/api/servers/{id}/checks` | `ServerChecksResponse` | Run and return custom checks |

### 4.8 System Endpoints

| Method | Endpoint | Response | Description |
|--------|----------|----------|-------------|
| GET | `/api/health` | `HealthResponse` | System health including component status |
| GET | `/api/overview` | Overview stats | Dashboard aggregate statistics |

---

## 5. Data Flow

### 5.1 Poll Cycle (60-second default)

```
1. Timer fires (APScheduler)
2. SNMPPoller.poll_all()
3. For each registered server:
   a. Try real SNMP via easynsmp (v2c or v3)
   b. If SNMP fails → generate mock snapshot
   c. Write to InfluxDB (4 measurements: cpu, memory, disk, network)
   d. Feed snapshot to Forecaster
   e. Feed snapshot to AnomalyDetector
   f. Collect snapshot in list
4. Broadcast via WebSocket:
   a. Build metrics_update message with all snapshots
   b. Evaluate each snapshot via AlertEngine
   c. If new alerts → include in message
   d. Run custom checks → include results
5. AlertEngine stores new alerts in memory
6. New alerts → embed in Qdrant (async, best-effort)
```

### 5.2 AI Chat Flow

```
1. User sends query via POST /api/ai/chat
2. Backend gathers context:
   a. Current metrics from poller/poller.servers
   b. Active alerts from AlertEngine
   c. If server specified → filter context
3. Format context into prompt:
   "Current Metrics:\n{formatted_metrics}\n
    Active Alerts:\n{formatted_alerts}\n
    User Question: {message}"
4. Send to Ollama via /api/generate (non-streaming)
   OR /api/chat (streaming via SSE)
5. Return response to user
```

### 5.3 Alert Remediation Flow

```
1. Alert triggered by AlertEngine
2. Alert embedded to Qdrant (async)
3. User requests remediation (POST /api/alerts/{id}/remediate)
4. AIService.analyze_alert(alert):
   a. Generate query from alert message
   b. Search Qdrant remediation cache:
      - Score ≥ 0.85 → Return cached directly (<100ms)
      - Score ≥ 0.55 → Use as RAG context for Ollama prompt
      - Score < 0.55 → Full Ollama analysis from scratch
   c. Record result in cache stats
5. If Ollama analysis → store remediation in Qdrant for future
6. Return remediation to caller
```

### 5.4 Anomaly Detection Flow

```
1. SNMPPoller feeds snapshot to AnomalyDetector.evaluate()
2. For each metric (cpu_percent, memory_percent, disk_percent):
   a. Get/create MetricBaseline for server:metric:current_hour
   b. Append value to sliding window (max 30)
   c. Compute mean + stddev (min 5 samples)
   d. Calculate Z-score = |value - mean| / stddev
   e. If Z-score > 2.5:
      - Check cooldown (15 min per server:metric)
      - If not in cooldown:
        → Log anomaly with direction, severity, expected range
        → Set cooldown
3. Return list of anomalies
```

### 5.5 Forecasting Flow

```
1. SNMPPoller feeds snapshot to Forecaster.record_from_snapshot()
2. For each metric (cpu_percent, memory_percent, disk_percent):
   a. Store (datetime, value) in history dict
   b. Prune data older than 7 days
3. On request (GET /api/forecasts):
   a. For each server+metric with ≥ 5 data points:
      - Convert timestamps to hours since first point
      - Fit LinearRegression (least squares)
      - Compute slope, intercept, R-squared
      - Determine trend (increasing/decreasing/stable)
      - Calculate days_to_warning and days_to_critical
      - Predict values at 7d and 30d
      - Assign confidence level (high/medium/low)
```

---

## 6. State Management

### 6.1 Service Singletons

All services use the singleton pattern for in-memory state:

| Service | File | State Storage | Persistence |
|---------|------|--------------|-------------|
| `db` | `app/database.py` | InfluxDB + in-memory fallback | Docker volume (InfluxDB) |
| `poller` | `app/services/snmp_poller.py` | Registered servers list + poll status | None (ephemeral) |
| `alert_engine` | `app/services/alert_engine.py` | Alerts dict | None (ephemeral) |
| `ai_service` | `app/services/ai_service.py` | Cache stats dict | None (ephemeral) |
| `vector_store` | `app/services/vector_store.py` | Qdrant (remote) | Qdrant volume |
| `remediation_engine` | `app/services/remediation_engine.py` | Logs list + cooldowns dict | None (ephemeral) |
| `forecaster` | `app/services/forecaster.py` | History dict (7-day sliding) | None (ephemeral) |
| `anomaly_detector` | `app/services/anomaly_detector.py` | Baselines dict + log list | None (ephemeral) |
| `custom_check_runner` | `app/services/custom_checks.py` | Latest results dict | None (ephemeral) |

### 6.2 WebSocket Manager

Single `ConnectionManager` instance in `api/ws.py`:
- Tracks all active WebSocket connections
- Provides `broadcast()` method for sending to all clients
- Auto-removes disconnected clients

---

## 7. Algorithm & Service Design

### 7.1 Linear Regression (`services/forecaster.py`)

```
Class LinearRegression:
  Input: list[(x: float, y: float)]  # time vs value
  Computation:
    n = len(data)
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    numerator = sum((x - x_mean) * (y - y_mean))
    denominator = sum((x - x_mean)^2)
    slope = numerator / denominator  (if denominator != 0)
    intercept = y_mean - slope * x_mean
    ss_res = sum((y - (slope*x + intercept))^2)
    ss_tot = sum((y - y_mean)^2)
    r_squared = 1 - ss_res / ss_tot  (if ss_tot > 0)
  Predict: y = slope * x + intercept
```

### 7.2 Z-Score Anomaly Detection (`services/anomaly_detector.py`)

```
Class MetricBaseline:
  window_size = 30
  z_score_threshold = 2.5

  update(value):
    values.append(value)
    if len(values) > window_size: pop oldest
    if len(values) < 5: return None  // insufficient data
    mean = avg(values)
    stddev = stdev(values)  // population or sample
    z_score = |value - mean| / stddev
    if z_score > threshold:
      severity = "critical" if z_score > 4.0 else "warning"
      return anomaly { z_score, direction, severity,
                       expected_range: (mean-2σ, mean+2σ), ... }
```

### 7.3 Three-Tier Cache (AI Service + Vector Store)

```
Cache thresholds (configurable):
  HIGH = 0.85    → Direct cache hit
  MEDIUM = 0.55  → RAG context threshold
  MIN = 0.40     → Minimum score to consider

Search flow:
  1. Embed query using nomic-embed-text (768-dims)
  2. Search Qdrant with filter: remediation != ""
  3. If top score >= HIGH:
       → Return cached remediation with score label
  4. If top score >= MEDIUM:
       → Use as RAG context in Ollama prompt (reduced tokens)
  5. Else:
       → Full Ollama analysis

Cache stats tracking:
  total_requests, cache_hits, rag_fallbacks, full_analysis
  avg_duration per tier, estimated Ollama savings
```

### 7.4 Alert Cooldown & Escalation

```
Cooldown:
  Per server + metric + severity
  Default: 5 minutes
  Prevents duplicate alerts for same condition

Escalation:
  Severity ranking: INFO(0) < WARNING(1) < CRITICAL(2)
  If new alert severity > existing active alert → resolve lower, create higher
  If new alert severity <= existing active alert → suppress
```

### 7.5 Mock Data Generation

```
Random ranges per metric:
  cpu_percent:     10–95
  memory_total:    random.choice([4, 8, 16, 32, 64]) GB
  memory_usage:    30–95% of total
  disk_total:      random.choice([100, 250, 500, 1000]) GB
  disk_usage:      20–95% of total
  network_rx:      1e6–5e8 bytes
  network_tx:      0.5e6–2e8 bytes
  uptime:          1–30 days
```

### 7.6 Remediation Recipes

```
Metric → Action → Condition → Command:

CPU:
  KILL_TOP_CPU:    Critical → kill highest CPU process
  NOTIFY_ONLY:     Always   → log notification

Memory:
  CLEAR_CACHE:     Warning  → sync + drop_caches
  KILL_TOP_CPU:    Critical → kill highest memory process
  NOTIFY_ONLY:     Always   → log notification

Disk:
  CLEAN_TEMP_FILES: Warning  → find /tmp -atime +7 -delete
  COMPRESS_LOGS:    Warning  → gzip /var/log/*.log
  NOTIFY_ONLY:      Always   → log notification

All actions have:
  - Risk level (low/medium/high)
  - Cooldown (5-120 minutes)
  - Simulation mode by default (no actual execution)
```

---

## 8. Deployment Architecture

### 8.1 Docker Compose Services

| Service | Image | Ports | Volumes | Depends On | Health Check |
|---------|-------|-------|---------|------------|--------------|
| `influxdb` | influxdb:2.7-alpine | 8086 | influxdb-data | — | `influx ping` |
| `ollama` | ollama/ollama:latest | 11434 | ollama-data | — | `ollama list` |
| `backend` | custom (./backend/Dockerfile) | 8000 | — | influxdb (healthy) | HTTP /api/health |
| `frontend` | custom (./frontend/Dockerfile) | 80, 443 | nginx config | backend | HTTP :80/ |
| `poller` | custom (./monitoring/Dockerfile) | — | — | backend (healthy) | — |
| `ollama-setup` | ollama/ollama:latest | — | ollama-data | ollama (started) | — (one-shot) |

### 8.2 Docker Network

```yaml
networks:
  egli2-net:
    driver: bridge
    name: egli2-network
```

All services communicate over the `egli2-net` bridge network. Service discovery is via container names:
- Backend → `http://influxdb:8086`
- Backend → `http://ollama:11434`
- Frontend → `http://backend:8000` (via Nginx proxy)

### 8.3 Deployment Commands

| Action | Command |
|--------|---------|
| Start all services | `docker compose up -d` |
| Pull LLM model | `docker compose --profile setup run ollama-setup` |
| View logs | `docker compose logs -f backend` |
| Restart service | `docker compose restart backend` |
| Stop all | `docker compose down` |
| Full teardown (incl. volumes) | `docker compose down -v` |
| Rebuild | `docker compose build --no-cache` |

### 8.4 Systemd Services (Production)

| Service | Purpose | Type |
|---------|---------|------|
| `egli2.service` | Main stack startup | oneshot |
| `egli2-health.service` | Periodic health check | oneshot (timer) |
| `egli2-health.timer` | 5-minute health check schedule | timer |
| `egli2-notify@.service` | Per-instance alert notification | oneshot |

### 8.5 Resource Requirements

| Scale | Servers | RAM | CPU | Storage | Network |
|-------|---------|-----|-----|---------|---------|
| Small | 1–10 | 8 GB | 2 vCPU | 20 GB SSD | 100 Mbps |
| Medium | 10–50 | 16 GB | 4 vCPU | 50 GB SSD | 1 Gbps |
| Large | 50–200 | 32 GB | 8 vCPU | 100 GB SSD | 1 Gbps |

---

## 9. Security Design

### 9.1 Network Security

| Port | Protocol | Exposure | Purpose |
|------|----------|----------|---------|
| 22 | TCP | Inbound (SSH) | Administration |
| 80 | TCP | Inbound (HTTP) | Dashboard access |
| 443 | TCP | Inbound (HTTPS) | Dashboard access (SSL) |
| 161 | UDP | Outbound | SNMP polling |
| 8086 | TCP | Internal only | InfluxDB |
| 11434 | TCP | Internal only | Ollama |
| 6333 | TCP | Internal only | Qdrant |

### 9.2 Authentication & Secrets

| Secret | Generation | Storage | Rotation |
|--------|-----------|---------|----------|
| `SECRET_KEY` | `openssl rand -hex 32` | `.env` file | Manual |
| `INFLUXDB_TOKEN` | `openssl rand -hex 16` | `.env` file | Manual |
| SNMP community | User-configured | Environment / API | Per-server |

### 9.3 SNMP Security

| Version | Authentication | Encryption | Recommendation |
|---------|---------------|------------|----------------|
| v2c | Community string (plaintext) | None | Development only |
| v3 (authPriv) | SHA/MD5 password | AES/DES encryption | Production |

### 9.4 Data Privacy

- **Zero data egress**: All processing (LLM, vector search, alerts) happens locally
- **No telemetry**: No analytics or usage tracking sent externally
- **Air-gapped capable**: Can run fully offline once images and models are cached

---

## 10. Performance Design

### 10.1 Expected Performance Characteristics

| Operation | Expected Latency | Bottleneck | Optimization |
|-----------|-----------------|------------|--------------|
| REST API (no AI) | < 50ms | In-memory lookups | Direct dict access |
| REST API (with InfluxDB) | < 200ms | Network + query | Indexed measurements |
| AI chat (full) | 5–15s | Ollama CPU inference | Use smaller model, GPU |
| AI chat (cached) | < 100ms | Qdrant lookup | In-memory + indexing |
| AI chat (RAG) | 3–8s | Partial Ollama | Reduced token count |
| WebSocket broadcast | < 50ms (50 clients) | Serialization | JSON encoding |
| SNMP poll (10 servers) | < 10s | Network latency | Parallel polling |
| SNMP poll (50 servers) | < 30s | Network + concurrency | Adjustable timeout |
| Qdrant embed | 100–300ms | Ollama embedding | Async/batch |

### 10.2 Optimization Strategies

| Strategy | Application | Expected Improvement |
|----------|------------|---------------------|
| Vector cache | AI remediation | 10-15x faster (100ms vs 10s) |
| Mock fallback | InfluxDB queries | 100x faster (local dict vs network) |
| Sliding window | Anomaly detection | O(1) memory bound |
| Bounded storage | InfluxDB mock | Prevents memory growth |
| Async I/O | Custom checks | 10x concurrent throughput |

### 10.3 Concurrency Model

| Component | Concurrency | Mechanism |
|-----------|-------------|-----------|
| Web server | Async | Uvicorn with async handlers |
| SNMP polling | Synchronous | APScheduler (runs in executor) |
| Custom checks | Async | `asyncio.gather` with semaphore (max 10) |
| WebSocket | Async | Per-connection coroutine |
| Qdrant writes | Async + fire-and-forget | `asyncio.ensure_future` |
| LLM calls | Async | httpx.AsyncClient |

---

## 11. Testing Strategy

### 11.1 Test Levels

| Level | Tool | Location | Focus |
|-------|------|----------|-------|
| Unit (backend) | pytest | backend (planned) | Services, algorithms, data models |
| Unit (frontend) | Vitest + Testing Library | `frontend/src/components/__tests__/` | Component rendering, interactions |
| Integration | pytest + httpx | backend (planned) | API endpoints, data flow |
| E2E | Playwright (planned) | — | Full stack flows |

### 11.2 Frontend Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| AIChat.test.jsx | 17 | Loading, streaming, error, suggested queries |
| AIOpsPanel.test.jsx | 18 | Panel open/close, interactions |
| AlertPanel.test.jsx | 22 | Filter, acknowledge, resolve, severity |
| AnomalyDetection.test.jsx | 19 | Summary, timeline, baselines, filtering |
| AutoFixButton.test.jsx | — | Click, loading, success |
| CountdownTimer.test.jsx | — | Timer display, completion |
| ForecastCard.test.jsx | — | Data display, empty state |
| ImportServersModal.test.jsx | — | Import flow, validation |
| Layout.test.jsx | 14 | Navigation, responsive |
| LiveClock.test.jsx | — | Time display |
| MetricChart.test.jsx | — | Chart rendering, data |
| NetworkTopology.test.jsx | — | Graph, interactions |
| ParticleBackground.test.jsx | — | Canvas rendering |
| QuickActionGrid.test.jsx | — | Action buttons |
| SelfHealingPanel.test.jsx | — | Controls, logs |
| ServerCard.test.jsx | 25 | Gauges, badges, history |
| SystemOverview.test.jsx | 19 | Stats, cache performance |
| Toast.test.jsx | — | Notifications, timeout |

**Total: 348 tests across 18 files** (all passing)

### 11.3 Test Patterns

| Pattern | Implementation |
|---------|---------------|
| Loading skeleton | Assert skeleton renders when `loading=true` or no data |
| Empty state | Assert empty message renders when data=[] |
| Error state | Assert error message when fetch fails |
| Data rendering | Assert correct values/formatting with mock data |
| User interaction | Simulate clicks, verify state changes and event calls |
| Auto-refresh | Mock timers, verify fetch called at interval |
| Conditional display | Assert elements present/hidden based on props |

### 11.4 Integration Test: Cache Pipeline

File: `test_cache_flow.py`

Tests the full 3-tier cache pipeline:
1. Mock Qdrant and Ollama endpoints
2. Trigger alert with known pattern
3. Assert cache miss → full analysis
4. Store remediation
5. Trigger similar alert
6. Assert cache hit → fast response

---

## 12. Technical Debt & Future Considerations

### 12.1 Known Technical Debt

| Area | Issue | Impact | Priority |
|------|-------|--------|----------|
| **State persistence** | All state (servers, alerts) is in-memory | Lost on restart | High |
| **Auth** | No authentication or RBAC | Anyone with network access can use API | High |
| **Error handling** | Some `asyncio.ensure_future` fire-and-forget calls are unhandled | Silent failures | Medium |
| **SNMP error handling** | Mock fallback hides real SNMP failures | Operators may not notice polling issues | Medium |
| **Qdrant filter syntax** | `search_remediation_cache` uses `must_not` workaround for empty string filter | May behave unexpectedly with different Qdrant versions | Low |
| **Frontend bundle** | Single bundle with all components | Larger initial load | Low |
| **No pagination** | All endpoints return complete datasets | Performance issues with 200+ servers | Medium |
| **No API versioning** | All endpoints under `/api/` with no version prefix | Breaking changes harder to manage | Low |

### 12.2 Future Enhancements

| Feature | Priority | Complexity | Dependencies |
|---------|----------|------------|--------------|
| **Multi-tenancy** | High | High | Auth, RBAC, data isolation |
| **Authentication (JWT/OAuth)** | High | Medium | User management |
| **PagerDuty integration** | Medium | Medium | Webhook system |
| **Slack integration** | Medium | Low | Webhook system |
| **Email alerts** | Medium | Low | SMTP config |
| **Prometheus export** | Medium | Low | New endpoint |
| **Grafana datasource** | Low | Medium | Grafana plugin API |
| **Kubernetes autodiscovery** | Low | High | K8s API integration |
| **ML-driven anomaly** | Low | High | Training pipeline |
| **Mobile app** | Low | High | React Native |
| **Webhook system** | Medium | Medium | Notification abstraction |
| **Alert rules (CRUD)** | Medium | Medium | Rule storage + evaluation |
| **Dashboard customization** | Low | Medium | Widget system |
| **Export to PDF** | Low | Low | Reports feature |

### 12.3 Monitoring the Monitor

| Check | Frequency | Action on Failure |
|-------|-----------|-------------------|
| Docker containers healthy | Every 5 min (systemd timer) | Auto-restart unhealthy |
| API health endpoint | Every 5 min | Systemd notification |
| Disk space (< 1 GB) | Every 5 min | Warning log + notification |
| Memory (< 512 MB) | Every 5 min | Warning log + notification |
| InfluxDB connectivity | Every poll cycle | Mock fallback |
| Ollama availability | Every AI request | Graceful error response |

### 12.4 Backup Strategy

| Data | Frequency | Method | Retention |
|------|-----------|--------|-----------|
| InfluxDB metrics | Daily | `influx backup` via script | 7 days (rolling) |
| Server registration | Daily | API export | 7 days (rolling) |
| Configuration (.env) | Daily | File copy | 7 days (rolling) |
| Docker volumes | Weekly | Volume backup | 4 weeks |

---

*End of TRD Document*
