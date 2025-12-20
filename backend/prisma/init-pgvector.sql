-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector similarity functions
CREATE OR REPLACE FUNCTION cosine_distance(a vector, b vector) RETURNS float8 AS $$
  SELECT 1 - (a <=> b);
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

-- Create function to search for similar vectors
CREATE OR REPLACE FUNCTION search_similar_documents(
  query_embedding vector(1536),
  kb_id TEXT,
  min_trust FLOAT DEFAULT 0.5,
  similarity_threshold FLOAT DEFAULT 0.7,
  max_results INT DEFAULT 5
) RETURNS TABLE (
  id TEXT,
  title TEXT,
  content TEXT,
  source TEXT,
  trust_score FLOAT,
  is_verified BOOLEAN,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kd.id,
    kd.title,
    kd.content,
    kd.source,
    kd."trustScore"::FLOAT,
    kd."isVerified",
    kd.metadata::JSONB,
    (1 - (kd.embedding <=> query_embedding))::FLOAT as similarity
  FROM "KnowledgeDocument" kd
  WHERE kd."knowledgeBaseId" = kb_id
    AND kd."trustScore" >= min_trust
    AND kd.embedding IS NOT NULL
    AND (1 - (kd.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY kd.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Create function for hybrid search (combining vector similarity with trust score)
CREATE OR REPLACE FUNCTION hybrid_search_documents(
  query_embedding vector(1536),
  kb_id TEXT,
  min_trust FLOAT DEFAULT 0.5,
  similarity_threshold FLOAT DEFAULT 0.7,
  trust_weight FLOAT DEFAULT 0.3,
  max_results INT DEFAULT 5
) RETURNS TABLE (
  id TEXT,
  title TEXT,
  content TEXT,
  source TEXT,
  trust_score FLOAT,
  is_verified BOOLEAN,
  metadata JSONB,
  similarity FLOAT,
  combined_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kd.id,
    kd.title,
    kd.content,
    kd.source,
    kd."trustScore"::FLOAT,
    kd."isVerified",
    kd.metadata::JSONB,
    (1 - (kd.embedding <=> query_embedding))::FLOAT as similarity,
    ((1 - trust_weight) * (1 - (kd.embedding <=> query_embedding)) + trust_weight * kd."trustScore")::FLOAT as combined_score
  FROM "KnowledgeDocument" kd
  WHERE kd."knowledgeBaseId" = kb_id
    AND kd."trustScore" >= min_trust
    AND kd.embedding IS NOT NULL
    AND (1 - (kd.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY combined_score DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'pgvector extension and similarity functions initialized successfully';
END $$;
