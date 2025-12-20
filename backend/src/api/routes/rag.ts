import { Router, Request, Response } from 'express';
import { RAGService } from '../../services/RAGService';
import { VectorService } from '../../services/VectorService';
import { adaptiveRAGService } from '../../services/AdaptiveRAGService';

const router = Router();

// ==================== Knowledge Base Management ====================

/**
 * Create knowledge base
 * إنشاء قاعدة معرفة
 */
router.post('/knowledge-bases', async (req: Request, res: Response) => {
  try {
    const { name, description, domain, embeddingModel, chunkSize, chunkOverlap } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const knowledgeBase = await RAGService.createKnowledgeBase({
      name,
      description,
      domain,
      embeddingModel,
      chunkSize,
      chunkOverlap,
    });

    res.json(knowledgeBase);
  } catch (error) {
    console.error('Create knowledge base error:', error);
    res.status(500).json({ error: 'Failed to create knowledge base' });
  }
});

/**
 * Get knowledge base with statistics
 * الحصول على قاعدة المعرفة مع الإحصائيات
 */
router.get('/knowledge-bases/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const knowledgeBase = await RAGService.getKnowledgeBaseWithStats(id);

    if (!knowledgeBase) {
      return res.status(404).json({ error: 'Knowledge base not found' });
    }

    res.json(knowledgeBase);
  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({ error: 'Failed to get knowledge base' });
  }
});

// ==================== Document Ingestion ====================

/**
 * Ingest documents into knowledge base
 * إدخال وثائق إلى قاعدة المعرفة
 */
router.post('/knowledge-bases/:id/documents', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'documents array is required' });
    }

    // Validate document structure
    for (const doc of documents) {
      if (!doc.title || !doc.content) {
        return res.status(400).json({
          error: 'Each document must have title and content'
        });
      }
    }

    const results = await RAGService.addToKnowledgeBase(id, documents);

    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);

    res.json({
      success: true,
      documentsProcessed: results.length,
      totalChunks,
      totalTokens,
      processingTimeMs: totalTime,
      results,
    });
  } catch (error) {
    console.error('Ingest documents error:', error);
    res.status(500).json({
      error: 'Failed to ingest documents',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Batch ingest text content
 * إدخال محتوى نصي بالجملة
 */
router.post('/knowledge-bases/:id/ingest', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      texts,
      source,
      trustScore = 1.0,
      isVerified = false,
      metadata = {}
    } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts array is required' });
    }

    // Convert texts to documents
    const documents = texts.map((text: string, index: number) => ({
      title: `Document ${index + 1}`,
      content: text,
      source,
      trustScore,
      isVerified,
      metadata: { ...metadata, originalIndex: index },
    }));

    const results = await RAGService.addToKnowledgeBase(id, documents);

    res.json({
      success: true,
      textsProcessed: texts.length,
      totalChunks: results.reduce((sum, r) => sum + r.chunksCreated, 0),
      results,
    });
  } catch (error) {
    console.error('Batch ingest error:', error);
    res.status(500).json({ error: 'Failed to ingest texts' });
  }
});

/**
 * Update embeddings for documents without vector embeddings
 * تحديث التضمينات للوثائق بدون تضمينات متجهة
 */
router.post('/knowledge-bases/:id/update-embeddings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { batchSize = 50 } = req.body;

    const result = await RAGService.updateMissingEmbeddings(id, batchSize);

    res.json({
      success: true,
      updated: result.updated,
      failed: result.failed,
    });
  } catch (error) {
    console.error('Update embeddings error:', error);
    res.status(500).json({ error: 'Failed to update embeddings' });
  }
});

// ==================== Retrieval Endpoints ====================

/**
 * Retrieve context with vector search
 * استرجاع السياق باستخدام البحث المتجه
 */
router.post('/knowledge-bases/:id/retrieve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      query,
      topK = 5,
      minRelevance = 0.7,
      minTrust = 0.5,
      verifiedOnly = false,
      useHybridSearch = true,
      trustWeight = 0.3,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const context = await RAGService.retrieveContext(id, query, {
      topK,
      minRelevance,
      minTrust,
      verifiedOnly,
      useHybridSearch,
      trustWeight,
    });

    res.json({
      success: true,
      sessionId: context.sessionId,
      query,
      chunks: context.chunks,
      totalRelevance: context.totalRelevance,
      sources: context.sources,
      stats: {
        chunksReturned: context.chunks.length,
        avgRelevance: context.chunks.length > 0
          ? context.chunks.reduce((sum, c) => sum + c.relevanceScore, 0) / context.chunks.length
          : 0,
        avgTrust: context.chunks.length > 0
          ? context.chunks.reduce((sum, c) => sum + c.trustScore, 0) / context.chunks.length
          : 0,
      },
    });
  } catch (error) {
    console.error('Retrieve context error:', error);
    res.status(500).json({ error: 'Failed to retrieve context' });
  }
});

/**
 * Retrieve with advanced filters
 * الاسترجاع مع فلاتر متقدمة
 */
router.post('/knowledge-bases/:id/retrieve-filtered', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      query,
      filters = {},
      topK = 5,
      minRelevance = 0.7,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const context = await RAGService.retrieveContextWithFilters(
      id,
      query,
      {
        sources: filters.sources,
        minTrust: filters.minTrust,
        maxTrust: filters.maxTrust,
        verifiedOnly: filters.verifiedOnly,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
        metadataFilters: filters.metadata,
      },
      { topK, minRelevance }
    );

    res.json({
      success: true,
      chunks: context.chunks,
      totalRelevance: context.totalRelevance,
      sources: context.sources,
    });
  } catch (error) {
    console.error('Filtered retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve with filters' });
  }
});

/**
 * Build RAG-enhanced prompt
 * بناء prompt معزز بـ RAG
 */
router.post('/build-prompt', async (req: Request, res: Response) => {
  try {
    const {
      originalPrompt,
      knowledgeBaseId,
      query,
      options = {}
    } = req.body;

    if (!originalPrompt || !knowledgeBaseId || !query) {
      return res.status(400).json({
        error: 'originalPrompt, knowledgeBaseId, and query are required'
      });
    }

    const context = await RAGService.retrieveContext(knowledgeBaseId, query, {
      topK: options.topK,
      minRelevance: options.minRelevance,
      minTrust: options.minTrust,
      verifiedOnly: options.verifiedOnly,
      useHybridSearch: options.useHybridSearch,
      trustWeight: options.trustWeight,
    });

    const ragPrompt = RAGService.buildRAGPrompt(originalPrompt, context, {
      includeSourceAttribution: options.includeSourceAttribution,
      includeConfidenceScores: options.includeConfidenceScores,
      maxContextLength: options.maxContextLength,
      citationFormat: options.citationFormat,
    });

    res.json({
      ragPrompt,
      context,
      sessionId: context.sessionId,
    });
  } catch (error) {
    console.error('Build RAG prompt error:', error);
    res.status(500).json({ error: 'Failed to build RAG prompt' });
  }
});

// ==================== Trust & Verification ====================

/**
 * Update trust scores
 * تحديث درجات الثقة
 */
router.post('/knowledge-bases/:id/trust-scores', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    if (!feedback || !Array.isArray(feedback)) {
      return res.status(400).json({ error: 'feedback array is required' });
    }

    const results = await RAGService.updateTrustScores(id, feedback);

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Update trust scores error:', error);
    res.status(500).json({ error: 'Failed to update trust scores' });
  }
});

/**
 * Verify source
 * التحقق من مصدر
 */
router.post('/knowledge-bases/:id/verify-source', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source, verifiedBy } = req.body;

    if (!source || !verifiedBy) {
      return res.status(400).json({ error: 'source and verifiedBy are required' });
    }

    const result = await RAGService.verifySource(id, source, verifiedBy);

    res.json({
      success: true,
      documentsVerified: result.count,
    });
  } catch (error) {
    console.error('Verify source error:', error);
    res.status(500).json({ error: 'Failed to verify source' });
  }
});

// ==================== Utility Endpoints ====================

/**
 * Chunk text
 * تقسيم النص
 */
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const { text, chunkSize, overlap } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const chunks = RAGService.chunkText(text, { chunkSize, overlap });

    res.json({
      chunks,
      count: chunks.length,
      avgChunkSize: chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
    });
  } catch (error) {
    console.error('Chunk text error:', error);
    res.status(500).json({ error: 'Failed to chunk text' });
  }
});

/**
 * Get embedding statistics
 * الحصول على إحصائيات التضمين
 */
router.get('/knowledge-bases/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const stats = await VectorService.getEmbeddingStats(id);

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Delete document
 * حذف وثيقة
 */
router.delete('/documents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await RAGService.deleteDocument(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * Get recent sessions
 * الحصول على الجلسات الأخيرة
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const sessions = await RAGService.getRecentSessions(limit);

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// ==================== Adaptive RAG Endpoints ====================

/**
 * Retrieve adaptive context with dynamic context packing
 * استرجاع سياق تكيفي مع حزم سياق ديناميكية
 */
router.post('/adaptive/retrieve', async (req: Request, res: Response) => {
  try {
    const {
      knowledgeBaseId,
      query,
      maxChunks = 5,
      minRelevance = 0.7,
      minTrust = 0.5,
      enableSummarization = true,
      maxContextLength = 4000,
      includeSourceTrace = true,
    } = req.body;

    if (!knowledgeBaseId || !query) {
      return res.status(400).json({
        error: 'knowledgeBaseId and query are required',
      });
    }

    const result = await adaptiveRAGService.retrieveAdaptiveContext(
      knowledgeBaseId,
      query,
      {
        maxChunks,
        minRelevance,
        minTrust,
        enableSummarization,
        maxContextLength,
        includeSourceTrace,
      }
    );

    res.json(result);
  } catch (error) {
    console.error('Adaptive RAG retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve adaptive context',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Build context mask for trusted sources
 * بناء ماسك سياق للمصادر الموثوقة
 */
router.post('/adaptive/context-mask', async (req: Request, res: Response) => {
  try {
    const {
      knowledgeBaseId,
      trustThreshold = 0.5,
      verifiedOnly = false,
      allowedDomains = [],
      blockedDomains = [],
    } = req.body;

    if (!knowledgeBaseId) {
      return res.status(400).json({ error: 'knowledgeBaseId is required' });
    }

    const contextMask = await adaptiveRAGService.buildContextMask(
      knowledgeBaseId,
      {
        trustThreshold,
        verifiedOnly,
        allowedDomains,
        blockedDomains,
      }
    );

    res.json(contextMask);
  } catch (error) {
    console.error('Context mask error:', error);
    res.status(500).json({ error: 'Failed to build context mask' });
  }
});

/**
 * Get RAG session history
 * الحصول على سجل جلسة RAG
 */
router.get('/adaptive/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await adaptiveRAGService.getSessionHistory(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Session history error:', error);
    res.status(500).json({ error: 'Failed to retrieve session history' });
  }
});

/**
 * Register a trusted source
 * تسجيل مصدر موثوق
 */
router.post('/adaptive/trusted-sources', async (req: Request, res: Response) => {
  try {
    const {
      name,
      domain,
      url,
      sourceType = 'document',
      baseTrustScore = 0.8,
      autoVerify = false,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const trustedSource = await adaptiveRAGService.registerTrustedSource({
      name,
      domain,
      url,
      sourceType,
      baseTrustScore,
      autoVerify,
    });

    res.json(trustedSource);
  } catch (error) {
    console.error('Register trusted source error:', error);
    res.status(500).json({
      error: 'Failed to register trusted source',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Summarize chunks with confidence indicators
 * تلخيص المقتطفات مع مؤشرات الثقة
 */
router.post('/adaptive/summarize', async (req: Request, res: Response) => {
  try {
    const { chunks, query } = req.body;

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return res.status(400).json({ error: 'chunks array is required' });
    }

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const enrichedChunks = await adaptiveRAGService.summarizeChunks(chunks, query);

    res.json({
      enrichedChunks,
      count: enrichedChunks.length,
      avgConfidence: enrichedChunks.reduce((sum, c) => sum + c.confidenceScore, 0) / enrichedChunks.length,
    });
  } catch (error) {
    console.error('Summarize chunks error:', error);
    res.status(500).json({ error: 'Failed to summarize chunks' });
  }
});

export default router;
