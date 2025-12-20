import { Router, Request, Response } from 'express';
import { RAGService } from '../../services/RAGService.js';
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
    content: z.string().min(1),
    metadata: z.record(z.any()).optional(),
    source: z.string().optional(),
  })).min(1, 'At least one document is required'),
});

const retrieveContextSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(20).optional(),
  minRelevance: z.number().min(0).max(1).optional(),
  minTrust: z.number().min(0).max(1).optional(),
});

const buildPromptSchema = z.object({
  originalPrompt: z.string().min(1, 'Original prompt is required'),
  knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  query: z.string().min(1, 'Query is required'),
  options: z.object({
    topK: z.number().int().min(1).max(20).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
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

// Create knowledge base
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

// Add documents to knowledge base
router.post(
  '/knowledge-bases/:id/documents',
  validateParams(idParamSchema),
  validateBody(addDocumentsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { documents } = req.body;

    const addedDocs = await RAGService.addToKnowledgeBase(id, documents);

    res.json({ success: true, data: { count: addedDocs.length, documents: addedDocs } });
  })
);

// Retrieve context for query
router.post(
  '/knowledge-bases/:id/retrieve',
  validateParams(idParamSchema),
  validateBody(retrieveContextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { query, topK, minRelevance, minTrust } = req.body;

    const context = await RAGService.retrieveContext(id, query, {
      topK,
      minRelevance,
      minTrust,
    });

    res.json({ success: true, data: context });
  })
);

// Build RAG-enhanced prompt
router.post(
  '/build-prompt',
  validateBody(buildPromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { originalPrompt, knowledgeBaseId, query, options } = req.body;

    const context = await RAGService.retrieveContext(knowledgeBaseId, query, options);
    const ragPrompt = RAGService.buildRAGPrompt(originalPrompt, context, options);

    res.json({ success: true, data: { ragPrompt, context } });
  })
);

// Update trust scores
router.post(
  '/knowledge-bases/:id/trust-scores',
  validateParams(idParamSchema),
  validateBody(updateTrustScoresSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { feedback } = req.body;

    await RAGService.updateTrustScores(id, feedback);

    res.json({ success: true, message: 'Trust scores updated' });
  })
);

// Chunk text
router.post(
  '/chunk',
  validateBody(chunkTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { text, chunkSize, overlap } = req.body;

    const chunks = RAGService.chunkText(text, { chunkSize, overlap });

    res.json({ success: true, data: { chunks, count: chunks.length } });
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
