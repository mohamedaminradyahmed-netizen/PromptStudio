"""
Application configuration using Pydantic Settings

Enhanced configuration with support for multiple LLM providers,
embeddings, and batch processing settings.
"""

from functools import lru_cache
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application
    app_name: str = "PromptStudio Python Backend"
    app_version: str = "2.0.0"
    debug: bool = False
    environment: str = "development"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4

    # CORS
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Node.js Backend WebSocket Bridge
    nodejs_backend_url: str = "http://localhost:3001"
    nodejs_ws_url: str = "ws://localhost:3001"

    # LLM Providers - OpenAI
    openai_api_key: Optional[str] = None
    openai_organization: Optional[str] = None

    # LLM Providers - Anthropic
    anthropic_api_key: Optional[str] = None

    # LLM Providers - Google (Gemini)
    google_api_key: Optional[str] = None
    google_project_id: Optional[str] = None

    # LLM Providers - Azure OpenAI
    azure_api_key: Optional[str] = None
    azure_endpoint: Optional[str] = None
    azure_api_version: str = "2024-02-15-preview"
    azure_deployment: Optional[str] = None

    # LLM Providers - Cohere
    cohere_api_key: Optional[str] = None

    # Default LLM Settings
    default_llm_provider: str = "openai"
    default_model: str = "gpt-4-turbo-preview"
    default_temperature: float = 0.7
    default_max_tokens: int = 4096

    # Embedding Settings
    default_embedding_provider: str = "openai"
    default_embedding_model: str = "text-embedding-3-small"

    # Batch Processing Settings
    batch_max_concurrency: int = 10
    batch_rate_limit_per_minute: int = 60
    batch_default_timeout: int = 120

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_ttl: int = 3600  # 1 hour

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/promptstudio"

    # JWT
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60

    # Commands and Templates
    commands_directory: str = "./commands"
    templates_directory: str = "./templates"

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"  # json or text

    # Feature Flags
    enable_streaming: bool = True
    enable_caching: bool = True
    enable_metrics: bool = True

    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 100

    # Safety Settings
    safety_check_enabled: bool = True
    safety_block_threshold: str = "high"  # low, medium, high, critical


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
