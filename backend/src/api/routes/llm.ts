/**
 * LLM API Routes
 *
 * REST API endpoints that proxy requests to the Python LLM backend
 * through the WebSocket bridge.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pythonBridge } from '../../websocket/index.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       required:
 *         - role
 *         - content
 *       properties:
 *         role:
 *           type: string
 *           enum: [system, user, assistant]
 *         content:
 *           type: string
 *
 *     LLMGenerateRequest:
 *       type: object
 *       required:
 *         - messages
 *       properties:
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Message'
 *         model:
 *           type: string
 *           default: gpt-4-turbo-preview
 *         provider:
 *           type: string
 *           enum: [openai, anthropic, google]
 *           default: openai
 *         temperature:
 *           type: number
 *           minimum: 0
 *           maximum: 2
 *           default: 0.7
 *         max_tokens:
 *           type: integer
 *           minimum: 1
 *           maximum: 128000
 *
 *     LLMResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         result:
 *           type: object
 *           properties:
 *             content:
 *               type: string
 *             model:
 *               type: string
 *             provider:
 *               type: string
 *             usage:
 *               type: object
 *               properties:
 *                 prompt_tokens:
 *                   type: integer
 *                 completion_tokens:
 *                   type: integer
 *                 total_tokens:
 *                   type: integer
 *             finish_reason:
 *               type: string
 *             latency_ms:
 *               type: number
 *         error:
 *           type: string
 */

// Middleware to check if Python service is available
const checkPythonService = (req: Request, res: Response, next: NextFunction) => {
  if (!pythonBridge.isServiceAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Python LLM service is not available',
      hint: 'Ensure the Python backend is running and connected',
    });
  }
  next();
};

/**
 * @swagger
 * /api/llm/generate:
 *   post:
 *     tags: [LLM]
 *     summary: Generate text using LLM
 *     description: Send a request to the Python LLM service for text generation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LLMGenerateRequest'
 *     responses:
 *       200:
 *         description: Successful generation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LLMResponse'
 *       503:
 *         description: Python service unavailable
 */
router.post('/generate', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { messages, model, provider, temperature, max_tokens } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'messages is required and must be an array',
      });
    }

    const response = await pythonBridge.generate({
      messages,
      model,
      provider,
      temperature,
      max_tokens,
    });

    res.json(response);
  } catch (error) {
    console.error('LLM generate error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/analyze:
 *   post:
 *     tags: [LLM]
 *     summary: Analyze a prompt
 *     description: Analyze a prompt for quality, clarity, and effectiveness
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *               context:
 *                 type: string
 *     responses:
 *       200:
 *         description: Analysis result
 */
router.post('/analyze', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { prompt, context } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const response = await pythonBridge.analyzePrompt({ prompt, context });
    res.json(response);
  } catch (error) {
    console.error('LLM analyze error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/refine:
 *   post:
 *     tags: [LLM]
 *     summary: Refine a prompt
 *     description: Improve and refine a prompt based on goals
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Refined prompt
 */
router.post('/refine', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { prompt, goals } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const response = await pythonBridge.refinePrompt({ prompt, goals });
    res.json(response);
  } catch (error) {
    console.error('LLM refine error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/translate:
 *   post:
 *     tags: [LLM]
 *     summary: Translate text
 *     description: Translate text between languages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - source_language
 *               - target_language
 *             properties:
 *               text:
 *                 type: string
 *               source_language:
 *                 type: string
 *               target_language:
 *                 type: string
 *     responses:
 *       200:
 *         description: Translated text
 */
router.post('/translate', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { text, source_language, target_language } = req.body;

    if (!text || !source_language || !target_language) {
      return res.status(400).json({
        success: false,
        error: 'text, source_language, and target_language are required',
      });
    }

    const response = await pythonBridge.translate({
      text,
      source_language,
      target_language,
    });
    res.json(response);
  } catch (error) {
    console.error('LLM translate error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/safety:
 *   post:
 *     tags: [LLM]
 *     summary: Check prompt safety
 *     description: Analyze a prompt for safety concerns
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Safety analysis result
 */
router.post('/safety', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const response = await pythonBridge.checkSafety({ prompt });
    res.json(response);
  } catch (error) {
    console.error('LLM safety check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/cost:
 *   post:
 *     tags: [LLM]
 *     summary: Predict cost
 *     description: Estimate the cost of running a prompt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *               expected_output_length:
 *                 type: string
 *                 enum: [short, medium, long]
 *                 default: medium
 *               model:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cost prediction
 */
router.post('/cost', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { prompt, expected_output_length, model } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const response = await pythonBridge.predictCost({
      prompt,
      expected_output_length,
      model,
    });
    res.json(response);
  } catch (error) {
    console.error('LLM cost prediction error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/status:
 *   get:
 *     tags: [LLM]
 *     summary: Get Python service status
 *     description: Check if the Python LLM service is connected and available
 *     responses:
 *       200:
 *         description: Service status
 */
router.get('/status', (req: Request, res: Response) => {
  const services = pythonBridge.getAvailableServices();
  const isAvailable = pythonBridge.isServiceAvailable();

  res.json({
    available: isAvailable,
    services: services.map(s => ({
      name: s.serviceName,
      capabilities: s.capabilities,
      connectedAt: s.connectedAt,
      lastHeartbeat: s.lastHeartbeat,
    })),
  });
});

/**
 * @swagger
 * /api/llm/commands:
 *   get:
 *     tags: [LLM]
 *     summary: List available commands
 *     description: Get a list of available YAML commands from Python service
 *     responses:
 *       200:
 *         description: List of commands
 */
router.get('/commands', checkPythonService, async (req: Request, res: Response) => {
  try {
    const response = await pythonBridge.listCommands();
    res.json(response);
  } catch (error) {
    console.error('List commands error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/commands/search:
 *   post:
 *     tags: [LLM]
 *     summary: Search commands
 *     description: Search for commands by query
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Search results
 */
router.post('/commands/search', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query is required',
      });
    }

    const response = await pythonBridge.searchCommands(query);
    res.json(response);
  } catch (error) {
    console.error('Search commands error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/llm/commands/execute:
 *   post:
 *     tags: [LLM]
 *     summary: Execute a command
 *     description: Execute a YAML command with parameters
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *               parameters:
 *                 type: object
 *               model:
 *                 type: string
 *               temperature:
 *                 type: number
 *               stream:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Command execution result
 */
router.post('/commands/execute', checkPythonService, async (req: Request, res: Response) => {
  try {
    const { command, parameters, model, temperature, stream } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'command is required',
      });
    }

    const response = await pythonBridge.executeCommand({
      command,
      parameters,
      model,
      temperature,
      stream,
    });
    res.json(response);
  } catch (error) {
    console.error('Execute command error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
