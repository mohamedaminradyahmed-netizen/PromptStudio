import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ============================================================================
// Auth Schemas
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  avatar: z.string().url('Invalid avatar URL').optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
});

// ============================================================================
// Session Schemas
// ============================================================================

export const createSessionSchema = z.object({
  name: z.string().min(1, 'Session name is required').max(200),
  description: z.string().max(1000).optional(),
  content: z.string().optional(),
});

export const updateSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.enum(['VIEWER', 'EDITOR', 'OWNER']).default('VIEWER'),
});

export const updateMemberSchema = z.object({
  role: z.enum(['VIEWER', 'EDITOR', 'OWNER']),
});

export const createSnapshotSchema = z.object({
  name: z.string().max(200).optional(),
});

// ============================================================================
// Prompt Schemas
// ============================================================================

export const hierarchicalPromptSchema = z.object({
  systemPrompt: z.string().optional(),
  processPrompt: z.string().optional(),
  taskPrompt: z.string().optional(),
  outputPrompt: z.string().optional(),
});

export const metaPromptSchema = z.object({
  persona: z.string().optional(),
  domain: z.string().optional(),
  timeConstraint: z.string().optional(),
  metaInstructions: z.array(z.string()).optional(),
});

export const sessionMetaPromptSchema = metaPromptSchema.extend({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const analyzePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().optional(),
});

export const treeOfThoughtSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  maxDepth: z.number().int().min(1).max(10).optional(),
  branchingFactor: z.number().int().min(1).max(5).optional(),
});

export const graphOfThoughtSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  maxNodes: z.number().int().min(1).max(50).optional(),
});

export const toolPlanSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  availableTools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.any()).optional(),
  })).optional(),
  maxTools: z.number().int().min(1).max(20).optional(),
  requireApproval: z.boolean().optional(),
});

export const executePlanSchema = z.object({
  plan: z.array(z.any()),
  approved: z.boolean(),
});

export const selfRefineSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  executionResult: z.string().optional(),
  qualityMetrics: z.record(z.number()).optional(),
});

export const createVersionSchema = z.object({
  content: z.string().min(1),
  components: z.record(z.string()).optional(),
  refinementReason: z.string().optional(),
  qualityScore: z.number().min(0).max(100).optional(),
});

export const safetyCheckSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  options: z.object({
    strictMode: z.boolean().optional(),
    categories: z.array(z.string()).optional(),
  }).optional(),
});

export const bayesianOptimizeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  iterations: z.number().int().min(1).max(100).optional(),
  populationSize: z.number().int().min(1).max(50).optional(),
});

export const evolutionaryOptimizeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  generations: z.number().int().min(1).max(100).optional(),
  populationSize: z.number().int().min(1).max(50).optional(),
});

export const abTestSchema = z.object({
  promptA: z.string().min(1, 'Prompt A is required'),
  promptB: z.string().min(1, 'Prompt B is required'),
  iterations: z.number().int().min(1).max(50).optional(),
});

export const experimentConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  config: z.object({
    iterations: z.number().int().min(1).max(100).optional(),
    populationSize: z.number().int().min(1).max(50).optional(),
    mutationRate: z.number().min(0).max(1).optional(),
    crossoverRate: z.number().min(0).max(1).optional(),
    eliteRatio: z.number().min(0).max(1).optional(),
  }).optional(),
});

export const comparePromptsSchema = z.object({
  prompts: z.array(z.string().min(1)).min(2, 'At least 2 prompts are required'),
  evaluationRounds: z.number().int().min(1).max(20).optional(),
});

// ============================================================================
// Cache Schemas
// ============================================================================

export const cacheQuerySchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  threshold: z.number().min(0).max(1).optional(),
});

export const cacheStoreSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  response: z.string().min(1, 'Response is required'),
  metadata: z.record(z.any()).optional(),
});

export const cacheInvalidateSchema = z.object({
  pattern: z.string().optional(),
  ids: z.array(z.string()).optional(),
});

// ============================================================================
// RAG Schemas
// ============================================================================

export const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['documents', 'urls', 'custom']).default('documents'),
});

export const ingestDocumentSchema = z.object({
  knowledgeBaseId: z.string().min(1, 'Knowledge base ID is required'),
  content: z.string().min(1, 'Content is required'),
  metadata: z.record(z.any()).optional(),
  chunkSize: z.number().int().min(100).max(4000).optional(),
  chunkOverlap: z.number().int().min(0).max(500).optional(),
});

export const ragQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  knowledgeBaseId: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

// ============================================================================
// Chain Schemas
// ============================================================================

export const createChainSchema = z.object({
  name: z.string().min(1, 'Chain name is required').max(200),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.any()).optional(),
    dependencies: z.array(z.string()).optional(),
  })).min(1, 'At least one step is required'),
});

export const executeChainSchema = z.object({
  chainId: z.string().optional(),
  chain: z.object({
    steps: z.array(z.any()),
  }).optional(),
  input: z.record(z.any()).optional(),
  context: z.record(z.any()).optional(),
});

// ============================================================================
// Prediction Schemas
// ============================================================================

export const predictionSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string().optional(),
  options: z.object({
    includeTokens: z.boolean().optional(),
    includeCost: z.boolean().optional(),
    includeTime: z.boolean().optional(),
    includeSuccess: z.boolean().optional(),
  }).optional(),
});

export const modelComparisonSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  models: z.array(z.string()).min(1, 'At least one model is required'),
});

// ============================================================================
// Reasoning Schemas
// ============================================================================

export const reasoningSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  method: z.enum(['tree', 'graph', 'chain', 'auto']).default('auto'),
  config: z.object({
    maxDepth: z.number().int().min(1).max(10).optional(),
    maxNodes: z.number().int().min(1).max(100).optional(),
    branchingFactor: z.number().int().min(1).max(5).optional(),
  }).optional(),
});

// ============================================================================
// Refinement Schemas
// ============================================================================

export const refinementSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  feedback: z.string().optional(),
  targetMetrics: z.object({
    clarity: z.number().min(0).max(1).optional(),
    specificity: z.number().min(0).max(1).optional(),
    effectiveness: z.number().min(0).max(1).optional(),
  }).optional(),
  maxIterations: z.number().int().min(1).max(10).optional(),
});

// ============================================================================
// Translation Schemas
// ============================================================================

export const translationSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  sourceLang: z.string().min(2).max(10).optional(),
  targetLang: z.string().min(2).max(10),
});

// ============================================================================
// Type Exports
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AnalyzePromptInput = z.infer<typeof analyzePromptSchema>;
export type PredictionInput = z.infer<typeof predictionSchema>;
export type RagQueryInput = z.infer<typeof ragQuerySchema>;
export type RefinementInput = z.infer<typeof refinementSchema>;
