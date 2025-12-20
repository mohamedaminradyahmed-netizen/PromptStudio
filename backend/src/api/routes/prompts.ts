import { Router, Request, Response } from 'express';
import { PromptService } from '../../services/PromptService.js';
import { LLMServiceAdapter } from '../../services/LLMServiceAdapter.js';
import { SafetyService } from '../../services/SafetyService.js';
import { PromptOptimizationService } from '../../services/PromptOptimizationService.js';
import {
  BayesianPromptOptimizer,
  quickOptimize,
  comparePrompts,
  ExperimentConfig,
  ExperimentResult,
} from '../../services/BayesianPromptOptimizer.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateBody, validateQuery } from '../validation/middleware.js';
import {
  hierarchicalPromptSchema,
  metaPromptSchema,
  sessionMetaPromptSchema,
  analyzePromptSchema,
  treeOfThoughtSchema,
  graphOfThoughtSchema,
  toolPlanSchema,
  executePlanSchema,
  selfRefineSchema,
  createVersionSchema,
  safetyCheckSchema,
  bayesianOptimizeSchema,
  evolutionaryOptimizeSchema,
  abTestSchema,
  experimentConfigSchema,
  comparePromptsSchema,
  paginationSchema,
} from '../validation/schemas.js';
import { z } from 'zod';

// In-memory store for experiment history (in production, use database)
const experimentHistory: Map<string, ExperimentResult> = new Map();

const router = Router();

// Build hierarchical prompt
router.post(
  '/build-hierarchical',
  validateBody(hierarchicalPromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { systemPrompt, processPrompt, taskPrompt, outputPrompt } = req.body;

    const fullPrompt = PromptService.buildHierarchicalPrompt({
      systemPrompt,
      processPrompt,
      taskPrompt,
      outputPrompt,
    });

    res.json({ success: true, data: { fullPrompt } });
  })
);

// Generate meta-prompt
router.post(
  '/generate-meta',
  validateBody(metaPromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { persona, domain, timeConstraint, metaInstructions } = req.body;

    const metaPrompt = PromptService.generateMetaPrompt({
      persona,
      domain,
      timeConstraint,
      metaInstructions,
    });

    res.json({ success: true, data: { metaPrompt } });
  })
);

// Generate session-fixed meta-prompt
router.post(
  '/generate-session-meta',
  validateBody(sessionMetaPromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, persona, domain, timeConstraint, metaInstructions } = req.body;

    const metaPrompt = PromptService.generateSessionMetaPrompt(sessionId, {
      persona,
      domain,
      timeConstraint,
      metaInstructions,
    });

    res.json({ success: true, data: { metaPrompt, cached: true } });
  })
);

// Clear session meta-prompt cache
router.delete(
  '/session-meta/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    PromptService.clearSessionMetaPrompt(sessionId);

    res.json({ success: true, message: 'Session meta-prompt cleared' });
  })
);

// Analyze prompt before sending
router.post(
  '/analyze',
  validateBody(analyzePromptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model } = req.body;

    const tokens = PromptService.estimateTokens(prompt);
    const cost = PromptService.estimateCost(tokens, model);
    const successProbability = await PromptService.calculateSuccessProbability(prompt);
    const safetyScore = await SafetyService.calculateSafetyScore(prompt);

    const validation = await SafetyService.validatePrompt(prompt);
    const safetyCheck = await SafetyService.performSafetyCheck(prompt);

    res.json({
      success: true,
      data: {
        estimatedTokens: tokens,
        estimatedCost: cost,
        successProbability,
        safetyScore,
        validation,
        safetyIssues: safetyCheck.issues,
        recommendations: safetyCheck.recommendations,
      },
    });
  })
);

// Execute Tree-of-Thought reasoning
router.post(
  '/tree-of-thought',
  validateBody(treeOfThoughtSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, maxDepth, branchingFactor } = req.body;

    const result = await LLMServiceAdapter.executeTreeOfThought(prompt, {
      maxDepth,
      branchingFactor,
    });

    res.json({ success: true, data: result });
  })
);

// Execute Graph-of-Thought reasoning
router.post(
  '/graph-of-thought',
  validateBody(graphOfThoughtSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, maxNodes } = req.body;

    const result = await LLMServiceAdapter.executeGraphOfThought(prompt, {
      maxNodes,
    });

    res.json({ success: true, data: result });
  })
);

// Generate tool plan (legacy)
router.post(
  '/tool-plan',
  validateBody(toolPlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, availableTools } = req.body;

    const plan = await LLMServiceAdapter.generateToolPlan(prompt, availableTools);

    res.json({ success: true, data: { plan } });
  })
);

// Advanced tool planning with reasoning
router.post(
  '/plan-tools',
  validateBody(toolPlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, availableTools, maxTools, requireApproval } = req.body;

    const result = await LLMServiceAdapter.planToolUsage({
      prompt,
      availableTools: availableTools || [],
      maxTools: maxTools || 5,
      requireApproval: requireApproval !== false,
    });

    res.json({ success: true, data: result });
  })
);

// Execute approved tool plan
router.post(
  '/execute-plan',
  validateBody(executePlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { plan, approved } = req.body;

    if (!approved) {
      res.json({
        success: true,
        data: {
          results: [],
          summary: 'Execution cancelled - plan not approved',
        },
      });
      return;
    }

    // In a real implementation, executors would be provided based on registered tools
    const mockExecutors: Record<string, (params: Record<string, any>) => Promise<any>> = {};

    const result = await LLMServiceAdapter.executePlan(plan, approved, mockExecutors);

    res.json({ success: true, data: result });
  })
);

// Self-refine prompt
router.post(
  '/self-refine',
  validateBody(selfRefineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, executionResult, qualityMetrics } = req.body;

    const refinement = await LLMServiceAdapter.selfRefinePrompt(
      prompt,
      executionResult,
      qualityMetrics
    );

    res.json({ success: true, data: refinement });
  })
);

// Create prompt version
router.post(
  '/:id/versions',
  validateBody(createVersionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { content, components, refinementReason, qualityScore } = req.body;

    const version = await PromptService.createPromptVersion(
      id,
      content,
      components,
      refinementReason,
      qualityScore
    );

    res.json({ success: true, data: version });
  })
);

// Get prompt versions
router.get(
  '/:id/versions',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const versions = await PromptService.getPromptVersions(id);

    res.json({ success: true, data: versions });
  })
);

// Safety check
router.post(
  '/safety-check',
  validateBody(safetyCheckSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { content, options } = req.body;

    const result = await SafetyService.performSafetyCheck(content, options);

    res.json({ success: true, data: result });
  })
);

// Optimize prompt (Bayesian)
router.post(
  '/optimize/bayesian',
  validateBody(bayesianOptimizeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, iterations, populationSize } = req.body;

    const result = await PromptOptimizationService.bayesianOptimization(prompt, {
      iterations,
      populationSize,
    });

    res.json({ success: true, data: result });
  })
);

// Optimize prompt (Evolutionary)
router.post(
  '/optimize/evolutionary',
  validateBody(evolutionaryOptimizeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, generations, populationSize } = req.body;

    const result = await PromptOptimizationService.evolutionaryOptimization(prompt, {
      generations,
      populationSize,
    });

    res.json({ success: true, data: result });
  })
);

// A/B test prompts
router.post(
  '/ab-test',
  validateBody(abTestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { promptA, promptB, iterations } = req.body;

    const result = await PromptOptimizationService.abTest(promptA, promptB, iterations);

    res.json({ success: true, data: result });
  })
);

// ============================================================================
// Bayesian/Evolutionary Prompt Optimization Experiments
// ============================================================================

// Run full Bayesian optimization experiment
router.post(
  '/experiments/bayesian',
  validateBody(experimentConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, config } = req.body;

    const optimizer = new BayesianPromptOptimizer(prompt, config);
    const result = await optimizer.runExperiment();

    // Store in history
    experimentHistory.set(result.experimentId, result);

    res.json({ success: true, data: result });
  })
);

// Quick optimization (simplified, fewer iterations)
router.post(
  '/experiments/quick-optimize',
  validateBody(experimentConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, config } = req.body;

    const result = await quickOptimize(prompt, config);

    // Store in history
    experimentHistory.set(result.experimentId, result);

    res.json({ success: true, data: result });
  })
);

// Compare multiple prompts
router.post(
  '/experiments/compare',
  validateBody(comparePromptsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { prompts, evaluationRounds } = req.body;

    const result = await comparePrompts(prompts, evaluationRounds);

    res.json({ success: true, data: result });
  })
);

// Get experiment history
router.get(
  '/experiments/history',
  validateQuery(paginationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };

    const experiments = Array.from(experimentHistory.values())
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        experiments,
        total: experimentHistory.size,
        limit,
        offset,
      },
    });
  })
);

// Get specific experiment by ID
router.get(
  '/experiments/:experimentId',
  asyncHandler(async (req: Request, res: Response) => {
    const { experimentId } = req.params;

    const experiment = experimentHistory.get(experimentId);

    if (!experiment) {
      throw Errors.notFound('Experiment');
    }

    res.json({ success: true, data: experiment });
  })
);

// Get experiment trials/details
router.get(
  '/experiments/:experimentId/trials',
  asyncHandler(async (req: Request, res: Response) => {
    const { experimentId } = req.params;
    const { iteration } = req.query;

    const experiment = experimentHistory.get(experimentId);

    if (!experiment) {
      throw Errors.notFound('Experiment');
    }

    let trials = experiment.trials;

    // Filter by iteration if specified
    if (iteration !== undefined) {
      trials = trials.filter(t => t.iteration === Number(iteration));
    }

    res.json({
      success: true,
      data: {
        trials,
        summary: experiment.summary,
      },
    });
  })
);

// Apply best prompt from experiment (mark as selected)
router.post(
  '/experiments/:experimentId/apply',
  asyncHandler(async (req: Request, res: Response) => {
    const { experimentId } = req.params;

    const experiment = experimentHistory.get(experimentId);

    if (!experiment) {
      throw Errors.notFound('Experiment');
    }

    res.json({
      success: true,
      data: {
        appliedPrompt: experiment.bestPrompt,
        originalPrompt: experiment.basePrompt,
        improvement: experiment.improvement,
        message: 'Best prompt has been selected for use',
      },
    });
  })
);

// Delete experiment from history
router.delete(
  '/experiments/:experimentId',
  asyncHandler(async (req: Request, res: Response) => {
    const { experimentId } = req.params;

    if (!experimentHistory.has(experimentId)) {
      throw Errors.notFound('Experiment');
    }

    experimentHistory.delete(experimentId);

    res.json({ success: true, message: 'Experiment deleted successfully' });
  })
);

// Get optimization statistics
router.get(
  '/experiments/stats/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const experiments = Array.from(experimentHistory.values());

    if (experiments.length === 0) {
      res.json({
        success: true,
        data: {
          totalExperiments: 0,
          avgImprovement: 0,
          totalTrials: 0,
          mostEffectiveMutation: null,
        },
      });
      return;
    }

    const totalExperiments = experiments.length;
    const avgImprovement = experiments.reduce((sum, e) => sum + e.improvement, 0) / totalExperiments;
    const totalTrials = experiments.reduce((sum, e) => sum + e.trials.length, 0);

    // Calculate most effective mutation across all experiments
    const mutationScores: Record<string, number[]> = {};
    for (const exp of experiments) {
      for (const [type, score] of Object.entries(exp.summary.mutationEffectiveness)) {
        if (!mutationScores[type]) {
          mutationScores[type] = [];
        }
        mutationScores[type].push(score);
      }
    }

    let mostEffectiveMutation: string | null = null;
    let highestAvgScore = 0;
    for (const [type, scores] of Object.entries(mutationScores)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > highestAvgScore) {
        highestAvgScore = avg;
        mostEffectiveMutation = type;
      }
    }

    res.json({
      success: true,
      data: {
        totalExperiments,
        avgImprovement: avgImprovement.toFixed(2),
        totalTrials,
        mostEffectiveMutation,
        mutationEffectiveness: Object.fromEntries(
          Object.entries(mutationScores).map(([type, scores]) => [
            type,
            (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3),
          ])
        ),
      },
    });
  })
);

export default router;
