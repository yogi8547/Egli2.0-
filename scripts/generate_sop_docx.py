#!/usr/bin/env python3
"""
Generate SOP_Egli2.0.docx from the SOP markdown content.
Produces a professional Word document with proper formatting.
"""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
import re
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "..", "SOP_Egli2.0.docx")


def set_cell_shading(cell, color_hex):
    """Set cell background color."""
    shading = cell._element.get_or_add_tcPr()
    shading_elm = shading.makeelement(qn("w:shd"), {
        qn("w:fill"): color_hex,
        qn("w:val"): "clear",
    })
    shading.append(shading_elm)


def add_table_row(table, cells_data, is_header=False, header_color="1a5276"):
    """Add a row to a table with formatting."""
    row = table.add_row()
    for i, text in enumerate(cells_data):
        cell = row.cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(str(text))
        run.font.size = Pt(9)
        if is_header:
            run.bold = True
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            set_cell_shading(cell, header_color)
    return row


def create_document():
    doc = Document()

    # ── Page setup ──────────────────────────────────────────────────────────
    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

    # ── Style definitions ──────────────────────────────────────────────────
    style = doc.styles

    # Normal
    normal = style['Normal']
    normal.font.name = 'Calibri'
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15

    # Title
    title_style = style['Title']
    title_style.font.name = 'Calibri'
    title_style.font.size = Pt(28)
    title_style.font.bold = True
    title_style.font.color.rgb = RGBColor(0x1A, 0x52, 0x76)

    # Heading 1
    h1 = style['Heading 1']
    h1.font.name = 'Calibri'
    h1.font.size = Pt(20)
    h1.font.bold = True
    h1.font.color.rgb = RGBColor(0x1A, 0x52, 0x76)
    h1.paragraph_format.space_before = Pt(24)
    h1.paragraph_format.space_after = Pt(12)

    # Heading 2
    h2 = style['Heading 2']
    h2.font.name = 'Calibri'
    h2.font.size = Pt(16)
    h2.font.bold = True
    h2.font.color.rgb = RGBColor(0x2E, 0x86, 0xC1)
    h2.paragraph_format.space_before = Pt(18)
    h2.paragraph_format.space_after = Pt(8)

    # Heading 3
    h3 = style['Heading 3']
    h3.font.name = 'Calibri'
    h3.font.size = Pt(13)
    h3.font.bold = True
    h3.font.color.rgb = RGBColor(0x2E, 0x86, 0xC1)
    h3.paragraph_format.space_before = Pt(12)
    h3.paragraph_format.space_after = Pt(6)

    # ── Title Page ─────────────────────────────────────────────────────────
    for _ in range(4):
        doc.add_paragraph("")

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("Standard Operating Procedure")
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x1A, 0x52, 0x76)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Egli2.0")
    run.font.size = Pt(24)
    run.font.color.rgb = RGBColor(0x2E, 0x86, 0xC1)

    desc = doc.add_paragraph()
    desc.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = desc.add_run("AI-Powered Infrastructure Monitoring Platform")
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x56, 0x6A, 0x7F)
    run.italic = True

    doc.add_paragraph("")
    doc.add_paragraph("")

    # Metadata table
    meta_table = doc.add_table(rows=0, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Document ID", "SOP-EGLI2-001"),
        ("Version", "1.0"),
        ("Effective Date", "June 2, 2026"),
        ("Author", "Egli2.0 Operations Team"),
        ("Review Cycle", "Quarterly"),
        ("Classification", "Internal Use Only"),
    ]
    for label, value in meta_data:
        row = meta_table.add_row()
        row.cells[0].text = label
        row.cells[1].text = value
        for cell in row.cells:
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.size = Pt(11)
                    run.font.name = 'Calibri'
        row.cells[0].paragraphs[0].runs[0].bold = True
        set_cell_shading(row.cells[0], "E8EEF4")

    doc.add_page_break()

    # ── Table of Contents placeholder ──────────────────────────────────────
    doc.add_heading("Table of Contents", level=1)
    toc_items = [
        "1. Purpose & Scope",
        "2. System Architecture Overview",
        "3. Roles & Responsibilities",
        "4. Prerequisites & System Requirements",
        "5. SOP-01: Initial Installation & Deployment",
        "6. SOP-02: Daily Operations & Monitoring",
        "7. SOP-03: Server Management (Add/Remove/Update)",
        "8. SOP-04: Alert Management & Response",
        "9. SOP-05: AI Features & LLM Management",
        "10. SOP-06: Backup & Recovery",
        "11. SOP-07: Updates & Patching",
        "12. SOP-08: Troubleshooting Guide",
        "13. SOP-09: Emergency Procedures",
        "14. SOP-10: Security Hardening",
        "Appendix A: API Reference Quick Card",
        "Appendix B: Configuration Reference",
        "Appendix C: Contact & Escalation Matrix",
    ]
    for item in toc_items:
        p = doc.add_paragraph(item)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.left_indent = Cm(1)

    doc.add_page_break()

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1: Purpose & Scope
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("1. Purpose & Scope", level=1)

    doc.add_heading("1.1 Purpose", level=2)
    doc.add_paragraph(
        "This Standard Operating Procedure provides step-by-step instructions for deploying, "
        "operating, maintaining, and troubleshooting the Egli2.0 infrastructure monitoring platform. "
        "It ensures consistent, repeatable processes across all environments."
    )

    doc.add_heading("1.2 Scope", level=2)
    scope_items = [
        "Deployment — Fresh installation on Ubuntu 24.04 LTS servers",
        "Operations — Daily monitoring, alert response, and health checks",
        "Management — Server registration, configuration changes, and LLM model management",
        "Maintenance — Backups, updates, patching, and capacity planning",
        "Recovery — Disaster recovery, rollback, and emergency procedures",
        "Security — Hardening, access control, and compliance",
    ]
    for item in scope_items:
        doc.add_paragraph(item, style='List Bullet')

    doc.add_heading("1.3 Audience", level=2)
    audience_table = doc.add_table(rows=1, cols=2)
    audience_table.style = 'Table Grid'
    add_table_row(audience_table, ["Role", "Sections Relevant"], is_header=True)
    for role, sections in [
        ("System Administrators", "All sections"),
        ("DevOps Engineers", "Sections 5, 6, 7, 11, 12, 13"),
        ("NOC Operators", "Sections 6, 8"),
        ("Security Team", "Sections 10, 14"),
        ("Management", "Sections 1, 3, 6 (summary)"),
    ]:
        add_table_row(audience_table, [role, sections])

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 2: Architecture
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("2. System Architecture Overview", level=1)

    doc.add_heading("2.1 Component Summary", level=2)
    comp_table = doc.add_table(rows=1, cols=5)
    comp_table.style = 'Table Grid'
    add_table_row(comp_table, ["Service", "Technology", "Container", "Port", "Purpose"], is_header=True)
    components = [
        ("Frontend", "React 18 + Vite + Tailwind", "egli2-frontend", "80, 443", "NOC dashboard with real-time updates"),
        ("Backend", "Python FastAPI", "egli2-backend", "8000", "REST API, WebSocket, AI integration"),
        ("Database", "InfluxDB 2.7", "egli2-influxdb", "8086", "Time-series metric storage"),
        ("LLM", "Ollama (llama3.2)", "egli2-ollama", "11434", "Local AI inference — zero cloud deps"),
        ("Poller", "Python (easysnmp)", "egli2-poller", "—", "Background SNMP metric collection"),
    ]
    for c in components:
        add_table_row(comp_table, c)

    doc.add_heading("2.2 Data Flow", level=2)
    flow_steps = [
        "SNMP Poller queries managed servers every 60 seconds",
        "Metrics stored in InfluxDB (time-series)",
        "Backend evaluates metrics against thresholds → triggers alerts",
        "WebSocket broadcasts live metrics + alerts to all connected dashboards",
        "AI (Ollama) analyzes alerts on-demand for root cause analysis",
        "Frontend renders real-time dashboard with charts, alerts, and AI chat",
    ]
    for i, step in enumerate(flow_steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("2.3 Network Requirements", level=2)
    net_table = doc.add_table(rows=1, cols=4)
    net_table.style = 'Table Grid'
    add_table_row(net_table, ["Port", "Protocol", "Direction", "Purpose"], is_header=True)
    for port, proto, direction, purpose in [
        ("22", "TCP", "Inbound", "SSH access"),
        ("80", "TCP", "Inbound", "HTTP (dashboard)"),
        ("443", "TCP", "Inbound", "HTTPS (SSL)"),
        ("161", "UDP", "Outbound", "SNMP polling"),
        ("8086", "TCP", "Internal", "InfluxDB"),
        ("11434", "TCP", "Internal", "Ollama LLM"),
    ]:
        add_table_row(net_table, [port, proto, direction, purpose])

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3: Roles & Responsibilities
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("3. Roles & Responsibilities", level=1)

    doc.add_heading("3.1 RACI Matrix", level=2)
    raci_table = doc.add_table(rows=1, cols=5)
    raci_table.style = 'Table Grid'
    add_table_row(raci_table, ["Activity", "Sys Admin", "DevOps", "NOC", "Security"], is_header=True)
    for activity, sa, dev, noc, sec in [
        ("Initial deployment", "R/A", "C", "I", "C"),
        ("Daily health monitoring", "I", "C", "R/A", "I"),
        ("Server registration", "R", "A", "R", "I"),
        ("Alert response (P1/P2)", "R", "A", "R", "I"),
        ("Backup execution", "A", "R", "I", "C"),
        ("Security hardening", "C", "R", "I", "A"),
        ("System updates", "R", "A", "I", "C"),
    ]:
        add_table_row(raci_table, [activity, sa, dev, noc, sec])

    p = doc.add_paragraph()
    run = p.add_run("R = Responsible, A = Accountable, C = Consulted, I = Informed")
    run.italic = True
    run.font.size = Pt(9)

    doc.add_heading("3.2 On-Call Priorities", level=2)
    priority_table = doc.add_table(rows=1, cols=3)
    priority_table.style = 'Table Grid'
    add_table_row(priority_table, ["Priority", "Scenario", "Response Time"], is_header=True)
    for pri, scenario, time in [
        ("P1 — Critical", "Dashboard down, data loss", "< 15 minutes"),
        ("P2 — High", "Multiple alerts failing, Ollama down", "< 1 hour"),
        ("P3 — Medium", "Single server unreachable", "Next business day"),
        ("P4 — Low", "Cosmetic issues, minor warnings", "Scheduled maintenance"),
    ]:
        add_table_row(priority_table, [pri, scenario, time])

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4: Prerequisites
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("4. Prerequisites & System Requirements", level=1)

    doc.add_heading("4.1 Server Requirements", level=2)
    req_table = doc.add_table(rows=1, cols=5)
    req_table.style = 'Table Grid'
    add_table_row(req_table, ["Scale", "Servers", "RAM", "CPU", "Storage"], is_header=True)
    for scale, srvs, ram, cpu, storage in [
        ("Small", "1–10", "8 GB", "2 vCPU", "20 GB SSD"),
        ("Medium", "10–50", "16 GB", "4 vCPU", "50 GB SSD"),
        ("Large", "50–200", "32 GB", "8 vCPU", "100 GB SSD"),
    ]:
        add_table_row(req_table, [scale, srvs, ram, cpu, storage])

    doc.add_heading("4.2 Software Requirements", level=2)
    sw_table = doc.add_table(rows=1, cols=3)
    sw_table.style = 'Table Grid'
    add_table_row(sw_table, ["Component", "Minimum", "Recommended"], is_header=True)
    for comp, mini, rec in [
        ("OS", "Ubuntu 22.04 LTS", "Ubuntu 24.04 LTS"),
        ("Docker", "24.0", "Latest stable"),
        ("Docker Compose", "2.0", "Latest stable"),
        ("Python", "3.11", "3.12"),
        ("Node.js", "18", "20 LTS"),
    ]:
        add_table_row(sw_table, [comp, mini, rec])

    # ══════════════════════════════════════════════════════════════════════
    # SOP-01: Installation & Deployment
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("5. SOP-01: Initial Installation & Deployment", level=1)

    doc.add_heading("5.1 Objective", level=2)
    doc.add_paragraph("Deploy a fresh Egli2.0 instance on an Ubuntu 24.04 LTS server.")

    doc.add_heading("5.2 Estimated Time", level=2)
    doc.add_paragraph("Fresh install: 15–30 minutes. With Ollama model pull: +10–20 minutes (CPU) or +2–5 minutes (GPU).")

    doc.add_heading("5.3 Procedure", level=2)

    # Step 1
    doc.add_heading("Step 1: Prepare the Server", level=3)
    code = doc.add_paragraph()
    run = code.add_run(
        "ssh root@<SERVER_IP>\n"
        "apt-get update && apt-get upgrade -y\n"
        "free -h          # Need 8 GB+ RAM\n"
        "df -h            # Need 20 GB+ free disk\n"
        "uname -m         # Need amd64 or arm64"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # Step 2
    doc.add_heading("Step 2: Clone the Repository", level=3)
    code = doc.add_paragraph()
    run = code.add_run("cd /opt\ngit clone https://github.com/yogi8547/Egli2.0-.git Egli2.0\ncd Egli2.0")
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # Step 3
    doc.add_heading("Step 3: Run the Deploy Script", level=3)
    code = doc.add_paragraph()
    run = code.add_run("chmod +x deploy-ubuntu.sh\nsudo ./deploy-ubuntu.sh")
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    doc.add_paragraph("The script performs 10 automated phases: pre-flight checks, system update, Docker install, Docker configuration, firewall, project deployment, configuration, service startup, systemd setup, Ollama model pull, and full verification.")

    # Step 4
    doc.add_heading("Step 4: Verify Deployment", level=3)
    code = doc.add_paragraph()
    run = code.add_run(
        "docker compose ps\n"
        "curl http://localhost/api/health\n"
        "curl -s -o /dev/null -w '%{http_code}' http://localhost/"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    doc.add_paragraph("Expected: All containers show 'Up (healthy)', API returns HTTP 200 with status 'ok', dashboard returns HTTP 200.")

    # Step 5
    doc.add_heading("Step 5: Access the Dashboard", level=2)
    items = [
        "Dashboard: http://<SERVER_IP>/",
        "API Docs: http://<SERVER_IP>:8000/docs",
        "API Health: http://<SERVER_IP>/api/health",
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    # ══════════════════════════════════════════════════════════════════════
    # SOP-02: Daily Operations
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("6. SOP-02: Daily Operations & Monitoring", level=1)

    doc.add_heading("6.1 Daily Health Check Routine", level=2)
    checks = [
        "Check all services are healthy: docker compose ps",
        "Check API health: curl http://localhost/api/health",
        "Check active alerts: curl http://localhost/api/alerts/active",
        "Check registered servers: curl http://localhost/api/servers",
        "Check disk usage: df -h /opt/Egli2.0",
        "Check system resources: docker stats --no-stream",
        "Check recent logs for errors: docker compose logs --tail=50 backend | grep -i error",
    ]
    for i, check in enumerate(checks, 1):
        doc.add_paragraph(f"{i}. {check}")

    doc.add_heading("6.2 Automated Health Monitoring", level=2)
    doc.add_paragraph("The platform includes an automated health check that runs every 5 minutes via systemd timer (egli2-health.timer). It validates: Docker daemon, all containers, API health endpoint, dashboard accessibility, disk space, and available memory.")

    doc.add_heading("6.3 Key Metrics to Monitor", level=2)
    metrics_table = doc.add_table(rows=1, cols=3)
    metrics_table.style = 'Table Grid'
    add_table_row(metrics_table, ["Metric", "Warning", "Critical"], is_header=True)
    for metric, warn, crit in [
        ("Disk usage", "> 80%", "> 95%"),
        ("Memory usage", "> 80%", "> 95%"),
        ("API response time", "> 2s", "> 5s"),
    ]:
        add_table_row(metrics_table, [metric, warn, crit])

    # ══════════════════════════════════════════════════════════════════════
    # SOP-03: Server Management
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("7. SOP-03: Server Management", level=1)

    doc.add_heading("7.1 Adding a Server (SNMPv2c)", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "./scripts/add-server.sh single \\\n"
        "    --id web-01 --name \"Production Web 01\" \\\n"
        "    --host 192.168.1.101 --community mySecret \\\n"
        "    --test --tags env=prod,type=web"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    doc.add_heading("7.2 Adding a Server (SNMPv3)", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "./scripts/add-server.sh single \\\n"
        "    --id db-01 --name \"Database Primary\" \\\n"
        "    --host 10.0.1.50 --version 3 \\\n"
        "    --username monitor --auth-proto SHA \\\n"
        "    --auth-pass \"authKey123\" --priv-proto AES \\\n"
        "    --priv-pass \"privKey456\" --test"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    doc.add_heading("7.3 Bulk Import from CSV", level=2)
    doc.add_paragraph("1. Prepare a CSV file with columns: id, name, host, port, snmp_version, snmp_community, ...")
    doc.add_paragraph("2. Run: ./scripts/add-server.sh bulk --file servers.csv --skip-duplicates")

    doc.add_heading("7.4 Server API Endpoints", level=2)
    api_table = doc.add_table(rows=1, cols=3)
    api_table.style = 'Table Grid'
    add_table_row(api_table, ["Method", "Endpoint", "Description"], is_header=True)
    for method, endpoint, desc in [
        ("GET", "/api/servers", "List all servers"),
        ("POST", "/api/servers", "Register a server"),
        ("GET", "/api/servers/{id}", "Get server details"),
        ("PUT", "/api/servers/{id}", "Update a server"),
        ("DELETE", "/api/servers/{id}", "Remove a server"),
        ("POST", "/api/servers/{id}/test-connection", "Test SNMP connectivity"),
        ("POST", "/api/servers/bulk-import", "Import multiple servers"),
        ("GET", "/api/servers/export", "Export servers as JSON"),
    ]:
        add_table_row(api_table, [method, endpoint, desc])

    # ══════════════════════════════════════════════════════════════════════
    # SOP-04: Alert Management
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("8. SOP-04: Alert Management & Response", level=1)

    doc.add_heading("8.1 Alert Severity Levels", level=2)
    sev_table = doc.add_table(rows=1, cols=3)
    sev_table.style = 'Table Grid'
    add_table_row(sev_table, ["Level", "Response Time", "Description"], is_header=True)
    for level, time, desc in [
        ("Critical", "< 15 minutes", "Server down, CPU > 90%, disk > 95%, memory > 95%"),
        ("Warning", "< 1 hour", "CPU > 75%, disk > 85%, memory > 80%"),
        ("Info", "Next business day", "Informational, non-urgent"),
    ]:
        add_table_row(sev_table, [level, time, desc])

    doc.add_heading("8.2 Alert Response Procedure", level=2)
    steps = [
        "View active alerts: curl http://localhost/api/alerts/active",
        "Acknowledge the alert: curl -X POST http://localhost/api/alerts/<ID>/acknowledge",
        "Get AI-powered remediation: curl -X POST 'http://localhost/api/alerts/<ID>/remediate?deep=true'",
        "Execute remediation action: curl -X POST 'http://localhost/api/alerts/<ID>/execute-action?action=kill_top_cpu_process'",
        "Resolve the alert: curl -X POST http://localhost/api/alerts/<ID>/resolve",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("8.3 Alert API Endpoints", level=2)
    alert_api = doc.add_table(rows=1, cols=3)
    alert_api.style = 'Table Grid'
    add_table_row(alert_api, ["Method", "Endpoint", "Description"], is_header=True)
    for method, endpoint, desc in [
        ("GET", "/api/alerts", "List all alerts (filter by status/server)"),
        ("GET", "/api/alerts/active", "Active alerts only"),
        ("POST", "/api/alerts/{id}/acknowledge", "Acknowledge an alert"),
        ("POST", "/api/alerts/{id}/resolve", "Resolve an alert"),
        ("POST", "/api/alerts/{id}/remediation-actions", "Get predefined fixes"),
        ("POST", "/api/alerts/{id}/execute-action", "Execute a fix"),
        ("POST", "/api/alerts/{id}/remediate", "Get AI remediation"),
    ]:
        add_table_row(alert_api, [method, endpoint, desc])

    # ══════════════════════════════════════════════════════════════════════
    # SOP-05: AI Features
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("9. SOP-05: AI Features & LLM Management", level=1)

    doc.add_heading("9.1 Default Configuration", level=2)
    llm_table = doc.add_table(rows=1, cols=2)
    llm_table.style = 'Table Grid'
    add_table_row(llm_table, ["Setting", "Value"], is_header=True)
    for setting, value in [
        ("Model", "llama3.2 (2B parameters)"),
        ("Runtime", "CPU (no GPU required)"),
        ("RAM Usage", "~2 GB"),
        ("Response Time", "5–15 seconds"),
    ]:
        add_table_row(llm_table, [setting, value])

    doc.add_heading("9.2 Changing the LLM Model", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "# Step 1: Pull a new model\ndocker exec egli2-ollama ollama pull mistral\n\n"
        "# Step 2: Update .env\nsed -i 's/OLLAMA_MODEL=llama3.2/OLLAMA_MODEL=mistral/' .env\n\n"
        "# Step 3: Restart backend\ndocker compose restart backend\n\n"
        "# Step 4: Verify\ncurl -s http://localhost/api/ai/models"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # ══════════════════════════════════════════════════════════════════════
    # SOP-06: Backup & Recovery
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("10. SOP-06: Backup & Recovery", level=1)

    doc.add_heading("10.1 What to Backup", level=2)
    backup_table = doc.add_table(rows=1, cols=3)
    backup_table.style = 'Table Grid'
    add_table_row(backup_table, ["Component", "Location", "Priority"], is_header=True)
    for comp, loc, pri in [
        (".env + docker-compose.yml", "/opt/Egli2.0/", "Critical"),
        ("InfluxDB data", "Docker volume: egli2-influxdb-data", "Critical"),
        ("Ollama models", "Docker volume: egli2-ollama-data", "Medium"),
        ("Source code", "/opt/Egli2.0/", "Low (in Git)"),
    ]:
        add_table_row(backup_table, [comp, loc, pri])

    doc.add_heading("10.2 Backup Procedure", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "# Create backup script at /opt/Egli2.0/scripts/backup.sh\n"
        "# It backs up: .env, docker-compose.yml, nginx config, InfluxDB data, server registrations\n\n"
        "# Schedule daily at 2:00 AM:\n"
        "echo '0 2 * * * /opt/Egli2.0/scripts/backup.sh' | crontab -"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    doc.add_heading("10.3 Restore from Backup", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "# Restore InfluxDB\ndocker cp /path/to/backup/influx_* egli2-influxdb:/tmp/restore\n"
        "docker exec egli2-influxdb influx restore /tmp/restore\n\n"
        "# Restore server registrations\ncat servers-backup.json | python3 -c \"\n"
        "import sys, json, requests\n"
        "for s in json.load(sys.stdin):\n"
        "    requests.post('http://localhost/api/servers', json=s)\""
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # ══════════════════════════════════════════════════════════════════════
    # SOP-07: Updates & Patching
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("11. SOP-07: Updates & Patching", level=1)

    doc.add_heading("11.1 Update Procedure", level=2)
    steps = [
        "Create a backup: /opt/Egli2.0/scripts/backup.sh",
        "Pull latest changes: cd /opt/Egli2.0 && git pull origin master",
        "Rebuild and restart: docker compose down && docker compose build --no-cache && docker compose up -d",
        "Verify: docker compose ps && curl http://localhost/api/health",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("11.2 Rollback", level=2)
    code = doc.add_paragraph()
    run = code.add_run(
        "git log --oneline -5\ngit checkout <previous-commit>\n"
        "docker compose down && docker compose build --no-cache && docker compose up -d"
    )
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # ══════════════════════════════════════════════════════════════════════
    # SOP-08: Troubleshooting
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("12. SOP-08: Troubleshooting Guide", level=1)

    issues = [
        ("Backend Container Won't Start", "Check logs: docker compose logs backend. Common causes: InfluxDB not ready, port conflict, missing .env. Fix: docker compose restart influxdb && sleep 10 && docker compose up -d backend."),
        ("No Metrics Appearing", "Check poller logs: docker compose logs poller. Verify registered servers: curl http://localhost/api/servers. Seed mock data: docker exec egli2-backend python mock_data/seed.py."),
        ("Ollama AI Not Responding", "Check: docker compose ps ollama. List models: docker exec egli2-ollama ollama list. Pull if missing: docker exec egli2-ollama ollama pull llama3.2."),
        ("SNMP Polling Fails", "Test: snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.1. Check: target snmpd running, firewall UDP 161, community string matches."),
        ("Dashboard Shows Blank", "Check: docker compose logs frontend. Rebuild: docker compose build --no-cache frontend && docker compose up -d frontend."),
    ]

    for issue, solution in issues:
        doc.add_heading(issue, level=3)
        doc.add_paragraph(solution)

    # ══════════════════════════════════════════════════════════════════════
    # SOP-09: Emergency Procedures
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("13. SOP-09: Emergency Procedures", level=1)

    doc.add_heading("13.1 Complete Platform Down (P1)", level=2)
    steps = [
        "Check Docker: systemctl status docker",
        "Check containers: docker compose ps",
        "Restart everything: cd /opt/Egli2.0 && docker compose down && docker compose up -d",
        "Verify health: sleep 15 && curl http://localhost/api/health",
        "If still down, check logs: docker compose logs --tail=50",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("13.2 Data Loss / InfluxDB Corruption", level=2)
    steps = [
        "Stop the stack: docker compose down",
        "Remove corrupted data: docker volume rm egli2-influxdb-data",
        "Restart InfluxDB: docker compose up -d influxdb",
        "Restore from backup: docker cp /path/to/backup/influx_* egli2-influxdb:/tmp/restore && docker exec egli2-influxdb influx restore /tmp/restore",
        "Start remaining services: docker compose up -d",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("13.3 Security Breach Response", level=2)
    steps = [
        "Isolate: sudo ufw deny all && sudo ufw allow ssh",
        "Check access: last -20 && cat /var/log/auth.log | grep 'Failed password'",
        "Rotate secrets: Generate new SECRET_KEY and INFLUXDB_TOKEN",
        "Restart with new credentials: docker compose down && docker compose up -d",
        "Notify security team and document incident",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    doc.add_heading("13.4 Full Uninstall", level=2)
    code = doc.add_paragraph()
    run = code.add_run("sudo ./deploy-ubuntu.sh --uninstall")
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

    # ══════════════════════════════════════════════════════════════════════
    # SOP-10: Security Hardening
    # ══════════════════════════════════════════════════════════════════════
    doc.add_heading("14. SOP-10: Security Hardening", level=1)

    doc.add_heading("14.1 Post-Installation Security Checklist", level=2)
    sec_table = doc.add_table(rows=1, cols=3)
    sec_table.style = 'Table Grid'
    add_table_row(sec_table, ["#", "Task", "Status"], is_header=True)
    for num, task in [
        ("1", "Change default SECRET_KEY in .env"),
        ("2", "Change InfluxDB token in .env"),
        ("3", "Use SNMPv3 instead of v2c for all servers"),
        ("4", "Enable UFW firewall (ufw enable)"),
        ("5", "Restrict API access via Nginx allow rules"),
        ("6", "Enable HTTPS with SSL certificates"),
        ("7", "Block InfluxDB external access (port 8086)"),
        ("8", "Block Ollama external access (port 11434)"),
        ("9", "Set up log rotation"),
        ("10", "Enable automatic security updates"),
    ]:
        add_table_row(sec_table, [num, task, "☐"])

    doc.add_heading("14.2 SNMPv3 Configuration", level=2)
    doc.add_paragraph(
        "SNMPv3 provides authentication and encryption. Use it for all production servers. "
        "Configure the target snmpd with: createUser monitor SHA <auth_password> AES <priv_password>. "
        "Then register in Egli2.0 with snmp_version: 3 and the corresponding auth fields."
    )

    doc.add_heading("14.3 HTTPS/SSL Setup", level=2)
    steps = [
        "Obtain certificate: sudo certbot certonly --standalone -d monitor.example.com",
        "Copy certs to /opt/Egli2.0/certs/",
        "Update nginx/nginx.conf with SSL server block",
        "Restart: docker compose restart frontend",
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f"{i}. {step}")

    # ══════════════════════════════════════════════════════════════════════
    # APPENDIX A: API Reference
    # ══════════════════════════════════════════════════════════════════════
    doc.add_page_break()
    doc.add_heading("Appendix A: API Reference Quick Card", level=1)

    categories = [
        ("Server Management", [
            ("GET", "/api/servers", "List all servers"),
            ("POST", "/api/servers", "Register a server"),
            ("GET", "/api/servers/{id}", "Get server details"),
            ("PUT", "/api/servers/{id}", "Update a server"),
            ("DELETE", "/api/servers/{id}", "Remove a server"),
            ("POST", "/api/servers/{id}/test-connection", "Test SNMP connectivity"),
            ("POST", "/api/servers/bulk-import", "Import multiple servers"),
            ("GET", "/api/servers/export", "Export servers as JSON"),
        ]),
        ("Metrics", [
            ("GET", "/api/metrics", "Current metrics for all servers"),
            ("GET", "/api/metrics/{server}", "Metrics for a specific server"),
            ("GET", "/api/metrics/history/{server}/{measurement}", "Historical data"),
            ("GET", "/api/overview", "Dashboard overview stats"),
        ]),
        ("Alerts", [
            ("GET", "/api/alerts", "List all alerts"),
            ("GET", "/api/alerts/active", "Active alerts only"),
            ("POST", "/api/alerts/{id}/acknowledge", "Acknowledge an alert"),
            ("POST", "/api/alerts/{id}/resolve", "Resolve an alert"),
            ("POST", "/api/alerts/{id}/remediation-actions", "Get predefined fixes"),
            ("POST", "/api/alerts/{id}/execute-action", "Execute a fix"),
            ("POST", "/api/alerts/{id}/remediate", "Get AI remediation"),
        ]),
        ("AI & Chat", [
            ("POST", "/api/ai/chat", "Natural language query"),
            ("POST", "/api/ai/chat/stream", "Streaming chat (SSE)"),
            ("POST", "/api/ai/analyze", "AI data analysis"),
            ("GET", "/api/ai/health", "AI health report"),
            ("GET", "/api/ai/models", "List Ollama models"),
        ]),
        ("System", [
            ("GET", "/api/health", "Health check"),
            ("WS", "/ws/metrics", "Live metric streaming"),
        ]),
    ]

    for cat_name, endpoints in categories:
        doc.add_heading(cat_name, level=2)
        t = doc.add_table(rows=1, cols=3)
        t.style = 'Table Grid'
        add_table_row(t, ["Method", "Endpoint", "Description"], is_header=True)
        for method, endpoint, desc in endpoints:
            add_table_row(t, [method, endpoint, desc])

    # ══════════════════════════════════════════════════════════════════════
    # APPENDIX B: Configuration Reference
    # ══════════════════════════════════════════════════════════════════════
    doc.add_page_break()
    doc.add_heading("Appendix B: Configuration Reference", level=1)

    doc.add_heading("Environment Variables (.env)", level=2)
    env_table = doc.add_table(rows=1, cols=3)
    env_table.style = 'Table Grid'
    add_table_row(env_table, ["Variable", "Default", "Description"], is_header=True)
    for var, default, desc in [
        ("SECRET_KEY", "change-me-in-production", "Application secret key"),
        ("OLLAMA_MODEL", "llama3.2", "LLM model name"),
        ("POLL_INTERVAL", "60", "SNMP poll interval (seconds)"),
        ("SEED_MOCK", "true", "Seed mock data on startup"),
        ("SNMP_COMMUNITY", "public", "Default SNMP community string"),
        ("CPU_WARN", "75", "CPU warning threshold (%)"),
        ("CPU_CRIT", "90", "CPU critical threshold (%)"),
        ("MEM_WARN", "80", "Memory warning threshold (%)"),
        ("MEM_CRIT", "95", "Memory critical threshold (%)"),
        ("DISK_WARN", "85", "Disk warning threshold (%)"),
        ("DISK_CRIT", "95", "Disk critical threshold (%)"),
    ]:
        add_table_row(env_table, [var, default, desc])

    # ══════════════════════════════════════════════════════════════════════
    # APPENDIX C: Escalation Matrix
    # ══════════════════════════════════════════════════════════════════════
    doc.add_page_break()
    doc.add_heading("Appendix C: Contact & Escalation Matrix", level=1)

    esc_table = doc.add_table(rows=1, cols=3)
    esc_table.style = 'Table Grid'
    add_table_row(esc_table, ["Priority", "Response Time", "Escalation Path"], is_header=True)
    for pri, time, path in [
        ("P1 — Critical", "< 15 minutes", "NOC → DevOps Lead → Management"),
        ("P2 — High", "< 1 hour", "NOC → DevOps → Management (if > 2 hours)"),
        ("P3 — Medium", "Next business day", "NOC → DevOps"),
        ("P4 — Low", "Scheduled maintenance", "DevOps"),
    ]:
        add_table_row(esc_table, [pri, time, path])

    doc.add_heading("Quick Reference Commands", level=2)
    quick_cmds = [
        ("systemctl start egli2", "Start the stack"),
        ("systemctl stop egli2", "Stop the stack"),
        ("systemctl restart egli2", "Restart the stack"),
        ("systemctl status egli2", "Check status"),
        ("docker compose ps", "Container status"),
        ("docker compose logs -f", "Follow all logs"),
        ("docker compose down", "Stop all containers"),
        ("docker compose up -d", "Start all containers"),
        ("systemctl status egli2-health.timer", "Health timer status"),
        ("journalctl -u egli2-health -f", "Health check logs"),
        ("./scripts/add-server.sh list", "List servers"),
        ("/opt/Egli2.0/scripts/backup.sh", "Manual backup"),
        ("sudo ./deploy-ubuntu.sh --uninstall", "Full removal"),
    ]
    for cmd, desc in quick_cmds:
        p = doc.add_paragraph()
        run = p.add_run(cmd)
        run.font.name = 'Consolas'
        run.font.size = Pt(9)
        p.add_run(f"  —  {desc}")

    # ── Footer ─────────────────────────────────────────────────────────────
    doc.add_paragraph("")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("— End of SOP Document —")
    run.italic = True
    run.font.color.rgb = RGBColor(0x56, 0x6A, 0x7F)

    # ── Save ───────────────────────────────────────────────────────────────
    doc.save(OUTPUT)
    print(f"Created: {OUTPUT}")
    print(f"Size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")


if __name__ == "__main__":
    create_document()
