"""API route modules"""

from .llm import router as llm_router
from .commands import router as commands_router
from .health import router as health_router
from .rag import router as rag_router

__all__ = ["llm_router", "commands_router", "health_router", "rag_router"]
