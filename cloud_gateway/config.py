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

    # ─── Gemini ────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # ─── Groq ──────────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # ─── OpenRouter ────────────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-chat-v3-0324"
    openrouter_r1_api_key: str = ""
    openrouter_r1_model: str = "deepseek/deepseek-r1"

    # ─── Cerebras ──────────────────────────────────────────────────
    cerebras_api_key: str = ""
    cerebras_model: str = "qwen-3-235b-a22b-instruct-2507"

    # ─── Cloudflare Workers AI ─────────────────────────────────────
    cloudflare_api_key: str = ""
    cloudflare_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    cloudflare_url: str = ""

    # ─── Claude ────────────────────────────────────────────────────
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # ─── DeepSeek ──────────────────────────────────────────────────
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"

    # ─── GitHub Models ─────────────────────────────────────────────
    github_api_key: str = ""
    github_model: str = "gpt-4o-mini"
    github_deepseek_v3_api_key: str = ""
    github_deepseek_v3_model: str = "DeepSeek-V3-0324"

    # ─── NVIDIA ────────────────────────────────────────────────────
    nvidia_api_key: str = ""
    nvidia_model: str = "moonshotai/kimi-k2.6"
    nvidia_deepseek_api_key: str = ""
    nvidia_deepseek_model: str = "deepseek-ai/deepseek-v4-pro"

    # ─── FreeModel ─────────────────────────────────────────────────
    freemodel_api_key: str = ""
    freemodel_model: str = "gpt-4o-mini"

    # ─── Cohere ────────────────────────────────────────────────────
    cohere_api_key: str = ""
    cohere_model: str = "command-r-plus"

    # Task maps contain provider names, never credentials.
    task_provider_map: str = (
        '{"chat":"gemini","rag":"gemini","summary":"groq",'
        '"daily_reader":"github","review":"nvidia_deepseek",'
        '"review_outline":"groq","review_section":"groq",'
        '"verify":"gemini","critique":"gemini","debate":"nvidia_deepseek",'
        '"gap":"nvidia_deepseek","insight":"github",'
        '"quality_check":"github","research":"groq",'
        '"synthesis":"groq","entity":"cerebras","translate":"gemini"}'
    )
    routing_policy: str = (
        '{"chat.fast":["gemini","github","groq"],"chat.deep":["deepseek","openrouter","nvidia_deepseek","gemini"],"chat.deep_plus":["openrouter_r1","deepseek","nvidia_deepseek","gemini"],"rag.fast":["gemini","groq","cerebras"],"rag.deep":["deepseek","gemini","nvidia"],"rag.deep_plus":["openrouter_r1","deepseek","gemini"],"review_outline":["groq","gemini","cerebras"],"review_section":["nvidia_deepseek","deepseek","gemini","groq"],"review":["nvidia_deepseek","deepseek","gemini"],"verify":["gemini","deepseek","groq"],"critique":["gemini","deepseek","nvidia"],"debate":["nvidia_deepseek","deepseek","gemini"],"summary":["groq","gemini","cerebras"],"quality_check":["github","gemini","groq"],"translate":["gemini","groq"],"entity":["cerebras","groq"],"research":["deepseek","groq","gemini"],"synthesis":["deepseek","groq","gemini"],"daily_reader":["github","gemini","groq"],"gap":["deepseek","nvidia_deepseek","gemini"],"insight":["github","gemini","groq"]}'
    )
    provider_fallback_chain: str = (
        "groq,cerebras,cloudflare,nvidia,nvidia_deepseek,"
        "github,github_deepseek_v3,cohere,openrouter,openrouter_r1,"
        "deepseek,freemodel,claude"
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> GatewaySettings:
    return GatewaySettings()

