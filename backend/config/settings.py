import os
import json
from pathlib import Path
from pydantic_settings import BaseSettings


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
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                custom_path = data.get("data_dir")
                if custom_path:
                    path = Path(custom_path)
                    path.mkdir(parents=True, exist_ok=True)
                    return path
        except Exception:
            pass
    return default_dir


class Settings(BaseSettings):
    # Backend
    host: str = "127.0.0.1"
    port: int = 8765

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
    top_k_bm25: int = 20
    top_k_vector: int = 20
    top_k_final: int = 10
    hybrid_alpha: float = 0.3  # 0 = pure vector, 1 = pure BM25
    rrf_k: int = 60  # Reciprocal Rank Fusion constant

    # RAG
    top_k_retrieval: int = 5

    # LLM
    provider_timeout: float = 180.0
    nvidia_timeout: float = 8.0
    openai_stream_timeout: float = 3.0
    llama_server_url: str = "http://127.0.0.1:8080"
    local_model: str = "Qwen3-4B-Q4_K_M.gguf"
    local_max_tokens: int = 160
    
    # Claude Cloud
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    
    # DeepSeek Cloud
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    
    # Gemini Cloud
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    
    # NVIDIA NIM (OpenAI-compatible)
    nvidia_api_key: str = ""
    nvidia_model: str = "moonshotai/kimi-k2.6"
    nvidia_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_deepseek_api_key: str = ""
    nvidia_deepseek_model: str = "deepseek-ai/deepseek-v4-pro"
    
    # Groq Cloud
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # FreeModel.dev Cloud (OpenAI-compatible proxy)
    freemodel_api_key: str = ""
    freemodel_model: str = "gpt-4o-mini"
    freemodel_url: str = "https://api.freemodel.dev/v1"
    
    # Reranking settings (disabled by default for CPU performance)
    enable_reranker: bool = False

    # MMR (Maximal Marginal Relevance): balances relevance vs diversity
    # 0.0–1.0; 1.0 = pure relevance, 0.7 = balanced, None = disabled
    mmr_lambda: float | None = None

    # GraphRAG — knowledge graph entity extraction, community detection, structured search
    graph_enabled: bool = True
    graph_max_gleanings: int = 2
    graph_entity_types: str = "CONCEPT,METHOD,DATASET,METRIC,MODEL,ALGORITHM,ARCHITECTURE,TASK,DOMAIN"
    graph_max_cluster_size: int = 10
    graph_top_k_entities: int = 10
    graph_top_k_relationships: int = 10
    graph_max_drift_steps: int = 3

    # Embedding pooling (FlagEmbedding-inspired): "cls", "mean", "last_token"
    embedding_pooling: str = "cls"

    # Retrieval postprocessing
    similarity_cutoff: float = 0.0

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
    
    # Custom provider: "deepseek", "claude", or "gemini"
    custom_cloud_provider: str = "deepseek"
    
    # Onboarding setup completed state
    setup_completed: bool = False
    
    # Academic verification
    openalex_email: str = ""
    crossref_email: str = ""

    # Zotero data directory (persisted)
    zotero_data_dir: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
