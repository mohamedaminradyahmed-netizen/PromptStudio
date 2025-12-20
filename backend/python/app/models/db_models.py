"""
SQLAlchemy database models with pgvector support for RAG operations
"""

from datetime import datetime
from typing import Optional, List, Any
from sqlalchemy import (
    Column, String, Text, Float, Boolean, Integer,
    DateTime, ForeignKey, JSON, Index, func
)
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from pgvector.sqlalchemy import Vector
import uuid


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


class KnowledgeBaseModel(Base):
    """Knowledge base container for documents"""
    __tablename__ = "KnowledgeBase"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents: Mapped[List["KnowledgeDocumentModel"]] = relationship(
        "KnowledgeDocumentModel",
        back_populates="knowledge_base",
        cascade="all, delete-orphan"
    )


class KnowledgeDocumentModel(Base):
    """Document with vector embedding for semantic search"""
    __tablename__ = "KnowledgeDocument"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("KnowledgeBase.id", ondelete="CASCADE"),
        nullable=False,
        name="knowledgeBaseId"
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # Vector embedding (1536 dimensions for OpenAI)
    embedding = Column(Vector(1536), nullable=True)

    # Trust and verification
    trust_score: Mapped[float] = mapped_column(Float, default=0.5, name="trustScore")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, name="isVerified")

    # Chunk information
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, name="chunkIndex")
    parent_document_id: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
        name="parentDocumentId"
    )
    token_count: Mapped[int] = mapped_column(Integer, default=0, name="tokenCount")

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, name="createdAt")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, name="updatedAt")

    # Relationships
    knowledge_base: Mapped["KnowledgeBaseModel"] = relationship(
        "KnowledgeBaseModel",
        back_populates="documents"
    )

    # Indexes
    __table_args__ = (
        Index("idx_knowledge_document_kb_id", "knowledgeBaseId"),
        Index("idx_knowledge_document_trust", "trustScore"),
    )


class TrustedSourceModel(Base):
    """Registry of trusted document sources"""
    __tablename__ = "TrustedSource"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False, unique=True, name="sourceUrl")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trust_level: Mapped[float] = mapped_column(Float, default=0.8, name="trustLevel")
    verification_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, name="verificationMethod")
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, name="verifiedAt")
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, name="createdAt")


class RAGContextSessionModel(Base):
    """Session tracking for RAG context building"""
    __tablename__ = "RAGContextSession"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    query: Mapped[str] = mapped_column(Text, nullable=False)
    knowledge_base_ids: Mapped[list] = mapped_column(JSON, default=list, name="knowledgeBaseIds")
    context_built: Mapped[str] = mapped_column(Text, nullable=True, name="contextBuilt")
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, name="totalTokens")
    sources_count: Mapped[int] = mapped_column(Integer, default=0, name="sourcesCount")
    avg_relevance: Mapped[float] = mapped_column(Float, default=0.0, name="avgRelevance")
    avg_trust: Mapped[float] = mapped_column(Float, default=0.0, name="avgTrust")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, name="createdAt")


class SemanticCacheModel(Base):
    """Semantic cache for prompts and responses"""
    __tablename__ = "SemanticCache"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True, name="promptHash")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, name="hitCount")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, name="createdAt")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, name="expiresAt")
