"""
Configuration management using pydantic-settings.
Reads from environment variables and .env file.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Ollama
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:8b"
    OLLAMA_TIMEOUT: int = 120

    # Application
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 7842
    APP_DEBUG: bool = False
    APP_LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "sqlite:///./data/clanker.db"

    # System prompt
    SYSTEM_PROMPT_FILE: str = "config/system_prompt.txt"

    def get_system_prompt(self) -> str:
        """Read system prompt from file, fall back to default."""
        path = Path(self.SYSTEM_PROMPT_FILE)
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
        return DEFAULT_SYSTEM_PROMPT


DEFAULT_SYSTEM_PROMPT = """You are Clanker, a practical local AI desktop assistant.

Your personality:
- Casual, direct, and helpful
- Concise — don't pad answers
- Proactive when you spot something useful to mention
- Not formal, not motivational, not sycophantic
- You're a working assistant, not a chatbot

Your role:
- Help the user manage tasks, projects, notes, and workflow
- Use available tools when they'd genuinely help
- Remember things the user asks you to remember
- Search local files when asked
- Open folders/apps the user has configured

Tool use guidelines:
- Use tools when the user clearly needs them (e.g. "create a task", "what's on my list today")
- Don't use tools unless they're actually relevant
- Always tell the user what you did when using a tool
- If a tool fails, report the error clearly

Keep responses short unless the user needs detail.
"""

settings = Settings()
