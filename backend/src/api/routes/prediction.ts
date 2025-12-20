import { Router, Request, Response } from 'express';
import { PreSendPredictionService, MODEL_PRICING } from '../../services/PreSendPredictionService.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateBody } from '../validation/middleware.js';
import { z } from 'zod';

const router = Router();

// Validation Schemas
const expectedOutputLengthEnum = z.enum(['short', 'medium', 'long', 'very_long']);

const analyzeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
  expectedOutputLength: expectedOutputLengthEnum.default('medium'),
  requestsPerMonth: z.number().int().positive().default(100),
  includeHistory: z.boolean().default(true),
  userId: z.string().optional(),
});

const quickAnalyzeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
});

const tokensSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
  expectedOutputLength: expectedOutputLengthEnum.default('medium'),
});

const costSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
  expectedOutputLength: expectedOutputLengthEnum.default('medium'),
  requestsPerMonth: z.number().int().positive().default(100),
});

const successSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
});

const responseTimeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().default('gpt-4'),
  expectedOutputLength: expectedOutputLengthEnum.default('medium'),
});

const compareSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  models: z.array(z.string()).min(1).default(['gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet']),
});

/**
 * @route POST /api/prediction/analyze
 * @desc Comprehensive pre-send analysis
 */
router.post(
  '/analyze',
  validateBody(analyzeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      prompt,
      model,
      expectedOutputLength,
      requestsPerMonth,
      includeHistory,
      userId,
    } = req.body;

    const analysis = await PreSendPredictionService.analyze(prompt, model, {
      expectedOutputLength,
      requestsPerMonth,
      includeHistory,
      userId,
    });

    res.json({
      success: true,
      data: analysis,
    });
  })
);

/**
 * @route POST /api/prediction/quick
 * @desc Quick analysis for real-time feedback
 */
router.post(
  '/quick',
  validateBody(quickAnalyzeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model } = req.body;

    const analysis = PreSendPredictionService.quickAnalyze(prompt, model);

    res.json({
      success: true,
      data: analysis,
    });
  })
);

/**
 * @route POST /api/prediction/tokens
 * @desc Estimate token counts
 */
router.post(
  '/tokens',
  validateBody(tokensSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, expectedOutputLength } = req.body;

    const tokenEstimation = PreSendPredictionService.estimateTokens(
      prompt,
      model,
      expectedOutputLength
    );

    res.json({
      success: true,
      data: tokenEstimation,
    });
  })
);

/**
 * @route POST /api/prediction/cost
 * @desc Estimate costs
 */
router.post(
  '/cost',
  validateBody(costSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, expectedOutputLength, requestsPerMonth } = req.body;

    const tokenEstimation = PreSendPredictionService.estimateTokens(
      prompt,
      model,
      expectedOutputLength
    );

    const costEstimation = PreSendPredictionService.estimateCost(
      tokenEstimation,
      model,
      requestsPerMonth
    );

    res.json({
      success: true,
      data: {
        ...costEstimation,
        tokens: tokenEstimation,
      },
    });
  })
);

/**
 * @route POST /api/prediction/success
 * @desc Predict success probability
 */
router.post(
  '/success',
  validateBody(successSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model } = req.body;

    const successPrediction = await PreSendPredictionService.predictSuccess(
      prompt,
      model
    );

    res.json({
      success: true,
      data: successPrediction,
    });
  })
);

/**
 * @route POST /api/prediction/response-time
 * @desc Estimate response time
 */
router.post(
  '/response-time',
  validateBody(responseTimeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, expectedOutputLength } = req.body;

    const tokenEstimation = PreSendPredictionService.estimateTokens(
      prompt,
      model,
      expectedOutputLength
    );

    const responseTimeEstimation = PreSendPredictionService.estimateResponseTime(
      tokenEstimation,
      model
    );

    res.json({
      success: true,
      data: responseTimeEstimation,
    });
  })
);

/**
 * @route GET /api/prediction/models
 * @desc Get available models with pricing
 */
router.get(
  '/models',
  asyncHandler(async (req: Request, res: Response) => {
    const models = Object.entries(MODEL_PRICING).map(([id, pricing]) => ({
      id,
      ...pricing,
      inputCostPer1K: pricing.input,
      outputCostPer1K: pricing.output,
    }));

    res.json({
      success: true,
      data: models,
    });
  })
);

/**
 * @route POST /api/prediction/compare
 * @desc Compare analysis across multiple models
 */
router.post(
  '/compare',
  validateBody(compareSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, models } = req.body;

    const comparisons = await Promise.all(
      models.map(async (model: string) => {
        const analysis = await PreSendPredictionService.analyze(prompt, model, {
          includeHistory: false,
        });

        return {
          model,
          ...analysis,
        };
      })
    );

    // Find best options
    const bestForCost = comparisons.reduce((best, current) =>
      current.costEstimation.totalCost < best.costEstimation.totalCost ? current : best
    );

    const bestForSuccess = comparisons.reduce((best, current) =>
      current.successPrediction.probability > best.successPrediction.probability ? current : best
    );

    const bestForSpeed = comparisons.reduce((best, current) =>
      current.responseTimeEstimation.estimatedSeconds < best.responseTimeEstimation.estimatedSeconds
        ? current
        : best
    );

    res.json({
      success: true,
      data: {
        comparisons,
        recommendations: {
          bestForCost: bestForCost.model,
          bestForSuccess: bestForSuccess.model,
          bestForSpeed: bestForSpeed.model,
        },
      },
    });
  })
);

export default router;
