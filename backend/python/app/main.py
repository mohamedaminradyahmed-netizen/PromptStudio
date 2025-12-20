"""
PromptStudio Python Backend - FastAPI Application

Main entry point for the Python backend service that provides:
- Mirascope + Instructor for structured LLM outputs
- YAML-based command system
- WebSocket bridge to Node.js backend
- REST API for LLM operations
- Prompt chains, embeddings, templates, and batch processing
- RAG system with pgvector for document retrieval
"""

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from .core.config import settings
from .core.logging import setup_logging
from .core.database import database
from .api.routes import (
    llm_router,
    commands_router,
    health_router,
    chains_router,
    embeddings_router,
    templates_router,
    batch_router,
    rag_router,
)
from .api.routes.agents import router as agents_router
from .websocket.bridge import bridge
from .websocket.handlers import WebSocketHandlers
from .services.llm_service import LLMService
from .services.instructor_service import InstructorService
from .services.command_service import CommandService
from .services.prompt_chain_service import PromptChainService
from .services.embedding_service import EmbeddingService
from .services.template_service import TemplateService
from .services.batch_service import BatchService
from .services.rag_service import RAGService


# Setup logging
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager

    Handles startup and shutdown events:
    - Initialize database with pgvector
    - Initialize all services
    - Connect to Node.js backend on startup
    - Disconnect on shutdown
    """
    logger.info("Starting PromptStudio Python Backend...")

    # Initialize database with pgvector support
    try:
        await database.init()
        logger.info("Database initialized with pgvector support")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

    # Initialize services
    llm_service = LLMService()
    instructor_service = InstructorService()
    command_service = CommandService()
    chain_service = PromptChainService(llm_service, instructor_service)
    embedding_service = EmbeddingService()
    template_service = TemplateService()
    batch_service = BatchService(llm_service, instructor_service)
    rag_service = RAGService()

    # Setup WebSocket handlers
    handlers = WebSocketHandlers(
        bridge=bridge,
        llm_service=llm_service,
        instructor_service=instructor_service,
        command_service=command_service,
    )

    # Store services in app state
    app.state.llm_service = llm_service
    app.state.instructor_service = instructor_service
    app.state.command_service = command_service
    app.state.chain_service = chain_service
    app.state.embedding_service = embedding_service
    app.state.template_service = template_service
    app.state.batch_service = batch_service
    app.state.rag_service = rag_service
    app.state.handlers = handlers

    # Store services dict for agents
    app.state.agent_services = {
        "llm_service": llm_service,
        "instructor_service": instructor_service,
        "command_service": command_service,
    }

    # Connect to Node.js backend (non-blocking)
    try:
        asyncio.create_task(bridge.connect_to_nodejs())
    except Exception as e:
        logger.warning(f"Could not connect to Node.js backend: {e}")

    logger.info(f"Python backend started on {settings.host}:{settings.port}")

    yield

    # Shutdown
    logger.info("Shutting down Python backend...")
    await bridge.disconnect_from_nodejs()
    await database.close()


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    PromptStudio Python Backend

    Provides LLM operations with structured outputs using Mirascope and Instructor.

    ## Features

    - **Structured Outputs**: Get validated Pydantic models from LLM responses
    - **Multi-Provider**: Support for OpenAI, Anthropic, Google, Azure via Mirascope
    - **Command System**: YAML-based command definitions with hot-reload
    - **Prompt Chains**: Execute multi-step prompt workflows
    - **Embeddings**: Generate and search vector embeddings
    - **Templates**: Manage prompt templates with inheritance
    - **Batch Processing**: Process multiple prompts in parallel
    - **WebSocket Bridge**: Real-time communication with Node.js backend
    - **Prompt Analysis**: Analyze prompts for quality and safety
    - **Translation**: Multi-language prompt translation
    - **Cost Prediction**: Pre-send cost estimation
    - **RAG System**: Document ingestion and semantic retrieval with pgvector
    - **Vector Search**: Hybrid search combining similarity and trust scores
    - **Knowledge Bases**: Organize documents in searchable collections

    ## Agent Framework

    - **AutoGen Agents**: Research, Planning, and Execution agents
    - **LangGraph Workflows**: State machine-based orchestration
    - **Plan-and-Execute Pattern**: Multi-step task automation
    """,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(health_router)
app.include_router(llm_router, prefix="/api")
app.include_router(commands_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(chains_router, prefix="/api")
app.include_router(embeddings_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(batch_router, prefix="/api")
app.include_router(rag_router, prefix="/api")


# WebSocket endpoint for direct client connections
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint for direct client connections

    Clients can connect directly to the Python backend for real-time
    LLM operations without going through the Node.js backend.
    """
    await bridge.handle_websocket(websocket, client_id)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs" if settings.debug else "disabled",
        "endpoints": {
            "llm": "/api/llm",
            "commands": "/api/commands",
            "agents": "/api/agents",
            "chains": "/api/chains",
            "embeddings": "/api/embeddings",
            "templates": "/api/templates",
            "batch": "/api/batch",
            "rag": "/api/rag",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        workers=1 if settings.debug else settings.workers,
    )
