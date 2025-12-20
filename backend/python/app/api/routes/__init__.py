"""API route modules"""

from .llm import router as llm_router
from .commands import router as commands_router
from .health import router as health_router
from .chains import router as chains_router
from .embeddings import router as embeddings_router
from .templates import router as templates_router
from .batch import router as batch_router

__all__ = [
    "llm_router",
    "commands_router",
    "health_router",
    "chains_router",
    "embeddings_router",
    "templates_router",
    "batch_router",
]
