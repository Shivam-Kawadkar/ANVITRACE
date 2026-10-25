"""ANVITRACE — Local Ollama LLM Service.

Provides robust, offline-only async communication with local Ollama runtime.
Adheres strictly to the offline cyber-forensics guarantee:
- Zero external API calls or telemetry.
- Bounded timeouts to prevent server thread starvation.
- Graceful error states when Ollama daemon is offline or model is missing.
"""

from __future__ import annotations

import json
from typing import Any, Optional
import httpx

from app.config.settings import settings
from app.utils.logging import logger


class OllamaClientError(Exception):
    """Base exception for Ollama interactions."""


class OllamaConnectionError(OllamaClientError):
    """Raised when the Ollama daemon cannot be reached."""


class OllamaModelNotFoundError(OllamaClientError):
    """Raised when the configured model is not installed locally."""


class OllamaTimeoutError(OllamaClientError):
    """Raised when local inference exceeds the configured timeout."""


class LocalLLMService:
    """Async client communicating strictly with the local Ollama daemon."""

    def __init__(
        self,
        base_url: str | None = None,
        model_name: str | None = None,
        timeout_seconds: int | None = None,
    ) -> None:
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.model = model_name or settings.OLLAMA_MODEL
        self.timeout = timeout_seconds or settings.OLLAMA_TIMEOUT_SECONDS

    async def check_health(self) -> dict[str, Any]:
        """Check if Ollama daemon is reachable and if the required model is installed.

        Never attempts to pull or download a missing model.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code != 200:
                    return {
                        "ollama_reachable": False,
                        "base_url": self.base_url,
                        "configured_model": self.model,
                        "model_available": False,
                        "available_models": [],
                        "offline": True,
                        "status": "ollama_down",
                    }

                data = res.json()
                models_info = data.get("models", [])
                # Model names in Ollama can be e.g. "llama3.2:3b" or "llama3.2:latest"
                available_names = [m.get("name", "") for m in models_info]

                # Match exact or tag prefix (e.g. llama3.2 matches llama3.2:latest)
                model_found = any(
                    name == self.model
                    or name.startswith(f"{self.model}:")
                    or self.model.startswith(f"{name.split(':')[0]}:")
                    for name in available_names
                )

                return {
                    "ollama_reachable": True,
                    "base_url": self.base_url,
                    "configured_model": self.model,
                    "model_available": model_found,
                    "available_models": available_names,
                    "offline": True,
                    "status": "ready" if model_found else "model_missing",
                }
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            logger.warning(f"Ollama daemon unreachable at {self.base_url}: {e}")
            return {
                "ollama_reachable": False,
                "base_url": self.base_url,
                "configured_model": self.model,
                "model_available": False,
                "available_models": [],
                "offline": True,
                "status": "ollama_down",
            }
        except Exception as e:
            logger.error(f"Unexpected error checking Ollama health: {e}")
            return {
                "ollama_reachable": False,
                "base_url": self.base_url,
                "configured_model": self.model,
                "model_available": False,
                "available_models": [],
                "offline": True,
                "status": "ollama_down",
            }

    async def chat(
        self,
        messages: list[dict[str, str]],
        format: Optional[str | dict[str, Any]] = None,
        temperature: float = 0.1,
        max_tokens: int = 450,
        num_ctx: int = 2048,
    ) -> str:
        """Send chat messages to the local Ollama model with optimized bounds.

        Parameters
        ----------
        messages:
            List of message dicts with 'role' ('system', 'user', 'assistant') and 'content'.
        format:
            Optional 'json' or JSON schema dict for structured output.
        temperature:
            Sampling temperature (low default 0.1 for deterministic, factual forensic reasoning).
        max_tokens:
            Max tokens to generate (default 450 prevents long CPU generation delays).
        num_ctx:
            Context window size (default 2048 prevents massive prompt evaluation latency).
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": num_ctx,
                "top_p": 0.9,
                "top_k": 40,
            },
        }
        if format:
            payload["format"] = format

        try:
            async with httpx.AsyncClient(timeout=float(self.timeout)) as client:
                res = await client.post(f"{self.base_url}/api/chat", json=payload)
                if res.status_code == 404:
                    raise OllamaModelNotFoundError(
                        f"Ollama model '{self.model}' is not installed locally. "
                        f"Run `ollama pull {self.model}` offline prior to investigation."
                    )
                if res.status_code != 200:
                    raise OllamaClientError(
                        f"Ollama returned HTTP {res.status_code}: {res.text[:200]}"
                    )

                data = res.json()
                msg = data.get("message", {})
                content = msg.get("content", "")
                if not content:
                    raise OllamaClientError("Ollama returned an empty response.")
                return content.strip()

        except httpx.ConnectError as e:
            raise OllamaConnectionError(
                f"Cannot connect to Ollama daemon at {self.base_url}. Ensure Ollama is running (`ollama serve`)."
            ) from e
        except httpx.TimeoutException as e:
            raise OllamaTimeoutError(
                f"Ollama inference timed out after {self.timeout}s. Try a shorter query or smaller context."
            ) from e
        except OllamaClientError:
            raise
        except Exception as e:
            raise OllamaClientError(f"Unexpected Ollama inference failure: {e}") from e

    async def generate_json(
        self,
        messages: list[dict[str, str]],
        schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
        max_tokens: int = 550,
        num_ctx: int = 2048,
    ) -> dict[str, Any]:
        """Generate guaranteed JSON output from Ollama with error recovery and bounded tokens."""
        format_spec: str | dict[str, Any] = schema if schema else "json"
        raw_output = await self.chat(
            messages=messages,
            format=format_spec,
            temperature=temperature,
            max_tokens=max_tokens,
            num_ctx=num_ctx,
        )

        # Parse JSON output
        try:
            # Handle potential markdown code fencing: ```json ... ```
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            return json.loads(cleaned)
        except json.JSONDecodeError as decode_err:
            logger.warning(f"Initial JSON parse failed on Ollama output: {decode_err}. Attempting recovery.")
            # Simple substring extraction between { and }
            start = raw_output.find("{")
            end = raw_output.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(raw_output[start : end + 1])
                except Exception:
                    pass
            raise OllamaClientError(
                f"Failed to parse model output as valid JSON: {raw_output[:250]}"
            ) from decode_err


# Global default instance
local_llm_service = LocalLLMService()
