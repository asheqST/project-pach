/**
 * Interactive MCP Client
 * Reference implementation for interacting with MCP Flow servers
 */

import EventEmitter from 'eventemitter3';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  SessionId,
  SessionState,
  InteractionPrompt,
  InteractionResponse,
  InteractiveCapabilities,
} from '../protocol/types';
import { RequestBuilders, isErrorResponse } from '../protocol/utils';

export interface ClientConfig {
  timeout?: number;
}

export interface ClientEvents {
  prompt: (sessionId: SessionId, prompt: InteractionPrompt) => void;
  completed: (sessionId: SessionId, result: unknown) => void;
  cancelled: (sessionId: SessionId) => void;
  error: (error: Error) => void;
}

/**
 * Transport interface for sending requests
 */
export interface Transport {
  send: (request: JsonRpcRequest) => Promise<JsonRpcResponse>;
}

/**
 * Interactive MCP Client
 */
export class InteractiveClient extends EventEmitter<ClientEvents> {
  private transport: Transport;
  private capabilities?: InteractiveCapabilities;

  constructor(transport: Transport, _clientConfig: ClientConfig = {}) {
    super();
    this.transport = transport;
    // Note: timeout config reserved for future implementation
  }

  /**
   * Negotiates capabilities with server using MCP initialize
   */
  async negotiate(): Promise<InteractiveCapabilities> {
    const request = {
      jsonrpc: '2.0' as const,
      id: 'init-' + Date.now(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-flow-client',
          version: '0.1.0',
        },
      },
    };

    const response = await this.transport.send(request);

    if (isErrorResponse(response)) {
      throw new Error(response.error.message);
    }

    const result = response.result as {
      capabilities?: {
        experimental?: {
          interactive?: InteractiveCapabilities;
        };
      };
    };

    // Extract interactive capabilities from experimental section
    this.capabilities =
      result.capabilities?.experimental?.interactive ||
      ({ interactive: false, version: '0.1.0', features: {} } as InteractiveCapabilities);

    return this.capabilities;
  }

  /**
   * Starts an interactive session
   */
  async startInteraction(
    toolName: string,
    initialParams?: Record<string, unknown>,
    context?: Record<string, unknown>,
    timeout?: number
  ): Promise<SessionId> {
    const request = RequestBuilders.start(toolName, initialParams, context, timeout);
    const response = await this.transport.send(request);

    if (isErrorResponse(response)) {
      throw new Error(response.error.message);
    }

    const result = response.result as { sessionId: SessionId };
    return result.sessionId;
  }

  /**
   * Responds to an interactive prompt
   */
  async respond(
    sessionId: SessionId,
    value: unknown,
    metadata?: Record<string, unknown>
  ): Promise<{ accepted: boolean; error?: string }> {
    const response: InteractionResponse = {
      value,
      timestamp: Date.now(),
      metadata,
    };

    const request = RequestBuilders.respond(sessionId, response);
    const rpcResponse = await this.transport.send(request);

    if (isErrorResponse(rpcResponse)) {
      throw new Error(rpcResponse.error.message);
    }

    const result = rpcResponse.result as {
      accepted: boolean;
      validation?: { valid: boolean; error?: string };
    };

    return {
      accepted: result.accepted,
      error: result.validation?.error,
    };
  }

  /**
   * Cancels an interaction
   */
  async cancel(sessionId: SessionId, reason?: string): Promise<void> {
    const request = RequestBuilders.cancel(sessionId, reason);
    const response = await this.transport.send(request);

    if (isErrorResponse(response)) {
      throw new Error(response.error.message);
    }

    this.emit('cancelled', sessionId);
  }

  /**
   * Gets current session state
   */
  async getState(sessionId: SessionId): Promise<SessionState> {
    const request = RequestBuilders.getState(sessionId);
    const response = await this.transport.send(request);

    if (isErrorResponse(response)) {
      throw new Error(response.error.message);
    }

    // The result contains sessionState as per our API
    const result = response.result as any;
    return result.sessionState || result;
  }

  /**
   * Runs a complete interactive session
   * Provides callback for handling prompts
   */
  async runInteractive(
    toolName: string,
    promptHandler: (prompt: InteractionPrompt) => Promise<unknown>,
    initialParams?: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<unknown> {
    const sessionId = await this.startInteraction(toolName, initialParams, context);

    try {
      // Poll for prompts and completion
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const state = await this.getState(sessionId);

        if (state.state === 'completed') {
          const result = state.accumulatedData.result;
          this.emit('completed', sessionId, result);
          return result;
        }

        if (state.state === 'cancelled' || state.state === 'error') {
          throw new Error(`Session ${state.state}`);
        }

        if (state.state === 'waiting_user' && state.currentPrompt) {
          this.emit('prompt', sessionId, state.currentPrompt);

          // Get user response
          const value = await promptHandler(state.currentPrompt);

          // Send response
          const { accepted, error } = await this.respond(sessionId, value);

          if (!accepted) {
            // Retry with error feedback
            this.emit('error', new Error(error ?? 'Invalid response'));
            continue;
          }
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Checks if server supports interactive mode
   */
  isInteractive(): boolean {
    return this.capabilities?.interactive ?? false;
  }

  /**
   * Gets server capabilities
   */
  getCapabilities(): InteractiveCapabilities | undefined {
    return this.capabilities;
  }
}
