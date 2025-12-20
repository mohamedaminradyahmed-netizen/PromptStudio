import { Router, Request, Response } from 'express';
import { RAGService } from '../../services/RAGService';

const router = Router();

// Create knowledge base
router.post('/knowledge-bases', async (req: Request, res: Response) => {
  try {
    const { name, description, domain, embeddingModel, chunkSize, chunkOverlap } = req.body;

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
    res.status(500).json({ error: 'Failed to create knowledge base' });
  }
});

// Add documents to knowledge base
router.post('/knowledge-bases/:id/documents', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { documents } = req.body;

    const addedDocs = await RAGService.addToKnowledgeBase(id, documents);

    res.json({ count: addedDocs.length, documents: addedDocs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add documents' });
  }
});

// Retrieve context for query
router.post('/knowledge-bases/:id/retrieve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { query, topK, minRelevance, minTrust } = req.body;

    const context = await RAGService.retrieveContext(id, query, {
      topK,
      minRelevance,
      minTrust,
    });

    res.json(context);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve context' });
  }
});

// Build RAG-enhanced prompt
router.post('/build-prompt', async (req: Request, res: Response) => {
  try {
    const { originalPrompt, knowledgeBaseId, query, options } = req.body;

    const context = await RAGService.retrieveContext(knowledgeBaseId, query, options);
    const ragPrompt = RAGService.buildRAGPrompt(originalPrompt, context, options);

    res.json({ ragPrompt, context });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build RAG prompt' });
  }
});

// Update trust scores
router.post('/knowledge-bases/:id/trust-scores', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    await RAGService.updateTrustScores(id, feedback);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update trust scores' });
  }
});

// Chunk text
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const { text, chunkSize, overlap } = req.body;

    const chunks = RAGService.chunkText(text, { chunkSize, overlap });

    res.json({ chunks, count: chunks.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to chunk text' });
  }
});

export default router;
