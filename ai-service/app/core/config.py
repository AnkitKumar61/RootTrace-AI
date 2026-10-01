from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore')
    ai_service_secret: str = Field(min_length=32)
    gemini_api_key: str = ''
    llm_provider: str = 'gemini'
    llm_model: str = 'gemini-3.5-flash-lite'
    embedding_provider: str = 'gemini'
    embedding_model: str = 'gemini-embedding-2'
    embedding_dimensions: int = Field(default=768, ge=128, le=3072)
    qdrant_url: str = ''
    qdrant_api_key: str = ''
    qdrant_collection: str = 'roottrace_gemini_embedding2_768'
    retrieval_top_k: int = Field(default=8, ge=1, le=30)
    retrieval_min_score: float = Field(default=0.35, ge=0, le=1)
    max_file_size_mb: int = Field(default=20, ge=1, le=100)
