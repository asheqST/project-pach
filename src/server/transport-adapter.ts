/**
 * Transport Adapter for MCP SDK Integration
 *
 * Connects InteractiveServer to MCP SDK transports (stdio, SSE, etc.)
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { InteractiveServer, ServerConfig } from './interactive-server.js';
import { JsonRpcRequest, JsonRpcResponse } from '../protocol/types.js';

/**
 * Adapts InteractiveServer to work with MCP SDK transports
 *
 * @example
 * ```typescript
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 * import { InteractiveServer } from 'mcp-flow';
 * import { connectTransport } from 'mcp-flow/server';
 *
 * const server = new InteractiveServer();
 * const transport = new StdioServerTransport();
 *
 * await connectTransport(server, transport);
 * ```
 */
export async function connectTransport(
  server: InteractiveServer,
  transport: Transport
): Promise<void> {
  // Handle incoming messages from transport
  transport.onmessage = async (message: JSONRPCMessage) => {
    try {
      // Convert MCP SDK message to our request type
      const request = message as JsonRpcRequest;

      // Process request through our server
      const response = await server.handleRequest(request);

      // Send response back through transport
      await transport.send(response as JSONRPCMessage);
    } catch (error) {
      // Handle errors
      if (transport.onerror) {
        transport.onerror(error as Error);
      }
    }
  };

  // Handle transport errors
  transport.onerror = (error: Error) => {
    server.emit('error', error);
  };

  // Handle transport close
  transport.onclose = () => {
    server.destroy();
  };

  // Start the transport
  await transport.start();
}

/**
 * Creates a server with MCP SDK transport already connected
 *
 * @example
 * ```typescript
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 * import { createServerWithTransport } from 'mcp-flow/server';
 *
 * const server = await createServerWithTransport(
 *   new StdioServerTransport(),
 *   {
 *     session: { defaultTimeout: 300000 }
 *   }
 * );
 *
 * // Register tools
 * server.registerTool({
 *   name: 'example',
 *   description: 'An example tool',
 *   async execute(context) {
 *     const response = await context.prompt({
 *       type: 'text',
 *       message: 'Enter something:'
 *     });
 *     return { result: response.value };
 *   }
 * });
 * ```
 */
export async function createServerWithTransport(
  transport: Transport,
  config?: ServerConfig
): Promise<InteractiveServer> {
  const { InteractiveServer } = await import('./interactive-server.js');
  const server = new InteractiveServer(config);
  await connectTransport(server, transport);
  return server;
}

/**
 * Type guard to check if a message is a request (has method)
 */
export function isRequest(message: JSONRPCMessage): message is JsonRpcRequest {
  return 'method' in message && typeof message.method === 'string';
}

/**
 * Type guard to check if a message is a response (has result or error)
 */
export function isResponse(message: JSONRPCMessage): message is JsonRpcResponse {
  return 'result' in message || 'error' in message;
}
