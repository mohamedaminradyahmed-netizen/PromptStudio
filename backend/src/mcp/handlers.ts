/**
 * MCP Tool Handlers
 *
 * Implementation of all MCP tool handlers for RAG operations.
 */

import { PrismaClient } from "@prisma/client";
import { VectorService } from "../services/VectorService.js";
import { AdaptiveRAGService } from "../services/AdaptiveRAGService.js";

// Initialize services
const prisma = new PrismaClient();

/**
 * Tool Handler class for processing MCP tool calls
 */
export class ToolHandler {
  private vectorService: VectorService;
  private ragService: AdaptiveRAGService;

  constructor() {
    this.vectorService = new VectorService();
    this.ragService = new AdaptiveRAGService();
  }

  /**
   * Handle a tool call and return the result
   */
  async handle(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      // ============== Knowledge Base Tools ==============
      case "create_knowledge_base":
        return this.createKnowledgeBase(args);
      case "list_knowledge_bases":
        return this.listKnowledgeBases();
      case "get_knowledge_base":
        return this.getKnowledgeBase(args.knowledge_base_id as string);
      case "delete_knowledge_base":
        return this.deleteKnowledgeBase(args);

      // ============== Ingestion Tools ==============
      case "ingest_document":
        return this.ingestDocument(args);
      case "ingest_url":
        return this.ingestUrl(args);
      case "batch_ingest":
        return this.batchIngest(args);

      // ============== Retrieval Tools ==============
      case "search_documents":
        return this.searchDocuments(args);
      case "build_context":
        return this.buildContext(args);
      case "get_document":
        return this.getDocument(args.document_id as string);

      // ============== Trust Tools ==============
      case "update_trust_score":
        return this.updateTrustScore(args);
      case "verify_document":
        return this.verifyDocument(args);
      case "register_trusted_source":
        return this.registerTrustedSource(args);

      // ============== Analysis Tools ==============
      case "analyze_prompt":
        return this.analyzePrompt(args.prompt as string);
      case "get_rag_stats":
        return this.getRagStats();
      case "estimate_cost":
        return this.estimateCost(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ============== Knowledge Base Handlers ==============

  private async createKnowledgeBase(args: Record<string, unknown>) {
    const kb = await prisma.knowledgeBase.create({
      data: {
        name: args.name as string,
        description: args.description as string | undefined,
        metadata: (args.metadata as object) || {},
      },
    });
    return {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      createdAt: kb.createdAt,
      message: "Knowledge base created successfully",
    };
  }

  private async listKnowledgeBases() {
    const kbs = await prisma.knowledgeBase.findMany({
      include: {
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return kbs.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb._count.documents,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }));
  }

  private async getKnowledgeBase(id: string) {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        _count: { select: { documents: true } },
        documents: {
          select: {
            id: true,
            title: true,
            source: true,
            trustScore: true,
            isVerified: true,
            createdAt: true,
          },
          take: 100,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!kb) {
      throw new Error(`Knowledge base not found: ${id}`);
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb._count.documents,
      documents: kb.documents,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    };
  }

  private async deleteKnowledgeBase(args: Record<string, unknown>) {
    if (args.confirm !== true) {
      throw new Error("Deletion requires confirm: true");
    }

    const id = args.knowledge_base_id as string;

    // Delete all documents first
    await prisma.knowledgeDocument.deleteMany({
      where: { knowledgeBaseId: id },
    });

    // Delete the knowledge base
    await prisma.knowledgeBase.delete({
      where: { id },
    });

    return { message: "Knowledge base deleted", id };
  }

  // ============== Ingestion Handlers ==============

  private async ingestDocument(args: Record<string, unknown>) {
    return this.vectorService.ingestDocument({
      knowledgeBaseId: args.knowledge_base_id as string,
      title: args.title as string,
      content: args.content as string,
      source: args.source as string | undefined,
      trustScore: (args.trust_score as number) || 0.5,
      metadata: (args.metadata as Record<string, unknown>) || {},
    });
  }

  private async ingestUrl(args: Record<string, unknown>) {
    const url = args.url as string;

    // Fetch URL content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    let content = await response.text();

    // Basic HTML stripping for web pages
    if (contentType.includes("text/html")) {
      content = this.stripHtml(content);
    }

    return this.vectorService.ingestDocument({
      knowledgeBaseId: args.knowledge_base_id as string,
      title: (args.title as string) || this.extractTitle(content) || url,
      content,
      source: url,
      trustScore: (args.trust_score as number) || 0.5,
    });
  }

  private async batchIngest(args: Record<string, unknown>) {
    const kbId = args.knowledge_base_id as string;
    const documents = args.documents as Array<{
      title: string;
      content: string;
      source?: string;
      trust_score?: number;
      metadata?: object;
    }>;

    const results = [];
    let successful = 0;
    let failed = 0;

    for (const doc of documents) {
      try {
        const result = await this.vectorService.ingestDocument({
          knowledgeBaseId: kbId,
          title: doc.title,
          content: doc.content,
          source: doc.source,
          trustScore: doc.trust_score || 0.5,
          metadata: doc.metadata || {},
        });
        results.push({ title: doc.title, status: "success", ...result });
        successful++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ title: doc.title, status: "failed", error: message });
        failed++;
      }
    }

    return {
      totalDocuments: documents.length,
      successful,
      failed,
      results,
    };
  }

  // ============== Retrieval Handlers ==============

  private async searchDocuments(args: Record<string, unknown>) {
    const useHybrid = args.use_hybrid !== false;
    const options = {
      maxResults: (args.max_results as number) || 5,
      minSimilarity: (args.min_similarity as number) || 0.7,
      minTrust: (args.min_trust as number) || 0.5,
      trustWeight: (args.trust_weight as number) || 0.3,
    };

    if (useHybrid) {
      return this.vectorService.hybridSearch(
        args.query as string,
        args.knowledge_base_id as string,
        options
      );
    }

    return this.vectorService.similaritySearch(
      args.query as string,
      args.knowledge_base_id as string,
      options
    );
  }

  private async buildContext(args: Record<string, unknown>) {
    return this.ragService.retrieveAdaptiveContext(
      args.query as string,
      args.knowledge_base_ids as string[],
      {
        maxContextTokens: (args.max_tokens as number) || 4000,
        minRelevance: (args.min_relevance as number) || 0.6,
        includeCitations: args.include_citations !== false,
        summarizeChunks: (args.summarize_chunks as boolean) || false,
      }
    );
  }

  private async getDocument(id: string) {
    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
      },
    });

    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      source: doc.source,
      trustScore: doc.trustScore,
      isVerified: doc.isVerified,
      knowledgeBase: doc.knowledgeBase,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // ============== Trust Handlers ==============

  private async updateTrustScore(args: Record<string, unknown>) {
    const trustScore = args.trust_score as number;
    if (trustScore < 0 || trustScore > 1) {
      throw new Error("Trust score must be between 0 and 1");
    }

    const updated = await prisma.knowledgeDocument.update({
      where: { id: args.document_id as string },
      data: {
        trustScore,
        updatedAt: new Date(),
        metadata: {
          ...(await this.getDocumentMetadata(args.document_id as string)),
          lastTrustUpdate: new Date().toISOString(),
          trustUpdateReason: args.reason as string | undefined,
        },
      },
    });

    return {
      id: updated.id,
      trustScore: updated.trustScore,
      message: "Trust score updated",
    };
  }

  private async verifyDocument(args: Record<string, unknown>) {
    const verified = await prisma.knowledgeDocument.update({
      where: { id: args.document_id as string },
      data: {
        isVerified: true,
        trustScore: 0.9, // Boost trust for verified docs
        updatedAt: new Date(),
        metadata: {
          ...(await this.getDocumentMetadata(args.document_id as string)),
          verifiedAt: new Date().toISOString(),
          verificationMethod: args.verification_method as string | undefined,
          verifierNotes: args.verifier_notes as string | undefined,
        },
      },
    });

    return {
      id: verified.id,
      isVerified: true,
      trustScore: verified.trustScore,
      message: "Document verified",
    };
  }

  private async registerTrustedSource(args: Record<string, unknown>) {
    const source = await prisma.trustedSource.upsert({
      where: { sourceUrl: args.source_url as string },
      update: {
        name: args.name as string,
        trustLevel: (args.trust_level as number) || 0.8,
        verifiedAt: new Date(),
      },
      create: {
        sourceUrl: args.source_url as string,
        name: args.name as string,
        trustLevel: (args.trust_level as number) || 0.8,
        verificationMethod: "manual_registration",
        verifiedAt: new Date(),
      },
    });

    return {
      id: source.id,
      sourceUrl: source.sourceUrl,
      name: source.name,
      trustLevel: source.trustLevel,
      message: "Trusted source registered",
    };
  }

  // ============== Analysis Handlers ==============

  private async analyzePrompt(prompt: string) {
    const wordCount = prompt.split(/\s+/).length;
    const charCount = prompt.length;
    const sentenceCount = (prompt.match(/[.!?]+/g) || []).length || 1;

    // Analyze prompt characteristics
    const hasContext =
      /\b(context|given|based on|considering|according to)\b/i.test(prompt);
    const hasInstructions =
      /\b(please|should|must|need to|want|help|explain|describe|create|write|generate)\b/i.test(
        prompt
      );
    const hasQuestion = /\?/.test(prompt);
    const hasSpecificTask =
      /\b(step by step|list|summarize|analyze|compare|translate|convert)\b/i.test(
        prompt
      );

    // Calculate scores
    const clarityScore = Math.min(
      10,
      Math.max(1, 5 + (hasContext ? 2 : 0) + (hasInstructions ? 2 : 0) - (wordCount < 5 ? 2 : 0))
    );
    const specificityScore = Math.min(
      10,
      Math.max(1, 5 + (hasSpecificTask ? 2 : 0) + (hasQuestion ? 1 : 0) + (sentenceCount > 1 ? 1 : 0))
    );

    // Generate suggestions
    const suggestions: string[] = [];
    if (wordCount < 10) suggestions.push("Consider adding more detail to your prompt");
    if (!hasContext) suggestions.push("Consider providing context for better results");
    if (!hasInstructions) suggestions.push("Add clear instructions or action words");
    if (!hasSpecificTask) suggestions.push("Specify the exact task or output format");
    if (wordCount > 500) suggestions.push("Consider breaking into smaller, focused prompts");

    return {
      wordCount,
      charCount,
      sentenceCount,
      estimatedTokens: Math.ceil(charCount / 4),
      characteristics: {
        hasContext,
        hasInstructions,
        hasQuestion,
        hasSpecificTask,
      },
      scores: {
        clarity: clarityScore,
        specificity: specificityScore,
        overall: (clarityScore + specificityScore) / 2,
      },
      suggestions,
    };
  }

  private async getRagStats() {
    const [kbCount, docCount, avgTrust] = await Promise.all([
      prisma.knowledgeBase.count(),
      prisma.knowledgeDocument.count(),
      prisma.knowledgeDocument.aggregate({ _avg: { trustScore: true } }),
    ]);

    const verifiedCount = await prisma.knowledgeDocument.count({
      where: { isVerified: true },
    });

    return {
      totalKnowledgeBases: kbCount,
      totalDocuments: docCount,
      verifiedDocuments: verifiedCount,
      averageTrustScore: avgTrust._avg.trustScore || 0,
      embeddingDimensions: 1536,
      vectorIndexType: "hnsw",
      embeddingModel: "text-embedding-3-small",
    };
  }

  private async estimateCost(args: Record<string, unknown>) {
    const operation = args.operation as string;
    const contentLength = args.content_length as number;
    const model = (args.model as string) || "gpt-4";

    // Estimate tokens (roughly 4 chars per token)
    const estimatedTokens = Math.ceil(contentLength / 4);

    // Cost per 1K tokens (approximate)
    const costs: Record<string, { input: number; output: number }> = {
      "gpt-4": { input: 0.03, output: 0.06 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
      "text-embedding-3-small": { input: 0.00002, output: 0 },
    };

    const modelCost = costs[model] || costs["gpt-4"];
    let estimatedCost = 0;

    switch (operation) {
      case "ingest":
        // Embedding cost only
        estimatedCost = (estimatedTokens / 1000) * costs["text-embedding-3-small"].input;
        break;
      case "retrieve":
        // Query embedding + small processing
        estimatedCost = (50 / 1000) * costs["text-embedding-3-small"].input;
        break;
      case "context":
        // Query embedding + context might be used in prompt
        estimatedCost =
          (50 / 1000) * costs["text-embedding-3-small"].input +
          (estimatedTokens / 1000) * modelCost.input;
        break;
    }

    return {
      operation,
      contentLength,
      estimatedTokens,
      model,
      estimatedCostUSD: Math.round(estimatedCost * 100000) / 100000,
      note: "Estimates are approximate and may vary based on actual content",
    };
  }

  // ============== Helper Methods ==============

  private async getDocumentMetadata(id: string): Promise<Record<string, unknown>> {
    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id },
      select: { metadata: true },
    });
    return (doc?.metadata as Record<string, unknown>) || {};
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractTitle(content: string): string | null {
    const match = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : null;
  }

  // ============== Resource Handlers ==============

  async listResources() {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      include: { _count: { select: { documents: true } } },
    });

    return knowledgeBases.map((kb) => ({
      uri: `promptstudio://knowledge-base/${kb.id}`,
      name: kb.name,
      description: kb.description || `Knowledge base with ${kb._count.documents} documents`,
      mimeType: "application/json",
    }));
  }

  async readResource(uri: string) {
    const match = uri.match(/^promptstudio:\/\/knowledge-base\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const kb = await this.getKnowledgeBase(match[1]);

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(kb, null, 2),
      },
    ];
  }
}
