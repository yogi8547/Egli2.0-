# Release Notes — v1.3.0

> **Branch:** `master` — Commits `844b601..7c2d21c`
> **21 files changed, +3,557 / -33 lines**

---

## 1. RAG Vector Cache for Alert Remediation

Implements a 3-tier semantic cache using Qdrant vector DB to speed up alert remediation:

| Tier | Score Range | Behavior |
|------|-------------|----------|
| **Cache Hit** | ≥ 0.85 | Instant replay — past remediation returned immediately |
| **RAG Context** | 0.55–0.85 | Similar past remediation used as context for Ollama prompt |
| **Full Analysis** | < 0.55 | Falls through to complete Ollama analysis |

**New files:**
- `backend/app/services/vector_store.py` — Qdrant client wrapper with `search_remediation_cache()` and `update_alert_remediation()`
- `backend/app/services/custom_checks.py` — Per-server health check runner (Tomcat, Nginx, MySQL, Redis, Grafana, OpenSIP)
- `backend/app/api/custom_checks.py` — REST endpoints for custom checks
- `backend/app/api/vector_search.py` — REST endpoints for vector search and Qdrant status

**Configurable thresholds** (via `.env`):
- `VECTOR_CACHE_TOP_K=5` — top-K candidates to retrieve
- `VECTOR_CACHE_HIGH_THRESHOLD=0.85` — cache hit threshold
- `VECTOR_CACHE_MEDIUM_THRESHOLD=0.55` — RAG context threshold
- `VECTOR_CACHE_MIN_SCORE=0.4` — minimum similarity score
- `QDRANT_REINDEX_ON_START=true` — auto-index alerts into Qdrant on startup

### API Changes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vectors/status` | GET | Qdrant connection + collection status |
| `/api/vectors/cache-stats` | GET | Cache hit/RAG/analysis rate counters |
| `/api/vectors/search` | POST | Semantic search across remediation history |
| `/api/servers/{id}/checks` | GET | Run custom health checks for a server |
| `/api/health` | GET | Now includes `vector_cache_stats` in response |

The remediate endpoint (`POST /api/alerts/{id}/remediate`) now reports `source: "vector_cache" | "ollama"` and `duration_seconds` in the response.

---

## 2. Real-Time WebSocket Events

Live server CRUD and status change broadcasts:

- **Server added/updated/deleted** — WebSocket message `type: "server_event"` with event type and full server payload
- **Status change detection** — SNMP poll success tracking (`snmp_poller.get_poll_status()`) triggers `type: "server_status_change"` broadcasts
- **Frontend handling** — Live toast notifications for server events (`Server Added`, `Server Updated`, `Server Removed`, `Server Offline`)
- **WebSocket proxy fix** — Vite proxy target changed from `ws://localhost:8000` to `http://localhost:8000` with `changeOrigin: true`

---

## 3. Cache Performance Dashboard

New live dashboard card showing vector cache efficiency:

**States:**
- **Loading skeleton** — `CachePerformanceSkeleton` with `animate-pulse` bars matching card layout
- **Empty** — "No remediation requests yet" with step-by-step instructions
- **Data view** — 3-tier stacked bar chart + savings summary pill
- **Refresh** — Spinning `RefreshCw` icon during refresh

**Auto-refresh:**
- Fetches `/api/vectors/cache-stats` every 30 seconds via `setInterval`
- Manual refresh button in card header (shared `useCallback` between auto and manual)

**Component additions:**
- `CachePerformance` — 3-tier bar chart, hit/RAG/analysis rate display, savings estimate
- `CachePerformanceSkeleton` — Pulsing placeholder during initial load
- `ServiceCheckStatus` — Health ring with per-server check result dots
- **ServerCard** — Custom check badges with hover tooltips

---

## 4. Custom Health Checks

Per-server service health verification:

| Service | Check Type |
|---------|------------|
| **Tomcat** | HTTP check on port 8080/8443 |
| **Nginx** | HTTP check on port 80/443 |
| **MySQL** | TCP port check on 3306 |
| **Redis** | TCP port check on 6379 |
| **Grafana** | HTTP check on port 3000 |
| **OpenSIP** | SIP OPTIONS via UDP 5060 |

Mock servers seeded with realistic custom check configurations.

---

## 5. Anomaly Detection Dashboard

New dedicated dashboard for statistical anomaly detection:

**Summary cards:**
- **Total Baselines** — Number of learned patterns per server+metric+hour
- **Total Anomalies** — All-time anomaly detections
- **Last Hour** — Recent anomalies (color-coded green/red)
- **Tracked Metrics** — Badges showing CPU, Memory, Disk monitoring

**Anomaly Timeline tab:**
- Server name + metric icon for each detection
- Severity badges (critical/warning) with color-coded backgrounds
- Direction indicators (TrendingUp/TrendingDown) with current value
- Expected range display: `Expected: low–high`
- z-score, baseline mean, and stddev per anomaly
- Empty state when no anomalies detected

**Learned Baselines tab:**
- Sortable table (click column headers: Server, Metric, Hour, Mean, StdDev, Samples, Anomalies)
- Metric filter buttons (All/CPU/Memory/Disk)
- Color-coded mean values (red >80%, yellow >60%, white normal)
- StdDev indicators (yellow >20, green <10)
- Anomaly count per baseline with bold red for >0

**UX features:**
- Loading skeleton (`AnomalySkeleton`) matching full layout on initial load
- Auto-refresh every 30s with cleanup on unmount
- Manual refresh button with spinning icon
- Info footer explaining z-score methodology (2.5σ threshold, 30-sample window, 15-min cooldown)

**Files:**
- `frontend/src/components/AnomalyDetection.jsx` — 603 lines
- `frontend/src/components/__tests__/AnomalyDetection.test.jsx` — 19 tests
- `frontend/src/components/Layout.jsx` — Added "Anomalies" nav item
- `frontend/src/App.jsx` — Added import and routing for 'anomalies' view

API endpoints consumed:
- `GET /api/anomalies` — Recent anomaly detections
- `GET /api/anomalies/summary` — Summary statistics
- `GET /api/anomalies/baselines` — Learned baselines per server+metric+hour

---

## 6. Infrastructure & Deployment

- **`install-ubuntu-native.sh`** — Full native deployment script (Qdrant, InfluxDB, Ollama, backend, Nginx)
- **`start.bat`** — Auto-installs pip dependencies and starts both frontend + backend
- **`start-backend.bat`** — Standalone backend startup script
- **`install-deps.bat`** — Python dependency installer for Windows
- **`test_cache_flow.py`** — End-to-end test script for the full RAG cache pipeline

---

## 7. Test Suite

All **348 tests pass across 18 test files** — no regressions (+19 new AnomalyDetection tests).

| Test File | Tests | Coverage |
|-----------|-------|----------|
| AnomalyDetection | 19 | Loading skeleton, summary cards, tabs, anomaly timeline, baseline table, metric filtering, refresh, error state |
| SystemOverview | 19 | Skeleton, CachePerformance, refresh button |
| AIOpsPanel | 18 | Panel interactions |
| AlertPanel | 22 | Alert lifecycle, actions |
| ServerCard | 25 | Custom check badges render |
| AIChat | 17 | Chat interactions |
| Layout | 14 | Navigation |
| +12 more files | 214 | All passing |

| Test File | Tests | Coverage |
|-----------|-------|----------|
| SystemOverview | 19 | Skeleton, CachePerformance, refresh button |
| AIOpsPanel | 18 | Panel interactions |
| AlertPanel | 22 | Alert lifecycle, actions |
| ServerCard | 25 | Custom check badges render |
| AIChat | 17 | Chat interactions |
| Layout | 14 | Navigation |
| +12 more files | 214 | All passing |

---

## Upgrade Notes

### Required environment variables (new):
```bash
# Add to backend/.env or export:
VECTOR_CACHE_TOP_K=5
VECTOR_CACHE_HIGH_THRESHOLD=0.85
VECTOR_CACHE_MEDIUM_THRESHOLD=0.55
VECTOR_CACHE_MIN_SCORE=0.4
QDRANT_REINDEX_ON_START=true
```

### New Python dependencies:
```bash
pip install qdrant-client>=1.9.0
```

### Database:
- Qdrant must be running (default: `http://localhost:6333`)
- On startup, alerts are automatically re-indexed into the `alert_remediations` collection
