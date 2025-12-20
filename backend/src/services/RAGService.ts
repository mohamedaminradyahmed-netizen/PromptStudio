import prisma from '../lib/prisma';
import { EmbeddingUtil } from './embedding-util';
import { VectorService, VectorSearchResult, IngestDocumentInput, RetrieveOptions } from './VectorService';

export interface RAGContext {
  chunks: ContextChunk[];
  totalRelevance: number;
  sources: string[];
  sessionId?: string;
}

export interface ContextChunk {
  id: string;
  content: string;
  source: string;
  relevanceScore: number;
  trustScore: number;
  isVerified: boolean;
  metadata?: Record<string, any>;
  combinedScore?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

export interface AddDocumentsResult {
  id: string;
  title: string;
  chunksCreated: number;
  totalTokens: number;
  processingTimeMs: number;
}

export class RAGService {
  /**
   * Generate embeddings for text using OpenAI
   * توليد التضمينات للنص باستخدام OpenAI
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    return EmbeddingUtil.generateEmbedding(text);
  }

  /**
   * Calculate cosine similarity between two vectors
   * حساب التشابه الجيب التمام بين متجهين
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    return EmbeddingUtil.cosineSimilarity(vec1, vec2);
  }

  /**
   * Chunk text into smaller pieces with overlap
   * تقسيم النص إلى أجزاء أصغر مع تداخل
   */
  static chunkText(
    text: string,
    options: {
      chunkSize?: number;
      overlap?: number;
      separator?: string;
    } = {}
  ): string[] {
    return EmbeddingUtil.chunkText(text, options);
  }

  /**
   * Add documents to knowledge base with vector embeddings
   * إضافة وثائق إلى قاعدة المعرفة مع تضمينات متجهة
   */
  static async addToKnowledgeBase(
    knowledgeBaseId: string,
    documents: Array<{
      title: string;
      content: string;
      source?: string;
      trustScore?: number;
      metadata?: Record<string, any>;
      isVerified?: boolean;
    }>
  ): Promise<AddDocumentsResult[]> {
    const ingestDocs: IngestDocumentInput[] = documents.map(doc => ({
      title: doc.title,
      content: doc.content,
      source: doc.source,
      trustScore: doc.trustScore,
      metadata: doc.metadata,
      isVerified: doc.isVerified,
    }));

    const results = await VectorService.ingestDocuments(knowledgeBaseId, ingestDocs);

    return results.map((r, idx) => ({
      id: r.documentId,
      title: documents[idx].title,
      chunksCreated: r.chunksCreated,
      totalTokens: r.totalTokens,
      processingTimeMs: r.processingTimeMs,
    }));
  }

  /**
   * Retrieve relevant context using vector search with trust/relevance scoring
   * استرجاع سياق ذي صلة باستخدام البحث المتجه مع تقييم الثقة/الصلة
   */
  static async retrieveContext(
    knowledgeBaseId: string,
    query: string,
    options: {
      topK?: number;
      minRelevance?: number;
      minTrust?: number;
      verifiedOnly?: boolean;
      useHybridSearch?: boolean;
      trustWeight?: number;
    } = {}
  ): Promise<RAGContext> {
    const {
      topK = 5,
      minRelevance = 0.7,
      minTrust = 0.5,
      verifiedOnly = false,
      useHybridSearch = true,
      trustWeight = 0.3,
    } = options;

    // Use VectorService for efficient vector search
    const searchResults = await VectorService.retrieveSimilar(
      knowledgeBaseId,
      query,
      {
        topK,
        minRelevance,
        minTrust,
        verifiedOnly,
        useHybridSearch,
        trustWeight,
      }
    );

    // Create context session for tracking
    const session = await prisma.rAGContextSession.create({
      data: {
        query,
        maxChunks: topK,
        minRelevance,
        minTrust,
        totalChunks: searchResults.length,
        avgRelevance: searchResults.length > 0
          ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
          : null,
        avgTrust: searchResults.length > 0
          ? searchResults.reduce((sum, r) => sum + r.trustScore, 0) / searchResults.length
          : null,
      },
    });

    // Transform results to context chunks
    const chunks: ContextChunk[] = searchResults.map(result => ({
      id: result.id,
      content: result.content,
      source: result.source || 'Unknown',
      relevanceScore: result.similarity,
      trustScore: result.trustScore,
      isVerified: result.isVerified,
      metadata: result.metadata,
      combinedScore: result.combinedScore,
    }));

    const totalRelevance = chunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0);
    const sources = [...new Set(chunks.map(chunk => chunk.source))];

    return {
      chunks,
      totalRelevance,
      sources,
      sessionId: session.id,
    };
  }

  /**
   * Retrieve context with advanced filters
   * استرجاع السياق مع فلاتر متقدمة
   */
  static async retrieveContextWithFilters(
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
  ): Promise<RAGContext> {
    const searchResults = await VectorService.semanticSearchWithFilters(
      knowledgeBaseId,
      query,
      filters,
      options
    );

    const chunks: ContextChunk[] = searchResults.map(result => ({
      id: result.id,
      content: result.content,
      source: result.source || 'Unknown',
      relevanceScore: result.similarity,
      trustScore: result.trustScore,
      isVerified: result.isVerified,
      metadata: result.metadata,
    }));

    return {
      chunks,
      totalRelevance: chunks.reduce((sum, c) => sum + c.relevanceScore, 0),
      sources: [...new Set(chunks.map(c => c.source))],
    };
  }

  /**
   * Build RAG-enhanced prompt with source attribution
   * بناء prompt معزز بـ RAG مع إسناد المصادر
   */
  static buildRAGPrompt(
    originalPrompt: string,
    context: RAGContext,
    options: {
      includeSourceAttribution?: boolean;
      includeConfidenceScores?: boolean;
      maxContextLength?: number;
      citationFormat?: 'inline' | 'footnote' | 'endnote';
    } = {}
  ): string {
    const {
      includeSourceAttribution = true,
      includeConfidenceScores = true,
      maxContextLength = 4000,
      citationFormat = 'inline',
    } = options;

    // Build context section
    let contextSection = '# Relevant Context\n\n';
    let currentLength = 0;
    const citations: string[] = [];

    for (let i = 0; i < context.chunks.length; i++) {
      const chunk = context.chunks[i];
      const citationNum = i + 1;

      let chunkText = '';

      if (includeSourceAttribution) {
        const confidenceInfo = includeConfidenceScores
          ? `, Relevance: ${chunk.relevanceScore.toFixed(2)}, Trust: ${chunk.trustScore.toFixed(2)}${chunk.isVerified ? ' ✓' : ''}`
          : '';

        if (citationFormat === 'inline') {
          chunkText = `[${citationNum}] [Source: ${chunk.source}${confidenceInfo}]\n${chunk.content}\n\n`;
        } else {
          chunkText = `${chunk.content} [${citationNum}]\n\n`;
          citations.push(`[${citationNum}] ${chunk.source}${confidenceInfo}`);
        }
      } else {
        chunkText = `${chunk.content}\n\n`;
      }

      if (currentLength + chunkText.length > maxContextLength) {
        break;
      }

      contextSection += chunkText;
      currentLength += chunkText.length;
    }

    // Add citations section if using footnote/endnote format
    if (citationFormat !== 'inline' && citations.length > 0) {
      contextSection += '\n---\n## Sources\n' + citations.join('\n');
    }

    // Combine with original prompt
    return `${contextSection}\n# Task\n${originalPrompt}\n\nPlease use the context provided above to inform your response. Cite sources when applicable using the reference numbers provided.`;
  }

  /**
   * Create a new knowledge base
   * إنشاء قاعدة معرفة جديدة
   */
  static async createKnowledgeBase(data: {
    name: string;
    description?: string;
    domain?: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }) {
    return await prisma.knowledgeBase.create({
      data: {
        name: data.name,
        description: data.description,
        domain: data.domain,
        embeddingModel: data.embeddingModel || 'text-embedding-3-small',
        chunkSize: data.chunkSize || 1000,
        chunkOverlap: data.chunkOverlap || 200,
      },
    });
  }

  /**
   * Get knowledge base with statistics
   * الحصول على قاعدة المعرفة مع الإحصائيات
   */
  static async getKnowledgeBaseWithStats(knowledgeBaseId: string) {
    const [knowledgeBase, stats] = await Promise.all([
      prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId },
      }),
      VectorService.getEmbeddingStats(knowledgeBaseId),
    ]);

    if (!knowledgeBase) {
      return null;
    }

    return {
      ...knowledgeBase,
      stats,
    };
  }

  /**
   * Update document trust scores based on feedback
   * تحديث درجات الثقة للوثائق بناءً على التغذية الراجعة
   */
  static async updateTrustScores(
    knowledgeBaseId: string,
    feedback: Array<{
      source: string;
      accuracyRating: number; // 0-1
      reason?: string;
    }>
  ) {
    const results = [];

    for (const item of feedback) {
      const updated = await prisma.knowledgeDocument.updateMany({
        where: {
          knowledgeBaseId,
          source: item.source,
        },
        data: {
          trustScore: item.accuracyRating,
        },
      });

      results.push({
        source: item.source,
        documentsUpdated: updated.count,
        newTrustScore: item.accuracyRating,
      });
    }

    return results;
  }

  /**
   * Verify documents from a source
   * التحقق من وثائق من مصدر معين
   */
  static async verifySource(
    knowledgeBaseId: string,
    source: string,
    verifiedBy: string
  ) {
    return await prisma.knowledgeDocument.updateMany({
      where: {
        knowledgeBaseId,
        source,
      },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy,
      },
    });
  }

  /**
   * Batch update embeddings for documents without vector embeddings
   * تحديث مجموعة من التضمينات للوثائق بدون تضمينات متجهة
   */
  static async updateMissingEmbeddings(
    knowledgeBaseId: string,
    batchSize = 50
  ) {
    return await VectorService.batchUpdateEmbeddings(knowledgeBaseId, batchSize);
  }

  /**
   * Delete a document
   * حذف وثيقة
   */
  static async deleteDocument(documentId: string) {
    return await VectorService.deleteDocument(documentId);
  }

  /**
   * Get recent retrieval sessions
   * الحصول على جلسات الاسترجاع الأخيرة
   */
  static async getRecentSessions(limit = 10) {
    return await prisma.rAGContextSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        summaries: true,
        traces: true,
      },
    });
  }
}
