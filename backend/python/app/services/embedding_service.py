"""
Embedding Service

Generate vector embeddings using OpenAI, local models, or other providers.
Supports semantic search, similarity scoring, clustering, and text chunking.
"""

import hashlib
import re
import time
from typing import Optional, List, Dict, Any, Tuple
from enum import Enum
import numpy as np
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from loguru import logger

from ..core.config import settings


class EmbeddingProvider(str, Enum):
    """Supported embedding providers"""
    OPENAI = "openai"
    COHERE = "cohere"
    LOCAL = "local"  # Sentence transformers


class EmbeddingModel(str, Enum):
    """Available embedding models"""
    # OpenAI models
    TEXT_EMBEDDING_3_SMALL = "text-embedding-3-small"
    TEXT_EMBEDDING_3_LARGE = "text-embedding-3-large"
    TEXT_EMBEDDING_ADA_002 = "text-embedding-ada-002"
    # Cohere models
    EMBED_ENGLISH_V3 = "embed-english-v3.0"
    EMBED_MULTILINGUAL_V3 = "embed-multilingual-v3.0"
    # Local models
    ALL_MINILM_L6_V2 = "all-MiniLM-L6-v2"
    ALL_MPNET_BASE_V2 = "all-mpnet-base-v2"


class EmbeddingRequest(BaseModel):
    """Request for generating embeddings"""
    texts: List[str] = Field(description="Texts to embed")
    model: Optional[str] = Field(default=None, description="Model to use")
    provider: Optional[EmbeddingProvider] = None
    dimensions: Optional[int] = Field(default=None, description="Output dimensions (if supported)")
    normalize: bool = Field(default=True, description="Normalize vectors to unit length")


class EmbeddingResult(BaseModel):
    """Result of embedding generation"""
    embeddings: List[List[float]]
    model: str
    provider: str
    dimensions: int
    total_tokens: int
    latency_ms: float


class SimilarityResult(BaseModel):
    """Result of similarity search"""
    text: str
    score: float
    index: int
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ClusterResult(BaseModel):
    """Result of clustering"""
    cluster_id: int
    texts: List[str]
    centroid: List[float]
    size: int


class EmbeddingService:
    """
    Service for generating and working with vector embeddings

    Features:
    - Multi-provider support (OpenAI, Cohere, local)
    - Embedding caching
    - Similarity search
    - Clustering
    - Dimensionality reduction
    - Text chunking for RAG
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.default_provider = EmbeddingProvider.OPENAI
        self.default_model = EmbeddingModel.TEXT_EMBEDDING_3_SMALL.value
        self.dimensions = 1536
        self._cache: Dict[str, List[float]] = {}
        self._local_model = None

    def _get_cache_key(self, text: str, model: str) -> str:
        """Generate cache key for text-model pair"""
        content = f"{text}:{model}"
        return hashlib.md5(content.encode()).hexdigest()

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResult:
        """
        Generate embeddings for texts

        Args:
            request: Embedding request with texts and configuration

        Returns:
            EmbeddingResult with embeddings and metrics
        """
        provider = request.provider or self.default_provider
        model = request.model or self.default_model
        start_time = time.time()

        try:
            if provider == EmbeddingProvider.OPENAI:
                result = await self._embed_openai(request.texts, model, request.dimensions)
            elif provider == EmbeddingProvider.COHERE:
                result = await self._embed_cohere(request.texts, model)
            elif provider == EmbeddingProvider.LOCAL:
                result = await self._embed_local(request.texts, model)
            else:
                raise ValueError(f"Unsupported provider: {provider}")

            embeddings = result["embeddings"]

            # Normalize if requested
            if request.normalize:
                embeddings = self._normalize_vectors(embeddings)

            latency_ms = (time.time() - start_time) * 1000

            return EmbeddingResult(
                embeddings=embeddings,
                model=model,
                provider=provider.value,
                dimensions=len(embeddings[0]) if embeddings else 0,
                total_tokens=result.get("total_tokens", 0),
                latency_ms=latency_ms,
            )

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    async def embed_text(
        self,
        text: str,
        model: Optional[str] = None
    ) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text to embed
            model: Optional embedding model override

        Returns:
            List of floats representing the embedding vector
        """
        model = model or self.default_model

        # Check cache
        cache_key = self._get_cache_key(text, model)
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            response = await self.client.embeddings.create(
                model=model,
                input=text,
            )
            embedding = response.data[0].embedding

            # Cache the result
            self._cache[cache_key] = embedding

            return embedding

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    async def embed_batch(
        self,
        texts: List[str],
        model: Optional[str] = None,
        batch_size: int = 100
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed
            model: Optional embedding model override
            batch_size: Maximum texts per API call

        Returns:
            List of embedding vectors
        """
        model = model or self.default_model
        all_embeddings: List[List[float]] = []

        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            try:
                response = await self.client.embeddings.create(
                    model=model,
                    input=batch,
                )

                # Extract embeddings in order
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)

                logger.debug(f"Embedded batch {i//batch_size + 1}, texts: {len(batch)}")

            except Exception as e:
                logger.error(f"Batch embedding failed at index {i}: {e}")
                raise

        return all_embeddings

    async def _embed_openai(
        self,
        texts: List[str],
        model: str,
        dimensions: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Generate embeddings using OpenAI"""
        kwargs = {"model": model, "input": texts}
        if dimensions and model in ["text-embedding-3-small", "text-embedding-3-large"]:
            kwargs["dimensions"] = dimensions

        response = await self.client.embeddings.create(**kwargs)

        embeddings = [item.embedding for item in response.data]
        total_tokens = response.usage.total_tokens

        return {
            "embeddings": embeddings,
            "total_tokens": total_tokens,
        }

    async def _embed_cohere(
        self,
        texts: List[str],
        model: str,
    ) -> Dict[str, Any]:
        """Generate embeddings using Cohere"""
        try:
            import cohere

            client = cohere.AsyncClient(api_key=settings.cohere_api_key)
            response = await client.embed(
                texts=texts,
                model=model,
                input_type="search_document",
            )

            return {
                "embeddings": response.embeddings,
                "total_tokens": len(texts) * 100,  # Approximate
            }
        except ImportError:
            raise ValueError("Cohere library not installed. Run: pip install cohere")

    async def _embed_local(
        self,
        texts: List[str],
        model: str,
    ) -> Dict[str, Any]:
        """Generate embeddings using local sentence transformers"""
        try:
            from sentence_transformers import SentenceTransformer

            if self._local_model is None or self._local_model.get_config_dict().get("name") != model:
                self._local_model = SentenceTransformer(model)

            embeddings = self._local_model.encode(texts, convert_to_numpy=True).tolist()

            return {
                "embeddings": embeddings,
                "total_tokens": sum(len(t.split()) for t in texts),
            }
        except ImportError:
            raise ValueError("sentence-transformers not installed. Run: pip install sentence-transformers")

    def _normalize_vectors(self, vectors: List[List[float]]) -> List[List[float]]:
        """Normalize vectors to unit length"""
        normalized = []
        for vec in vectors:
            arr = np.array(vec)
            norm = np.linalg.norm(arr)
            if norm > 0:
                normalized.append((arr / norm).tolist())
            else:
                normalized.append(vec)
        return normalized

    def cosine_similarity(
        self,
        vec1: List[float],
        vec2: List[float],
    ) -> float:
        """Calculate cosine similarity between two vectors"""
        arr1 = np.array(vec1)
        arr2 = np.array(vec2)
        dot = np.dot(arr1, arr2)
        norm1 = np.linalg.norm(arr1)
        norm2 = np.linalg.norm(arr2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(dot / (norm1 * norm2))

    def euclidean_distance(
        self,
        vec1: List[float],
        vec2: List[float],
    ) -> float:
        """Calculate Euclidean distance between two vectors"""
        arr1 = np.array(vec1)
        arr2 = np.array(vec2)
        return float(np.linalg.norm(arr1 - arr2))

    async def semantic_search(
        self,
        query: str,
        documents: List[str],
        top_k: int = 5,
        threshold: float = 0.0,
        model: Optional[str] = None,
    ) -> List[SimilarityResult]:
        """
        Perform semantic search over documents

        Args:
            query: Search query
            documents: List of documents to search
            top_k: Number of results to return
            threshold: Minimum similarity threshold
            model: Embedding model to use

        Returns:
            List of SimilarityResult sorted by score
        """
        # Generate embeddings
        all_texts = [query] + documents
        result = await self.embed(EmbeddingRequest(
            texts=all_texts,
            model=model,
        ))

        query_embedding = result.embeddings[0]
        doc_embeddings = result.embeddings[1:]

        # Calculate similarities
        similarities = []
        for i, (doc, embedding) in enumerate(zip(documents, doc_embeddings)):
            score = self.cosine_similarity(query_embedding, embedding)
            if score >= threshold:
                similarities.append(SimilarityResult(
                    text=doc,
                    score=score,
                    index=i,
                ))

        # Sort by score and return top_k
        similarities.sort(key=lambda x: x.score, reverse=True)
        return similarities[:top_k]

    async def find_similar(
        self,
        text: str,
        candidates: List[str],
        top_k: int = 5,
        model: Optional[str] = None,
    ) -> List[SimilarityResult]:
        """
        Find texts most similar to the given text

        Args:
            text: Reference text
            candidates: Candidate texts to compare
            top_k: Number of results to return
            model: Embedding model to use

        Returns:
            List of SimilarityResult sorted by similarity
        """
        return await self.semantic_search(
            query=text,
            documents=candidates,
            top_k=top_k,
            model=model,
        )

    async def cluster_texts(
        self,
        texts: List[str],
        n_clusters: int = 5,
        model: Optional[str] = None,
    ) -> List[ClusterResult]:
        """
        Cluster texts by semantic similarity

        Args:
            texts: Texts to cluster
            n_clusters: Number of clusters
            model: Embedding model to use

        Returns:
            List of ClusterResult with clustered texts
        """
        try:
            from sklearn.cluster import KMeans
        except ImportError:
            raise ValueError("scikit-learn not installed. Run: pip install scikit-learn")

        # Generate embeddings
        result = await self.embed(EmbeddingRequest(texts=texts, model=model))
        embeddings = np.array(result.embeddings)

        # Perform clustering
        n_clusters = min(n_clusters, len(texts))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embeddings)

        # Group texts by cluster
        clusters = {}
        for i, (text, label) in enumerate(zip(texts, labels)):
            if label not in clusters:
                clusters[label] = {"texts": [], "indices": []}
            clusters[label]["texts"].append(text)
            clusters[label]["indices"].append(i)

        # Build results
        results = []
        for cluster_id, data in clusters.items():
            centroid = kmeans.cluster_centers_[cluster_id].tolist()
            results.append(ClusterResult(
                cluster_id=int(cluster_id),
                texts=data["texts"],
                centroid=centroid,
                size=len(data["texts"]),
            ))

        return sorted(results, key=lambda x: x.size, reverse=True)

    async def deduplicate(
        self,
        texts: List[str],
        similarity_threshold: float = 0.95,
        model: Optional[str] = None,
    ) -> Tuple[List[str], List[Tuple[int, int, float]]]:
        """
        Deduplicate texts based on semantic similarity

        Args:
            texts: Texts to deduplicate
            similarity_threshold: Threshold for considering texts as duplicates
            model: Embedding model to use

        Returns:
            Tuple of (unique texts, list of duplicate pairs with similarity)
        """
        if len(texts) <= 1:
            return texts, []

        # Generate embeddings
        result = await self.embed(EmbeddingRequest(texts=texts, model=model))
        embeddings = result.embeddings

        # Find duplicates
        duplicates = []
        keep_indices = set(range(len(texts)))

        for i in range(len(texts)):
            if i not in keep_indices:
                continue
            for j in range(i + 1, len(texts)):
                if j not in keep_indices:
                    continue
                similarity = self.cosine_similarity(embeddings[i], embeddings[j])
                if similarity >= similarity_threshold:
                    duplicates.append((i, j, similarity))
                    keep_indices.discard(j)

        unique_texts = [texts[i] for i in sorted(keep_indices)]
        return unique_texts, duplicates

    async def reduce_dimensions(
        self,
        embeddings: List[List[float]],
        target_dims: int = 2,
        method: str = "pca",
    ) -> List[List[float]]:
        """
        Reduce embedding dimensions for visualization

        Args:
            embeddings: High-dimensional embeddings
            target_dims: Target number of dimensions
            method: Reduction method (pca, tsne, umap)

        Returns:
            Reduced-dimension embeddings
        """
        arr = np.array(embeddings)

        if method == "pca":
            try:
                from sklearn.decomposition import PCA
                reducer = PCA(n_components=target_dims)
                reduced = reducer.fit_transform(arr)
            except ImportError:
                raise ValueError("scikit-learn not installed")

        elif method == "tsne":
            try:
                from sklearn.manifold import TSNE
                reducer = TSNE(n_components=target_dims, random_state=42)
                reduced = reducer.fit_transform(arr)
            except ImportError:
                raise ValueError("scikit-learn not installed")

        elif method == "umap":
            try:
                import umap
                reducer = umap.UMAP(n_components=target_dims, random_state=42)
                reduced = reducer.fit_transform(arr)
            except ImportError:
                raise ValueError("umap-learn not installed. Run: pip install umap-learn")

        else:
            raise ValueError(f"Unknown reduction method: {method}")

        return reduced.tolist()

    def batch_similarity_matrix(
        self,
        embeddings: List[List[float]],
    ) -> List[List[float]]:
        """
        Compute pairwise similarity matrix for all embeddings

        Args:
            embeddings: List of embeddings

        Returns:
            Similarity matrix where [i][j] is similarity between i and j
        """
        arr = np.array(embeddings)
        # Normalize
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1
        normalized = arr / norms
        # Compute similarity matrix
        similarity = np.dot(normalized, normalized.T)
        return similarity.tolist()

    # Text chunking methods for RAG

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 512,
        overlap: int = 50,
        strategy: str = "semantic"
    ) -> List[str]:
        """
        Split text into chunks for embedding.

        Args:
            text: Text to chunk
            chunk_size: Target chunk size in approximate tokens
            overlap: Overlap between chunks in approximate tokens
            strategy: Chunking strategy (fixed_size, sentence, paragraph, semantic)

        Returns:
            List of text chunks
        """
        if strategy == "paragraph":
            return self._chunk_by_paragraph(text, chunk_size, overlap)
        elif strategy == "sentence":
            return self._chunk_by_sentence(text, chunk_size, overlap)
        elif strategy == "semantic":
            return self._chunk_semantic(text, chunk_size, overlap)
        else:
            return self._chunk_fixed_size(text, chunk_size, overlap)

    def _chunk_fixed_size(
        self,
        text: str,
        chunk_size: int,
        overlap: int
    ) -> List[str]:
        """Fixed size chunking based on word count (approximating tokens)"""
        words = text.split()
        chunks = []

        # Approximate 1.3 words per token
        words_per_chunk = int(chunk_size * 1.3)
        words_overlap = int(overlap * 1.3)

        start = 0
        while start < len(words):
            end = min(start + words_per_chunk, len(words))
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            start = end - words_overlap if end < len(words) else end

        return chunks

    def _chunk_by_sentence(
        self,
        text: str,
        chunk_size: int,
        overlap: int
    ) -> List[str]:
        """Chunk by sentences, respecting boundaries"""
        sentences = re.split(r'(?<=[.!?])\s+', text)

        chunks = []
        current_chunk: List[str] = []
        current_tokens = 0

        for sentence in sentences:
            sentence_tokens = self.estimate_tokens(sentence)

            if current_tokens + sentence_tokens > chunk_size and current_chunk:
                chunks.append(" ".join(current_chunk))
                # Keep some sentences for overlap
                overlap_sentences = []
                overlap_tokens = 0
                for s in reversed(current_chunk):
                    s_tokens = self.estimate_tokens(s)
                    if overlap_tokens + s_tokens <= overlap:
                        overlap_sentences.insert(0, s)
                        overlap_tokens += s_tokens
                    else:
                        break
                current_chunk = overlap_sentences
                current_tokens = overlap_tokens

            current_chunk.append(sentence)
            current_tokens += sentence_tokens

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    def _chunk_by_paragraph(
        self,
        text: str,
        chunk_size: int,
        overlap: int
    ) -> List[str]:
        """Chunk by paragraphs"""
        paragraphs = text.split("\n\n")

        chunks = []
        current_chunk: List[str] = []
        current_tokens = 0

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            para_tokens = self.estimate_tokens(para)

            if current_tokens + para_tokens > chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = []
                current_tokens = 0

            current_chunk.append(para)
            current_tokens += para_tokens

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        return chunks

    def _chunk_semantic(
        self,
        text: str,
        chunk_size: int,
        overlap: int
    ) -> List[str]:
        """
        Semantic chunking - tries to keep related content together.
        Uses section markers, headers, and paragraph structure.
        """
        # Split by section markers or headers
        sections = re.split(r'\n(?=#{1,3}\s|[A-Z][^.!?]*:\s*\n)', text)

        chunks = []
        current_chunk: List[str] = []
        current_tokens = 0

        for section in sections:
            section = section.strip()
            if not section:
                continue

            section_tokens = self.estimate_tokens(section)

            # If section is too large, further split by paragraphs
            if section_tokens > chunk_size:
                sub_chunks = self._chunk_by_paragraph(section, chunk_size, overlap)
                for sub in sub_chunks:
                    chunks.append(sub)
            elif current_tokens + section_tokens > chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [section]
                current_tokens = section_tokens
            else:
                current_chunk.append(section)
                current_tokens += section_tokens

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        return chunks

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for text.

        Uses a simple heuristic: ~4 characters per token for English,
        ~2 characters per token for code.
        """
        # Simple heuristic
        word_count = len(text.split())
        char_count = len(text)

        # Blend word-based and character-based estimates
        word_estimate = word_count * 1.3
        char_estimate = char_count / 4

        return int((word_estimate + char_estimate) / 2)

    def clear_cache(self) -> None:
        """Clear the embedding cache"""
        self._cache.clear()
        logger.info("Embedding cache cleared")
