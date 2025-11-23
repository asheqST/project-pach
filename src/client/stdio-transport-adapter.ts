/**
 * Stdio Transport Adapter
 * Bridges MCP SDK StdioClientTransport to InteractiveClient's Transport interface
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { JsonRpcRequest, JsonRpcResponse } from '../protocol/types.js';
import type { Transport } from './interactive-client.js';

export interface StdioTransportConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Adapts MCP SDK StdioClientTransport to work with InteractiveClient
 */
export class StdioTransportAdapter implements Transport {
  private mcpTransport: StdioClientTransport;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private messageQueue: JSONRPCMessage[] = [];
  private isStarted = false;

  constructor(config: StdioTransportConfig) {
    this.mcpTransport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    // Set up message handler
    this.mcpTransport.onmessage = (message: JSONRPCMessage) => {
      this.handleMessage(message);
    };

    // Set up error handler
    this.mcpTransport.onerror = (error: Error) => {
      console.error('Transport error:', error);
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.pendingRequests.delete(id);
      }
    };

    // Set up close handler
    this.mcpTransport.onclose = () => {
      // Reject all pending requests
      const error = new Error('Transport closed');
      for (const [id, pending] of this.pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.pendingRequests.delete(id);
      }
    };
  }

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (!this.isStarted) {
      await this.mcpTransport.start();
      this.isStarted = true;
    }
  }

  /**
   * Send a request and wait for response
   */
  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.isStarted) {
      await this.start();
    }

    return new Promise((resolve, reject) => {
      const id = request.id;
      if (id === undefined || id === null) {
        reject(new Error('Request must have an id'));
        return;
      }

      // Set up timeout (30 seconds)
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 30000);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send the request
      this.mcpTransport
        .send(request as unknown as JSONRPCMessage)
        .catch((error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        });
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: JSONRPCMessage): void {
    // Check if this is a response to a pending request
    if ('id' in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        pending.resolve(message as JsonRpcResponse);
        return;
      }
    }

    // If not a pending request, queue it (notifications, etc.)
    this.messageQueue.push(message);
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    // Reject all pending requests
    const error = new Error('Transport closing');
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }

    await this.mcpTransport.close();
    this.isStarted = false;
  }
}
