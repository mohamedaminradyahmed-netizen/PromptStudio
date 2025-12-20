/**
 * PromptStudio MCP Server
 *
 * Model Context Protocol server providing unified access to:
 * - RAG operations (ingest, retrieve, context building)
 * - Knowledge base management
 * - Prompt optimization and analysis
 *
 * Can run in stdio mode for direct integration with AI assistants
 * or as an HTTP server for web-based access.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { VectorService } from "../services/VectorService.js";
import { AdaptiveRAGService } from "../services/AdaptiveRAGService.js";

// Initialize services
const prisma = new PrismaClient();
const vectorService = new VectorService();
const ragService = new AdaptiveRAGService();

/**
 * Tool Definitions
 */
const TOOLS: Tool[] = [
  // ============== Knowledge Base Tools ==============
  {
    name: "create_knowledge_base",
    description: "Create a new knowledge base for storing documents",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the knowledge base",
        },
        description: {
          type: "string",
          description: "Description of the knowledge base",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_knowledge_bases",
    description: "List all available knowledge bases",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ============== Document Ingestion Tools ==============
  {
    name: "ingest_document",
    description:
      "Ingest a document into a knowledge base. The document will be chunked and embedded for semantic search.",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the target knowledge base",
        },
        title: {
          type: "string",
          description: "Document title",
        },
        content: {
          type: "string",
          description: "Document content to ingest",
        },
        source: {
          type: "string",
          description: "Source URL or reference",
        },
        trust_score: {
          type: "number",
          description: "Trust score from 0 to 1 (default: 0.5)",
        },
      },
      required: ["knowledge_base_id", "title", "content"],
    },
  },
  {
    name: "ingest_url",
    description: "Fetch and ingest content from a URL",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the target knowledge base",
        },
        url: {
          type: "string",
          description: "URL to fetch and ingest",
        },
        title: {
          type: "string",
          description: "Optional title override",
        },
      },
      required: ["knowledge_base_id", "url"],
    },
  },

  // ============== Retrieval Tools ==============
  {
    name: "search_documents",
    description:
      "Search for documents relevant to a query using semantic similarity",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        knowledge_base_id: {
          type: "string",
          description: "Knowledge base to search",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default: 5)",
        },
        min_similarity: {
          type: "number",
          description: "Minimum similarity threshold 0-1 (default: 0.7)",
        },
        use_hybrid: {
          type: "boolean",
          description: "Use hybrid search with trust weighting (default: true)",
        },
      },
      required: ["query", "knowledge_base_id"],
    },
  },
  {
    name: "build_context",
    description:
      "Build context for a prompt by retrieving and combining relevant documents",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The prompt/query to build context for",
        },
        knowledge_base_ids: {
          type: "array",
          items: { type: "string" },
          description: "Knowledge bases to search",
        },
        max_tokens: {
          type: "number",
          description: "Maximum context tokens (default: 4000)",
        },
        include_citations: {
          type: "boolean",
          description: "Include source citations (default: true)",
        },
      },
      required: ["query", "knowledge_base_ids"],
    },
  },

  // ============== Trust & Verification Tools ==============
  {
    name: "update_trust_score",
    description: "Update the trust score for a document",
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Document ID",
        },
        trust_score: {
          type: "number",
          description: "New trust score (0-1)",
        },
      },
      required: ["document_id", "trust_score"],
    },
  },
  {
    name: "verify_document",
    description: "Mark a document as verified, boosting its trust score",
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Document ID to verify",
        },
      },
      required: ["document_id"],
    },
  },

  // ============== Analysis Tools ==============
  {
    name: "analyze_prompt",
    description: "Analyze a prompt for clarity, effectiveness, and potential issues",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Prompt to analyze",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_rag_stats",
    description: "Get statistics about the RAG system",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Create and configure MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: "promptstudio-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args || {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          } as TextContent,
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          } as TextContent,
        ],
        isError: true,
      };
    }
  });

  // Handle list resources request
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // List knowledge bases as resources
    const knowledgeBases = await prisma.knowledgeBase.findMany();

    return {
      resources: knowledgeBases.map((kb) => ({
        uri: `promptstudio://knowledge-base/${kb.id}`,
        name: kb.name,
        description: kb.description || "Knowledge base",
        mimeType: "application/json",
      })),
    };
  });

  // Handle read resource request
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Parse the URI
    const match = uri.match(/^promptstudio:\/\/knowledge-base\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const kbId = match[1];
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            source: true,
            trustScore: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(kb, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * Handle tool calls
 */
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // Knowledge Base Tools
    case "create_knowledge_base": {
      const kb = await prisma.knowledgeBase.create({
        data: {
          name: args.name as string,
          description: args.description as string | undefined,
        },
      });
      return { id: kb.id, name: kb.name, message: "Knowledge base created" };
    }

    case "list_knowledge_bases": {
      const kbs = await prisma.knowledgeBase.findMany({
        include: {
          _count: {
            select: { documents: true },
          },
        },
      });
      return kbs.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        documentCount: kb._count.documents,
        createdAt: kb.createdAt,
      }));
    }

    // Document Ingestion Tools
    case "ingest_document": {
      const result = await vectorService.ingestDocument({
        knowledgeBaseId: args.knowledge_base_id as string,
        title: args.title as string,
        content: args.content as string,
        source: args.source as string | undefined,
        trustScore: (args.trust_score as number) || 0.5,
      });
      return result;
    }

    case "ingest_url": {
      // Fetch URL content and ingest
      const url = args.url as string;
      const response = await fetch(url);
      const content = await response.text();

      const result = await vectorService.ingestDocument({
        knowledgeBaseId: args.knowledge_base_id as string,
        title: (args.title as string) || url,
        content,
        source: url,
        trustScore: 0.5,
      });
      return result;
    }

    // Retrieval Tools
    case "search_documents": {
      const useHybrid = args.use_hybrid !== false;

      if (useHybrid) {
        const results = await vectorService.hybridSearch(
          args.query as string,
          args.knowledge_base_id as string,
          {
            maxResults: (args.max_results as number) || 5,
            minSimilarity: (args.min_similarity as number) || 0.7,
            minTrust: 0.5,
            trustWeight: 0.3,
          }
        );
        return results;
      } else {
        const results = await vectorService.similaritySearch(
          args.query as string,
          args.knowledge_base_id as string,
          {
            maxResults: (args.max_results as number) || 5,
            minSimilarity: (args.min_similarity as number) || 0.7,
          }
        );
        return results;
      }
    }

    case "build_context": {
      const context = await ragService.retrieveAdaptiveContext(
        args.query as string,
        args.knowledge_base_ids as string[],
        {
          maxContextTokens: (args.max_tokens as number) || 4000,
          minRelevance: 0.6,
          includeCitations: args.include_citations !== false,
        }
      );
      return context;
    }

    // Trust Tools
    case "update_trust_score": {
      const updated = await prisma.knowledgeDocument.update({
        where: { id: args.document_id as string },
        data: {
          trustScore: args.trust_score as number,
          updatedAt: new Date(),
        },
      });
      return { id: updated.id, trustScore: updated.trustScore };
    }

    case "verify_document": {
      const verified = await prisma.knowledgeDocument.update({
        where: { id: args.document_id as string },
        data: {
          isVerified: true,
          trustScore: 0.9,
          updatedAt: new Date(),
        },
      });
      return { id: verified.id, isVerified: true, trustScore: verified.trustScore };
    }

    // Analysis Tools
    case "analyze_prompt": {
      // Simple prompt analysis (in production, would use LLM)
      const prompt = args.prompt as string;
      const wordCount = prompt.split(/\s+/).length;
      const hasContext = prompt.includes("context") || prompt.includes("given");
      const hasInstructions = prompt.includes("please") || prompt.includes("should");

      return {
        wordCount,
        estimatedTokens: Math.ceil(wordCount * 1.3),
        hasContext,
        hasInstructions,
        clarity: wordCount > 10 && wordCount < 500 ? "good" : "review",
        suggestions: [
          wordCount < 10 ? "Consider adding more detail" : null,
          !hasContext ? "Consider providing context" : null,
          !hasInstructions ? "Consider adding clear instructions" : null,
        ].filter(Boolean),
      };
    }

    case "get_rag_stats": {
      const [kbCount, docCount] = await Promise.all([
        prisma.knowledgeBase.count(),
        prisma.knowledgeDocument.count(),
      ]);

      const avgTrust = await prisma.knowledgeDocument.aggregate({
        _avg: { trustScore: true },
      });

      return {
        totalKnowledgeBases: kbCount,
        totalDocuments: docCount,
        averageTrustScore: avgTrust._avg.trustScore || 0,
        embeddingDimensions: 1536,
        vectorIndexType: "hnsw",
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  const server = createServer();

  // Check if running in stdio mode
  const isStdio = process.argv.includes("--stdio");

  if (isStdio) {
    // Run as stdio transport for direct integration
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("PromptStudio MCP Server running on stdio");
  } else {
    // Run as HTTP server (future implementation)
    console.log("PromptStudio MCP Server");
    console.log("Use --stdio flag for stdio transport mode");
    console.log("\nAvailable tools:");
    TOOLS.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
  }
}

// Handle cleanup
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(console.error);
