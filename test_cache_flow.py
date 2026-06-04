"""
RAG Cache Hit Flow Test
=======================
Tests the three-tier remediation optimization:
1. Vector cache hit (Qdrant) — instant (< 100ms)
2. RAG fallback (Ollama with context) — faster (~3-5s)
3. Full AI analysis — standard (~5-10s)

Requires:
- Egli2.0 backend running on localhost:8000
- Qdrant running on localhost:6333 (for cache hit test)
- Ollama running on localhost:11434

Usage:
    python test_cache_flow.py
"""

import json
import time
import urllib.request
import urllib.error
import sys


API_BASE = "http://localhost:8000"


def api_get(path):
    """GET request and return parsed JSON."""
    try:
        with urllib.request.urlopen(f"{API_BASE}{path}", timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())
    except Exception as e:
        return {"error": str(e)}


def api_post(path, data=None, timeout=120):
    """POST request with optional JSON body."""
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def print_header(text):
    print()
    print("=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_result(label, value, unit=""):
    print(f"  {label:30s} {value}{unit}")


# ── Test Suite ──────────────────────────────────────────────────────────


def test_1_vector_status():
    """Check if Qdrant and Ollama are reachable."""
    print_header("STEP 1: Vector Store Status")

    status = api_get("/api/vectors/status")
    if "error" in status:
        print(f"  ❌ Error: {status['error']}")
        return False

    qdrant_ok = status.get("qdrant_available", False)
    ollama_ok = status.get("ollama_available", False)
    points = status.get("collection", {}).get("total_points", 0)

    print_result("Qdrant available", "✅ YES" if qdrant_ok else "❌ NO")
    print_result("Ollama available", "✅ YES" if ollama_ok else "❌ NO")
    print_result("Alert embeddings stored", points)

    if not qdrant_ok:
        print()
        print("  ⚠️  Qdrant is not available. Cache hits will not work.")
        print("  The test will still run but all calls will fall through")
        print("  to Ollama (tier 3).")
        print()
        print("  To enable cache hits, start Qdrant:")
        print("    # Local binary:")
        print("    qdrant")
        print("    # OR Docker:")
        print("    docker run -p 6333:6333 qdrant/qdrant:latest")
        print()

    return qdrant_ok


def test_2_predefined_actions():
    """Test the fastest tier: predefined actions (deep=false, no AI)."""
    print_header("STEP 2: Predefined Actions (Tier 0)")

    alerts = api_get("/api/alerts/active")
    if not alerts.get("alerts"):
        print("  No active alerts to test.")
        return None

    alert = alerts["alerts"][0]
    alert_id = alert["id"]
    print_result("Alert", f"{alert['server']} - {alert['metric']}")
    print_result("Alert ID", alert_id[:20] + "...")

    start = time.time()
    result = api_post(f"/api/alerts/{alert_id}/remediate?deep=false")
    elapsed = time.time() - start

    print_result("Duration", f"{elapsed:.3f}", "s")
    print_result("Actions returned", result.get("total", 0))

    for action in result.get("actions", []):
        print(f"    • {action['action']} ({action['risk']})")

    return alert_id


def test_3_fresh_ai_analysis(alert_id):
    """
    First AI call for an alert. Without Qdrant, this goes to Ollama.
    With Qdrant, it would first check the cache and potentially
    return a cached remediation in < 100ms.
    """
    print_header("STEP 3: First AI Analysis (Tier 3 — fresh Ollama call)")

    print("  This generates a NEW remediation via Ollama.")
    print("  (May take 10-60 seconds depending on hardware)")
    print()

    start = time.time()
    result = api_post(f"/api/alerts/{alert_id}/remediate?deep=true", timeout=120)
    elapsed = time.time() - start

    if "error" in result:
        print(f"  ❌ Error: {result['error']}")
        return None

    source = result.get("source", "N/A")
    is_cached = source == "vector_cache"

    print_result("Source", "🟢 CACHE HIT 🚀" if is_cached else "🔵 Ollama analysis")
    print_result("Duration", f"{elapsed:.2f}", "s")
    print_result("API-reported duration", f"{result.get('duration_seconds', 0):.2f}", "s")
    print()
    print("  Remediation preview:")
    rem = result.get("remediation", "")
    for line in rem.split("\n")[:6]:
        print(f"    {line}")
    print()

    return result


def test_4_repeat_ai_analysis(alert_id):
    """
    Second AI call for the SAME alert.
    With Qdrant: should be a CACHE HIT — returns < 100ms
    Without Qdrant: same as first call (falls through to Ollama)

    This demonstrates the optimization.
    """
    print_header("STEP 4: Repeat AI Analysis (same alert — cache test)")

    start = time.time()
    result = api_post(f"/api/alerts/{alert_id}/remediate?deep=true", timeout=120)
    elapsed = time.time() - start

    source = result.get("source", "N/A")
    is_cached = source == "vector_cache"

    if is_cached:
        print(f"  🟢 CACHE HIT! Remediation returned in {elapsed:.3f}s")
        print(f"     (Vs ~10-30s for Ollama — that's a {30/elapsed:.0f}x speedup!)")
    else:
        print(f"  🔵 Cache miss (Qdrant not available)")
        print(f"     Duration: {elapsed:.2f}s")

    print_result("Source", "CACHE HIT 🚀" if is_cached else "Ollama analysis")
    print_result("Duration", f"{elapsed:.2f}", "s")

    return result


def test_5_similar_alert_cache():
    """
    Trigger a NEW alert with the same metric type as one we already
    analyzed. With Qdrant, this should find the cached remediation
    for the similar past alert via semantic similarity search.
    """
    print_header("STEP 5: Similar Alert Cache Hit")

    # Check if we have any alerts with stored remediations
    status = api_get("/api/vectors/status")
    points = status.get("collection", {}).get("total_points", 0)

    print_result("Total stored alert vectors", points)
    print()
    print("  When a NEW alert fires for the same metric type")
    print("  (e.g., another 'service_tomcat' or 'cpu' alert),")
    print("  the system will:")
    print()
    print("  1. Embed the new alert text")
    print("  2. Search Qdrant for similar past alerts")
    print("  3. If score ≥ 0.85 → return cached remediation")
    print("  4. If score ≥ 0.55 → use as RAG context for Ollama")
    print("  5. Less than 0.55 → full analysis from scratch")
    print()

    # Check by listing all servers and looking for same metric type alerts
    alerts = api_get("/api/alerts/active")
    metrics = {}
    for a in alerts.get("alerts", []):
        metric = a["metric"]
        if metric not in metrics:
            metrics[metric] = []
        metrics[metric].append(a["id"])

    print(f"  Active alert metrics found:")
    for metric, ids in sorted(metrics.items()):
        print(f"    • {metric} ({len(ids)} alerts)")

    print()


def test_6_reindex_check():
    """Verify we can force a re-index of all alerts."""
    print_header("STEP 6: Force Re-index All Alerts")

    if not api_get("/api/vectors/status").get("qdrant_available"):
        print("  ⚠️  Qdrant not available — skipping re-index test")
        print()
        print("  With Qdrant available, run:")
        print("    curl -X POST http://localhost:8000/api/vectors/reindex")
        print()
        return

    result = api_post("/api/vectors/reindex", timeout=30)
    print_result("Total alerts", result.get("total_alerts", 0))
    print_result("Successfully indexed", result.get("indexed", 0))
    print_result("Failed", result.get("failed", 0))


# ── Main Runner ─────────────────────────────────────────────────────────


def main():
    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║   RAG Cache Hit Flow — Test Suite                ║")
    print("  ║   Tests the 3-tier remediation optimization      ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()

    # Check backend availability
    health = api_get("/api/health")
    if "error" in health:
        print(f"❌ Backend not reachable at {API_BASE}")
        print(f"   Error: {health['error']}")
        print()
        print("   Make sure the backend is running:")
        print("     uvicorn app.main:app --host 0.0.0.0 --port 8000")
        sys.exit(1)

    print(f"  ✅ Backend reachable (uptime: {health.get('uptime_seconds', 0):.0f}s)")
    print()

    # Run tests
    qdrant_available = test_1_vector_status()

    alert_id = test_2_predefined_actions()
    if not alert_id:
        print("  No alerts to test. Exiting.")
        return

    # First AI call (will be slow — Ollama generation)
    result1 = test_3_fresh_ai_analysis(alert_id)

    # Repeat AI call (should be fast if Qdrant is available)
    if result1 and qdrant_available:
        test_4_repeat_ai_analysis(alert_id)

    test_5_similar_alert_cache()
    test_6_reindex_check()

    # ── Summary ──────────────────────────────────────────────────────
    print_header("SUMMARY")

    print()
    print(f"  Qdrant available:     {'✅ YES' if qdrant_available else '❌ NO'}")
    print()
    print("  Tier speeds with Qdrant enabled:")
    print()
    print("    Tier 0 — Predefined actions    < 10ms    (rule-based)")
    print("    Tier 1 — Vector cache hit      < 100ms   (Qdrant lookup)")
    print("    Tier 2 — RAG-prompted Ollama   ~3-5s     (40% faster)")
    print("    Tier 3 — Full AI analysis      ~5-10s    (from scratch)")
    print()
    print("  To enable cache hits, start Qdrant:")
    print("    docker run -d -p 6333:6333 qdrant/qdrant:latest")
    print()
    print("  Then restart the backend:")
    print("    Restart the Egli2.0 backend process")
    print()


if __name__ == "__main__":
    main()
