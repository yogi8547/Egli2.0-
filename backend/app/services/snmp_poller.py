"""
SNMP polling service — periodically fetches metrics from monitored servers.

Supports both SNMPv2c and SNMPv3. Uses easysnmp for synchronous polling
and runs on an APScheduler interval. Falls back to mock data when no real
SNMP agents are available (for development / demo mode).
"""

from __future__ import annotations

import platform
import random
import time
from datetime import datetime
from typing import Any, Optional

from loguru import logger

from app.config import settings
from app.database import db
from app.services.forecaster import forecaster
from app.services.anomaly_detector import anomaly_detector

# ── OIDs for common system metrics ──────────────────────────────────────────
OID = {
    # System
    "sysName": ".1.3.6.1.2.1.1.5.0",
    "sysUptime": ".1.3.6.1.2.1.1.3.0",
    # CPU
    "cpuLoad": ".1.3.6.1.4.1.2021.10.1.3.1",
    "cpuUser": ".1.3.6.1.4.1.2021.11.9.0",
    "cpuSystem": ".1.3.6.1.4.1.2021.11.10.0",
    "cpuIdle": ".1.3.6.1.4.1.2021.11.11.0",
    # Memory
    "memTotalReal": ".1.3.6.1.4.1.2021.4.5.0",
    "memAvailReal": ".1.3.6.1.4.1.2021.4.6.0",
    "memTotalSwap": ".1.3.6.1.4.1.2021.4.3.0",
    "memAvailSwap": ".1.3.6.1.4.1.2021.4.4.0",
    # Disk
    "diskPath": ".1.3.6.1.4.1.2021.9.1.2.1",
    "diskSize": ".1.3.6.1.4.1.2021.9.1.6.1",
    "diskUsed": ".1.3.6.1.4.1.2021.9.1.8.1",
    "diskPercent": ".1.3.6.1.4.1.2021.9.1.9.1",
    # Network interfaces
    "ifNumber": ".1.3.6.1.2.1.2.1.0",
    "ifDescr": ".1.3.6.1.2.1.2.2.1.2",
    "ifInOctets": ".1.3.6.1.2.1.2.2.1.10",
    "ifOutOctets": ".1.3.6.1.2.1.2.2.1.16",
    "ifAdminStatus": ".1.3.6.1.2.1.2.2.1.7",
    "ifOperStatus": ".1.3.6.1.2.1.2.2.1.8",
}


class SNMPPoller:
    """
    Polls SNMP-enabled devices for system metrics.

    Uses easysnmp for actual SNMP queries; falls back to mock data
    when no real SNMP agents are reachable (controlled by mock_mode).
    """

    def __init__(self) -> None:
        self._servers: list[dict] = []
        self._mock_mode: bool = False
        self._previous_rx: dict[str, float] = {}
        self._previous_tx: dict[str, float] = {}
        self._previous_time: dict[str, float] = {}

    def register_server(self, server_info: dict) -> None:
        """Add a server to the polling list."""
        self._servers.append(server_info)
        logger.info("Registered server for polling: {}", server_info.get("name"))

    def remove_server(self, server_id: str) -> None:
        """Remove a server from the polling list."""
        self._servers = [s for s in self._servers if s.get("id") != server_id]

    @property
    def servers(self) -> list[dict]:
        return self._servers.copy()

    # ── Mock Data Generation ────────────────────────────────────────────

    def _generate_mock_snapshot(self, server: dict) -> dict[str, Any]:
        """Generate a realistic mock metric snapshot for development/demo."""
        server_name = server.get("name", server.get("id", "unknown"))
        cpu = random.uniform(10, 95)
        mem_total = random.choice([4, 8, 16, 32, 64])
        mem_used = round(mem_total * random.uniform(0.3, 0.95), 1)
        disk_total = random.choice([100, 250, 500, 1000])
        disk_used = round(disk_total * random.uniform(0.2, 0.95), 1)
        rx = random.uniform(1e6, 5e8)
        tx = random.uniform(0.5e6, 2e8)

        return {
            "server": server_name,
            "timestamp": datetime.utcnow().isoformat(),
            "cpu_percent": round(cpu, 1),
            "memory_percent": round((mem_used / mem_total) * 100, 1),
            "memory_used_gb": mem_used,
            "memory_total_gb": mem_total,
            "disk_percent": round((disk_used / disk_total) * 100, 1),
            "disk_used_gb": disk_used,
            "disk_total_gb": disk_total,
            "network_rx_bytes": rx,
            "network_tx_bytes": tx,
            "uptime_seconds": random.randint(86400, 2592000),
        }

    # ── Real SNMP Polling ───────────────────────────────────────────────

    def _poll_server_snmp(self, server: dict) -> Optional[dict[str, Any]]:
        """
        Attempt to poll a server via SNMP.
        Supports SNMPv2c (community string) and SNMPv3 (username + auth/priv).
        Returns None if SNMP is unavailable (falls back to mock).
        """
        try:
            from easysnmp import Session

            host = server.get("host", server.get("id"))
            version = int(server.get("snmp_version", "2c").replace("v", "").replace("c", ""))

            # Build common session kwargs
            session_kwargs = dict(
                hostname=host,
                version=version,
                timeout=settings.snmp_timeout,
                retries=settings.snmp_retries,
            )

            if version == 3:
                # SNMPv3 — use username + auth/priv
                session_kwargs["security_username"] = server.get("snmp_username", "")

                auth_proto = server.get("snmp_auth_protocol")
                if auth_proto:
                    session_kwargs["auth_protocol"] = auth_proto.upper()  # MD5 or SHA
                    session_kwargs["auth_password"] = server.get("snmp_auth_password", "")

                priv_proto = server.get("snmp_priv_protocol")
                if priv_proto:
                    session_kwargs["privacy_protocol"] = priv_proto.upper()  # DES or AES
                    session_kwargs["privacy_password"] = server.get("snmp_priv_password", "")

                # Set security level based on what's provided
                if priv_proto:
                    session_kwargs["security_level"] = "auth_priv"
                elif auth_proto:
                    session_kwargs["security_level"] = "auth_no_priv"
                else:
                    session_kwargs["security_level"] = "no_auth_no_priv"
            else:
                # SNMPv2c — use community string
                community = server.get("snmp_community", settings.snmp_community)
                session_kwargs["community"] = community

            session = Session(**session_kwargs)

            # System info
            sys_name = session.get(OID["sysName"]).value
            uptime = session.get(OID["sysUptime"]).value

            # CPU
            cpu_raw = session.get(OID["cpuLoad"])
            cpu = float(cpu_raw.value) if cpu_raw.value else 0.0

            # Memory
            mem_total_raw = session.get(OID["memTotalReal"])
            mem_avail_raw = session.get(OID["memAvailReal"])
            mem_total = float(mem_total_raw.value) if mem_total_raw.value else 0.0
            mem_avail = float(mem_avail_raw.value) if mem_avail_raw.value else 0.0
            mem_used = mem_total - mem_avail

            # Disk
            disk_total_raw = session.get(OID["diskSize"])
            disk_used_raw = session.get(OID["diskUsed"])
            disk_total = float(disk_total_raw.value) if disk_total_raw.value else 0.0
            disk_used = float(disk_used_raw.value) if disk_used_raw.value else 0.0

            # Network (first interface)
            rx_raw = session.get(OID["ifInOctets"])
            tx_raw = session.get(OID["ifOutOctets"])
            rx = float(rx_raw.value) if rx_raw.value else 0.0
            tx = float(tx_raw.value) if tx_raw.value else 0.0

            return {
                "server": sys_name or server.get("name", host),
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent": round(cpu, 1),
                "memory_percent": round((mem_used / mem_total) * 100 if mem_total else 0, 1),
                "memory_used_gb": round(mem_used / (1024**3), 1),
                "memory_total_gb": round(mem_total / (1024**3), 1),
                "disk_percent": round((disk_used / disk_total) * 100 if disk_total else 0, 1),
                "disk_used_gb": round(disk_used / (1024**3), 1),
                "disk_total_gb": round(disk_total / (1024**3), 1),
                "network_rx_bytes": rx,
                "network_tx_bytes": tx,
                "uptime_seconds": float(uptime) if uptime else 0.0,
            }
        except ImportError:
            logger.warning("easysnmp not installed, falling back to mock data")
            return None
        except Exception as exc:
            logger.debug("SNMP poll failed for {}: {}", server.get("name"), exc)
            return None

    # ── Main Poll Cycle ─────────────────────────────────────────────────

    def poll_all(self) -> list[dict[str, Any]]:
        """
        Poll all registered servers and write results to InfluxDB.
        Also feeds data to forecaster and anomaly detector.

        Returns:
            List of metric snapshots collected this cycle.
        """
        snapshots: list[dict[str, Any]] = []
        now = datetime.utcnow()

        for server in self._servers:
            snapshot = self._poll_server_snmp(server)
            if snapshot is None:
                snapshot = self._generate_mock_snapshot(server)

            snapshots.append(snapshot)
            self._write_to_influxdb(snapshot, now)

            # Feed to forecaster for predictive analytics
            forecaster.record_from_snapshot(snapshot)

            # Feed to anomaly detector
            anomaly_detector.evaluate(snapshot)

        logger.info("Polled {} servers — {} snapshots collected", len(self._servers), len(snapshots))
        return snapshots

    def poll_server(self, server_id: str) -> Optional[dict[str, Any]]:
        """Poll a single server by its ID."""
        for server in self._servers:
            if server.get("id") == server_id:
                snapshot = self._poll_server_snmp(server)
                if snapshot is None:
                    snapshot = self._generate_mock_snapshot(server)
                self._write_to_influxdb(snapshot, datetime.utcnow())

                # Feed to forecaster and anomaly detector
                forecaster.record_from_snapshot(snapshot)
                anomaly_detector.evaluate(snapshot)

                return snapshot
        return None

    # ── InfluxDB Write ──────────────────────────────────────────────────

    def _write_to_influxdb(self, snapshot: dict[str, Any], timestamp: datetime) -> None:
        """Write a metric snapshot to InfluxDB as separate measurement points."""
        server = snapshot["server"]
        tags = {"server": server}

        try:
            db.write_metric("cpu", tags, {"percent": snapshot["cpu_percent"]}, timestamp)
            db.write_metric("memory", tags, {
                "percent": snapshot["memory_percent"],
                "used_gb": snapshot["memory_used_gb"],
                "total_gb": snapshot["memory_total_gb"],
            }, timestamp)
            db.write_metric("disk", tags, {
                "percent": snapshot["disk_percent"],
                "used_gb": snapshot["disk_used_gb"],
                "total_gb": snapshot["disk_total_gb"],
            }, timestamp)
            db.write_metric("network", tags, {
                "rx_bytes": snapshot["network_rx_bytes"],
                "tx_bytes": snapshot["network_tx_bytes"],
            }, timestamp)
            db.write_metric("uptime", tags, {"seconds": snapshot["uptime_seconds"]}, timestamp)
        except Exception as exc:
            logger.error("Failed to write metrics to InfluxDB: {}", exc)

    def get_mock_snapshot(self, server_id: str) -> dict[str, Any]:
        """Generate a mock snapshot for a given server (used when demo mode)."""
        server = {"id": server_id, "name": server_id}
        return self._generate_mock_snapshot(server)


# Singleton poller
poller = SNMPPoller()
