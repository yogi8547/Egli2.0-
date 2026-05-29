"""Ollama API client for Root Cause Analysis hypothesis generation.

Adapted from the wireshark-ai-analyzer pattern, specialized for
structured causal hypothesis generation and diagnostic queries.
"""

from __future__ import annotations

import json
import re
from typing import Any, Generator, Optional

import requests

OLLAMA_BASE_URL = "http://localhost:11434"


def list_models() -> list[dict]:
    """Fetch available models from the local Ollama instance."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        r.raise_for_status()
        return r.json().get("models", [])
    except requests.ConnectionError:
        return []
    except requests.RequestException:
        return []


def chat_stream(
    model: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    temperature: float = 0.3,
) -> Generator[str, None, None]:
    """Send a chat request to Ollama and yield response tokens.

    Args:
        model: Ollama model name (e.g. 'llama3.2')
        messages: List of message dicts with 'role' and 'content' keys
        system_prompt: Optional system prompt
        temperature: Model temperature (lower = more deterministic)

    Yields:
        Content tokens as they arrive from the model
    """
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + list(messages)

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": temperature,
        },
    }

    with requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json=payload,
        stream=True,
        timeout=120,
    ) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line:
                chunk = json.loads(line)
                if not chunk.get("done", False):
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content


def generate_structured(
    model: str,
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: float = 0.3,
) -> str:
    """Send a non-streaming generate request and return the full response.

    Args:
        model: Ollama model name
        prompt: The prompt text
        system_prompt: Optional system prompt
        temperature: Model temperature

    Returns:
        Full response text
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system_prompt or "",
        "stream": False,
        "options": {
            "temperature": temperature,
        },
    }

    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        return data.get("response", "")
    except requests.ConnectionError:
        return "ERROR: Cannot connect to Ollama. Make sure Ollama is running (http://localhost:11434)."
    except requests.RequestException as e:
        return f"ERROR: Ollama request failed: {e}"


def extract_json_from_response(text: str) -> Optional[dict[str, Any]]:
    """Extract JSON from an LLM response that may contain markdown fences."""
    # Try to find JSON between ```json and ``` fences
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find any JSON object in the text
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def is_ollama_available() -> bool:
    """Check if Ollama is running and accessible."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return r.status_code == 200
    except requests.ConnectionError:
        return False
