"""
Ollama service layer.
Handles all communication with the Ollama API.
"""
import json
from typing import AsyncIterator
import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaError(Exception):
    """Raised when Ollama is unavailable or returns an error."""
    pass


class OllamaService:
    def __init__(self):
        self.host = settings.OLLAMA_HOST
        self.timeout = settings.OLLAMA_TIMEOUT

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.host,
            timeout=httpx.Timeout(connect=5.0, read=self.timeout, write=30.0, pool=5.0),
        )

    async def check_health(self) -> dict:
        """Check if Ollama is running. Returns status dict."""
        try:
            async with self._client() as client:
                r = await client.get("/")
                return {"status": "ok", "message": r.text.strip()}
        except httpx.ConnectError:
            return {"status": "error", "message": "Cannot connect to Ollama. Is it running?"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def list_models(self) -> list[dict]:
        """Return list of installed models."""
        try:
            async with self._client() as client:
                r = await client.get("/api/tags")
                r.raise_for_status()
                data = r.json()
                return data.get("models", [])
        except httpx.ConnectError:
            raise OllamaError("Cannot connect to Ollama at " + self.host)
        except Exception as e:
            raise OllamaError(f"Failed to list models: {e}")

    async def chat_stream(
        self,
        model: str,
        messages: list[dict],
    ) -> AsyncIterator[str]:
        """
        Stream a chat completion from Ollama.
        Yields text chunks as they arrive.
        """
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        try:
            async with self._client() as client:
                async with client.stream("POST", "/api/chat", json=payload) as response:
                    if response.status_code == 404:
                        raise OllamaError(f"Model '{model}' not found. Pull it first: ollama pull {model}")
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            text = chunk.get("message", {}).get("content", "")
                            if text:
                                yield text
                            if chunk.get("done"):
                                return
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            raise OllamaError("Cannot connect to Ollama. Make sure Ollama is running.")
        except httpx.ReadTimeout:
            raise OllamaError("Ollama took too long to respond. The model may be loading.")
        except OllamaError:
            raise
        except Exception as e:
            raise OllamaError(f"Unexpected error during chat: {e}")

    async def chat_complete(
        self,
        model: str,
        messages: list[dict],
    ) -> str:
        """Non-streaming chat — returns full response text."""
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        try:
            async with self._client() as client:
                r = await client.post("/api/chat", json=payload)
                if r.status_code == 404:
                    raise OllamaError(f"Model '{model}' not found.")
                r.raise_for_status()
                data = r.json()
                return data.get("message", {}).get("content", "")
        except httpx.ConnectError:
            raise OllamaError("Cannot connect to Ollama.")
        except OllamaError:
            raise
        except Exception as e:
            raise OllamaError(f"Chat failed: {e}")


ollama_service = OllamaService()
