#!/usr/bin/env python3
"""
Seed script — populates InfluxDB with historical mock metric data.

This creates realistic-looking CPU, memory, disk, and network data
for demonstration and development purposes.

Usage:
    python mock_data/seed.py                        # Seed with defaults
    python mock_data/seed.py --hours 24 --servers 10  # Custom parameters
    python mock_data/seed.py --clear                 # Clear all metrics
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import os
from datetime import datetime, timedelta

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger
from influxdb_client import Point

from app.config import settings
from app.database import db


# ── Mock Server Definitions ───────────────────────────────────────────────

SERVER_DEFINITIONS = [
    {"name": "Web Server 01", "id": "server-01", "tags": {"role": "web", "tier": "frontend"}},
    {"name": "Web Server 02", "id": "server-02", "tags": {"role": "web", "tier": "frontend"}},
    {"name": "Database Server", "id": "server-03", "tags": {"role": "database", "tier": "backend"}},
    {"name": "Cache Server", "id": "server-04", "tags": {"role": "cache", "tier": "backend"}},
    {"name": "Monitoring Node", "id": "server-05", "tags": {"role": "monitoring", "tier": "infra"}},
    {"name": "API Server 01", "id": "server-06", "tags": {"role": "api", "tier": "backend"}},
    {"name": "API Server 02", "id": "server-07", "tags": {"role": "api", "tier": "backend"}},
    {"name": "Worker Node 01", "id": "server-08", "tags": {"role": "worker", "tier": "compute"}},
    {"name": "Storage Node", "id": "server-09", "tags": {"role": "storage", "tier": "infra"}},
    {"name": "Load Balancer", "id": "server-10", "tags": {"role": "lb", "tier": "network"}},
]


def generate_seasonal_cpu(t: float, base: float = 40.0, amplitude: float = 20.0) -> float:
    """Generate CPU values with realistic daily patterns."""
    # Daily pattern: lower at night, higher during day
    daily = base + amplitude * math.sin(t * 2 * math.pi / 24 - 6 * math.pi / 24)
    # Random noise
    noise = random.uniform(-10, 10)
    # Occasional spikes
    spike = random.uniform(0, 100) > 98
    if spike:
        noise += random.uniform(20, 50)
    return max(5, min(100, daily + noise))


def generate_seasonal_memory(t: float, base: float = 55.0) -> float:
    """Generate memory values with gradual growth pattern (memory leak sim)."""
    gradual = base + t * 0.1  # Small growth over time
    noise = random.uniform(-5, 5)
    return max(20, min(100, gradual + noise))


def generate_disk_usage(t: float, server_idx: int) -> float:
    """Generate disk usage with slow growth and per-server variation."""
    base = 40 + (server_idx * 5)  # Different baseline per server
    growth = t * 0.02  # Very slow growth
    noise = random.uniform(-3, 3)
    return max(10, min(100, base + growth + noise))


def generate_network_traffic(t: float) -> tuple[float, float]:
    """Generate network RX/TX with diurnal patterns."""
    base_rx = random.uniform(1e8, 5e8)
    base_tx = random.uniform(0.5e8, 2e8)
    daily_factor = 0.5 + 0.5 * math.sin(t * 2 * math.pi / 24 - 6 * math.pi / 24)
    rx = base_rx * daily_factor + random.uniform(-1e7, 1e7)
    tx = base_tx * daily_factor + random.uniform(-0.5e7, 0.5e7)
    return max(0, rx), max(0, tx)


def generate_points(
    servers: list[dict],
    hours: float = 24,
    interval_minutes: int = 5,
) -> list[Point]:
    """
    Generate metric points for the specified time range.

    Args:
        servers: List of server dicts with 'name' and 'tags'
        hours: How many hours of historical data to generate
        interval_minutes: Interval between data points (5 = 12 pts/hour)

    Returns:
        List of InfluxDB Point objects ready to write
    """
    points: list[Point] = []
    now = datetime.utcnow()
    total_points = int(hours * 60 / interval_minutes)

    logger.info("Generating {} data points across {} servers...",
                total_points * len(servers) * 4, len(servers))

    for server_idx, server in enumerate(servers):
        server_name = server["name"]
        tags = {"server": server_name}

        for i in range(total_points):
            timestamp = now - timedelta(hours=hours) + timedelta(minutes=i * interval_minutes)
            t = i * interval_minutes / 60  # Hours from start

            # CPU
            cpu = generate_seasonal_cpu(t, base=35 + server_idx * 2)
            points.append(
                Point("cpu")
                .tag("server", server_name)
                .field("percent", round(cpu, 1))
                .time(timestamp)
            )

            # Memory
            mem = generate_seasonal_memory(t, base=50 + server_idx * 3)
            mem_total_gb = random.choice([4, 8, 16, 32])
            mem_used_gb = round(mem_total_gb * mem / 100, 1)
            points.append(
                Point("memory")
                .tag("server", server_name)
                .field("percent", round(mem, 1))
                .field("used_gb", mem_used_gb)
                .field("total_gb", mem_total_gb)
                .time(timestamp)
            )

            # Disk
            disk = generate_disk_usage(t, server_idx)
            disk_total_gb = random.choice([100, 250, 500, 1000])
            disk_used_gb = round(disk_total_gb * disk / 100, 1)
            points.append(
                Point("disk")
                .tag("server", server_name)
                .field("percent", round(disk, 1))
                .field("used_gb", disk_used_gb)
                .field("total_gb", disk_total_gb)
                .time(timestamp)
            )

            # Network
            rx, tx = generate_network_traffic(t)
            points.append(
                Point("network")
                .tag("server", server_name)
                .field("rx_bytes", round(rx, 0))
                .field("tx_bytes", round(tx, 0))
                .time(timestamp)
            )

    return points


def main():
    parser = argparse.ArgumentParser(description="Seed InfluxDB with mock metric data")
    parser.add_argument("--hours", type=float, default=24, help="Hours of historical data (default: 24)")
    parser.add_argument("--servers", type=int, default=5, help="Number of mock servers (default: 5, max: 10)")
    parser.add_argument("--interval", type=int, default=5, help="Interval in minutes (default: 5)")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before seeding")
    args = parser.parse_args()

    # Connect to InfluxDB
    try:
        db.connect()
        logger.info("Connected to InfluxDB at {}", settings.influxdb_url)
    except Exception as exc:
        logger.error("Failed to connect to InfluxDB: {}", exc)
        sys.exit(1)

    # Clear if requested
    if args.clear:
        logger.warning("Clearing all data from bucket '{}'...", settings.influxdb_bucket)
        # Note: InfluxDB v2 doesn't support TRUNCATE; use bucket deletion instead
        logger.info("To clear data, delete and recreate the bucket manually")
        # For now, just log
        logger.info("Skipping clear — delete the bucket in the InfluxDB UI if needed")

    # Select servers
    servers = SERVER_DEFINITIONS[:min(args.servers, 10)]
    logger.info("Using {} mock servers", len(servers))

    # Generate and write points
    points = generate_points(servers, hours=args.hours, interval_minutes=args.interval)
    logger.info("Writing {} points to InfluxDB...", len(points))

    # Write in batches of 5000
    batch_size = 5000
    total_written = 0
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        try:
            db.write.write(bucket=settings.influxdb_bucket, record=batch)
            total_written += len(batch)
            logger.info("  Written {} / {} points...", total_written, len(points))
        except Exception as exc:
            logger.error("Failed to write batch: {}", exc)

    logger.info("✅ Seed complete! {} points written to InfluxDB.", total_written)
    db.close()


if __name__ == "__main__":
    main()
