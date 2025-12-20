"""Pydantic models for structured outputs"""

from .llm_models import (
    LLMRequest,
    LLMResponse,
    PromptAnalysis,
    PromptSuggestion,
    TranslationResult,
    SafetyCheck,
    CostPrediction,
)
from .command_models import Command, CommandParameter, CommandCategory
from .rag_models import (
    DocumentIngestRequest,
    BatchIngestRequest,
    RetrieveRequest,
    KnowledgeBaseCreateRequest,
    ContextBuildRequest,
    IngestResponse,
    BatchIngestResponse,
    RetrieveResponse,
    RetrievedDocument,
    KnowledgeBase,
    BuiltContext,
    DocumentStatus,
    ChunkingStrategy,
)

__all__ = [
    # LLM Models
    "LLMRequest",
    "LLMResponse",
    "PromptAnalysis",
    "PromptSuggestion",
    "TranslationResult",
    "SafetyCheck",
    "CostPrediction",
    # Command Models
    "Command",
    "CommandParameter",
    "CommandCategory",
    # RAG Models
    "DocumentIngestRequest",
    "BatchIngestRequest",
    "RetrieveRequest",
    "KnowledgeBaseCreateRequest",
    "ContextBuildRequest",
    "IngestResponse",
    "BatchIngestResponse",
    "RetrieveResponse",
    "RetrievedDocument",
    "KnowledgeBase",
    "BuiltContext",
    "DocumentStatus",
    "ChunkingStrategy",
]
