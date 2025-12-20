import { Router, Request, Response } from 'express';
import { PromptChainService } from '../../services/PromptChainService';

const router = Router();

// Create a new chain
router.post('/', async (req: Request, res: Response) => {
  try {
    const { promptId, name, description, stages } = req.body;

    const chain = await PromptChainService.createChain(promptId, {
      name,
      description,
      stages,
    });

    res.json(chain);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chain' });
  }
});

// Execute a chain
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { initialContext } = req.body;

    const result = await PromptChainService.executeChain(id, initialContext);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute chain' });
  }
});

// Get chain execution history
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;

    const history = await PromptChainService.getExecutionHistory(id, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get execution history' });
  }
});

// Analyze chain performance
router.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await PromptChainService.analyzeChainPerformance(id);

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze chain performance' });
  }
});

// Create analysis pipeline
router.post('/templates/analysis-pipeline', async (req: Request, res: Response) => {
  try {
    const { promptId, name } = req.body;

    const chain = await PromptChainService.createAnalysisPipeline(promptId, name);

    res.json(chain);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create analysis pipeline' });
  }
});

export default router;
