/**
 * Interactive MCP Server
 * Reference implementation of MCP Flow server
 *
 * This server uses MCP SDK protocol types and can integrate with MCP SDK transports
 * (stdio, SSE) instead of reimplementing the protocol from scratch.
 */

import EventEmitter from 'eventemitter3';
import { SessionManager, SessionConfig } from '../session/manager';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  SessionId,
  InteractionState,
  InteractionPrompt,
  InteractionResponse,
  InteractiveCapabilities,
} from '../protocol/types';
import {
  createResponse,
  Errors,
  generateSessionId,
} from '../protocol/utils';
import { validateResponse, normalizeResponse } from '../protocol/validator';

export interface InteractiveTool {
  name: string;
  description: string;
  execute: (
    context: ToolExecutionContext
  ) => Promise<unknown> | unknown;
}

export interface ToolExecutionContext {
  sessionId: SessionId;
  initialParams?: Record<string, unknown>;
  context?: Record<string, unknown>;

  // Methods available to tools during execution
  prompt: (prompt: InteractionPrompt) => Promise<InteractionResponse>;
  setData: (key: string, value: unknown) => void;
  getData: (key?: string) => unknown;
  updateProgress: (current: number, total: number, message?: string) => void;
}

export interface ServerConfig {
  session?: SessionConfig;
  capabilities?: Partial<InteractiveCapabilities>;
}

export interface ServerEvents {
  request: (request: JsonRpcRequest) => void;
  response: (response: JsonRpcResponse) => void;
  error: (error: Error) => void;
  toolStarted: (sessionId: SessionId, toolName: string) => void;
  toolCompleted: (sessionId: SessionId, result: unknown) => void;
}

/**
 * Interactive MCP Server implementation
 * Uses MCP SDK protocol types instead of reimplementing them
 * Can integrate with MCP SDK transports (stdio, SSE)
 */
export class InteractiveServer extends EventEmitter<ServerEvents> {
  private sessionManager: SessionManager;
  private tools: Map<string, InteractiveTool> = new Map();
  private pendingPrompts: Map<SessionId, (response: InteractionResponse) => void> = new Map();
  private capabilities: InteractiveCapabilities;

  constructor(config: ServerConfig = {}) {
    super();

    this.sessionManager = new SessionManager(config.session);

    this.capabilities = {
      interactive: true,
      version: '0.1.0',
      features: {
        statefulSessions: true,
        progressTracking: true,
        validation: true,
        multiplePromptTypes: true,
        sessionPersistence: false,
        ...config.capabilities?.features,
      },
    };

    this.setupEventHandlers();
  }

  /**
   * Registers an interactive tool
   */
  registerTool(tool: InteractiveTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregisters a tool
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Gets server capabilities
   */
  getCapabilities(): InteractiveCapabilities {
    return this.capabilities;
  }

  /**
   * Handles incoming JSON-RPC requests
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.emit('request', request);

    try {
      const response = await this.processRequest(request);
      this.emit('response', response);
      return response;
    } catch (error) {
      const errorResponse = createResponse(
        request.id ?? 0,
        undefined,
        Errors.internalError((error as Error).message)
      );
      this.emit('response', errorResponse);
      return errorResponse;
    }
  }

  /**
   * Processes different request types
   */
  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params, id ?? 0);

      case 'interaction.start':
        return this.handleStart(params, id ?? 0);

      case 'interaction.respond':
        return this.handleRespond(params, id ?? 0);

      case 'interaction.cancel':
        return this.handleCancel(params, id ?? 0);

      case 'interaction.getState':
        return this.handleGetState(params, id ?? 0);

      case 'capabilities':
        // Legacy support - redirects to initialize
        return this.handleInitialize(params, id ?? 0);

      default:
        return createResponse(id ?? 0, undefined, Errors.invalidMethod(method));
    }
  }

  /**
   * Handles interaction.start
   */
  private async handleStart(
    params: Record<string, unknown> = {},
    id: string | number
  ): Promise<JsonRpcResponse> {
    const { toolName, initialParams, context, timeout } = params as {
      toolName: string;
      initialParams?: Record<string, unknown>;
      context?: Record<string, unknown>;
      timeout?: number;
    };

    const tool = this.tools.get(toolName);
    if (!tool) {
      return createResponse(id, undefined, Errors.invalidParams(`Tool not found: ${toolName}`));
    }

    const sessionId = generateSessionId();
    const session = this.sessionManager.createSession(sessionId, toolName, context, timeout);

    this.emit('toolStarted', sessionId, toolName);

    // Execute tool asynchronously
    this.executeTool(sessionId, tool, initialParams, context).catch((error) => {
      this.sessionManager.errorSession(sessionId, error);
      this.emit('error', error);
    });

    return createResponse(id, {
      sessionId,
      state: session.state,
    });
  }

  /**
   * Handles interaction.respond
   */
  private async handleRespond(
    params: Record<string, unknown> = {},
    id: string | number
  ): Promise<JsonRpcResponse> {
    const { sessionId, response } = params as {
      sessionId: SessionId;
      response: InteractionResponse;
    };

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return createResponse(id, undefined, Errors.sessionNotFound(sessionId));
    }

    if (!session.currentPrompt) {
      return createResponse(id, undefined, Errors.invalidParams('No active prompt'));
    }

    // Validate response
    const validation = validateResponse(response, session.currentPrompt);
    if (!validation.valid) {
      return createResponse(id, {
        accepted: false,
        validation,
      });
    }

    // Normalize and accept response
    const normalizedValue = normalizeResponse(response.value, session.currentPrompt.type);
    const normalizedResponse: InteractionResponse = {
      ...response,
      value: normalizedValue,
    };

    // Add to history
    this.sessionManager.addTurn(sessionId, undefined, normalizedResponse);
    this.sessionManager.updateState(sessionId, InteractionState.PROCESSING);

    // Resolve pending prompt
    const resolver = this.pendingPrompts.get(sessionId);
    if (resolver) {
      resolver(normalizedResponse);
      this.pendingPrompts.delete(sessionId);
    }

    return createResponse(id, {
      accepted: true,
      validation,
    });
  }

  /**
   * Handles interaction.cancel
   */
  private async handleCancel(
    params: Record<string, unknown> = {},
    id: string | number
  ): Promise<JsonRpcResponse> {
    const { sessionId, reason } = params as {
      sessionId: SessionId;
      reason?: string;
    };

    if (!this.sessionManager.hasSession(sessionId)) {
      return createResponse(id, undefined, Errors.sessionNotFound(sessionId));
    }

    this.sessionManager.cancelSession(sessionId, reason);

    return createResponse(id, {
      cancelled: true,
    });
  }

  /**
   * Handles interaction.getState
   */
  private async handleGetState(
    params: Record<string, unknown> = {},
    id: string | number
  ): Promise<JsonRpcResponse> {
    const { sessionId } = params as { sessionId: SessionId };

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return createResponse(id, undefined, Errors.sessionNotFound(sessionId));
    }

    return createResponse(id, session);
  }

  /**
   * Handles initialize request (MCP standard)
   * Returns server information and capabilities
   */
  private handleInitialize(
    _params: Record<string, unknown> = {},
    id: string | number
  ): JsonRpcResponse {
    const protocolVersion = '2024-11-05';
    const serverInfo = {
      name: 'mcp-flow-server',
      version: '0.1.0',
    };

    return createResponse(id, {
      protocolVersion,
      serverInfo,
      capabilities: {
        // Standard MCP capabilities (if any)
        // For now, we're only adding experimental interactive features
        experimental: {
          // MCP Flow interactive capabilities as experimental extension
          interactive: this.capabilities,
        },
      },
    });
  }

  /**
   * Executes a tool with interactive context
   */
  private async executeTool(
    sessionId: SessionId,
    tool: InteractiveTool,
    initialParams?: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<void> {
    this.sessionManager.updateState(sessionId, InteractionState.ACTIVE);

    const executionContext: ToolExecutionContext = {
      sessionId,
      initialParams,
      context,

      prompt: async (prompt: InteractionPrompt): Promise<InteractionResponse> => {
        return this.promptUser(sessionId, prompt);
      },

      setData: (key: string, value: unknown) => {
        this.sessionManager.setData(sessionId, key, value);
      },

      getData: (key?: string) => {
        return this.sessionManager.getData(sessionId, key);
      },

      updateProgress: (_current: number, _total: number, _message?: string) => {
        // Progress updates can be emitted as events
        // Implementation depends on transport layer
      },
    };

    try {
      const result = await tool.execute(executionContext);
      this.sessionManager.completeSession(sessionId, result);
      this.emit('toolCompleted', sessionId, result);
    } catch (error) {
      this.sessionManager.errorSession(sessionId, error as Error);
      throw error;
    }
  }

  /**
   * Prompts user and waits for response
   */
  private async promptUser(
    sessionId: SessionId,
    prompt: InteractionPrompt
  ): Promise<InteractionResponse> {
    // Add prompt to history
    this.sessionManager.addTurn(sessionId, prompt, undefined);
    this.sessionManager.updateState(sessionId, InteractionState.WAITING_USER);

    // Wait for response
    return new Promise((resolve) => {
      this.pendingPrompts.set(sessionId, resolve);
    });
  }

  /**
   * Sets up internal event handlers for session lifecycle
   */
  private setupEventHandlers(): void {
    this.sessionManager.on('expired', (sessionId) => {
      this.pendingPrompts.delete(sessionId);
    });

    this.sessionManager.on('cancelled', (sessionId) => {
      const resolver = this.pendingPrompts.get(sessionId);
      if (resolver) {
        // Clean up pending prompt
        this.pendingPrompts.delete(sessionId);
      }
    });
  }

  /**
   * Cleans up server resources
   * Call this before shutting down the server
   */
  destroy(): void {
    this.sessionManager.destroy();
    this.tools.clear();
    this.pendingPrompts.clear();
    this.removeAllListeners();
  }
}
