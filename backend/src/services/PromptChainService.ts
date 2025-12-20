import prisma from '../lib/prisma';

export interface ChainStage {
  id: string;
  name: string;
  prompt: string;
  expectedOutput?: string;
  order: number;
  dependencies?: string[]; // IDs of previous stages this depends on
}

export interface ChainContext {
  variables: Record<string, any>;
  stageOutputs: Record<string, string>;
  metadata: Record<string, any>;
}

export interface ChainExecutionResult {
  success: boolean;
  results: Record<string, any>;
  totalDuration: number;
  totalCost?: number;
  errors?: string[];
}

export class PromptChainService {
  /**
   * Create a new prompt chain
   */
  static async createChain(
    promptId: string,
    data: {
      name: string;
      description?: string;
      stages: ChainStage[];
    }
  ) {
    return await prisma.promptChain.create({
      data: {
        promptId,
        name: data.name,
        description: data.description,
        stages: data.stages,
        contextMemory: {},
      },
    });
  }

  /**
   * Execute a prompt chain
   */
  static async executeChain(
    chainId: string,
    initialContext: Record<string, any> = {}
  ): Promise<ChainExecutionResult> {
    const startTime = Date.now();

    const chain = await prisma.promptChain.findUnique({
      where: { id: chainId },
    });

    if (!chain) {
      throw new Error('Chain not found');
    }

    const stages = chain.stages as any as ChainStage[];
    const context: ChainContext = {
      variables: { ...initialContext },
      stageOutputs: {},
      metadata: {},
    };

    const errors: string[] = [];
    let totalCost = 0;

    // Execute stages in order
    for (const stage of stages.sort((a, b) => a.order - b.order)) {
      try {
        // Check dependencies
        if (stage.dependencies && stage.dependencies.length > 0) {
          const missingDeps = stage.dependencies.filter(
            dep => !context.stageOutputs[dep]
          );

          if (missingDeps.length > 0) {
            throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
          }
        }

        // Build stage prompt with context
        const stagePrompt = this.interpolatePrompt(stage.prompt, context);

        // Execute stage (placeholder - in real implementation, call LLM)
        const stageResult = await this.executeStage(stagePrompt, stage);

        // Store result
        context.stageOutputs[stage.id] = stageResult.output;
        context.metadata[`${stage.id}_duration`] = stageResult.duration;
        totalCost += stageResult.cost || 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Stage ${stage.name} failed: ${errorMessage}`);

        // Save failed execution
        await this.saveExecution(chainId, context.stageOutputs, Date.now() - startTime, totalCost, false, errorMessage);

        return {
          success: false,
          results: context.stageOutputs,
          totalDuration: Date.now() - startTime,
          totalCost,
          errors,
        };
      }
    }

    const totalDuration = Date.now() - startTime;

    // Save successful execution
    await this.saveExecution(chainId, context.stageOutputs, totalDuration, totalCost, true);

    // Update chain context memory
    await this.updateContextMemory(chainId, context);

    return {
      success: true,
      results: context.stageOutputs,
      totalDuration,
      totalCost,
    };
  }

  /**
   * Interpolate prompt with context variables
   */
  private static interpolatePrompt(
    prompt: string,
    context: ChainContext
  ): string {
    let interpolated = prompt;

    // Replace stage outputs
    Object.entries(context.stageOutputs).forEach(([stageId, output]) => {
      interpolated = interpolated.replace(
        new RegExp(`\\{\\{${stageId}\\}\\}`, 'g'),
        output
      );
    });

    // Replace variables
    Object.entries(context.variables).forEach(([key, value]) => {
      interpolated = interpolated.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(value)
      );
    });

    return interpolated;
  }

  /**
   * Execute a single stage
   */
  private static async executeStage(
    prompt: string,
    stage: ChainStage
  ): Promise<{
    output: string;
    duration: number;
    cost?: number;
  }> {
    const startTime = Date.now();

    // Placeholder implementation
    // In real implementation, this would call an LLM service
    const output = `Result from stage "${stage.name}": Processing prompt of ${prompt.length} characters`;

    const duration = Date.now() - startTime;
    const cost = prompt.length * 0.00001; // Rough estimate

    return { output, duration, cost };
  }

  /**
   * Save chain execution
   */
  private static async saveExecution(
    chainId: string,
    stageResults: Record<string, any>,
    duration: number,
    cost: number,
    success: boolean,
    errorMessage?: string
  ) {
    return await prisma.chainExecution.create({
      data: {
        chainId,
        stageResults,
        totalDuration: duration,
        totalCost: cost,
        success,
        errorMessage,
      },
    });
  }

  /**
   * Update chain context memory
   */
  private static async updateContextMemory(
    chainId: string,
    context: ChainContext
  ) {
    // Get existing memory
    const chain = await prisma.promptChain.findUnique({
      where: { id: chainId },
      select: { contextMemory: true },
    });

    const existingMemory = (chain?.contextMemory as Record<string, any>) || {};

    // Merge with new context
    const updatedMemory = {
      ...existingMemory,
      lastExecution: new Date().toISOString(),
      recentOutputs: Object.entries(context.stageOutputs).map(([stageId, output]) => ({
        stageId,
        output: output.substring(0, 500), // Store truncated version
        timestamp: new Date().toISOString(),
      })),
    };

    await prisma.promptChain.update({
      where: { id: chainId },
      data: { contextMemory: updatedMemory },
    });
  }

  /**
   * Get chain execution history
   */
  static async getExecutionHistory(
    chainId: string,
    options: { limit?: number; offset?: number } = {}
  ) {
    const { limit = 20, offset = 0 } = options;

    return await prisma.chainExecution.findMany({
      where: { chainId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Analyze chain performance
   */
  static async analyzeChainPerformance(chainId: string) {
    const executions = await prisma.chainExecution.findMany({
      where: { chainId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (executions.length === 0) {
      return null;
    }

    const successCount = executions.filter(e => e.success).length;
    const avgDuration = executions.reduce((sum, e) => sum + e.totalDuration, 0) / executions.length;
    const avgCost = executions.reduce((sum, e) => sum + (e.totalCost || 0), 0) / executions.length;

    const recentExecutions = executions.slice(0, 10);
    const recentSuccessRate = recentExecutions.filter(e => e.success).length / recentExecutions.length;

    return {
      totalExecutions: executions.length,
      successRate: successCount / executions.length,
      recentSuccessRate,
      avgDuration,
      avgCost,
      trends: {
        improving: recentSuccessRate > successCount / executions.length,
      },
    };
  }

  /**
   * Create predefined chain templates
   */
  static async createAnalysisPipeline(promptId: string, name: string) {
    const stages: ChainStage[] = [
      {
        id: 'analyze',
        name: 'Analysis',
        prompt: 'Analyze the following input and identify key themes, entities, and concepts:\n\n{{input}}',
        order: 0,
      },
      {
        id: 'plan',
        name: 'Planning',
        prompt: 'Based on this analysis:\n{{analyze}}\n\nCreate a structured plan to address the task.',
        order: 1,
        dependencies: ['analyze'],
      },
      {
        id: 'draft',
        name: 'Drafting',
        prompt: 'Following this plan:\n{{plan}}\n\nCreate a comprehensive draft response.',
        order: 2,
        dependencies: ['plan'],
      },
      {
        id: 'review',
        name: 'Review',
        prompt: 'Review this draft for accuracy, completeness, and quality:\n{{draft}}\n\nProvide feedback and suggestions.',
        order: 3,
        dependencies: ['draft'],
      },
      {
        id: 'finalize',
        name: 'Finalization',
        prompt: 'Incorporate this feedback:\n{{review}}\n\nInto the draft:\n{{draft}}\n\nTo produce the final output.',
        order: 4,
        dependencies: ['draft', 'review'],
      },
    ];

    return await this.createChain(promptId, {
      name,
      description: 'Multi-stage analysis pipeline: Analyze → Plan → Draft → Review → Finalize',
      stages,
    });
  }
}
