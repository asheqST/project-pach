/**
 * MCP SDK Adapter for MCP Flow
 *
 * Bridges MCP Flow with the official @modelcontextprotocol/sdk
 * Allows existing MCP servers to easily add interactive capabilities
 */

import { InteractiveServer, InteractiveTool } from '../server';
import { JsonRpcRequest, JsonRpcResponse } from '../protocol';

/**
 * MCP SDK Server interface (matches official SDK structure)
 */
export interface MCPServer {
  setRequestHandler(
    schema: { method: string },
    handler: (request: any) => Promise<any>
  ): void;
  connect(transport: any): Promise<void>;
}

/**
 * Adapter configuration
 */
export interface MCPFlowAdapterConfig {
  sessionTimeout?: number;
  maxSessions?: number;
  enableValidation?: boolean;
}

/**
 * MCP Flow Adapter for official TypeScript SDK
 *
 * Usage:
 * ```typescript
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 * import { MCPFlowAdapter } from 'mcp-flow/adapters/sdk';
 *
 * const server = new Server({ name: 'my-server', version: '1.0.0' }, { capabilities: {} });
 * const flowAdapter = new MCPFlowAdapter(server);
 *
 * // Add interactive tool
 * flowAdapter.addInteractiveTool({
 *   name: 'wizard',
 *   description: 'Interactive wizard',
 *   async execute(context) {
 *     const response = await context.prompt({ type: 'text', message: 'Enter name:' });
 *     return { name: response.value };
 *   }
 * });
 * ```
 */
export class MCPFlowAdapter {
  private mcpServer: MCPServer;
  private flowServer: InteractiveServer;
  private initialized: boolean = false;

  constructor(mcpServer: MCPServer, config: MCPFlowAdapterConfig = {}) {
    this.mcpServer = mcpServer;
    this.flowServer = new InteractiveServer({
      session: {
        defaultTimeout: config.sessionTimeout ?? 300000,
        maxSessions: config.maxSessions ?? 1000,
      },
    });
  }

  /**
   * Initialize the adapter and register handlers with MCP server
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Wrap the initialize handler to include MCP Flow capabilities
    this.mcpServer.setRequestHandler(
      { method: 'initialize' },
      async (request: any) => {
        const baseResponse = {
          protocolVersion: '2024-11-05',
          serverInfo: request.params?.clientInfo || {},
          capabilities: {
            tools: {},
            experimental: {
              interactive: this.flowServer.getCapabilities(),
            },
          },
        };
        return baseResponse;
      }
    );

    // Register MCP Flow interaction handlers
    this.registerInteractionHandlers();

    this.initialized = true;
  }

  /**
   * Add an interactive tool to the server
   */
  addInteractiveTool(tool: InteractiveTool): void {
    this.flowServer.registerTool(tool);
  }

  /**
   * Remove an interactive tool
   */
  removeInteractiveTool(toolName: string): boolean {
    return this.flowServer.unregisterTool(toolName);
  }

  /**
   * Get the underlying MCP Flow server (for advanced usage)
   */
  getFlowServer(): InteractiveServer {
    return this.flowServer;
  }

  /**
   * Register all interaction-related request handlers
   */
  private registerInteractionHandlers(): void {
    const interactionMethods = [
      'interaction.start',
      'interaction.respond',
      'interaction.cancel',
      'interaction.getState',
    ];

    interactionMethods.forEach((method) => {
      this.mcpServer.setRequestHandler({ method }, async (request: any) => {
        const jsonRpcRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: request.id ?? 0,
          method: request.method || method,
          params: request.params,
        };

        const response = await this.flowServer.handleRequest(jsonRpcRequest);
        return response.result || response.error;
      });
    });
  }
}

/**
 * Helper function to wrap an existing MCP server with MCP Flow
 *
 * @example
 * ```typescript
 * const server = new Server(info, options);
 * const enhanced = withMCPFlow(server);
 *
 * enhanced.addInteractiveTool({
 *   name: 'my-tool',
 *   description: 'My interactive tool',
 *   execute: async (context) => { ... }
 * });
 * ```
 */
export function withMCPFlow(
  mcpServer: MCPServer,
  config?: MCPFlowAdapterConfig
): MCPFlowAdapter {
  const adapter = new MCPFlowAdapter(mcpServer, config);
  adapter.initialize();
  return adapter;
}

/**
 * Convert a standard MCP tool to an interactive tool wrapper
 * Allows gradual migration of existing tools
 */
export function wrapMCPTool(
  name: string,
  description: string,
  inputSchema: any,
  handler: (args: any) => Promise<any>
): InteractiveTool {
  return {
    name,
    description,
    async execute(context) {
      // For now, just execute with initial params
      // Can be enhanced to prompt for missing params
      const args = context.initialParams || {};

      // Validate against schema (basic)
      const missingRequired = [];
      if (inputSchema.required) {
        for (const field of inputSchema.required) {
          if (!(field in args)) {
            missingRequired.push(field);
          }
        }
      }

      // If missing required fields, prompt for them
      if (missingRequired.length > 0) {
        for (const field of missingRequired) {
          const property = inputSchema.properties?.[field];
          const response = await context.prompt({
            type: property?.type === 'number' ? 'number' : 'text',
            message: `Enter ${field}:`,
            validation: { required: true },
          });
          args[field] = response.value;
        }
      }

      return await handler(args);
    },
  };
}
