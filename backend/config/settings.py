from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Backend
    host: str = "127.0.0.1"
    port: int = 8765

    # Paths
    data_dir: Path = Path(__file__).parent.parent.parent / "data"
    papers_dir: Path = data_dir / "papers"
    chroma_dir: Path = data_dir / "chroma"
    db_path: Path = data_dir / "researchmind.db"

    # Chunking
    chunk_size: int = 512
    chunk_overlap: int = 50

    # Embedding
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024

    # Search
    top_k_bm25: int = 20
    top_k_vector: int = 20
    top_k_final: int = 10
    hybrid_alpha: float = 0.3  # 0 = pure vector, 1 = pure BM25
    rrf_k: int = 60  # Reciprocal Rank Fusion constant

    # RAG
    top_k_retrieval: int = 5

    # LLM
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    llm_mode: str = "local"  # "local" or "cloud"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
