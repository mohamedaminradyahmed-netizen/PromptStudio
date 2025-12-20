import prisma from '../lib/prisma';
import { EmbeddingUtil } from './embedding-util';
import { Prisma } from '@prisma/client';

/**
 * Vector Search Service
 * خدمة البحث عن المتجهات باستخدام pgvector
 */

export interface VectorSearchResult {
  id: string;
  title: string;
  content: string;
  source: string | null;
  trustScore: number;
  isVerified: boolean;
  metadata: Record<string, any>;
  similarity: number;
  combinedScore?: number;
}

export interface IngestDocumentInput {
  title: string;
  content: string;
  source?: string;
  trustScore?: number;
  metadata?: Record<string, any>;
  isVerified?: boolean;
}

export interface IngestResult {
  documentId: string;
  chunksCreated: number;
  totalTokens: number;
  processingTimeMs: number;
}

export interface RetrieveOptions {
  topK?: number;
  minRelevance?: number;
  minTrust?: number;
  verifiedOnly?: boolean;
  trustWeight?: number;
  useHybridSearch?: boolean;
}

export class VectorService {
  private static readonly VECTOR_DIMENSION = 1536;
  private static readonly DEFAULT_CHUNK_SIZE = 1000;
  private static readonly DEFAULT_CHUNK_OVERLAP = 200;

  /**
   * Ingest text documents into the knowledge base
   * إدخال وثائق نصية إلى قاعدة المعرفة
   */
  static async ingestDocuments(
    knowledgeBaseId: string,
    documents: IngestDocumentInput[]
  ): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    // Get knowledge base configuration
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }

    const chunkSize = knowledgeBase.chunkSize || this.DEFAULT_CHUNK_SIZE;
    const chunkOverlap = knowledgeBase.chunkOverlap || this.DEFAULT_CHUNK_OVERLAP;

    for (const doc of documents) {
      const startTime = Date.now();

      // Chunk the document
      const chunks = EmbeddingUtil.chunkText(doc.content, {
        chunkSize,
        overlap: chunkOverlap,
      });

      let totalTokens = 0;
      const createdChunks: string[] = [];

      // Process chunks in batches for efficiency
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        // Generate embeddings for batch
        const embeddings = await EmbeddingUtil.batchGenerateEmbeddings(batch);

        // Create documents with vector embeddings
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          const tokenCount = EmbeddingUtil.estimateTokenCount(chunk);
          totalTokens += tokenCount;

          // Create document with vector embedding using raw SQL
          const chunkIndex = i + j;
          const created = await this.createDocumentWithVector({
            knowledgeBaseId,
            title: `${doc.title} [Chunk ${chunkIndex + 1}/${chunks.length}]`,
            content: chunk,
            source: doc.source,
            trustScore: doc.trustScore || 1.0,
            isVerified: doc.isVerified || false,
            metadata: {
              ...doc.metadata,
              chunkIndex,
              totalChunks: chunks.length,
              originalTitle: doc.title,
              tokenCount,
            },
            embedding,
          });

          createdChunks.push(created.id);
        }
      }

      results.push({
        documentId: createdChunks[0] || '',
        chunksCreated: createdChunks.length,
        totalTokens,
        processingTimeMs: Date.now() - startTime,
      });
    }

    return results;
  }

  /**
   * Create document with vector embedding
   * إنشاء وثيقة مع تضمين متجه
   */
  private static async createDocumentWithVector(data: {
    knowledgeBaseId: string;
    title: string;
    content: string;
    source?: string;
    trustScore: number;
    isVerified: boolean;
    metadata: Record<string, any>;
    embedding: number[];
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const embeddingStr = `[${data.embedding.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO "KnowledgeDocument" (
        id, "knowledgeBaseId", title, content, source,
        "trustScore", "isVerified", metadata, embedding, "embedding_vector",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}::text,
        ${data.knowledgeBaseId}::text,
        ${data.title}::text,
        ${data.content}::text,
        ${data.source || null}::text,
        ${data.trustScore}::float8,
        ${data.isVerified}::boolean,
        ${JSON.stringify(data.metadata)}::jsonb,
        ${JSON.stringify(data.embedding)}::jsonb,
        ${embeddingStr}::vector(1536),
        NOW(),
        NOW()
      )
    `;

    return { id };
  }

  /**
   * Retrieve similar documents using vector search
   * استرجاع وثائق مشابهة باستخدام البحث عن المتجهات
   */
  static async retrieveSimilar(
    knowledgeBaseId: string,
    query: string,
    options: RetrieveOptions = {}
  ): Promise<VectorSearchResult[]> {
    const {
      topK = 5,
      minRelevance = 0.7,
      minTrust = 0.5,
      verifiedOnly = false,
      trustWeight = 0.3,
      useHybridSearch = true,
    } = options;

    // Generate query embedding
    const queryEmbedding = await EmbeddingUtil.generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let results: VectorSearchResult[];

    if (useHybridSearch) {
      // Hybrid search: combines similarity with trust score
      results = await this.hybridVectorSearch(
        knowledgeBaseId,
        embeddingStr,
        minTrust,
        minRelevance,
        trustWeight,
        topK,
        verifiedOnly
      );
    } else {
      // Pure similarity search
      results = await this.pureVectorSearch(
        knowledgeBaseId,
        embeddingStr,
        minTrust,
        minRelevance,
        topK,
        verifiedOnly
      );
    }

    // Update retrieval statistics
    await this.updateRetrievalStats(results.map(r => r.id));

    return results;
  }

  /**
   * Pure vector similarity search
   * البحث عن التشابه بالمتجهات فقط
   */
  private static async pureVectorSearch(
    knowledgeBaseId: string,
    embeddingStr: string,
    minTrust: number,
    minRelevance: number,
    topK: number,
    verifiedOnly: boolean
  ): Promise<VectorSearchResult[]> {
    const verifiedCondition = verifiedOnly ? Prisma.sql`AND "isVerified" = true` : Prisma.sql``;

    const results = await prisma.$queryRaw<VectorSearchResult[]>`
      SELECT
        id,
        title,
        content,
        source,
        "trustScore" as "trustScore",
        "isVerified" as "isVerified",
        metadata,
        (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536)))::float8 as similarity
      FROM "KnowledgeDocument"
      WHERE "knowledgeBaseId" = ${knowledgeBaseId}
        AND "trustScore" >= ${minTrust}
        AND "embedding_vector" IS NOT NULL
        AND (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536))) >= ${minRelevance}
        ${verifiedCondition}
      ORDER BY "embedding_vector" <=> ${embeddingStr}::vector(1536)
      LIMIT ${topK}
    `;

    return results;
  }

  /**
   * Hybrid search: combines similarity with trust score
   * البحث المختلط: يجمع بين التشابه ودرجة الثقة
   */
  private static async hybridVectorSearch(
    knowledgeBaseId: string,
    embeddingStr: string,
    minTrust: number,
    minRelevance: number,
    trustWeight: number,
    topK: number,
    verifiedOnly: boolean
  ): Promise<VectorSearchResult[]> {
    const verifiedCondition = verifiedOnly ? Prisma.sql`AND "isVerified" = true` : Prisma.sql``;
    const relevanceWeight = 1 - trustWeight;

    const results = await prisma.$queryRaw<VectorSearchResult[]>`
      SELECT
        id,
        title,
        content,
        source,
        "trustScore" as "trustScore",
        "isVerified" as "isVerified",
        metadata,
        (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536)))::float8 as similarity,
        (
          ${relevanceWeight}::float8 * (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536))) +
          ${trustWeight}::float8 * "trustScore"
        )::float8 as "combinedScore"
      FROM "KnowledgeDocument"
      WHERE "knowledgeBaseId" = ${knowledgeBaseId}
        AND "trustScore" >= ${minTrust}
        AND "embedding_vector" IS NOT NULL
        AND (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536))) >= ${minRelevance}
        ${verifiedCondition}
      ORDER BY (
        ${relevanceWeight}::float8 * (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536))) +
        ${trustWeight}::float8 * "trustScore"
      ) DESC
      LIMIT ${topK}
    `;

    return results;
  }

  /**
   * Update retrieval statistics for documents
   * تحديث إحصائيات الاسترجاع للوثائق
   */
  private static async updateRetrievalStats(documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;

    await prisma.knowledgeDocument.updateMany({
      where: { id: { in: documentIds } },
      data: {
        retrievalCount: { increment: 1 },
        lastRetrieved: new Date(),
      },
    });
  }

  /**
   * Batch update embeddings for existing documents
   * تحديث مجموعة من التضمينات للوثائق الموجودة
   */
  static async batchUpdateEmbeddings(
    knowledgeBaseId: string,
    batchSize = 50
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    // Find documents without vector embeddings
    const documents = await prisma.knowledgeDocument.findMany({
      where: {
        knowledgeBaseId,
        OR: [
          { embedding: { equals: null } },
        ],
      },
      select: { id: true, content: true },
      take: batchSize,
    });

    for (const doc of documents) {
      try {
        const embedding = await EmbeddingUtil.generateEmbedding(doc.content);
        const embeddingStr = `[${embedding.join(',')}]`;

        await prisma.$executeRaw`
          UPDATE "KnowledgeDocument"
          SET
            embedding = ${JSON.stringify(embedding)}::jsonb,
            "embedding_vector" = ${embeddingStr}::vector(1536),
            "updatedAt" = NOW()
          WHERE id = ${doc.id}
        `;

        updated++;
      } catch (error) {
        console.error(`Failed to update embedding for document ${doc.id}:`, error);
        failed++;
      }
    }

    return { updated, failed };
  }

  /**
   * Delete document and its embedding
   * حذف وثيقة وتضمينها
   */
  static async deleteDocument(documentId: string): Promise<boolean> {
    const result = await prisma.knowledgeDocument.delete({
      where: { id: documentId },
    });

    return !!result;
  }

  /**
   * Get embedding statistics for a knowledge base
   * الحصول على إحصائيات التضمين لقاعدة معرفة
   */
  static async getEmbeddingStats(knowledgeBaseId: string): Promise<{
    totalDocuments: number;
    documentsWithEmbeddings: number;
    documentsWithVectorEmbeddings: number;
    avgTrustScore: number;
    verifiedCount: number;
  }> {
    const stats = await prisma.$queryRaw<Array<{
      total: bigint;
      with_embeddings: bigint;
      with_vector: bigint;
      avg_trust: number;
      verified: bigint;
    }>>`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embeddings,
        COUNT("embedding_vector") as with_vector,
        COALESCE(AVG("trustScore"), 0)::float8 as avg_trust,
        COUNT(*) FILTER (WHERE "isVerified" = true) as verified
      FROM "KnowledgeDocument"
      WHERE "knowledgeBaseId" = ${knowledgeBaseId}
    `;

    const result = stats[0];
    return {
      totalDocuments: Number(result.total),
      documentsWithEmbeddings: Number(result.with_embeddings),
      documentsWithVectorEmbeddings: Number(result.with_vector),
      avgTrustScore: result.avg_trust,
      verifiedCount: Number(result.verified),
    };
  }

  /**
   * Semantic search with filters
   * البحث الدلالي مع الفلاتر
   */
  static async semanticSearchWithFilters(
    knowledgeBaseId: string,
    query: string,
    filters: {
      sources?: string[];
      minTrust?: number;
      maxTrust?: number;
      verifiedOnly?: boolean;
      dateFrom?: Date;
      dateTo?: Date;
      metadataFilters?: Record<string, any>;
    },
    options: { topK?: number; minRelevance?: number } = {}
  ): Promise<VectorSearchResult[]> {
    const { topK = 5, minRelevance = 0.7 } = options;
    const queryEmbedding = await EmbeddingUtil.generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build dynamic conditions
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"knowledgeBaseId" = ${knowledgeBaseId}`,
      Prisma.sql`"embedding_vector" IS NOT NULL`,
      Prisma.sql`(1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536))) >= ${minRelevance}`,
    ];

    if (filters.sources && filters.sources.length > 0) {
      conditions.push(Prisma.sql`source = ANY(${filters.sources})`);
    }

    if (filters.minTrust !== undefined) {
      conditions.push(Prisma.sql`"trustScore" >= ${filters.minTrust}`);
    }

    if (filters.maxTrust !== undefined) {
      conditions.push(Prisma.sql`"trustScore" <= ${filters.maxTrust}`);
    }

    if (filters.verifiedOnly) {
      conditions.push(Prisma.sql`"isVerified" = true`);
    }

    if (filters.dateFrom) {
      conditions.push(Prisma.sql`"createdAt" >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      conditions.push(Prisma.sql`"createdAt" <= ${filters.dateTo}`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const results = await prisma.$queryRaw<VectorSearchResult[]>`
      SELECT
        id,
        title,
        content,
        source,
        "trustScore" as "trustScore",
        "isVerified" as "isVerified",
        metadata,
        (1 - ("embedding_vector" <=> ${embeddingStr}::vector(1536)))::float8 as similarity
      FROM "KnowledgeDocument"
      WHERE ${whereClause}
      ORDER BY "embedding_vector" <=> ${embeddingStr}::vector(1536)
      LIMIT ${topK}
    `;

    return results;
  }
}

export default VectorService;
