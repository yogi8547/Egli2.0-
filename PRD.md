# Egli2.0 — Product Requirements Document (PRD)

> **Document Version:** 1.0  
> **Date:** June 8, 2026  
> **Status:** Approved  
> **Author:** Egli2.0 Product Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [Target Audience & Personas](#3-target-audience--personas)
4. [User Stories & Epics](#4-user-stories--epics)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [User Interface & UX Requirements](#7-user-interface--ux-requirements)
8. [Integration Requirements](#8-integration-requirements)
9. [Data Requirements](#9-data-requirements)
10. [Release Criteria](#10-release-criteria)
11. [Glossary](#11-glossary)

---

## 1. Executive Summary

### 1.1 Problem Statement

Organizations running on-premise or hybrid infrastructure lack affordable, self-hosted monitoring solutions that combine **real-time metrics collection**, **intelligent alerting**, **AI-powered analysis**, and **self-healing automation** — all without sending sensitive infrastructure data to third-party cloud services.

Existing solutions fall into two categories:
- **Cloud-based** (Datadog, New Relic, Grafana Cloud): Require external API calls, monthly per-host fees, and send telemetry data off-site.
- **Self-hosted but fragmented** (Nagios, Zabbix, Prometheus + Grafana): Require stitching together multiple tools, lack native AI integration, and have steep configuration curves.

### 1.2 Solution

**Egli2.0** is a self-hosted, AI-powered infrastructure monitoring platform that provides:

- **Unified dashboard** with real-time WebSocket updates
- **SNMP-based metric collection** (CPU, memory, disk, network)
- **Threshold-based alert engine** with configurable severity levels
- **Local LLM integration** (Ollama) for natural language queries and analysis — **zero cloud dependencies**
- **Semantic vector cache** (Qdrant) for instant alert remediation replay
- **Anomaly detection** via statistical baselines (Z-score)
- **Predictive forecasting** via linear regression
- **Self-healing automation** with predefined remediation recipes
- **Custom service health checks** (TCP port, HTTP, process)
- **Root cause analysis** with dependency graph and hypothesis generation

### 1.3 Key Differentiators

| Feature | Egli2.0 | Competitors |
|---------|---------|-------------|
| **AI Inference** | Local (Ollama) — no external API | Cloud-based LLM calls |
| **Data Privacy** | 100% offline-capable | Data sent to cloud |
| **Cost Model** | One-time infrastructure cost | Per-host/month SaaS |
| **Alert Cache** | 3-tier semantic vector cache | None |
| **Self-Healing** | Predefined + AI-driven recipes | Manual response only |
| **Deployment** | Single `docker compose up -d` | Multi-tool assembly |

### 1.4 Success Metrics

| Metric | Target |
|--------|--------|
| Time to first dashboard | < 5 minutes (from git clone) |
| Poll interval accuracy | ±1 second at 60s interval |
| AI response time (cached) | < 100 ms (P95) |
| AI response time (full) | < 15 seconds (P95 on CPU) |
| Alert → notification latency | < 2 seconds |
| Dashboard load time | < 2 seconds (initial), < 500ms (subsequent) |
| System uptime | 99.9% (platform itself) |
| Concurrent dashboard users | 20+ simultaneous WebSocket connections |

---

## 2. Product Vision & Strategy

### 2.1 Vision Statement

> **"Every infrastructure team should have enterprise-grade, AI-powered monitoring — without vendor lock-in, per-host pricing, or sending their data to the cloud."**

### 2.2 Strategic Goals

| Goal | Timeline | Priority |
|------|----------|----------|
| **V1.0** — Core monitoring with AI chat | ✅ Shipped | Core |
| **V1.1** — Alert engine + remediation | ✅ Shipped | Core |
| **V1.2** — Vector cache + self-healing | ✅ Shipped | Growth |
| **V1.3** — Anomaly detection + forecasting | ✅ Shipped | Growth |
| **V1.4** — Custom checks + RCA module | ✅ Shipped | Growth |
| **V2.0** — Multi-tenancy + RBAC | Q3 2026 | Expansion |
| **V2.1** — PagerDuty/webhook integrations | Q4 2026 | Expansion |
| **V2.2** — ML-driven capacity planning | Q1 2027 | Innovation |

### 2.3 Target Market

| Segment | Size | Fit |
|---------|------|-----|
| **SMBs with on-prem infrastructure** | Large | ✅ Perfect fit — no budget for Datadog |
| **Managed Service Providers (MSPs)** | Medium | ⚠️ Needs multi-tenancy (V2.0) |
| **Government / Defense** | Niche | ✅ Air-gapped deployment is a feature |
| **DevOps teams in regulated industries** | Medium | ✅ Zero data leaves the network |
| **Homelab / Self-hosted enthusiasts** | Large | ✅ Free + Docker-based |

---

## 3. Target Audience & Personas

### 3.1 Primary Personas

#### Persona A: SRE / DevOps Engineer
- **Name:** Alex
- **Role:** Senior Site Reliability Engineer
- **Goals:** Reduce MTTR (Mean Time to Resolution), automate repetitive tasks, get AI-driven insights
- **Pain points:** Alert fatigue, manual root cause analysis, expensive cloud monitoring tools
- **Key needs:**
  - Real-time dashboard with live updates
  - AI-powered alert analysis and remediation suggestions
  - Self-healing automation with safety cooldowns
  - Custom service health checks (Tomcat, OpenSIP, etc.)
  - Exportable API for integration with existing tools

#### Persona B: NOC Operator
- **Name:** Jordan
- **Role:** Network Operations Center Analyst
- **Goals:** Quickly identify and escalate infrastructure issues, reduce false positives
- **Pain points:** Information overload, hard-to-read dashboards, slow alert response
- **Key needs:**
  - Clean, dark-themed NOC-style dashboard
  - Visual status indicators (online/degraded/offline)
  - Severity-filtered alert lists with one-click acknowledge/resolve
  - AI natural language queries for quick investigations
  - Toast notifications for critical events

#### Persona C: IT Manager / Director
- **Name:** Sam
- **Role:** IT Infrastructure Manager
- **Goals:** Oversee infrastructure health, plan capacity, control costs
- **Pain points:** No budget for premium monitoring, needs high-level overview
- **Key needs:**
  - Executive dashboard with aggregate stats
  - Predictive forecasting (days until disk full, etc.)
  - AI-generated health reports
  - Zero cloud dependency for compliance
  - Simple deployment and maintenance

### 3.2 Secondary Persona

#### Persona D: System Administrator
- **Name:** Taylor
- **Role:** SysAdmin handling day-to-day server management
- **Goals:** Register new servers, configure SNMP, manage alerts
- **Key needs:**
  - SNMPv2c/v3 server registration via API or UI
  - Bulk import/export of server configurations
  - Tag-based server filtering
  - Test-connection endpoint for validation
  - CLI scripts for automation

---

## 4. User Stories & Epics

### 4.1 Epic: Dashboard & Visualization

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| DASH-01 | As a NOC operator, I want a dark-themed dashboard with live-updating metrics so I can monitor infrastructure at a glance | P0 | Large |
| DASH-02 | As a user, I want to see per-server gauges for CPU, memory, disk, and network so I can quickly assess individual server health | P0 | Medium |
| DASH-03 | As a user, I want aggregate overview stats (total servers, online/offline, active alerts) so I can gauge overall health | P0 | Small |
| DASH-04 | As a user, I want metric history charts (sparklines) so I can see trends over time | P1 | Medium |
| DASH-05 | As a user, I want a live countdown to the next SNMP poll cycle so I know how fresh the data is | P2 | Small |
| DASH-06 | As a user, I want a network topology visualization showing server connectivity | P2 | Large |
| DASH-07 | As a user, I want light and dark theme toggle | P3 | Small |

### 4.2 Epic: Server Management

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| SRV-01 | As a sysadmin, I want to register servers via API or UI so I can start monitoring them | P0 | Medium |
| SRV-02 | As a sysadmin, I want to bulk-import servers from CSV so I can onboard my fleet quickly | P1 | Medium |
| SRV-03 | As a sysadmin, I want to export server configurations as JSON for backup | P1 | Small |
| SRV-04 | As a sysadmin, I want to test SNMP connectivity before registering a server | P1 | Small |
| SRV-05 | As a sysadmin, I want to tag servers with key-value pairs for organization | P1 | Small |
| SRV-06 | As a sysadmin, I want to filter servers by tag | P2 | Small |
| SRV-07 | As a sysadmin, I want to update or delete server registrations | P1 | Small |
| SRV-08 | As a sysadmin, I want to support both SNMPv2c and SNMPv3 authentication | P0 | Medium |

### 4.3 Epic: Alerting

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| ALR-01 | As a NOC operator, I want automatic threshold-based alerts for CPU, memory, and disk | P0 | Medium |
| ALR-02 | As a NOC operator, I want configurable warning/critical thresholds | P0 | Small |
| ALR-03 | As a NOC operator, I want to acknowledge and resolve alerts | P0 | Small |
| ALR-04 | As a NOC operator, I want to filter alerts by status and severity | P1 | Small |
| ALR-05 | As a NOC operator, I want escalation from warning to critical for worsening metrics | P1 | Small |
| ALR-06 | As a NOC operator, I want alert cooldowns to prevent alert storms | P1 | Small |
| ALR-07 | As a user, I want real-time toast notifications for new alerts via WebSocket | P1 | Medium |
| ALR-08 | As a user, I want to see alert history with resolution timestamps | P2 | Small |

### 4.4 Epic: AI & Intelligence

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| AI-01 | As a user, I want to ask natural language questions about my infrastructure | P0 | Large |
| AI-02 | As a user, I want streaming AI responses (token-by-token via SSE) | P1 | Medium |
| AI-03 | As a user, I want AI-powered alert analysis with root cause and remediation | P0 | Large |
| AI-04 | As a user, I want AI-generated health reports for shift handoffs | P1 | Medium |
| AI-05 | As a user, I want the AI to work fully offline (local Ollama) | P0 | Medium |
| AI-06 | As a user, I want suggested AI queries for quick access | P2 | Small |
| AI-07 | As a user, I want to scope AI questions to a specific server | P2 | Small |

### 4.5 Epic: Vector Cache & Self-Healing

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| CACHE-01 | As a user, I want past alert remediations to be cached so similar alerts resolve faster | P0 | Large |
| CACHE-02 | As a user, I want a 3-tier cache (direct hit / RAG / full analysis) | P0 | Large |
| CACHE-03 | As a user, I want to see cache performance stats on the dashboard | P1 | Medium |
| HEAL-01 | As an SRE, I want predefined remediation recipes for common issues | P1 | Medium |
| HEAL-02 | As an SRE, I want remediation actions to have safety cooldowns | P1 | Small |
| HEAL-03 | As an SRE, I want a full audit log of all remediation actions | P1 | Small |
| HEAL-04 | As an SRE, I want to simulate remediation before executing | P1 | Small |
| HEAL-05 | As an SRE, I want one-click execution of specific actions | P2 | Small |

### 4.6 Epic: Anomaly Detection & Forecasting

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| ANOM-01 | As a user, I want statistical anomaly detection that learns normal baselines | P1 | Large |
| ANOM-02 | As a user, I want time-of-day aware baselines per server+metric+hour | P1 | Medium |
| ANOM-03 | As a user, I want anomaly cooldowns to prevent alert storms | P2 | Small |
| ANOM-04 | As a user, I want an anomaly dashboard with timeline and baseline table | P1 | Medium |
| FORECAST-01 | As an IT manager, I want predictive forecasting of when resources will run out | P1 | Medium |
| FORECAST-02 | As a user, I want forecasts for "days until disk full" and similar metrics | P1 | Medium |
| FORECAST-03 | As a user, I want confidence levels on predictions | P2 | Small |

### 4.7 Epic: Custom Checks & RCA

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| CHECK-01 | As a user, I want custom TCP port checks for application services | P1 | Medium |
| CHECK-02 | As a user, I want HTTP health check endpoints | P1 | Medium |
| CHECK-03 | As a user, I want per-server custom check configurations | P1 | Small |
| CHECK-04 | As a user, I want custom check results visualized on server cards | P2 | Small |
| RCA-01 | As an SRE, I want dependency graph analysis for root cause | P2 | Large |
| RCA-02 | As an SRE, I want time-indexed event correlation | P2 | Medium |

### 4.8 Epic: Deployment & Operations

| ID | User Story | Priority | Effort |
|----|-----------|----------|--------|
| OPS-01 | As a sysadmin, I want one-command Docker Compose deployment | P0 | Small |
| OPS-02 | As a sysadmin, I want an automated Ubuntu deployment script | P0 | Medium |
| OPS-03 | As a sysadmin, I want automated health checks and systemd services | P1 | Medium |
| OPS-04 | As a sysadmin, I want automated backups of InfluxDB data | P1 | Small |
| OPS-05 | As a sysadmin, I want migration guides for OS upgrades | P1 | Small |
| OPS-06 | As a user, I want the platform to gracefully fall back to mock data | P0 | Medium |

---

## 5. Functional Requirements

### 5.1 Metric Collection (FR-METRIC)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-METRIC-01 | The system shall poll SNMP-enabled servers for CPU, memory, disk, and network metrics | Integration test |
| FR-METRIC-02 | The system shall support SNMPv2c (community string) and SNMPv3 (auth/priv) | Integration test |
| FR-METRIC-03 | The system shall fall back to realistic mock data when real SNMP targets are unavailable | Unit test |
| FR-METRIC-04 | The polling interval shall be configurable (default: 60 seconds) | Unit test |
| FR-METRIC-05 | The system shall store metrics in InfluxDB with proper tags (server, measurement) | Integration test |
| FR-METRIC-06 | The system shall support querying historical metrics by server, measurement, and time range | Integration test |

### 5.2 Real-Time Updates (FR-REALTIME)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-REALTIME-01 | The system shall broadcast new metrics via WebSocket to all connected dashboard clients | Integration test |
| FR-REALTIME-02 | The system shall push new alerts via WebSocket in real-time | Integration test |
| FR-REALTIME-03 | The system shall push server CRUD events (add/update/delete) via WebSocket | Integration test |
| FR-REALTIME-04 | The system shall push server status changes (online/offline/degraded) via WebSocket | Integration test |
| FR-REALTIME-05 | The WebSocket client shall auto-reconnect with exponential backoff | Unit test |

### 5.3 Alert Engine (FR-ALERT)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-ALERT-01 | The system shall evaluate CPU, memory, disk metrics against configurable thresholds | Unit test |
| FR-ALERT-02 | The system shall support three severity levels: info, warning, critical | Unit test |
| FR-ALERT-03 | The system shall escalate alerts from warning to critical when conditions worsen | Unit test |
| FR-ALERT-04 | The system shall enforce cooldowns (default: 5 min) to prevent duplicate alerts | Unit test |
| FR-ALERT-05 | The system shall support acknowledge/resolve lifecycle for each alert | Unit test |
| FR-ALERT-06 | The system shall automatically resolve alerts when metrics return to normal | Unit test |
| FR-ALERT-07 | The system shall delete resolved alerts older than 24 hours | Unit test |

### 5.4 AI & Chat (FR-AI)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-AI-01 | The system shall integrate with a local Ollama instance for LLM inference | Integration test |
| FR-AI-02 | The system shall support streaming chat responses (token-by-token via SSE) | Integration test |
| FR-AI-03 | The system shall provide metric context to AI queries for accurate answers | Integration test |
| FR-AI-04 | The system shall generate AI health reports summarizing infrastructure status | Integration test |
| FR-AI-05 | The system shall list available Ollama models and support model switching | Integration test |
| FR-AI-06 | The system shall gracefully handle Ollama being unavailable | Unit test |
| FR-AI-07 | The AI temperature and model shall be configurable | Unit test |

### 5.5 Vector Cache (FR-CACHE)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-CACHE-01 | The system shall embed alert messages as vectors in Qdrant for semantic search | Integration test |
| FR-CACHE-02 | The system shall implement a 3-tier cache: direct hit (≥0.85), RAG (≥0.55), full analysis (<0.55) | Integration test |
| FR-CACHE-03 | The system shall return cached remediation in < 100ms for high-confidence matches | Performance test |
| FR-CACHE-04 | The system shall update remediation text in the vector store when alerts are resolved | Integration test |
| FR-CACHE-05 | The system shall track cache hit/miss rates and expose via API | Unit test |
| FR-CACHE-06 | All cache thresholds shall be configurable via environment variables | Unit test |

### 5.6 Anomaly Detection (FR-ANOMALY)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-ANOMALY-01 | The system shall compute rolling mean and standard deviation per server+metric+hour | Unit test |
| FR-ANOMALY-02 | The system shall flag anomalies when Z-score exceeds threshold (default: 2.5) | Unit test |
| FR-ANOMALY-03 | The system shall maintain separate baselines for each hour of the day | Unit test |
| FR-ANOMALY-04 | The system shall enforce anomaly cooldowns (default: 15 min) | Unit test |
| FR-ANOMALY-05 | The system shall expose anomaly detections, baselines, and summary via API | Unit test |
| FR-ANOMALY-06 | The system shall need minimum 5 samples before establishing a baseline | Unit test |

### 5.7 Self-Healing (FR-HEAL)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-HEAL-01 | The system shall provide predefined remediation recipes for CPU, memory, and disk alerts | Unit test |
| FR-HEAL-02 | The system shall support simulation mode (default) — no actual commands executed | Unit test |
| FR-HEAL-03 | The system shall enforce cooldowns per action+server+metric combination | Unit test |
| FR-HEAL-04 | The system shall maintain a full audit log of all attempted remediations | Unit test |
| FR-HEAL-05 | The system shall support one-click execution of user-selected actions | Unit test |
| FR-HEAL-06 | Actions shall be ordered by risk level (low → medium → high) | Unit test |

### 5.8 Custom Checks (FR-CHECK)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-CHECK-01 | The system shall support TCP port checks (e.g., Tomcat on 8080) | Integration test |
| FR-CHECK-02 | The system shall support HTTP health check endpoints | Integration test |
| FR-CHECK-03 | The system shall support per-server check configurations | Unit test |
| FR-CHECK-04 | The system shall enforce configurable timeout and concurrency limits | Unit test |
| FR-CHECK-05 | The system shall feed failed checks into the alert engine | Integration test |
| FR-CHECK-06 | The system shall auto-resolve alerts when a previously-failed check recovers | Unit test |

### 5.9 Forecasting (FR-FORECAST)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-FORECAST-01 | The system shall use linear regression on historical metric data for predictions | Unit test |
| FR-FORECAST-02 | The system shall predict "days until warning threshold" and "days until critical threshold" | Unit test |
| FR-FORECAST-03 | The system shall compute R-squared for prediction confidence | Unit test |
| FR-FORECAST-04 | The system shall predict values at 7-day and 30-day horizons | Unit test |

### 5.10 Server Management (FR-SERVER)

| ID | Requirement | Verification |
|----|------------|--------------|
| FR-SERVER-01 | The system shall support CRUD operations for monitored servers | Integration test |
| FR-SERVER-02 | The system shall support bulk import from JSON array | Integration test |
| FR-SERVER-03 | The system shall support full server configuration export as JSON | Integration test |
| FR-SERVER-04 | The system shall support SNMP connection testing for registered servers | Integration test |
| FR-SERVER-05 | The system shall support per-server tags for organization | Integration test |
| FR-SERVER-06 | The system shall detect and broadcast server status changes via WebSocket | Integration test |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement | Target | Measurement |
|----|------------|--------|-------------|
| NFR-PERF-01 | API response time (P95) | < 200ms for cached paths | Prometheus metrics |
| NFR-PERF-02 | API response time (P95) | < 2s for uncached queries | Prometheus metrics |
| NFR-PERF-03 | AI response (cached) | < 100ms | Cache stats API |
| NFR-PERF-04 | AI response (full) | < 15s on CPU (Ollama) | Cache stats API |
| NFR-PERF-05 | Dashboard load time | < 2s initial | Lighthouse |
| NFR-PERF-06 | WebSocket latency | < 500ms metric-to-screen | Integration test |
| NFR-PERF-07 | Concurrent WebSocket connections | 20+ simultaneous | Load test |
| NFR-PERF-08 | SNMP poll cycle (50 servers) | < 30 seconds | Integration test |

### 6.2 Scalability

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-SCALE-01 | Monitored servers (small) | 1–10 | Single VM, 8 GB RAM |
| NFR-SCALE-02 | Monitored servers (medium) | 10–50 | 16 GB RAM, tuned poll interval |
| NFR-SCALE-03 | Monitored servers (large) | 50–200 | 32 GB RAM, dedicated InfluxDB storage |
| NFR-SCALE-04 | Metric data retention | 7+ days | Configurable via InfluxDB retention policies |
| NFR-SCALE-05 | Alert history retention | 30 days | Auto-cleanup for resolved alerts |

### 6.3 Availability & Reliability

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-AVAIL-01 | Platform uptime (self) | 99.9% | Docker auto-restart + health checks |
| NFR-AVAIL-02 | Graceful degradation | Required | Mock mode when InfluxDB/Ollama unavailable |
| NFR-AVAIL-03 | Data durability | Required | InfluxDB volume persistence |
| NFR-AVAIL-04 | Auto-recovery | Required | Docker restart policies + systemd health timers |
| NFR-AVAIL-05 | Backup strategy | Required | Automated InfluxDB + config backups |

### 6.4 Security

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-SEC-01 | SNMPv3 support | Required | Auth + privacy protocols |
| NFR-SEC-02 | Configurable SECRET_KEY | Required | Generated on deploy |
| NFR-SEC-03 | Internal-only ports | Required | InfluxDB (8086) and Ollama (11434) not exposed externally |
| NFR-SEC-04 | CORS configurable | Required | Default: allow all origins |
| NFR-SEC-05 | HTTPS support | Optional | Via Nginx SSL configuration |
| NFR-SEC-06 | Zero data egress | Required | No external API calls for monitoring |

### 6.5 Maintainability

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-MAINT-01 | Docker Compose deployment | Required | Single `docker compose up -d` |
| NFR-MAINT-02 | Environment-driven configuration | Required | All settings via .env |
| NFR-MAINT-03 | Health check endpoints | Required | `/api/health` with component status |
| NFR-MAINT-04 | Structured logging | Required | loguru with configurable levels |
| NFR-MAINT-05 | Automated deployment script | Required | `deploy-ubuntu.sh` for fresh installs |
| NFR-MAINT-06 | Migration guide | Required | CentOS → Rocky Linux documented |

### 6.6 Compatibility

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-COMP-01 | Browser support | Modern Chrome, Firefox, Edge | Vite dev server + Nginx production |
| NFR-COMP-02 | OS support | Ubuntu 24.04 LTS, Rocky Linux 9 | Primary deployment targets |
| NFR-COMP-03 | Docker Engine | 24+ | Docker Compose V2 |
| NFR-COMP-04 | Python | 3.11+ | Backend runtime |
| NFR-COMP-05 | Node.js | 20+ | Frontend build tooling |

---

## 7. User Interface & UX Requirements

### 7.1 Design System

| Element | Specification |
|---------|--------------|
| **Theme** | Dark mode default, light mode toggle |
| **Color palette** | Navy (#0a1628), Dark gray (#1a2332), Electric blue (#00b9f1) accent |
| **Typography** | System font stack (Inter/UI sans-serif), monospace for data |
| **Layout** | Fixed sidebar (collapsible) + header + scrollable content |
| **Responsiveness** | Desktop-first with mobile sidebar overlay |
| **Animations** | Subtle transitions (200-300ms), pulse for loading states |
| **Icons** | Lucide React icons |

### 7.2 Views & Navigation

| View | Route | Key Components |
|------|-------|----------------|
| **Overview** | `/` (default) | SystemOverview, CachePerformance, stat cards |
| **Servers** | `/servers` | ServerCard grid, tag filters, Add/Import/Export modals |
| **Network** | `/network` | NetworkTopology graph |
| **Alerts** | `/alerts` | AlertPanel with filter/sort/ack/resolve |
| **Anomalies** | `/anomalies` | AnomalyDetection with timeline + baselines |
| **Self-Healing** | `/self-healing` | SelfHealingPanel with remediation controls |
| **Forecasts** | `/forecasts` | ForecastCard per server |
| **AI Assistant** | `/ai` | AIChat with streaming responses |

### 7.3 UX Patterns

| Pattern | Description |
|---------|-------------|
| **Loading skeletons** | Animated pulse placeholders matching card layouts |
| **Empty states** | Helpful illustrations + guidance when no data |
| **Toast notifications** | Non-blocking alerts for CRUD events and critical alerts |
| **Auto-refresh** | 30s interval for cache stats, WebSocket for live data |
| **Responsive layouts** | 1→2→3 column grid for server cards |
| **Tag filtering** | Pill-style filters with active state and counts |

---

## 8. Integration Requirements

### 8.1 Infrastructure Dependencies

| Dependency | Version | Purpose | Required |
|-----------|---------|---------|----------|
| **InfluxDB** | 2.7 | Time-series metric storage | ✅ Yes |
| **Ollama** | Latest | Local LLM inference | ✅ Yes (graceful fallback) |
| **Qdrant** | Latest | Vector DB for alert cache | ✅ Yes (graceful fallback) |
| **Docker** | 24+ | Container runtime | ✅ Yes |
| **Docker Compose** | 2+ | Service orchestration | ✅ Yes |

### 8.2 External Integrations (Planned)

| Integration | Version | Status | Description |
|------------|---------|--------|-------------|
| **PagerDuty** | API v2 | 📋 Planned | Alert escalation and on-call management |
| **Slack** | Web API | 📋 Planned | Alert notifications to channels |
| **Webhook (generic)** | HTTP | 📋 Planned | Custom alert destination |
| **Email (SMTP)** | — | 📋 Planned | Direct email alerts |
| **Prometheus** | — | 📋 Considered | Export metrics in Prometheus format |

### 8.3 API Surface

| Method | Endpoint Count | Purpose |
|--------|---------------|---------|
| GET | 18 | Data retrieval (servers, metrics, alerts, AI, health) |
| POST | 12 | Actions (create, analyze, chat, import, test) |
| PUT | 1 | Update server |
| DELETE | 1 | Remove server |
| WS | 1 | Real-time metric streaming |

---

## 9. Data Requirements

### 9.1 Data Storage

| Data Type | Storage Engine | Retention | Volume Estimate |
|-----------|---------------|-----------|-----------------|
| **Time-series metrics** | InfluxDB 2.7 | 7–30 days (configurable) | ~1 MB/server/day |
| **Alert embeddings** | Qdrant vector DB | Indefinite | ~10 KB/alert |
| **Alert state** | In-memory (Python) | Session | ~1 KB/alert |
| **Server registry** | In-memory (Python) | Session | ~0.5 KB/server |
| **Anomaly baselines** | In-memory (Python) | Session | ~0.2 KB/server/metric/hour |
| **Metric history (forecast)** | In-memory (Python) | 7 days sliding | ~0.5 KB/server/metric |
| **Configuration** | .env / Environment | Indefinite | ~2 KB |

### 9.2 Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SNMP Targets│────▶│  SNMP Poller │────▶│   InfluxDB   │
│  (UDP/161)   │     │  (60s cycle) │     │  (TSDB)      │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │ Alert Engine │     │   Backend    │
                     │ (thresholds) │     │  (FastAPI)   │
                     └──────┬───────┘     └──────┬───────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   Qdrant    │     │   Ollama     │
                     │ (Vectors)   │     │  (LLM)       │
                     └──────────────┘     └──────────────┘
                            │                     │
                            └──────────┬──────────┘
                                       ▼
                              ┌────────────────┐
                              │   WebSocket    │
                              │   Broadcast    │
                              └───────┬────────┘
                                      ▼
                              ┌────────────────┐
                              │   Dashboard    │
                              │   (React)      │
                              └────────────────┘
```

### 9.3 Data Privacy

| Concern | Handling |
|---------|----------|
| **Infrastructure data** | Never leaves the host — all processing is local |
| **AI prompts** | Never sent externally — Ollama runs locally |
| **SNMP credentials** | Stored in-memory only; configurable via env vars |
| **API keys** | Configurable SECRET_KEY; no hardcoded secrets |

---

## 10. Release Criteria

### 10.1 Go/No-Go Checklist

| Criterion | Minimum Standard | Verification Method |
|-----------|-----------------|-------------------|
| **Core functionality** | All P0 user stories pass | Automated tests |
| **Test coverage** | All existing tests pass (348+) | `npm test` + `pytest` |
| **API contract** | All endpoints documented and working | Integration tests |
| **Performance** | Dashboard loads in < 2s | Manual verification |
| **Deployment** | `docker compose up -d` works on fresh Ubuntu 24.04 | Manual test |
| **Graceful degradation** | App starts even without InfluxDB/Ollama | Integration test |
| **Error handling** | No unhandled exceptions in API | Error monitoring |
| **Documentation** | README, SOP, migration guide updated | Manual review |

### 10.2 Rollback Criteria

| Condition | Action |
|-----------|--------|
| P0 feature broken in production | Revert to previous release tag |
| > 5% increase in API error rate | Rollback Docker images |
| Security vulnerability discovered | Emergency patch + rollback if needed |
| Data loss in InfluxDB | Restore from backup |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| **SNMP** | Simple Network Management Protocol — used to collect metrics from network devices and servers |
| **Ollama** | Local LLM inference server for running models like llama3.2 without external API calls |
| **Qdrant** | Vector similarity search engine used for semantic alert caching |
| **InfluxDB** | Time-series database used to store infrastructure metrics |
| **WebSocket** | Protocol for real-time, bidirectional communication between browser and server |
| **SSE** | Server-Sent Events — unidirectional streaming from server to client |
| **RAG** | Retrieval-Augmented Generation — using retrieved context to augment LLM prompts |
| **Z-score** | Statistical measure of how many standard deviations a value is from the mean |
| **Linear Regression** | Statistical method for modeling the relationship between variables |
| **MTTR** | Mean Time to Resolution — average time to resolve an incident |
| **RCA** | Root Cause Analysis — systematic process for identifying the root cause of problems |
| **NOC** | Network Operations Center — facility for monitoring and managing infrastructure |
| **SNMPv2c** | SNMP version 2c — uses community string authentication |
| **SNMPv3** | SNMP version 3 — supports username, authentication, and encryption |
| **MIB** | Management Information Base — defines OIDs for SNMP-accessible data |
| **OID** | Object Identifier — unique identifier for an SNMP-managed object |

---

*End of PRD Document*
