/**
 * MCP Tool Definitions for PromptStudio
 *
 * Defines all available tools for the MCP server including:
 * - Knowledge base management
 * - Document ingestion
 * - Semantic retrieval
 * - Trust management
 * - Prompt analysis
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Knowledge Base Management Tools
 */
export const KNOWLEDGE_BASE_TOOLS: Tool[] = [
  {
    name: "create_knowledge_base",
    description:
      "Create a new knowledge base for storing and organizing documents. Knowledge bases are containers that group related documents for semantic search.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the knowledge base (e.g., 'Technical Documentation', 'Product FAQs')",
        },
        description: {
          type: "string",
          description: "Description explaining the purpose and contents of this knowledge base",
        },
        metadata: {
          type: "object",
          description: "Optional metadata object for custom properties",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_knowledge_bases",
    description:
      "List all available knowledge bases with their document counts and statistics",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_knowledge_base",
    description: "Get detailed information about a specific knowledge base",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the knowledge base to retrieve",
        },
      },
      required: ["knowledge_base_id"],
    },
  },
  {
    name: "delete_knowledge_base",
    description:
      "Delete a knowledge base and all its documents. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the knowledge base to delete",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deletion",
        },
      },
      required: ["knowledge_base_id", "confirm"],
    },
  },
];

/**
 * Document Ingestion Tools
 */
export const INGESTION_TOOLS: Tool[] = [
  {
    name: "ingest_document",
    description:
      "Ingest a document into a knowledge base. The document will be automatically chunked, embedded, and indexed for semantic search. Supports various chunking strategies.",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the target knowledge base",
        },
        title: {
          type: "string",
          description: "Document title for identification and display",
        },
        content: {
          type: "string",
          description: "The full text content of the document to ingest",
        },
        source: {
          type: "string",
          description: "Source URL, file path, or reference for attribution",
        },
        trust_score: {
          type: "number",
          description:
            "Initial trust score from 0 to 1. Higher scores boost document ranking in search results. Default: 0.5",
        },
        chunking_strategy: {
          type: "string",
          enum: ["fixed_size", "sentence", "paragraph", "semantic"],
          description:
            "How to split the document into chunks. 'semantic' (default) tries to keep related content together.",
        },
        chunk_size: {
          type: "number",
          description: "Target chunk size in tokens (100-4096). Default: 512",
        },
        chunk_overlap: {
          type: "number",
          description: "Overlap between chunks in tokens (0-500). Default: 50",
        },
        metadata: {
          type: "object",
          description: "Custom metadata to attach to the document",
        },
      },
      required: ["knowledge_base_id", "title", "content"],
    },
  },
  {
    name: "ingest_url",
    description:
      "Fetch content from a URL and ingest it into a knowledge base. Automatically extracts text content from web pages.",
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
          description: "Optional title override. If not provided, page title will be used.",
        },
        trust_score: {
          type: "number",
          description: "Initial trust score from 0 to 1. Default: 0.5",
        },
      },
      required: ["knowledge_base_id", "url"],
    },
  },
  {
    name: "batch_ingest",
    description:
      "Ingest multiple documents at once. More efficient than individual ingestion for bulk loading.",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "ID of the target knowledge base",
        },
        documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              source: { type: "string" },
              trust_score: { type: "number" },
              metadata: { type: "object" },
            },
            required: ["title", "content"],
          },
          description: "Array of documents to ingest",
        },
      },
      required: ["knowledge_base_id", "documents"],
    },
  },
];

/**
 * Retrieval Tools
 */
export const RETRIEVAL_TOOLS: Tool[] = [
  {
    name: "search_documents",
    description:
      "Search for documents relevant to a query using semantic similarity. Returns ranked results with similarity scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        knowledge_base_id: {
          type: "string",
          description: "Knowledge base to search within",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (1-50). Default: 5",
        },
        min_similarity: {
          type: "number",
          description:
            "Minimum similarity threshold 0-1. Results below this are filtered out. Default: 0.7",
        },
        min_trust: {
          type: "number",
          description:
            "Minimum trust score filter. Only return documents with trust >= this value. Default: 0.5",
        },
        use_hybrid: {
          type: "boolean",
          description:
            "Use hybrid search that combines vector similarity with trust scores. Default: true",
        },
        trust_weight: {
          type: "number",
          description: "Weight for trust score in hybrid ranking (0-1). Default: 0.3",
        },
      },
      required: ["query", "knowledge_base_id"],
    },
  },
  {
    name: "build_context",
    description:
      "Build RAG context for a prompt by retrieving and combining relevant documents from multiple knowledge bases. Returns formatted context with source citations.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The prompt or question to build context for",
        },
        knowledge_base_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of knowledge base IDs to search across",
        },
        max_tokens: {
          type: "number",
          description:
            "Maximum tokens for the combined context (100-32000). Default: 4000",
        },
        min_relevance: {
          type: "number",
          description: "Minimum relevance score for included documents. Default: 0.6",
        },
        include_citations: {
          type: "boolean",
          description: "Include source citations in the context. Default: true",
        },
        summarize_chunks: {
          type: "boolean",
          description:
            "Summarize long chunks to fit more content. Default: false",
        },
      },
      required: ["query", "knowledge_base_ids"],
    },
  },
  {
    name: "get_document",
    description: "Get the full content and metadata of a specific document",
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "ID of the document to retrieve",
        },
      },
      required: ["document_id"],
    },
  },
];

/**
 * Trust & Verification Tools
 */
export const TRUST_TOOLS: Tool[] = [
  {
    name: "update_trust_score",
    description:
      "Update the trust score for a document. Higher trust scores boost document ranking in search results.",
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "ID of the document to update",
        },
        trust_score: {
          type: "number",
          description: "New trust score from 0 to 1",
        },
        reason: {
          type: "string",
          description: "Optional reason for the trust score change",
        },
      },
      required: ["document_id", "trust_score"],
    },
  },
  {
    name: "verify_document",
    description:
      "Mark a document as verified. Verified documents receive a trust boost and are prioritized in search results.",
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "ID of the document to verify",
        },
        verification_method: {
          type: "string",
          description: "Method used to verify (e.g., 'manual_review', 'source_check')",
        },
        verifier_notes: {
          type: "string",
          description: "Optional notes about the verification",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "register_trusted_source",
    description:
      "Register a source URL/domain as trusted. Documents from trusted sources automatically receive higher trust scores.",
    inputSchema: {
      type: "object",
      properties: {
        source_url: {
          type: "string",
          description: "URL or domain pattern to trust (e.g., 'docs.example.com')",
        },
        name: {
          type: "string",
          description: "Name for this trusted source",
        },
        trust_level: {
          type: "number",
          description: "Trust level to assign (0-1). Default: 0.8",
        },
      },
      required: ["source_url", "name"],
    },
  },
];

/**
 * Analysis Tools
 */
export const ANALYSIS_TOOLS: Tool[] = [
  {
    name: "analyze_prompt",
    description:
      "Analyze a prompt for clarity, effectiveness, and potential issues. Returns improvement suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt text to analyze",
        },
        context: {
          type: "string",
          description: "Optional context about how the prompt will be used",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_rag_stats",
    description:
      "Get statistics about the RAG system including document counts, average trust scores, and index info.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "estimate_cost",
    description:
      "Estimate the token cost for an operation (ingestion, retrieval, or context building).",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["ingest", "retrieve", "context"],
          description: "Type of operation",
        },
        content_length: {
          type: "number",
          description: "Approximate content length in characters",
        },
        model: {
          type: "string",
          description: "Target model for cost estimation. Default: gpt-4",
        },
      },
      required: ["operation", "content_length"],
    },
  },
];

/**
 * All tools combined
 */
export const TOOLS: Tool[] = [
  ...KNOWLEDGE_BASE_TOOLS,
  ...INGESTION_TOOLS,
  ...RETRIEVAL_TOOLS,
  ...TRUST_TOOLS,
  ...ANALYSIS_TOOLS,
];

/**
 * Tool categories for documentation
 */
export const TOOL_CATEGORIES = {
  "Knowledge Base Management": KNOWLEDGE_BASE_TOOLS,
  "Document Ingestion": INGESTION_TOOLS,
  "Retrieval & Search": RETRIEVAL_TOOLS,
  "Trust & Verification": TRUST_TOOLS,
  "Analysis & Stats": ANALYSIS_TOOLS,
};
