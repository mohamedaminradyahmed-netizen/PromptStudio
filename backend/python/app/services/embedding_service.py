"""
Embedding service for generating vector embeddings using OpenAI
"""

import time
import hashlib
from typing import List, Optional
from openai import AsyncOpenAI
from loguru import logger

from ..core.config import settings


class EmbeddingService:
    """
    Service for generating text embeddings using OpenAI's embedding models.

    Supports:
    - Single and batch text embedding
    - Token estimation
    - Text chunking with overlap
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.default_model = "text-embedding-3-small"
        self.dimensions = 1536
        self._cache: dict = {}

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
        import re
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
        import re

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

    def _get_cache_key(self, text: str, model: str) -> str:
        """Generate cache key for embedding"""
        content = f"{model}:{text}"
        return hashlib.md5(content.encode()).hexdigest()

    def clear_cache(self) -> None:
        """Clear the embedding cache"""
        self._cache.clear()
        logger.info("Embedding cache cleared")
