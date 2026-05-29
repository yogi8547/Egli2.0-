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


class AIService:
    """
    Service for communicating with local Ollama instance.
    All inference runs locally — no external API calls.
    """

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.temperature = settings.ollama_temperature

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
            yield "⚠️  Cannot connect to Ollama. Make sure Ollama is running."
        except Exception as exc:
            yield f"⚠️  Error: {exc!s}"

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

    async def analyze_alert(self, alert: Alert) -> str:
        """
        Analyze an alert and suggest remediation steps.

        Args:
            alert: The triggered alert

        Returns:
            AI-generated analysis with root cause and remediation
        """
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
        return await self.generate(prompt)

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
