/**
 * MCP Server Factory
 *
 * Creates and configures MCP server instances for different deployment scenarios.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOLS } from "./tools.js";
import { ToolHandler } from "./handlers.js";

export interface MCPServerConfig {
  name?: string;
  version?: string;
  enableResources?: boolean;
}

/**
 * Create a configured MCP server instance
 */
export function createMCPServer(config: MCPServerConfig = {}): Server {
  const {
    name = "promptstudio-mcp",
    version = "1.0.0",
    enableResources = true,
  } = config;

  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: enableResources ? {} : undefined,
      },
    }
  );

  const handler = new ToolHandler();

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handler.handle(name, args || {});
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
            text: JSON.stringify({ error: errorMessage }),
          } as TextContent,
        ],
        isError: true,
      };
    }
  });

  // Register resource handlers if enabled
  if (enableResources) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await handler.listResources();
      return { resources };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const contents = await handler.readResource(request.params.uri);
      return { contents };
    });
  }

  return server;
}

/**
 * Start MCP server with stdio transport
 */
export async function startStdioServer(config?: MCPServerConfig): Promise<void> {
  const server = createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PromptStudio MCP Server running on stdio");
}
