"""
RAG API Routes

REST API endpoints for RAG operations including:
- Knowledge base management
- Document ingestion
- Semantic retrieval
- Context building
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from ...core.database import get_session
from ...models.rag_models import (
    DocumentIngestRequest,
    BatchIngestRequest,
    RetrieveRequest,
    KnowledgeBaseCreateRequest,
    ContextBuildRequest,
    IngestResponse,
    BatchIngestResponse,
    RetrieveResponse,
    KnowledgeBase,
    BuiltContext,
    DocumentStatus,
)
from ...services.rag_service import RAGService


router = APIRouter(prefix="/rag", tags=["RAG"])

# Initialize service
rag_service = RAGService()


# ============== Knowledge Base Endpoints ==============

@router.post(
    "/knowledge-bases",
    response_model=KnowledgeBase,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new knowledge base",
)
async def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeBase:
    """
    Create a new knowledge base for storing documents.

    A knowledge base is a container for related documents that can be
    searched together.
    """
    try:
        kb = await rag_service.create_knowledge_base(request, session)
        logger.info(f"Created knowledge base: {kb.name}")
        return kb
    except Exception as e:
        logger.error(f"Failed to create knowledge base: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/knowledge-bases",
    response_model=List[KnowledgeBase],
    summary="List all knowledge bases",
)
async def list_knowledge_bases(
    session: AsyncSession = Depends(get_session),
) -> List[KnowledgeBase]:
    """List all available knowledge bases with their statistics."""
    try:
        return await rag_service.list_knowledge_bases(session)
    except Exception as e:
        logger.error(f"Failed to list knowledge bases: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/knowledge-bases/{kb_id}",
    response_model=KnowledgeBase,
    summary="Get a knowledge base by ID",
)
async def get_knowledge_base(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeBase:
    """Get details of a specific knowledge base."""
    kb = await rag_service.get_knowledge_base(kb_id, session)
    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Knowledge base not found: {kb_id}",
        )
    return kb


# ============== Document Ingestion Endpoints ==============

@router.post(
    "/ingest",
    response_model=IngestResponse,
    summary="Ingest a document",
)
async def ingest_document(
    request: DocumentIngestRequest,
    session: AsyncSession = Depends(get_session),
) -> IngestResponse:
    """
    Ingest a document into a knowledge base.

    The document will be:
    1. Chunked according to the specified strategy
    2. Embedded using OpenAI embeddings
    3. Stored with vector indexes for fast retrieval

    **Chunking Strategies:**
    - `fixed_size`: Split by approximate token count
    - `sentence`: Split by sentences
    - `paragraph`: Split by paragraphs
    - `semantic`: Smart splitting by section markers
    """
    result = await rag_service.ingest_document(request, session)

    if result.status == DocumentStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message,
        )

    return result


@router.post(
    "/ingest/batch",
    response_model=BatchIngestResponse,
    summary="Batch ingest documents",
)
async def batch_ingest(
    request: BatchIngestRequest,
    session: AsyncSession = Depends(get_session),
) -> BatchIngestResponse:
    """
    Ingest multiple documents at once.

    Useful for bulk loading documents into a knowledge base.
    Returns detailed status for each document.
    """
    return await rag_service.batch_ingest(request, session)


# ============== Retrieval Endpoints ==============

@router.post(
    "/retrieve",
    response_model=RetrieveResponse,
    summary="Retrieve relevant documents",
)
async def retrieve_documents(
    request: RetrieveRequest,
    session: AsyncSession = Depends(get_session),
) -> RetrieveResponse:
    """
    Retrieve documents relevant to a query using semantic search.

    **Search Modes:**
    - Vector search: Pure similarity-based ranking
    - Hybrid search: Combines similarity with trust scores

    Results are ordered by relevance/combined score.
    """
    try:
        return await rag_service.retrieve(request, session)
    except Exception as e:
        logger.error(f"Retrieval failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/context",
    response_model=BuiltContext,
    summary="Build context for a prompt",
)
async def build_context(
    request: ContextBuildRequest,
    session: AsyncSession = Depends(get_session),
) -> BuiltContext:
    """
    Build context for a prompt by retrieving and combining relevant documents.

    This is the main entry point for RAG-augmented prompting:
    1. Searches across specified knowledge bases
    2. Ranks documents by relevance and trust
    3. Combines content within token limits
    4. Returns context with source attribution
    """
    try:
        return await rag_service.build_context(request, session)
    except Exception as e:
        logger.error(f"Context building failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


# ============== Trust Management Endpoints ==============

@router.patch(
    "/documents/{document_id}/trust",
    summary="Update document trust score",
)
async def update_trust_score(
    document_id: str,
    trust_score: float,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update the trust score for a document (0.0 to 1.0)."""
    if not 0 <= trust_score <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trust score must be between 0 and 1",
        )

    success = await rag_service.update_trust_score(document_id, trust_score, session)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )

    return {"message": "Trust score updated", "document_id": document_id, "trust_score": trust_score}


@router.post(
    "/documents/{document_id}/verify",
    summary="Verify a document",
)
async def verify_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark a document as verified, boosting its trust score."""
    success = await rag_service.verify_document(document_id, session)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )

    return {"message": "Document verified", "document_id": document_id}
