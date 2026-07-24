import json
import os
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def resolve_env_files() -> tuple[str, ...]:
    """Locate .env for dev and PyInstaller bundles."""
    candidates: list[Path] = []

    explicit = os.environ.get("RESEARCHMIND_ENV_FILE")
    if explicit:
        candidates.append(Path(explicit))

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.extend(
            [
                exe_dir / ".env",
                exe_dir / "resources" / ".env",
            ]
        )
        resource_dir = os.environ.get("RESEARCHMIND_RESOURCE_DIR")
        if resource_dir:
            candidates.append(Path(resource_dir) / ".env")

    candidates.extend(
        [
            Path(".env"),
            Path(__file__).resolve().parent.parent / ".env",
        ]
    )

    seen: set[str] = set()
    files: list[str] = []
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        if path.exists():
            files.append(key)
    return tuple(files) if files else (".env",)


def get_fixed_default_dir() -> Path:
    if os.name == "nt":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            return Path(local_appdata) / "ResearchMind"
    return Path.home() / ".researchmind"


def get_resolved_data_dir() -> Path:
    default_dir = get_fixed_default_dir()
    config_file = default_dir / "config.json"
    if config_file.exists():
        try:
            with open(config_file, encoding="utf-8") as f:
                data = json.load(f)
                custom_path = data.get("data_dir")
                if custom_path:
                    path = Path(custom_path)
                    path.mkdir(parents=True, exist_ok=True)
                    return path
        except Exception:
            pass
    return default_dir


def get_license_public_key() -> str:
    configured = os.environ.get("LICENSE_PUBLIC_KEY", "").strip()
    if configured:
        return configured
    key_file = Path(__file__).resolve().parent / "license_public_key.txt"
    try:
        return key_file.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def get_public_gateway_url() -> str:
    """Load the non-secret gateway URL from env or a bundled JSON resource."""
    configured = os.environ.get("RESEARCHMIND_CLOUD_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    candidates: list[Path] = []
    resource_dir = os.environ.get("RESEARCHMIND_RESOURCE_DIR", "").strip()
    if resource_dir:
        candidates.append(Path(resource_dir) / "gateway.json")
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.extend([exe_dir / "gateway.json", exe_dir / "resources" / "gateway.json"])
    # Development: check backend/, project root, and config/
    candidates.append(Path(__file__).resolve().parent / "gateway.json")
    candidates.append(Path(__file__).resolve().parent.parent / "gateway.json")
    candidates.insert(0, Path.cwd() / "gateway.json")
    seen: set[Path] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        try:
            value = json.loads(path.read_text(encoding="utf-8")).get("url", "").strip()
            if value:
                return value.rstrip("/")
        except (OSError, ValueError, AttributeError):
            continue
    return ""


class Settings(BaseSettings):
    # Backend
    host: str = "127.0.0.1"
    port: int = 8765

    # Hosted authentication (disabled for the existing local-first desktop mode)
    firebase_auth_enabled: bool = False
    # Keep hosted research storage fail-closed until every database and vector
    # operation is isolated by the authenticated user ID.
    hosted_research_enabled: bool = False
    # Base64url-encoded raw Ed25519 public key used for offline license checks.
    license_public_key: str = get_license_public_key()
    firebase_project_id: str = ""
    firebase_service_account_json: str = ""
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    public_backend_url: str = ""
    desktop_google_callback_url: str = ""

    # Paths
    data_dir: Path = get_resolved_data_dir()
    papers_dir: Path = data_dir / "papers"
    chroma_dir: Path = data_dir / "chroma"
    db_path: Path = data_dir / "db" / "researchmind.db"

    # Chunking
    chunk_size: int = 512
    chunk_overlap: int = 50

    # Embedding
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024
    embedding_mode: str = "local"  # "local" (sentence-transformers) or "cloud" (Gemini API)
    embedding_query_instruction: str = ""
    embedding_passage_instruction: str = ""

    # Search
    top_k_bm25: int = 50
    top_k_vector: int = 50
    top_k_final: int = 50
    hybrid_alpha: float = 0.3  # 0 = pure vector, 1 = pure BM25
    rrf_k: int = 60  # Reciprocal Rank Fusion constant

    # RAG
    top_k_retrieval: int = 5
    parent_context_radius: int = 0
    ai_trace_sampling_rate: float = 0.1
    ai_trace_retention_days: int = 14
    ai_daily_token_budget: int = 0
    enable_multilingual_nli: bool = False

    # BGE-Reranker
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # LLM
    # auto follows the user's language; vi/en/ja forces a system-wide output language.
    output_language: str = "auto"
    provider_timeout: float = 180.0
    provider_max_retries: int = 1
    provider_retry_backoff: float = 0.35
    # Public hosted inference endpoint; provider API keys stay on the gateway.
    researchmind_cloud_url: str = get_public_gateway_url()
    researchmind_cloud_token: str = ""
    researchmind_cloud_timeout: float = 120.0
    nvidia_timeout: float = 8.0
    openai_stream_timeout: float = 3.0
    llama_server_url: str = "http://127.0.0.1:8080"
    local_model: str = "Qwen3-4B-Q4_K_M.gguf"
    local_max_tokens: int = 1024

    # Claude Cloud
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # DeepSeek Cloud
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"

    # Gemini Cloud
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Gemini Translation
    gemini_translate_api_key: str = ""
    gemini_translate_model: str = "gemini-2.5-flash"

    # NVIDIA NIM (OpenAI-compatible)
    nvidia_api_key: str = ""
    nvidia_model: str = "moonshotai/kimi-k2.6"
    nvidia_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_deepseek_api_key: str = ""
    nvidia_deepseek_model: str = "deepseek-ai/deepseek-v4-pro"

    # Groq Cloud
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # GitHub Models (Azure AI Foundry — OpenAI-compatible, free with GitHub PAT)
    github_api_key: str = ""
    github_model: str = "gpt-4o-mini"
    github_url: str = "https://models.inference.ai.azure.com"

    # GitHub Models — separate key for DeepSeek-V3-0324 (use different GH account to avoid rate limits)
    github_deepseek_v3_api_key: str = ""
    github_deepseek_v3_model: str = "DeepSeek-V3-0324"

    # FreeModel.dev Cloud (OpenAI-compatible proxy)
    freemodel_api_key: str = ""
    freemodel_model: str = "gpt-4o-mini"
    freemodel_url: str = "https://api.freemodel.dev/v1"

    # OpenRouter (OpenAI-compatible marketplace — DeepSeek V4 Flash, Cerebras, etc.)
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-v4-flash"
    openrouter_url: str = "https://openrouter.ai/api/v1"

    # OpenRouter Deep+ (for deepseek/deepseek-r1)
    openrouter_api_deep_key: str = ""
    openrouter_deep_model: str = "deepseek/deepseek-r1"
    openrouter_url_deep: str = "https://openrouter.ai/api/v1"

    # Cohere (Compatibility API — OpenAI-compatible)
    cohere_api_key: str = ""
    cohere_model: str = "command-r-plus"
    cohere_url: str = "https://api.cohere.ai/v1"

    # Cloudflare Workers AI (OpenAI-compatible — needs Account ID in URL)
    cloudflare_api_key: str = ""
    cloudflare_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    cloudflare_url: str = "https://api.cloudflare.com/client/v4/accounts/adb9fb90009a849d8bc1635194a7dbd4/ai/v1"

    # Cerebras (OpenAI-compatible — ultra-fast inference)
    cerebras_api_key: str = ""
    cerebras_model: str = "qwen-3-235b-a22b-instruct-2507"
    cerebras_url: str = "https://api.cerebras.ai/v1"

    # Reranking settings (BGE cross-encoder for improved relevance)
    enable_reranker: bool = True

    # MMR (Maximal Marginal Relevance): balances relevance vs diversity
    # 0.0–1.0; 1.0 = pure relevance, 0.7 = balanced, None = disabled
    mmr_lambda: float | None = None

    # GraphRAG — knowledge graph entity extraction, community detection, structured search
    graph_enabled: bool = True
    graph_max_gleanings: int = 0
    graph_entity_types: str = "CONCEPT,METHOD,DATASET,METRIC,MODEL,ALGORITHM,ARCHITECTURE,TASK,DOMAIN"
    graph_max_cluster_size: int = 10
    graph_top_k_entities: int = 10
    graph_top_k_relationships: int = 10
    graph_max_drift_steps: int = 3

    # Embedding pooling (FlagEmbedding-inspired): "cls", "mean", "last_token"
    embedding_pooling: str = "cls"

    # Retrieval postprocessing
    similarity_cutoff: float = 0.1

    # Response synthesis mode: "compact", "refine", "tree_summarize", "simple"
    response_mode: str = "compact"

    # Normalize embeddings before indexing/search
    normalize_embeddings: bool = True

    # Embedding instruction format (for RAG quality)
    query_instruction: str = ""
    passage_instruction: str = ""

    # Model Router settings (open-notebook inspired)
    large_context_threshold: int = 105000
    large_context_model: str = ""
    large_context_provider: str = ""

    # Free Cloud settings (tries Groq → Gemini → FreeModel → local)
    free_cloud_daily_limit: int = 10

    # llm_mode: "cloud_free" (Gemini with system/dev key), "cloud_custom" (user API key), "local" (llama-server)
    llm_mode: str = "cloud_free"
    cloud_ai_consent: bool = True
    diagnostics_consent: bool = False
    redact_metadata_for_cloud: bool = True

    # Custom provider: "deepseek", "claude", or "gemini"
    custom_cloud_provider: str = "deepseek"

    # Per-task provider map (JSON string): task_type → provider name
    # Factory default (override via .env):
    # {"summary":"github","daily_reader":"github","chat":"github","quality_check":"github",
    #  "insight":"github","rag":"gemini","gap":"deepseek","critique":"gemini","debate":"deepseek",
    #  "verify":"gemini","review":"deepseek","graph":"cerebras","research":"deepseek",
    #  "synthesis":"deepseek","entity":"github"}
    task_provider_map: str = '{"summary":"github","daily_reader":"github","chat":"github","quality_check":"github","insight":"github","rag":"gemini","gap":"deepseek","critique":"gemini","debate":"deepseek","verify":"gemini","review":"deepseek","graph":"cerebras","research":"deepseek","synthesis":"deepseek","entity":"github"}'

    # Per-task fallback provider map (JSON string): task_type → fallback provider
    # Used when primary provider fails (no key, rate limit, error)
    # Factory default (override via .env):
    # {"summary":"cloudflare","daily_reader":"cohere","chat":"openrouter","quality_check":"cohere",
    #  "insight":"openrouter","rag":"cerebras","gap":"gemini","critique":"deepseek","debate":"gemini",
    #  "verify":"deepseek","review":"gemini","graph":"gemini","research":"gemini",
    #  "synthesis":"gemini","entity":"cohere"}
    task_fallback_map: str = '{"summary":"cloudflare","daily_reader":"cohere","chat":"openrouter","quality_check":"cohere","insight":"openrouter","rag":"cerebras","gap":"gemini","critique":"deepseek","debate":"gemini","verify":"deepseek","review":"gemini","graph":"gemini","research":"gemini","synthesis":"gemini","entity":"cohere"}'

    # Ultimate fallback chain (comma-separated): tried in order when primary + fallback both fail
    # Factory default: "cerebras,groq,nvidia,nvidia_deepseek,github,github_deepseek_v3,cohere,cloudflare,openrouter,local"
    task_ultimate_fallback_chain: str = (
        "cerebras,groq,nvidia,nvidia_deepseek,github,github_deepseek_v3,cohere,cloudflare,openrouter,local"
    )

    # Onboarding setup completed state
    setup_completed: bool = False

    # Academic verification
    openalex_email: str = ""
    crossref_email: str = ""

    # Zotero data directory (persisted)
    zotero_data_dir: str = ""

    model_config = SettingsConfigDict(
        env_file=resolve_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
