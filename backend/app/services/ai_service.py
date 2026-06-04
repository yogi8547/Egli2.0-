"""
AI service — integrates with Ollama for natural language infrastructure analysis.

Provides:
- Infrastructure health summarization
- Alert analysis with remediation suggestions
- Natural language query answering with metric context
- Model management (list available, pull new models)
"""

from __future__ import annotations

import json
import re
from typing import Any, AsyncGenerator, Optional

import httpx
import requests
from loguru import logger

from app.config import settings
from app.models.schemas import Alert, MetricSnapshot, SystemOverview
from app.services.vector_store import vector_store


class AIService:
    """
    Service for communicating with local Ollama instance.
    All inference runs locally — no external API calls.
    """

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.temperature = settings.ollama_temperature

        # ── Cache Hit Rate Tracking ────────────────────────────────────
        self._cache_stats = {
            "total_requests": 0,
            "cache_hits": 0,  # Tier 1: returned cached remediation directly
            "rag_fallbacks": 0,  # Tier 2: used past remediation as Ollama context
            "full_analysis": 0,  # Tier 3: full analysis from scratch
            "avg_duration_cache_hit": 0.0,
            "avg_duration_rag": 0.0,
            "avg_duration_full": 0.0,
            "total_duration_cache_hit": 0.0,
            "total_duration_rag": 0.0,
            "total_duration_full": 0.0,
        }

    def is_available(self) -> bool:
        """Check if Ollama is running and accessible."""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=3)
            return r.status_code == 200
        except requests.ConnectionError:
            return False

    def list_models(self) -> list[dict]:
        """Fetch available models from the local Ollama instance."""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            r.raise_for_status()
            return r.json().get("models", [])
        except (requests.ConnectionError, requests.RequestException) as exc:
            logger.warning("Cannot list Ollama models: {}", exc)
            return []

    def get_available_models(self) -> list[str]:
        """Get list of model names available locally."""
        return [m.get("name", "") for m in self.list_models()]

    # ── Chat / Generate ─────────────────────────────────────────────────

    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat response from Ollama token by token."""
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + messages

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": self.temperature,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.strip():
                            chunk = json.loads(line)
                            if not chunk.get("done", False):
                                content = chunk.get("message", {}).get("content", "")
                                if content:
                                    yield content
        except httpx.ConnectError:
            yield "[ERROR] Cannot connect to Ollama. Make sure Ollama is running."
        except Exception as exc:
            yield f"[ERROR] {exc!s}"

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> str:
        """Send a non-streaming generate request and return full response."""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system_prompt or "",
            "stream": False,
            "options": {"temperature": self.temperature},
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(f"{self.base_url}/api/generate", json=payload)
                r.raise_for_status()
                data = r.json()
                return data.get("response", "")
        except httpx.ConnectError:
            return "ERROR: Cannot connect to Ollama. Make sure Ollama is running."
        except Exception as exc:
            return f"ERROR: {exc!s}"

    # ── Domain-Specific Analysis ────────────────────────────────────────

    async def analyze_metrics(self, metrics: list[MetricSnapshot]) -> str:
        """
        Analyze infrastructure metrics and return a health summary.

        Args:
            metrics: Current metric snapshots for all servers

        Returns:
            AI-generated health analysis text
        """
        context = self._format_metrics_context(metrics)
        prompt = (
            "You are an expert infrastructure monitoring analyst. "
            "Analyze the following server metrics and provide:\n"
            "1. Overall infrastructure health status (Healthy / Degraded / Critical)\n"
            "2. Any servers that need immediate attention\n"
            "3. Specific issues detected (high CPU, low disk, etc.)\n"
            "4. Trends or patterns you observe\n"
            "5. Recommended actions\n\n"
            f"Metrics Data:\n{context}"
        )
        return await self.generate(prompt)

    async def analyze_alert(self, alert: Alert, use_vector_cache: bool = True) -> str:
        """
        Analyze an alert and suggest remediation steps.

        Uses a two-tier approach:
        1. **Semantic cache** (if enabled): Search Qdrant for similar past alerts
           with known remediations. If a high-confidence match is found, return
           the cached remediation directly (< 100ms).
        2. **RAG fallback**: If a medium-confidence match is found, use the past
           remediation as context for a targeted Ollama prompt (faster, ~40%
           token reduction).
        3. **Full analysis**: If no good match, generate from scratch via Ollama.

        Args:
            alert: The triggered alert
            use_vector_cache: Whether to check Qdrant for cached remediations

        Returns:
            AI-generated analysis with root cause and remediation
        """
        start_time = __import__("time").time()

        # ── Tier 1: Semantic Cache Lookup ────────────────────────────────
        if use_vector_cache:
            query = (
                f"Alert on {alert.server}: {alert.metric} - {alert.message} "
                f"Severity: {alert.severity} Value: {alert.value} "
                f"Threshold: {alert.threshold}"
            )

            # Use configurable thresholds from settings
            high_threshold = settings.vector_cache_high_threshold
            medium_threshold = settings.vector_cache_medium_threshold
            min_score = settings.vector_cache_min_score
            top_k = settings.vector_cache_top_k

            cache_results = await vector_store.search_remediation_cache(
                query=query,
                server_filter=alert.server,
                metric_filter=alert.metric,
                top_k=top_k,
                score_threshold=min_score,
            )

            if cache_results:
                best = cache_results[0]
                score = best.get("score", 0.0)
                cached_remediation = best.get("remediation", "")

                # High-confidence match — return cached directly
                if score >= high_threshold and cached_remediation:
                    result_type = "cache_hit"
                    elapsed = __import__("time").time() - start_time
                    self._record_cache_result("cache_hit", elapsed)

                    logger.info(
                        "Vector cache HIT (score={}) for {} on {} — returning cached remediation",
                        score, alert.metric, alert.server,
                    )
                    return (
                        f"[CACHED REMEDIATION] Similarity: {score:.0%}\n\n"
                        f"This alert matches a previous incident on {best.get('server')} "
                        f"({best.get('metric')}, score: {score:.2f}).\n\n"
                        f"{cached_remediation}\n\n"
                        f"---\n"
                        f"[INFO] This remediation was retrieved from the vector cache. "
                        f"If it doesn't fully apply to the current situation, "
                        f"request a fresh AI analysis."
                    )

                # Medium-confidence match — use as RAG context
                if score >= medium_threshold and cached_remediation:
                    result_type = "rag_fallback"
                    logger.info(
                        "Vector cache RAG (score={}) for {} on {} — using past remediation as context",
                        score, alert.metric, alert.server,
                    )
                    prompt = (
                        "You are an expert infrastructure SRE. Given the following alert, "
                        "provide:\n"
                        "1. Likely root causes\n"
                        "2. Immediate remediation steps\n"
                        "3. Long-term preventive measures\n"
                        "4. Related things to check\n\n"
                        f"Alert:\n"
                        f"Server: {alert.server}\n"
                        f"Metric: {alert.metric}\n"
                        f"Value: {alert.value}\n"
                        f"Threshold: {alert.threshold}\n"
                        f"Severity: {alert.severity}\n"
                        f"Message: {alert.message}\n\n"
                        f"A similar alert was previously resolved with the following "
                        f"remediation. Use it as reference, but adapt if needed:\n\n"
                        f"Past remediation (similarity: {score:.2f}):\n"
                        f"{cached_remediation}\n"
                    )
                    result = await self.generate(prompt)
                    elapsed = __import__("time").time() - start_time
                    self._record_cache_result("rag_fallback", elapsed)
                    return result

            logger.debug(
                "Vector cache miss for {} on {} — falling back to full analysis",
                alert.metric, alert.server,
            )

        # ── Tier 3: Full Analysis (no cache or low-confidence) ─────────
        prompt = (
            "You are an expert infrastructure SRE. Given the following alert, "
            "provide:\n"
            "1. Likely root causes\n"
            "2. Immediate remediation steps\n"
            "3. Long-term preventive measures\n"
            "4. Related things to check\n\n"
            f"Alert:\n"
            f"Server: {alert.server}\n"
            f"Metric: {alert.metric}\n"
            f"Value: {alert.value}\n"
            f"Threshold: {alert.threshold}\n"
            f"Severity: {alert.severity}\n"
            f"Message: {alert.message}\n"
        )
        result = await self.generate(prompt)
        elapsed = __import__("time").time() - start_time
        self._record_cache_result("full_analysis", elapsed)
        return result

    async def chat_query(
        self,
        message: str,
        metrics: list[MetricSnapshot],
        alerts: list[Alert],
        server: Optional[str] = None,
    ) -> str:
        """
        Answer a natural language infrastructure question.

        Uses current metrics and alerts as context for the LLM.
        """
        metrics_context = self._format_metrics_context(metrics, server)
        alerts_context = self._format_alerts_context(alerts, server)
        system_prompt = (
            "You are an expert infrastructure monitoring assistant. "
            "You have access to real-time server metrics and alerts. "
            "Answer the user's question based on the data provided. "
            "Be concise, accurate, and actionable. "
            "If you don't have enough data to answer, say so."
        )
        user_prompt = (
            f"Current Metrics:\n{metrics_context}\n\n"
            f"Active Alerts:\n{alerts_context}\n\n"
            f"User Question: {message}\n\n"
            "Provide a clear, helpful answer based on the data above."
        )
        full_response = await self.generate(user_prompt, system_prompt=system_prompt)
        return full_response

    async def generate_health_report(self, overview: SystemOverview,
                                     alerts: list[Alert],
                                     metrics: list[MetricSnapshot]) -> str:
        """Generate a comprehensive health report."""
        context = self._format_metrics_context(metrics)
        alert_text = self._format_alerts_context(alerts)
        prompt = (
            "Generate a professional infrastructure health report covering:\n"
            f"- Total servers: {overview.total_servers} (Online: {overview.online_servers}, "
            f"Degraded: {overview.degraded_servers}, Offline: {overview.offline_servers})\n"
            f"- Average CPU: {overview.avg_cpu}%\n"
            f"- Average Memory: {overview.avg_memory}%\n"
            f"- Average Disk: {overview.avg_disk}%\n"
            f"- Active alerts: {overview.active_alerts}\n\n"
            f"Server Metrics:\n{context}\n\n"
            f"Active Alerts:\n{alert_text}\n\n"
            "Provide a professional summary with status, key issues, and recommendations."
        )
        return await self.generate(prompt)

    # ── Cache Stats ──────────────────────────────────────────────────────

    def _record_cache_result(self, result_type: str, duration: float) -> None:
        """Record a cache result for metrics tracking."""
        stats = self._cache_stats
        stats["total_requests"] += 1

        if result_type == "cache_hit":
            stats["cache_hits"] += 1
            stats["total_duration_cache_hit"] += duration
            stats["avg_duration_cache_hit"] = (
                stats["total_duration_cache_hit"] / stats["cache_hits"]
            )
        elif result_type == "rag_fallback":
            stats["rag_fallbacks"] += 1
            stats["total_duration_rag"] += duration
            stats["avg_duration_rag"] = (
                stats["total_duration_rag"] / stats["rag_fallbacks"]
            )
        else:
            stats["full_analysis"] += 1
            stats["total_duration_full"] += duration
            stats["avg_duration_full"] = (
                stats["total_duration_full"] / stats["full_analysis"]
            )

    def get_cache_stats(self) -> dict[str, Any]:
        """Get cache hit rate statistics.

        Returns:
            Dict with keys:
                total_requests, cache_hits, rag_fallbacks, full_analysis,
                cache_hit_rate (percentage), rag_rate, full_rate,
                avg_duration_cache_hit, avg_duration_rag, avg_duration_full
                ollama_savings_seconds (estimated time saved by cache hits)
        """
        s = dict(self._cache_stats)  # Copy
        total = s["total_requests"] or 1  # Avoid div by zero

        # Compute rates
        s["cache_hit_rate"] = round((s["cache_hits"] / total) * 100, 1)
        s["rag_rate"] = round((s["rag_fallbacks"] / total) * 100, 1)
        s["full_rate"] = round((s["full_analysis"] / total) * 100, 1)

        # Estimate Ollama time saved: each cache hit avoids ~8s avg Ollama call
        avg_ollama_time = s["avg_duration_full"]
        if avg_ollama_time > 0:
            s["ollama_savings_seconds"] = round(
                s["cache_hits"] * avg_ollama_time, 1
            )
        else:
            s["ollama_savings_seconds"] = 0.0

        # Round averages
        s["avg_duration_cache_hit"] = round(s["avg_duration_cache_hit"], 3)
        s["avg_duration_rag"] = round(s["avg_duration_rag"], 1)
        s["avg_duration_full"] = round(s["avg_duration_full"], 1)

        return s

    def reset_cache_stats(self) -> None:
        """Reset all cache statistics counters."""
        self._cache_stats = {
            "total_requests": 0,
            "cache_hits": 0,
            "rag_fallbacks": 0,
            "full_analysis": 0,
            "avg_duration_cache_hit": 0.0,
            "avg_duration_rag": 0.0,
            "avg_duration_full": 0.0,
            "total_duration_cache_hit": 0.0,
            "total_duration_rag": 0.0,
            "total_duration_full": 0.0,
        }

    # ── Helpers ─────────────────────────────────────────────────────────

    def _format_metrics_context(self, metrics: list[MetricSnapshot],
                                server_filter: Optional[str] = None) -> str:
        """Format metrics as a readable text block for the LLM."""
        if not metrics:
            return "No metrics available."
        lines = []
        for m in metrics:
            if server_filter and m.server != server_filter:
                continue
            lines.append(
                f"Server: {m.server}\n"
                f"  CPU: {m.cpu_percent}%\n"
                f"  Memory: {m.memory_percent}% ({m.memory_used_gb}/{m.memory_total_gb} GB)\n"
                f"  Disk: {m.disk_percent}% ({m.disk_used_gb}/{m.disk_total_gb} GB)\n"
                f"  Network: RX {m.network_rx_bytes:.0f} bytes, TX {m.network_tx_bytes:.0f} bytes\n"
                f"  Uptime: {m.uptime_seconds:.0f}s\n"
            )
        return "\n".join(lines)

    def _format_alerts_context(self, alerts: list[Alert],
                               server_filter: Optional[str] = None) -> str:
        """Format alerts as a readable text block."""
        if not alerts:
            return "No active alerts."
        filtered = [
            a for a in alerts
            if not server_filter or a.server == server_filter
        ]
        if not filtered:
            return "No active alerts for this server."
        lines = []
        for a in filtered:
            lines.append(
                f"[{a.severity.upper()}] {a.server} - {a.metric}: "
                f"{a.value} (threshold: {a.threshold})"
            )
        return "\n".join(lines)

    def _extract_json(self, text: str) -> Optional[dict[str, Any]]:
        """Extract JSON from an LLM response that may contain markdown fences."""
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
        return None


# Singleton AI service
ai_service = AIService()
