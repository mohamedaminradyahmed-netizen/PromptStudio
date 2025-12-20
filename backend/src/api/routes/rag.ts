import { Router, Request, Response } from 'express';
import { RAGService } from '../../services/RAGService.js';
import { VectorService } from '../../services/VectorService.js';
import { adaptiveRAGService } from '../../services/AdaptiveRAGService.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateBody, validateParams } from '../validation/middleware.js';
import { z } from 'zod';

const router = Router();

// Validation Schemas
const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  domain: z.string().optional(),
  embeddingModel: z.string().optional(),
  chunkSize: z.number().int().min(100).max(4000).optional(),
  chunkOverlap: z.number().int().min(0).max(500).optional(),
});

const addDocumentsSchema = z.object({
  documents: z.array(z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    source: z.string().optional(),
    trustScore: z.number().min(0).max(1).optional(),
    isVerified: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  })).min(1, 'At least one document is required'),
});

const batchIngestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1, 'At least one text is required'),
  source: z.string().optional(),
  trustScore: z.number().min(0).max(1).default(1.0),
  isVerified: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

const updateEmbeddingsSchema = z.object({
  batchSize: z.number().int().min(1).max(200).default(50),
});

const retrieveContextSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(20).optional(),
  minRelevance: z.number().min(0).max(1).optional(),
  minTrust: z.number().min(0).max(1).optional(),
  verifiedOnly: z.boolean().optional(),
  useHybridSearch: z.boolean().optional(),
  trustWeight: z.number().min(0).max(1).optional(),
});

const retrieveFilteredSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  filters: z.object({
    sources: z.array(z.string()).optional(),
    minTrust: z.number().min(0).max(1).optional(),
    maxTrust: z.number().min(0).max(1).optional(),
    verifiedOnly: z.boolean().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  minRelevance: z.number().min(0).max(1).optional(),
});

const buildPromptSchema = z.object({
  originalPrompt: z.string().min(1, 'Original prompt is required'),
  knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  query: z.string().min(1, 'Query is required'),
  options: z.object({
    topK: z.number().int().min(1).max(20).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    minTrust: z.number().min(0).max(1).optional(),
    verifiedOnly: z.boolean().optional(),
    useHybridSearch: z.boolean().optional(),
    trustWeight: z.number().min(0).max(1).optional(),
    includeSourceAttribution: z.boolean().optional(),
    includeConfidenceScores: z.boolean().optional(),
    maxContextLength: z.number().int().positive().optional(),
    citationFormat: z.string().optional(),
    includeMetadata: z.boolean().optional(),
  }).optional(),
});

const updateTrustScoresSchema = z.object({
  feedback: z.array(z.object({
    documentId: z.string(),
    score: z.number().min(-1).max(1),
    reason: z.string().optional(),
  })),
});

const verifySourceSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  verifiedBy: z.string().min(1, 'Verifier is required'),
});

const chunkTextSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  chunkSize: z.number().int().min(100).max(4000).optional(),
  overlap: z.number().int().min(0).max(500).optional(),
});

const adaptiveRetrieveSchema = z.object({
  knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  query: z.string().min(1, 'Query is required'),
  maxChunks: z.number().int().min(1).max(20).default(5),
  minRelevance: z.number().min(0).max(1).default(0.7),
  minTrust: z.number().min(0).max(1).default(0.5),
  enableSummarization: z.boolean().default(true),
  maxContextLength: z.number().int().positive().default(4000),
  includeSourceTrace: z.boolean().default(true),
});

const contextMaskSchema = z.object({
  knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  trustThreshold: z.number().min(0).max(1).default(0.5),
  verifiedOnly: z.boolean().default(false),
  allowedDomains: z.array(z.string()).default([]),
  blockedDomains: z.array(z.string()).default([]),
});

const trustedSourceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  domain: z.string().optional(),
  url: z.string().url().optional(),
  sourceType: z.enum(['document', 'api', 'database', 'web']).default('document'),
  baseTrustScore: z.number().min(0).max(1).default(0.8),
  autoVerify: z.boolean().default(false),
});

const summarizeChunksSchema = z.object({
  chunks: z.array(z.object({
    content: z.string(),
    relevanceScore: z.number().optional(),
    trustScore: z.number().optional(),
    source: z.string().optional(),
  })).min(1, 'Chunks array is required'),
  query: z.string().min(1, 'Query is required'),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

// ==================== Knowledge Base Management ====================

/**
 * Create knowledge base
 */
router.post(
  '/knowledge-bases',
  validateBody(createKnowledgeBaseSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, domain, embeddingModel, chunkSize, chunkOverlap } = req.body;

    const knowledgeBase = await RAGService.createKnowledgeBase({
      name,
      description,
      domain,
      embeddingModel,
      chunkSize,
      chunkOverlap,
    });

    res.json({ success: true, data: knowledgeBase });
  })
);

/**
 * Get knowledge base with statistics
 */
router.get(
  '/knowledge-bases/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await RAGService.getKnowledgeBaseWithStats(id);

    if (!knowledgeBase) {
      throw Errors.notFound('Knowledge base');
    }

    res.json({ success: true, data: knowledgeBase });
  })
);

// ==================== Document Ingestion ====================

/**
 * Ingest documents into knowledge base
 */
router.post(
  '/knowledge-bases/:id/documents',
  validateParams(idParamSchema),
  validateBody(addDocumentsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { documents } = req.body;

    const results = await RAGService.addToKnowledgeBase(id, documents);

    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);

    res.json({
      success: true,
      data: {
        documentsProcessed: results.length,
        totalChunks,
        totalTokens,
        processingTimeMs: totalTime,
        results,
      },
    });
  })
);

/**
 * Batch ingest text content
 */
router.post(
  '/knowledge-bases/:id/ingest',
  validateParams(idParamSchema),
  validateBody(batchIngestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      texts,
      source,
      trustScore = 1.0,
      isVerified = false,
      metadata = {}
    } = req.body;

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
      data: {
        textsProcessed: texts.length,
        totalChunks: results.reduce((sum, r) => sum + r.chunksCreated, 0),
        results,
      },
    });
  })
);

/**
 * Update embeddings for documents without vector embeddings
 */
router.post(
  '/knowledge-bases/:id/update-embeddings',
  validateParams(idParamSchema),
  validateBody(updateEmbeddingsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { batchSize = 50 } = req.body;

    const result = await RAGService.updateMissingEmbeddings(id, batchSize);

    res.json({
      success: true,
      data: {
        updated: result.updated,
        failed: result.failed,
      },
    });
  })
);

// ==================== Retrieval Endpoints ====================

/**
 * Retrieve context with vector search
 */
router.post(
  '/knowledge-bases/:id/retrieve',
  validateParams(idParamSchema),
  validateBody(retrieveContextSchema),
  asyncHandler(async (req: Request, res: Response) => {
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
      data: {
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
      },
    });
  })
);

/**
 * Retrieve with advanced filters
 */
router.post(
  '/knowledge-bases/:id/retrieve-filtered',
  validateParams(idParamSchema),
  validateBody(retrieveFilteredSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      query,
      filters = {},
      topK = 5,
      minRelevance = 0.7,
    } = req.body;

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
      data: {
        chunks: context.chunks,
        totalRelevance: context.totalRelevance,
        sources: context.sources,
      },
    });
  })
);

/**
 * Build RAG-enhanced prompt
 */
router.post(
  '/build-prompt',
  validateBody(buildPromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      originalPrompt,
      knowledgeBaseId,
      query,
      options = {}
    } = req.body;

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
      success: true,
      data: {
        ragPrompt,
        context,
        sessionId: context.sessionId,
      },
    });
  })
);

// ==================== Trust & Verification ====================

/**
 * Update trust scores
 */
router.post(
  '/knowledge-bases/:id/trust-scores',
  validateParams(idParamSchema),
  validateBody(updateTrustScoresSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { feedback } = req.body;

    const results = await RAGService.updateTrustScores(id, feedback);

    res.json({
      success: true,
      data: { results },
    });
  })
);

/**
 * Verify source
 */
router.post(
  '/knowledge-bases/:id/verify-source',
  validateParams(idParamSchema),
  validateBody(verifySourceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { source, verifiedBy } = req.body;

    const result = await RAGService.verifySource(id, source, verifiedBy);

    res.json({
      success: true,
      data: { documentsVerified: result.count },
    });
  })
);

// ==================== Utility Endpoints ====================

/**
 * Chunk text
 */
router.post(
  '/chunk',
  validateBody(chunkTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { text, chunkSize, overlap } = req.body;

    const chunks = RAGService.chunkText(text, { chunkSize, overlap });

    res.json({
      success: true,
      data: {
        chunks,
        count: chunks.length,
        avgChunkSize: chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
      },
    });
  })
);

/**
 * Get embedding statistics
 */
router.get(
  '/knowledge-bases/:id/stats',
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const stats = await VectorService.getEmbeddingStats(id);

    res.json({ success: true, data: stats });
  })
);

/**
 * Delete document
 */
router.delete(
  '/documents/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await RAGService.deleteDocument(id);

    res.json({ success: true });
  })
);

/**
 * Get recent sessions
 */
router.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;

    const sessions = await RAGService.getRecentSessions(limit);

    res.json({ success: true, data: sessions });
  })
);

// ==================== Adaptive RAG Endpoints ====================

/**
 * Retrieve adaptive context with dynamic context packing
 */
router.post(
  '/adaptive/retrieve',
  validateBody(adaptiveRetrieveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      knowledgeBaseId,
      query,
      maxChunks,
      minRelevance,
      minTrust,
      enableSummarization,
      maxContextLength,
      includeSourceTrace,
    } = req.body;

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

    res.json({ success: true, data: result });
  })
);

/**
 * Build context mask for trusted sources
 */
router.post(
  '/adaptive/context-mask',
  validateBody(contextMaskSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      knowledgeBaseId,
      trustThreshold,
      verifiedOnly,
      allowedDomains,
      blockedDomains,
    } = req.body;

    const contextMask = await adaptiveRAGService.buildContextMask(
      knowledgeBaseId,
      {
        trustThreshold,
        verifiedOnly,
        allowedDomains,
        blockedDomains,
      }
    );

    res.json({ success: true, data: contextMask });
  })
);

/**
 * Get RAG session history
 */
router.get(
  '/adaptive/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const session = await adaptiveRAGService.getSessionHistory(sessionId);

    if (!session) {
      throw Errors.notFound('Session');
    }

    res.json({ success: true, data: session });
  })
);

/**
 * Register a trusted source
 */
router.post(
  '/adaptive/trusted-sources',
  validateBody(trustedSourceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      domain,
      url,
      sourceType,
      baseTrustScore,
      autoVerify,
    } = req.body;

    const trustedSource = await adaptiveRAGService.registerTrustedSource({
      name,
      domain,
      url,
      sourceType,
      baseTrustScore,
      autoVerify,
    });

    res.json({ success: true, data: trustedSource });
  })
);

/**
 * Summarize chunks with confidence indicators
 */
router.post(
  '/adaptive/summarize',
  validateBody(summarizeChunksSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { chunks, query } = req.body;

    const enrichedChunks = await adaptiveRAGService.summarizeChunks(chunks, query);

    res.json({
      success: true,
      data: {
        enrichedChunks,
        count: enrichedChunks.length,
        avgConfidence: enrichedChunks.reduce((sum, c) => sum + c.confidenceScore, 0) / enrichedChunks.length,
      },
    });
  })
);

export default router;
