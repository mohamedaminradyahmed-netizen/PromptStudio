import { PromptService } from './PromptService';
import OpenAI from 'openai';
import { config } from '../config/index.js';

export interface ThoughtNode {
  id: string;
  content: string;
  score: number;
  children: ThoughtNode[];
  depth: number;
  reasoning?: string;
}

export interface ReasoningPath {
  nodes: ThoughtNode[];
  totalScore: number;
  finalAnswer: string;
}

export interface ToolPlan {
  toolName: string;
  reason: string;
  parameters: Record<string, any>;
  order: number;
}

export class LLMServiceAdapter {
  /**
   * Execute Tree-of-Thought reasoning
   */
  static async executeTreeOfThought(
    prompt: string,
    options: {
      maxDepth?: number;
      branchingFactor?: number;
      evaluationCriteria?: string[];
    } = {}
  ): Promise<ReasoningPath> {
    const { maxDepth = 3, branchingFactor = 3, evaluationCriteria = ['coherence', 'relevance', 'completeness'] } = options;

    // Build the reasoning tree
    const root: ThoughtNode = {
      id: 'root',
      content: prompt,
      score: 1.0,
      children: [],
      depth: 0,
    };

    await this.expandNode(root, maxDepth, branchingFactor);

    // Find the best path
    const bestPath = this.findBestPath(root, evaluationCriteria);

    return bestPath;
  }

  /**
   * Expand a thought node recursively
   */
  private static async expandNode(
    node: ThoughtNode,
    maxDepth: number,
    branchingFactor: number
  ): Promise<void> {
    if (node.depth >= maxDepth) {
      return;
    }

    // Generate child thoughts
    for (let i = 0; i < branchingFactor; i++) {
      const childThought = await this.generateThought(node.content, i);
      const childScore = await this.evaluateThought(childThought);

      const childNode: ThoughtNode = {
        id: `${node.id}-${i}`,
        content: childThought,
        score: childScore,
        children: [],
        depth: node.depth + 1,
      };

      node.children.push(childNode);

      // Recursively expand if promising
      if (childScore > 0.6) {
        await this.expandNode(childNode, maxDepth, branchingFactor);
      }
    }
  }

  /**
   * Generate a thought continuation using LLM
   */
  private static async generateThought(context: string, variant: number): Promise<string> {
    if (!config.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const openai = new OpenAI({ apiKey: config.openai.apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert reasoning assistant. Generate a thoughtful continuation or reasoning step based on the given context. Be specific and analytical.',
        },
        {
          role: 'user',
          content: `Context: ${context}\n\nGenerate reasoning step variant ${variant + 1}. Explore a different angle or approach.`,
        },
      ],
      temperature: 0.7 + (variant * 0.1),
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || `Thought continuation ${variant}`;
  }

  /**
   * Evaluate a thought using LLM-as-a-Judge
   */
  private static async evaluateThought(thought: string, criteria: string[] = ['coherence', 'relevance', 'completeness']): Promise<number> {
    if (!config.openai.apiKey) {
      // Fallback to heuristic evaluation
      return this.heuristicEvaluateThought(thought);
    }

    const openai = new OpenAI({ apiKey: config.openai.apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an expert evaluator. Evaluate the following thought based on these criteria: ${criteria.join(', ')}. Return ONLY a JSON object with a 'score' field (0-1) and a 'reasoning' field explaining your evaluation.`,
        },
        {
          role: 'user',
          content: `Evaluate this thought:\n\n${thought}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    try {
      const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 0.5}');
      return Math.min(Math.max(result.score || 0.5, 0), 1);
    } catch {
      return this.heuristicEvaluateThought(thought);
    }
  }

  /**
   * Fallback heuristic evaluation
   */
  private static heuristicEvaluateThought(thought: string): number {
    let score = 0.5;

    // Check for coherence (presence of connecting words)
    const connectingWords = ['therefore', 'thus', 'because', 'since', 'however', 'moreover'];
    const hasCoherence = connectingWords.some(word => thought.toLowerCase().includes(word));
    if (hasCoherence) score += 0.2;

    // Check for length (not too short)
    if (thought.length > 50) score += 0.1;

    // Check for specificity (numbers, facts)
    if (/\d+/.test(thought)) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Find the best reasoning path through the tree
   */
  private static findBestPath(root: ThoughtNode, criteria: string[]): ReasoningPath {
    let bestPath: ThoughtNode[] = [];
    let bestScore = 0;

    const explorePath = (node: ThoughtNode, currentPath: ThoughtNode[], currentScore: number) => {
      currentPath.push(node);
      currentScore += node.score;

      if (node.children.length === 0) {
        // Leaf node - check if this is the best path
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestPath = [...currentPath];
        }
      } else {
        // Continue exploring children
        for (const child of node.children) {
          explorePath(child, currentPath, currentScore);
        }
      }

      currentPath.pop();
    };

    explorePath(root, [], 0);

    return {
      nodes: bestPath,
      totalScore: bestScore,
      finalAnswer: bestPath.length > 0 ? bestPath[bestPath.length - 1].content : '',
    };
  }

  /**
   * Execute Graph-of-Thought reasoning
   */
  static async executeGraphOfThought(
    prompt: string,
    options: {
      maxNodes?: number;
      connectionThreshold?: number;
    } = {}
  ): Promise<{
    nodes: ThoughtNode[];
    connections: Array<{ from: string; to: string; weight: number }>;
    synthesis: string;
  }> {
    const { maxNodes = 10, connectionThreshold = 0.5 } = options;

    const nodes: ThoughtNode[] = [];
    const connections: Array<{ from: string; to: string; weight: number }> = [];

    // Generate initial thoughts
    for (let i = 0; i < maxNodes; i++) {
      const thought = await this.generateThought(prompt, i);
      const score = await this.evaluateThought(thought);

      nodes.push({
        id: `node-${i}`,
        content: thought,
        score,
        children: [],
        depth: 0,
      });
    }

    // Find connections between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.calculateSimilarity(nodes[i].content, nodes[j].content);
        if (similarity > connectionThreshold) {
          connections.push({
            from: nodes[i].id,
            to: nodes[j].id,
            weight: similarity,
          });
        }
      }
    }

    // Synthesize final answer from the graph
    const synthesis = this.synthesizeFromGraph(nodes, connections);

    return { nodes, connections, synthesis };
  }

  /**
   * Calculate similarity between two texts
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Synthesize final answer from graph
   */
  private static synthesizeFromGraph(
    nodes: ThoughtNode[],
    connections: Array<{ from: string; to: string; weight: number }>
  ): string {
    // Find the most connected and highest-scored nodes
    const nodeScores = new Map<string, number>();

    nodes.forEach(node => {
      let totalScore = node.score;

      // Add connection weights
      connections.forEach(conn => {
        if (conn.from === node.id || conn.to === node.id) {
          totalScore += conn.weight * 0.1;
        }
      });

      nodeScores.set(node.id, totalScore);
    });

    // Get top nodes
    const sortedNodes = nodes.sort((a, b) =>
      (nodeScores.get(b.id) || 0) - (nodeScores.get(a.id) || 0)
    );

    const topThoughts = sortedNodes.slice(0, 3).map(n => n.content);
    return `Synthesized answer:\n${topThoughts.join('\n\n')}`;
  }

  /**
   * Generate tool usage plan
   */
  static async generateToolPlan(
    prompt: string,
    availableTools: Array<{ name: string; description: string }>
  ): Promise<ToolPlan[]> {
    const plan: ToolPlan[] = [];

    // Analyze prompt to determine which tools are needed
    const lowerPrompt = prompt.toLowerCase();

    availableTools.forEach((tool, index) => {
      // Simple keyword matching (in real implementation, use LLM)
      const toolKeywords = tool.description.toLowerCase().split(/\s+/);
      const matches = toolKeywords.filter(kw => lowerPrompt.includes(kw));

      if (matches.length > 0) {
        plan.push({
          toolName: tool.name,
          reason: `Tool matches ${matches.length} keywords in the prompt`,
          parameters: {},
          order: index,
        });
      }
    });

    // Sort by relevance
    plan.sort((a, b) => {
      const aMatches = a.reason.match(/\d+/)?.[0] || '0';
      const bMatches = b.reason.match(/\d+/)?.[0] || '0';
      return parseInt(bMatches) - parseInt(aMatches);
    });

    return plan;
  }

  /**
   * Self-refine a prompt based on execution results
   */
  static async selfRefinePrompt(
    originalPrompt: string,
    executionResult: string,
    qualityMetrics: {
      accuracy?: number;
      completeness?: number;
      style?: number;
    }
  ): Promise<{
    refinedPrompt: string;
    refinementReason: string;
    improvements: string[];
  }> {
    const improvements: string[] = [];
    let refinedPrompt = originalPrompt;
    let refinementReason = '';

    // Analyze quality metrics
    const avgQuality = Object.values(qualityMetrics).reduce((sum, val) => sum + (val || 0), 0) /
      Object.keys(qualityMetrics).length;

    if (avgQuality < 0.7) {
      refinementReason = 'Quality metrics below threshold';

      // Check specific issues
      if ((qualityMetrics.accuracy || 0) < 0.7) {
        improvements.push('Add more specific examples');
        refinedPrompt += '\n\nPlease provide specific, accurate examples in your response.';
      }

      if ((qualityMetrics.completeness || 0) < 0.7) {
        improvements.push('Request comprehensive coverage');
        refinedPrompt += '\n\nEnsure your response covers all aspects of the question comprehensively.';
      }

      if ((qualityMetrics.style || 0) < 0.7) {
        improvements.push('Clarify output format');
        refinedPrompt += '\n\nFollow a clear, structured format in your response.';
      }
    } else {
      refinementReason = 'Quality acceptable, minor optimizations applied';
      improvements.push('Optimize for clarity');
    }

    return {
      refinedPrompt,
      refinementReason,
      improvements,
    };
  }
}
