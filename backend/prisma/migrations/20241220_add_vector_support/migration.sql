-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column to KnowledgeDocument (1536 dimensions for OpenAI embeddings)
ALTER TABLE "KnowledgeDocument"
ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1536);

-- Add vector column to SemanticCache
ALTER TABLE "SemanticCache"
ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1536);

-- Add vector column to LongTermMemory
ALTER TABLE "LongTermMemory"
ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1536);

-- Add vector column to RAGContextSession
ALTER TABLE "RAGContextSession"
ADD COLUMN IF NOT EXISTS "query_embedding_vector" vector(1536);

-- Create HNSW indexes for fast similarity search
-- HNSW is faster for queries, IVFFlat is faster for inserts
CREATE INDEX IF NOT EXISTS "knowledge_document_embedding_hnsw_idx"
ON "KnowledgeDocument"
USING hnsw ("embedding_vector" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "semantic_cache_embedding_hnsw_idx"
ON "SemanticCache"
USING hnsw ("embedding_vector" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "long_term_memory_embedding_hnsw_idx"
ON "LongTermMemory"
USING hnsw ("embedding_vector" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create composite index for filtered searches (trust score + embedding)
CREATE INDEX IF NOT EXISTS "knowledge_document_trust_embedding_idx"
ON "KnowledgeDocument" ("knowledgeBaseId", "trustScore")
WHERE "embedding_vector" IS NOT NULL;

-- Create composite index for verified documents search
CREATE INDEX IF NOT EXISTS "knowledge_document_verified_embedding_idx"
ON "KnowledgeDocument" ("knowledgeBaseId", "isVerified")
WHERE "embedding_vector" IS NOT NULL AND "isVerified" = true;

-- Migrate existing JSON embeddings to vector type
DO $$
DECLARE
  doc RECORD;
  embedding_array float8[];
BEGIN
  FOR doc IN
    SELECT id, embedding
    FROM "KnowledgeDocument"
    WHERE embedding IS NOT NULL
      AND "embedding_vector" IS NULL
      AND jsonb_typeof(embedding::jsonb) = 'array'
  LOOP
    BEGIN
      SELECT array_agg(elem::float8)
      INTO embedding_array
      FROM jsonb_array_elements_text(doc.embedding::jsonb) AS elem;

      IF array_length(embedding_array, 1) = 1536 THEN
        UPDATE "KnowledgeDocument"
        SET "embedding_vector" = embedding_array::vector(1536)
        WHERE id = doc.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to migrate embedding for document %: %', doc.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Vector migration completed successfully';
END $$;
