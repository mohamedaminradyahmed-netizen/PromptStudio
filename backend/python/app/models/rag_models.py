"""
Pydantic models for RAG (Retrieval Augmented Generation) operations
"""

from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class DocumentStatus(str, Enum):
    """Document processing status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ChunkingStrategy(str, Enum):
    """Text chunking strategies"""
    FIXED_SIZE = "fixed_size"
    SENTENCE = "sentence"
    PARAGRAPH = "paragraph"
    SEMANTIC = "semantic"


# ============== Request Models ==============

class DocumentIngestRequest(BaseModel):
    """Request to ingest a document into a knowledge base"""
    knowledge_base_id: str = Field(..., description="Target knowledge base ID")
    title: str = Field(..., description="Document title")
    content: str = Field(..., description="Document content")
    source: Optional[str] = Field(None, description="Document source URL or reference")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    chunking_strategy: ChunkingStrategy = Field(
        default=ChunkingStrategy.SEMANTIC,
        description="Strategy for splitting content into chunks"
    )
    chunk_size: int = Field(default=512, ge=100, le=4096, description="Target chunk size in tokens")
    chunk_overlap: int = Field(default=50, ge=0, le=500, description="Overlap between chunks")
    trust_score: float = Field(default=0.5, ge=0, le=1, description="Initial trust score")


class BatchIngestRequest(BaseModel):
    """Request to ingest multiple documents"""
    knowledge_base_id: str
    documents: List[DocumentIngestRequest]


class RetrieveRequest(BaseModel):
    """Request to retrieve relevant documents"""
    query: str = Field(..., description="Search query")
    knowledge_base_id: str = Field(..., description="Knowledge base to search")
    max_results: int = Field(default=5, ge=1, le=50, description="Maximum results to return")
    min_similarity: float = Field(default=0.7, ge=0, le=1, description="Minimum similarity threshold")
    min_trust_score: float = Field(default=0.5, ge=0, le=1, description="Minimum trust score filter")
    include_metadata: bool = Field(default=True, description="Include document metadata")
    use_hybrid_search: bool = Field(default=True, description="Use hybrid vector+trust scoring")
    trust_weight: float = Field(default=0.3, ge=0, le=1, description="Weight for trust score in hybrid search")


class KnowledgeBaseCreateRequest(BaseModel):
    """Request to create a new knowledge base"""
    name: str = Field(..., description="Knowledge base name")
    description: Optional[str] = Field(None, description="Description")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ContextBuildRequest(BaseModel):
    """Request to build context for a prompt"""
    query: str = Field(..., description="The prompt/query to build context for")
    knowledge_base_ids: List[str] = Field(..., description="Knowledge bases to search")
    max_context_tokens: int = Field(default=4000, ge=100, le=32000)
    min_relevance: float = Field(default=0.6, ge=0, le=1)
    include_citations: bool = Field(default=True)


# ============== Response Models ==============

class DocumentChunk(BaseModel):
    """A chunk of a document with its embedding"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    content: str
    chunk_index: int
    token_count: int
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RetrievedDocument(BaseModel):
    """A document retrieved from semantic search"""
    id: str
    title: str
    content: str
    source: Optional[str]
    trust_score: float
    is_verified: bool
    similarity: float
    combined_score: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    highlights: List[str] = Field(default_factory=list, description="Relevant text highlights")


class RetrieveResponse(BaseModel):
    """Response from document retrieval"""
    query: str
    results: List[RetrievedDocument]
    total_results: int
    search_time_ms: float
    knowledge_base_id: str


class IngestResponse(BaseModel):
    """Response from document ingestion"""
    document_id: str
    title: str
    status: DocumentStatus
    chunks_created: int
    total_tokens: int
    processing_time_ms: float
    message: Optional[str] = None


class BatchIngestResponse(BaseModel):
    """Response from batch ingestion"""
    total_documents: int
    successful: int
    failed: int
    results: List[IngestResponse]
    total_processing_time_ms: float


class KnowledgeBase(BaseModel):
    """Knowledge base model"""
    id: str
    name: str
    description: Optional[str]
    document_count: int = 0
    total_chunks: int = 0
    created_at: datetime
    updated_at: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ContextSource(BaseModel):
    """Source attribution for context"""
    document_id: str
    title: str
    source: Optional[str]
    relevance: float
    trust_score: float
    chunk_indices: List[int]


class BuiltContext(BaseModel):
    """Built context for a prompt with sources"""
    context_text: str
    total_tokens: int
    sources: List[ContextSource]
    query: str
    knowledge_bases_searched: List[str]


# ============== Embedding Models ==============

class EmbeddingRequest(BaseModel):
    """Request to generate embeddings"""
    texts: List[str] = Field(..., description="Texts to embed")
    model: str = Field(default="text-embedding-3-small", description="Embedding model")


class EmbeddingResponse(BaseModel):
    """Response with generated embeddings"""
    embeddings: List[List[float]]
    model: str
    total_tokens: int
    dimensions: int


# ============== Health & Stats Models ==============

class RAGStats(BaseModel):
    """RAG system statistics"""
    total_knowledge_bases: int
    total_documents: int
    total_chunks: int
    average_trust_score: float
    embedding_dimensions: int = 1536
    vector_index_type: str = "hnsw"
