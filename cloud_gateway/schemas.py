from typing import Literal
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    task_type: str = "chat"
    system_prompt: str = ""
    user_prompt: str
    language: str = "auto"
    max_tokens: int = Field(default=1024, ge=64, le=8192)
    temperature: float = Field(default=0.3, ge=0.0, le=1.5)


class GenerateResponse(BaseModel):
    content: str
    model: str
    provider: str
    finish_reason: str = "stop"


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)
    model: str = "gemini-embedding-001"


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str


class TranslateRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)
    source_language: str = "en"
    target_language: str = "vi"
    task_type: str = "translate"
    max_tokens: int = Field(default=4096, ge=256, le=8192)
    temperature: float = Field(default=0.1, ge=0.0, le=0.5)


class TranslateResponse(BaseModel):
    translations: list[str]
    model: str
    provider: str


class StreamEvent(BaseModel):
    type: Literal["meta", "delta", "done", "error"]
    content: str = ""
    provider: str = ""
    model: str = ""

