#!/usr/bin/env python3
"""
Standalone SNMP polling service — runs as a separate microservice.

Polls configured servers via SNMP and writes metrics to InfluxDB.
Can run independently of the main API server for better separation of concerns.

Usage:
    python poller.py          # Runs with settings from environment
    python poller.py --mock   # Runs with mock data (no real SNMP needed)
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from datetime import datetime

# Ensure the parent directory is on the path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger

from app.config import settings
from app.database import db
from app.models.schemas import ServerCreate
from app.services.snmp_poller import poller

# Mock server configurations (mirrors the backend seed)
MOCK_SERVERS = [
    ServerCreate(id="server-01", name="Web Server 01", host="192.168.1.101"),
    ServerCreate(id="server-02", name="Web Server 02", host="192.168.1.102"),
    ServerCreate(id="server-03", name="Database Server", host="192.168.1.201"),
    ServerCreate(id="server-04", name="Cache Server", host="192.168.1.202"),
    ServerCreate(id="server-05", name="Monitoring Node", host="192.168.1.10"),
]


def register_servers():
    """Register all mock servers with the poller."""
    for srv in MOCK_SERVERS:
        poller.register_server(srv.model_dump())
    logger.info("Registered {} mock servers", len(MOCK_SERVERS))


def polling_loop():
    """Main polling loop — runs forever, polling at the configured interval."""
    logger.info("Starting SNMP polling loop (interval: {}s)", settings.poll_interval_seconds)
    cycle = 0

    while True:
        cycle += 1
        logger.info("Polling cycle #{}", cycle)

        try:
            snapshots = poller.poll_all()
            logger.info("Cycle #{} complete — {} snapshots collected", cycle, len(snapshots))
        except Exception as exc:
            logger.error("Polling cycle #{} failed: {}", cycle, exc)

        time.sleep(settings.poll_interval_seconds)


def main():
    parser = argparse.ArgumentParser(description="Egli2.0 SNMP Poller")
    parser.add_argument("--mock", action="store_true", help="Run with mock data only")
    parser.add_argument("--interval", type=int, default=None, help="Polling interval in seconds")
    args = parser.parse_args()

    # Override interval if provided
    if args.interval:
        settings.poll_interval_seconds = args.interval

    # Override mock mode
    if args.mock:
        settings.seed_mock_data = True
        logger.info("Running in MOCK mode — no real SNMP required")

    # Connect to InfluxDB
    try:
        db.connect()
        logger.info("Connected to InfluxDB at {}", settings.influxdb_url)
    except Exception as exc:
        logger.warning("InfluxDB not available: {}", exc)
        logger.warning("Metrics will not be persisted — running in demo mode")

    # Register servers
    register_servers()

    # Start polling
    try:
        polling_loop()
    except KeyboardInterrupt:
        logger.info("Shutting down poller")
        db.close()


if __name__ == "__main__":
    main()
