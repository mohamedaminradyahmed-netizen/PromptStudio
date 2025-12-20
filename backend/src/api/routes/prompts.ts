import { Router, Request, Response } from 'express';
import { PromptService } from '../../services/PromptService';
import { LLMServiceAdapter } from '../../services/LLMServiceAdapter';
import { SafetyService } from '../../services/SafetyService';
import { RAGService } from '../../services/RAGService';
import { PromptChainService } from '../../services/PromptChainService';
import { PromptOptimizationService } from '../../services/PromptOptimizationService';

const router = Router();

// Build hierarchical prompt
router.post('/build-hierarchical', async (req: Request, res: Response) => {
  try {
    const { systemPrompt, processPrompt, taskPrompt, outputPrompt } = req.body;

    const fullPrompt = PromptService.buildHierarchicalPrompt({
      systemPrompt,
      processPrompt,
      taskPrompt,
      outputPrompt,
    });

    res.json({ fullPrompt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build hierarchical prompt' });
  }
});

// Generate meta-prompt
router.post('/generate-meta', async (req: Request, res: Response) => {
  try {
    const { persona, domain, metaInstructions } = req.body;

    const metaPrompt = PromptService.generateMetaPrompt({
      persona,
      domain,
      metaInstructions,
    });

    res.json({ metaPrompt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate meta-prompt' });
  }
});

// Analyze prompt before sending
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { prompt, model } = req.body;

    const tokens = PromptService.estimateTokens(prompt);
    const cost = PromptService.estimateCost(tokens, model);
    const successProbability = await PromptService.calculateSuccessProbability(prompt);
    const safetyScore = await SafetyService.calculateSafetyScore(prompt);

    const validation = await SafetyService.validatePrompt(prompt);
    const safetyCheck = await SafetyService.performSafetyCheck(prompt);

    res.json({
      estimatedTokens: tokens,
      estimatedCost: cost,
      successProbability,
      safetyScore,
      validation,
      safetyIssues: safetyCheck.issues,
      recommendations: safetyCheck.recommendations,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze prompt' });
  }
});

// Execute Tree-of-Thought reasoning
router.post('/tree-of-thought', async (req: Request, res: Response) => {
  try {
    const { prompt, maxDepth, branchingFactor } = req.body;

    const result = await LLMServiceAdapter.executeTreeOfThought(prompt, {
      maxDepth,
      branchingFactor,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute tree-of-thought' });
  }
});

// Execute Graph-of-Thought reasoning
router.post('/graph-of-thought', async (req: Request, res: Response) => {
  try {
    const { prompt, maxNodes } = req.body;

    const result = await LLMServiceAdapter.executeGraphOfThought(prompt, {
      maxNodes,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute graph-of-thought' });
  }
});

// Generate tool plan
router.post('/tool-plan', async (req: Request, res: Response) => {
  try {
    const { prompt, availableTools } = req.body;

    const plan = await LLMServiceAdapter.generateToolPlan(prompt, availableTools);

    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate tool plan' });
  }
});

// Self-refine prompt
router.post('/self-refine', async (req: Request, res: Response) => {
  try {
    const { prompt, executionResult, qualityMetrics } = req.body;

    const refinement = await LLMServiceAdapter.selfRefinePrompt(
      prompt,
      executionResult,
      qualityMetrics
    );

    res.json(refinement);
  } catch (error) {
    res.status(500).json({ error: 'Failed to self-refine prompt' });
  }
});

// Create prompt version
router.post('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, components, refinementReason, qualityScore } = req.body;

    const version = await PromptService.createPromptVersion(
      id,
      content,
      components,
      refinementReason,
      qualityScore
    );

    res.json(version);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create prompt version' });
  }
});

// Get prompt versions
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const versions = await PromptService.getPromptVersions(id);

    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompt versions' });
  }
});

// Safety check
router.post('/safety-check', async (req: Request, res: Response) => {
  try {
    const { content, options } = req.body;

    const result = await SafetyService.performSafetyCheck(content, options);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform safety check' });
  }
});

// Optimize prompt (Bayesian)
router.post('/optimize/bayesian', async (req: Request, res: Response) => {
  try {
    const { prompt, iterations, populationSize } = req.body;

    const result = await PromptOptimizationService.bayesianOptimization(prompt, {
      iterations,
      populationSize,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to optimize prompt' });
  }
});

// Optimize prompt (Evolutionary)
router.post('/optimize/evolutionary', async (req: Request, res: Response) => {
  try {
    const { prompt, generations, populationSize } = req.body;

    const result = await PromptOptimizationService.evolutionaryOptimization(prompt, {
      generations,
      populationSize,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to optimize prompt' });
  }
});

// A/B test prompts
router.post('/ab-test', async (req: Request, res: Response) => {
  try {
    const { promptA, promptB, iterations } = req.body;

    const result = await PromptOptimizationService.abTest(promptA, promptB, iterations);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform A/B test' });
  }
});

export default router;
