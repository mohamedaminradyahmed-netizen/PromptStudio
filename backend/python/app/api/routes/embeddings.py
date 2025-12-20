"""
Embedding API endpoints

Generate vector embeddings, perform semantic search,
and clustering operations.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...services.embedding_service import (
    EmbeddingService,
    EmbeddingProvider,
    EmbeddingRequest,
    EmbeddingResult,
    SimilarityResult,
    ClusterResult,
)

router = APIRouter(prefix="/embeddings", tags=["Embeddings"])

# Service instance
embedding_service = EmbeddingService()


# Request/Response models

class EmbedRequest(BaseModel):
    """Request to generate embeddings"""
    texts: List[str] = Field(description="Texts to embed")
    model: Optional[str] = None
    provider: Optional[str] = None
    dimensions: Optional[int] = None
    normalize: bool = True


class SemanticSearchRequest(BaseModel):
    """Request for semantic search"""
    query: str
    documents: List[str]
    top_k: int = Field(default=5, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0, le=1)
    model: Optional[str] = None


class SimilarityRequest(BaseModel):
    """Request to find similar texts"""
    text: str
    candidates: List[str]
    top_k: int = Field(default=5, ge=1, le=100)
    model: Optional[str] = None


class ClusterRequest(BaseModel):
    """Request to cluster texts"""
    texts: List[str]
    n_clusters: int = Field(default=5, ge=2, le=50)
    model: Optional[str] = None


class DeduplicateRequest(BaseModel):
    """Request to deduplicate texts"""
    texts: List[str]
    similarity_threshold: float = Field(default=0.95, ge=0.5, le=1.0)
    model: Optional[str] = None


class DimensionReductionRequest(BaseModel):
    """Request for dimension reduction"""
    embeddings: List[List[float]]
    target_dims: int = Field(default=2, ge=1, le=50)
    method: str = Field(default="pca", description="pca, tsne, or umap")


class SimilarityMatrixRequest(BaseModel):
    """Request for similarity matrix computation"""
    texts: List[str]
    model: Optional[str] = None


@router.post("/embed", response_model=EmbeddingResult)
async def embed_texts(request: EmbedRequest):
    """
    Generate vector embeddings for texts

    Supports multiple providers: OpenAI, Cohere, and local models.
    """
    try:
        provider = EmbeddingProvider(request.provider) if request.provider else None

        result = await embedding_service.embed(EmbeddingRequest(
            texts=request.texts,
            model=request.model,
            provider=provider,
            dimensions=request.dimensions,
            normalize=request.normalize,
        ))

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=List[SimilarityResult])
async def semantic_search(request: SemanticSearchRequest):
    """
    Perform semantic search over documents

    Returns documents ranked by semantic similarity to the query.
    """
    try:
        results = await embedding_service.semantic_search(
            query=request.query,
            documents=request.documents,
            top_k=request.top_k,
            threshold=request.threshold,
            model=request.model,
        )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/similar", response_model=List[SimilarityResult])
async def find_similar(request: SimilarityRequest):
    """
    Find texts most similar to a given text

    Useful for finding related content or near-duplicates.
    """
    try:
        results = await embedding_service.find_similar(
            text=request.text,
            candidates=request.candidates,
            top_k=request.top_k,
            model=request.model,
        )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cluster", response_model=List[ClusterResult])
async def cluster_texts(request: ClusterRequest):
    """
    Cluster texts by semantic similarity

    Uses K-means clustering on embedding vectors.
    """
    try:
        results = await embedding_service.cluster_texts(
            texts=request.texts,
            n_clusters=request.n_clusters,
            model=request.model,
        )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/deduplicate")
async def deduplicate_texts(request: DeduplicateRequest):
    """
    Deduplicate texts based on semantic similarity

    Returns unique texts and identified duplicate pairs.
    """
    try:
        unique_texts, duplicates = await embedding_service.deduplicate(
            texts=request.texts,
            similarity_threshold=request.similarity_threshold,
            model=request.model,
        )

        return {
            "unique_texts": unique_texts,
            "original_count": len(request.texts),
            "unique_count": len(unique_texts),
            "duplicates_removed": len(request.texts) - len(unique_texts),
            "duplicate_pairs": [
                {"index_a": d[0], "index_b": d[1], "similarity": d[2]}
                for d in duplicates
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reduce-dimensions")
async def reduce_dimensions(request: DimensionReductionRequest):
    """
    Reduce embedding dimensions for visualization

    Supports PCA, t-SNE, and UMAP methods.
    """
    try:
        reduced = await embedding_service.reduce_dimensions(
            embeddings=request.embeddings,
            target_dims=request.target_dims,
            method=request.method,
        )

        return {
            "reduced_embeddings": reduced,
            "original_dims": len(request.embeddings[0]) if request.embeddings else 0,
            "target_dims": request.target_dims,
            "method": request.method,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/similarity-matrix")
async def compute_similarity_matrix(request: SimilarityMatrixRequest):
    """
    Compute pairwise similarity matrix for texts

    Returns an NxN matrix of cosine similarities.
    """
    try:
        # First embed all texts
        result = await embedding_service.embed(EmbeddingRequest(
            texts=request.texts,
            model=request.model,
        ))

        # Compute similarity matrix
        matrix = embedding_service.batch_similarity_matrix(result.embeddings)

        return {
            "matrix": matrix,
            "size": len(request.texts),
            "texts": request.texts,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
async def compare_texts(text_a: str, text_b: str, model: Optional[str] = None):
    """
    Compare two texts and return similarity score
    """
    try:
        result = await embedding_service.embed(EmbeddingRequest(
            texts=[text_a, text_b],
            model=model,
        ))

        similarity = embedding_service.cosine_similarity(
            result.embeddings[0],
            result.embeddings[1],
        )

        return {
            "similarity": similarity,
            "text_a": text_a[:100] + "..." if len(text_a) > 100 else text_a,
            "text_b": text_b[:100] + "..." if len(text_b) > 100 else text_b,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_embedding_models():
    """List available embedding models"""
    return {
        "openai": [
            {"id": "text-embedding-3-small", "dimensions": 1536, "description": "Small, fast, cheap"},
            {"id": "text-embedding-3-large", "dimensions": 3072, "description": "Large, accurate, expensive"},
            {"id": "text-embedding-ada-002", "dimensions": 1536, "description": "Legacy model"},
        ],
        "cohere": [
            {"id": "embed-english-v3.0", "dimensions": 1024, "description": "English optimized"},
            {"id": "embed-multilingual-v3.0", "dimensions": 1024, "description": "100+ languages"},
        ],
        "local": [
            {"id": "all-MiniLM-L6-v2", "dimensions": 384, "description": "Small, fast, good quality"},
            {"id": "all-mpnet-base-v2", "dimensions": 768, "description": "Best quality, larger"},
        ],
    }
