import { Router, Request, Response } from 'express';
import { semanticCacheService } from '../../services/SemanticCacheService.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateBody, validateQuery } from '../validation/middleware.js';
import { z } from 'zod';

const router = Router();

// Validation Schemas
const cacheConfigSchema = z.object({
  similarityThreshold: z.number().min(0).max(1).optional(),
  defaultTtlSeconds: z.number().int().positive().optional(),
  maxEntries: z.number().int().positive().optional(),
});

const cacheLookupSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().optional(),
  threshold: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
});

const cacheStoreSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  response: z.string().min(1, 'Response is required'),
  model: z.string().min(1, 'Model is required'),
  tags: z.array(z.string()).optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

const cacheEntriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'hitCount', 'lastAccessed']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags: z.string().optional(),
  search: z.string().optional(),
});

const cacheInvalidateSchema = z.object({
  type: z.enum(['id', 'tags', 'pattern', 'all']),
  ids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  pattern: z.string().optional(),
});

// Get cache configuration
router.get(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    const config = await semanticCacheService['getConfig']();

    res.json({
      success: true,
      data: config,
    });
  })
);

// Update cache configuration
router.patch(
  '/config',
  validateBody(cacheConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const updates = req.body;
    const config = await semanticCacheService.updateConfig(updates);

    res.json({
      success: true,
      data: config,
    });
  })
);

// Lookup cache entry
router.post(
  '/lookup',
  validateBody(cacheLookupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, threshold, tags } = req.body;

    const result = await semanticCacheService.lookup({
      prompt,
      model,
      threshold,
      tags,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

// Store cache entry
router.post(
  '/store',
  validateBody(cacheStoreSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { prompt, response, model, tags, ttlSeconds } = req.body;

    const entry = await semanticCacheService.store({
      prompt,
      response,
      model,
      tags,
      ttlSeconds,
      userId: authReq.userId,
    });

    res.status(201).json({
      success: true,
      data: entry,
    });
  })
);

// Get all cache entries
router.get(
  '/entries',
  validateQuery(cacheEntriesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize, sortBy, sortOrder, tags, search } = req.query as z.infer<typeof cacheEntriesQuerySchema>;

    const result = await semanticCacheService.getEntries({
      page,
      pageSize,
      sortBy,
      sortOrder,
      tags: tags ? (tags as string).split(',') : undefined,
      search,
    });

    res.json({
      success: true,
      data: result.entries,
      meta: {
        page,
        pageSize,
        total: result.total,
        hasMore: page * pageSize < result.total,
      },
    });
  })
);

// Get cache analytics
router.get(
  '/analytics',
  asyncHandler(async (req: Request, res: Response) => {
    const analytics = await semanticCacheService.getAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  })
);

// Invalidate cache entries
router.post(
  '/invalidate',
  validateBody(cacheInvalidateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { type, ids, tags, pattern } = req.body;

    const result = await semanticCacheService.invalidate({
      type,
      ids,
      tags,
      pattern,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

// Delete specific cache entry
router.delete(
  '/entries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await semanticCacheService.invalidate({
      type: 'id',
      ids: [id],
    });

    if (result.deletedCount === 0) {
      throw Errors.notFound('Cache entry');
    }

    res.json({
      success: true,
      data: { message: 'Cache entry deleted successfully' },
    });
  })
);

// Cleanup expired entries
router.post(
  '/cleanup',
  asyncHandler(async (req: Request, res: Response) => {
    const deletedCount = await semanticCacheService.cleanup();

    res.json({
      success: true,
      data: { deletedCount, message: `Cleaned up ${deletedCount} expired entries` },
    });
  })
);

// Clear all cache
router.delete(
  '/all',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await semanticCacheService.invalidate({ type: 'all' });

    res.json({
      success: true,
      data: { deletedCount: result.deletedCount, message: 'All cache entries cleared' },
    });
  })
);

export { router as cacheRouter };
