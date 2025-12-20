"""
RAG (Retrieval Augmented Generation) Service

Provides document ingestion and semantic retrieval capabilities
using pgvector for vector similarity search.
"""

import time
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from ..models.db_models import (
    KnowledgeBaseModel,
    KnowledgeDocumentModel,
    TrustedSourceModel,
    RAGContextSessionModel,
)
from ..models.rag_models import (
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
    ContextSource,
    DocumentStatus,
)
from .embedding_service import EmbeddingService


class RAGService:
    """
    RAG Service for document ingestion and retrieval.

    Features:
    - Document ingestion with automatic chunking
    - Vector embedding generation
    - Hybrid semantic search (vector + trust score)
    - Context building for prompts
    - Trust score management
    """

    def __init__(self):
        self.embedding_service = EmbeddingService()

    # ============== Knowledge Base Operations ==============

    async def create_knowledge_base(
        self,
        request: KnowledgeBaseCreateRequest,
        session: AsyncSession
    ) -> KnowledgeBase:
        """Create a new knowledge base"""
        kb = KnowledgeBaseModel(
            id=str(uuid.uuid4()),
            name=request.name,
            description=request.description,
            metadata_=request.metadata,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        session.add(kb)
        await session.flush()

        logger.info(f"Created knowledge base: {kb.name} (ID: {kb.id})")

        return KnowledgeBase(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            document_count=0,
            total_chunks=0,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            metadata=kb.metadata_,
        )

    async def get_knowledge_base(
        self,
        kb_id: str,
        session: AsyncSession
    ) -> Optional[KnowledgeBase]:
        """Get a knowledge base by ID with stats"""
        result = await session.execute(
            select(KnowledgeBaseModel).where(KnowledgeBaseModel.id == kb_id)
        )
        kb = result.scalar_one_or_none()

        if not kb:
            return None

        # Get document count
        doc_count_result = await session.execute(
            select(func.count(KnowledgeDocumentModel.id))
            .where(KnowledgeDocumentModel.knowledge_base_id == kb_id)
        )
        doc_count = doc_count_result.scalar() or 0

        return KnowledgeBase(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            document_count=doc_count,
            total_chunks=doc_count,  # Each chunk is a document in our model
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            metadata=kb.metadata_,
        )

    async def list_knowledge_bases(
        self,
        session: AsyncSession
    ) -> List[KnowledgeBase]:
        """List all knowledge bases"""
        result = await session.execute(select(KnowledgeBaseModel))
        kbs = result.scalars().all()

        knowledge_bases = []
        for kb in kbs:
            doc_count_result = await session.execute(
                select(func.count(KnowledgeDocumentModel.id))
                .where(KnowledgeDocumentModel.knowledge_base_id == kb.id)
            )
            doc_count = doc_count_result.scalar() or 0

            knowledge_bases.append(KnowledgeBase(
                id=kb.id,
                name=kb.name,
                description=kb.description,
                document_count=doc_count,
                total_chunks=doc_count,
                created_at=kb.created_at,
                updated_at=kb.updated_at,
                metadata=kb.metadata_,
            ))

        return knowledge_bases

    # ============== Document Ingestion ==============

    async def ingest_document(
        self,
        request: DocumentIngestRequest,
        session: AsyncSession
    ) -> IngestResponse:
        """
        Ingest a document into a knowledge base.

        Process:
        1. Chunk the document content
        2. Generate embeddings for each chunk
        3. Store chunks with embeddings
        """
        start_time = time.time()
        parent_doc_id = str(uuid.uuid4())

        try:
            # Verify knowledge base exists
            kb = await self.get_knowledge_base(request.knowledge_base_id, session)
            if not kb:
                return IngestResponse(
                    document_id=parent_doc_id,
                    title=request.title,
                    status=DocumentStatus.FAILED,
                    chunks_created=0,
                    total_tokens=0,
                    processing_time_ms=(time.time() - start_time) * 1000,
                    message=f"Knowledge base not found: {request.knowledge_base_id}",
                )

            # Chunk the document
            chunks = self.embedding_service.chunk_text(
                request.content,
                chunk_size=request.chunk_size,
                overlap=request.chunk_overlap,
                strategy=request.chunking_strategy.value,
            )

            if not chunks:
                chunks = [request.content]

            logger.info(f"Document '{request.title}' split into {len(chunks)} chunks")

            # Generate embeddings for all chunks
            embeddings = await self.embedding_service.embed_batch(chunks)

            # Store each chunk as a document
            total_tokens = 0
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                token_count = self.embedding_service.estimate_tokens(chunk)
                total_tokens += token_count

                doc = KnowledgeDocumentModel(
                    id=str(uuid.uuid4()),
                    knowledge_base_id=request.knowledge_base_id,
                    title=f"{request.title} - Chunk {i + 1}",
                    content=chunk,
                    source=request.source,
                    embedding=embedding,
                    trust_score=request.trust_score,
                    is_verified=False,
                    chunk_index=i,
                    parent_document_id=parent_doc_id,
                    token_count=token_count,
                    metadata_={
                        **request.metadata,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "parent_title": request.title,
                    },
                )
                session.add(doc)

            await session.flush()

            processing_time_ms = (time.time() - start_time) * 1000
            logger.info(
                f"Ingested document '{request.title}': "
                f"{len(chunks)} chunks, {total_tokens} tokens, "
                f"{processing_time_ms:.2f}ms"
            )

            return IngestResponse(
                document_id=parent_doc_id,
                title=request.title,
                status=DocumentStatus.COMPLETED,
                chunks_created=len(chunks),
                total_tokens=total_tokens,
                processing_time_ms=processing_time_ms,
                message="Document ingested successfully",
            )

        except Exception as e:
            logger.error(f"Document ingestion failed: {e}")
            return IngestResponse(
                document_id=parent_doc_id,
                title=request.title,
                status=DocumentStatus.FAILED,
                chunks_created=0,
                total_tokens=0,
                processing_time_ms=(time.time() - start_time) * 1000,
                message=str(e),
            )

    async def batch_ingest(
        self,
        request: BatchIngestRequest,
        session: AsyncSession
    ) -> BatchIngestResponse:
        """Ingest multiple documents"""
        start_time = time.time()
        results = []
        successful = 0
        failed = 0

        for doc_request in request.documents:
            doc_request.knowledge_base_id = request.knowledge_base_id
            result = await self.ingest_document(doc_request, session)
            results.append(result)

            if result.status == DocumentStatus.COMPLETED:
                successful += 1
            else:
                failed += 1

        return BatchIngestResponse(
            total_documents=len(request.documents),
            successful=successful,
            failed=failed,
            results=results,
            total_processing_time_ms=(time.time() - start_time) * 1000,
        )

    # ============== Document Retrieval ==============

    async def retrieve(
        self,
        request: RetrieveRequest,
        session: AsyncSession
    ) -> RetrieveResponse:
        """
        Retrieve relevant documents using semantic search.

        Supports:
        - Pure vector similarity search
        - Hybrid search (vector + trust score weighting)
        """
        start_time = time.time()

        # Generate embedding for query
        query_embedding = await self.embedding_service.embed_text(request.query)

        if request.use_hybrid_search:
            results = await self._hybrid_search(
                query_embedding=query_embedding,
                kb_id=request.knowledge_base_id,
                min_trust=request.min_trust_score,
                similarity_threshold=request.min_similarity,
                trust_weight=request.trust_weight,
                max_results=request.max_results,
                session=session,
            )
        else:
            results = await self._vector_search(
                query_embedding=query_embedding,
                kb_id=request.knowledge_base_id,
                min_trust=request.min_trust_score,
                similarity_threshold=request.min_similarity,
                max_results=request.max_results,
                session=session,
            )

        search_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Retrieved {len(results)} documents for query "
            f"(similarity >= {request.min_similarity}, trust >= {request.min_trust_score}) "
            f"in {search_time_ms:.2f}ms"
        )

        return RetrieveResponse(
            query=request.query,
            results=results,
            total_results=len(results),
            search_time_ms=search_time_ms,
            knowledge_base_id=request.knowledge_base_id,
        )

    async def _vector_search(
        self,
        query_embedding: List[float],
        kb_id: str,
        min_trust: float,
        similarity_threshold: float,
        max_results: int,
        session: AsyncSession,
    ) -> List[RetrievedDocument]:
        """Pure vector similarity search"""
        # Use pgvector's cosine distance operator
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        query = text("""
            SELECT
                id, title, content, source,
                "trustScore" as trust_score,
                "isVerified" as is_verified,
                metadata,
                (1 - (embedding <=> :embedding::vector)) as similarity
            FROM "KnowledgeDocument"
            WHERE "knowledgeBaseId" = :kb_id
              AND "trustScore" >= :min_trust
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= :threshold
            ORDER BY embedding <=> :embedding::vector
            LIMIT :max_results
        """)

        result = await session.execute(
            query,
            {
                "embedding": embedding_str,
                "kb_id": kb_id,
                "min_trust": min_trust,
                "threshold": similarity_threshold,
                "max_results": max_results,
            }
        )

        rows = result.fetchall()
        return self._rows_to_documents(rows)

    async def _hybrid_search(
        self,
        query_embedding: List[float],
        kb_id: str,
        min_trust: float,
        similarity_threshold: float,
        trust_weight: float,
        max_results: int,
        session: AsyncSession,
    ) -> List[RetrievedDocument]:
        """Hybrid search combining vector similarity and trust score"""
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        query = text("""
            SELECT
                id, title, content, source,
                "trustScore" as trust_score,
                "isVerified" as is_verified,
                metadata,
                (1 - (embedding <=> :embedding::vector)) as similarity,
                (
                    (1 - :trust_weight) * (1 - (embedding <=> :embedding::vector)) +
                    :trust_weight * "trustScore"
                ) as combined_score
            FROM "KnowledgeDocument"
            WHERE "knowledgeBaseId" = :kb_id
              AND "trustScore" >= :min_trust
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= :threshold
            ORDER BY combined_score DESC
            LIMIT :max_results
        """)

        result = await session.execute(
            query,
            {
                "embedding": embedding_str,
                "kb_id": kb_id,
                "min_trust": min_trust,
                "threshold": similarity_threshold,
                "trust_weight": trust_weight,
                "max_results": max_results,
            }
        )

        rows = result.fetchall()
        return self._rows_to_documents(rows, include_combined_score=True)

    def _rows_to_documents(
        self,
        rows,
        include_combined_score: bool = False
    ) -> List[RetrievedDocument]:
        """Convert database rows to RetrievedDocument objects"""
        documents = []
        for row in rows:
            doc = RetrievedDocument(
                id=row.id,
                title=row.title,
                content=row.content,
                source=row.source,
                trust_score=float(row.trust_score),
                is_verified=bool(row.is_verified),
                similarity=float(row.similarity),
                combined_score=float(row.combined_score) if include_combined_score and hasattr(row, 'combined_score') else None,
                metadata=row.metadata if row.metadata else {},
            )
            documents.append(doc)
        return documents

    # ============== Context Building ==============

    async def build_context(
        self,
        request: ContextBuildRequest,
        session: AsyncSession
    ) -> BuiltContext:
        """
        Build context for a prompt by retrieving and combining relevant documents.
        """
        all_sources: List[ContextSource] = []
        context_parts: List[str] = []
        total_tokens = 0

        for kb_id in request.knowledge_base_ids:
            retrieve_request = RetrieveRequest(
                query=request.query,
                knowledge_base_id=kb_id,
                max_results=10,
                min_similarity=request.min_relevance,
                use_hybrid_search=True,
            )

            results = await self.retrieve(retrieve_request, session)

            for doc in results.results:
                doc_tokens = self.embedding_service.estimate_tokens(doc.content)

                if total_tokens + doc_tokens > request.max_context_tokens:
                    break

                # Add to context
                if request.include_citations:
                    context_parts.append(f"[Source: {doc.title}]\n{doc.content}")
                else:
                    context_parts.append(doc.content)

                total_tokens += doc_tokens

                # Track source
                source = ContextSource(
                    document_id=doc.id,
                    title=doc.title,
                    source=doc.source,
                    relevance=doc.similarity,
                    trust_score=doc.trust_score,
                    chunk_indices=[doc.metadata.get("chunk_index", 0)]
                )
                all_sources.append(source)

            if total_tokens >= request.max_context_tokens:
                break

        # Log context session
        context_session = RAGContextSessionModel(
            query=request.query,
            knowledge_base_ids=request.knowledge_base_ids,
            context_built="\n\n".join(context_parts),
            total_tokens=total_tokens,
            sources_count=len(all_sources),
            avg_relevance=sum(s.relevance for s in all_sources) / len(all_sources) if all_sources else 0,
            avg_trust=sum(s.trust_score for s in all_sources) / len(all_sources) if all_sources else 0,
        )
        session.add(context_session)

        return BuiltContext(
            context_text="\n\n".join(context_parts),
            total_tokens=total_tokens,
            sources=all_sources,
            query=request.query,
            knowledge_bases_searched=request.knowledge_base_ids,
        )

    # ============== Trust Management ==============

    async def update_trust_score(
        self,
        document_id: str,
        trust_score: float,
        session: AsyncSession
    ) -> bool:
        """Update trust score for a document"""
        result = await session.execute(
            select(KnowledgeDocumentModel)
            .where(KnowledgeDocumentModel.id == document_id)
        )
        doc = result.scalar_one_or_none()

        if not doc:
            return False

        doc.trust_score = trust_score
        doc.updated_at = datetime.utcnow()
        return True

    async def verify_document(
        self,
        document_id: str,
        session: AsyncSession
    ) -> bool:
        """Mark a document as verified"""
        result = await session.execute(
            select(KnowledgeDocumentModel)
            .where(KnowledgeDocumentModel.id == document_id)
        )
        doc = result.scalar_one_or_none()

        if not doc:
            return False

        doc.is_verified = True
        doc.trust_score = max(doc.trust_score, 0.9)  # Boost trust for verified docs
        doc.updated_at = datetime.utcnow()
        return True
