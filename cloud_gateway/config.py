"""Environment-only configuration for the hosted gateway.

Provider secrets belong here and must never be shipped with the desktop app.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    environment: str = "development"
    cors_origins: str = ""
    firebase_project_id: str = ""
    firebase_service_account_json: str = ""
    gateway_shared_token: str = ""
    allow_unauthenticated: bool = False
    free_requests_per_day: int = 30
    free_input_chars_per_day: int = 500_000
    max_input_chars: int = 120_000
    max_output_tokens: int = 4096
    provider_timeout: float = 120.0

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-chat-v3-0324"
    cerebras_api_key: str = ""
    cerebras_model: str = "qwen-3-235b-a22b-instruct-2507"
    cloudflare_api_key: str = ""
    cloudflare_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    cloudflare_url: str = ""
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # Task maps contain provider names, never credentials.
    task_provider_map: str = (
        '{"chat":"gemini","rag":"gemini","summary":"gemini",'
        '"review":"gemini","verify":"gemini","critique":"gemini",'
        '"debate":"gemini","gap":"gemini","insight":"gemini",'
        '"quality_check":"gemini","research":"gemini",'
        '"synthesis":"gemini","entity":"gemini","translate":"gemini"}'
    )
    provider_fallback_chain: str = "groq,cerebras,cloudflare,openrouter,claude"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> GatewaySettings:
    return GatewaySettings()

