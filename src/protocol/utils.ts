/**
 * Protocol utility functions for MCP Flow
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  FlowErrorCode,
  SessionId,
  InteractionPrompt,
  InteractionResponse,
  ProgressInfo,
} from './types';

/**
 * Generates a unique session ID
 */
export function generateSessionId(): SessionId {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Creates a JSON-RPC error object
 */
export function createError(
  code: number | FlowErrorCode,
  message: string,
  data?: unknown
): JsonRpcError {
  return { code, message, data };
}

/**
 * Creates a JSON-RPC response
 */
export function createResponse(
  id: string | number,
  result?: unknown,
  error?: JsonRpcError
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
    error,
  };
}

/**
 * Creates a JSON-RPC request
 */
export function createRequest(
  method: string,
  params?: Record<string, unknown>,
  id?: string | number
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id: id ?? generateRequestId(),
  };
}

/**
 * Standard error factories
 */
export const Errors = {
  sessionNotFound: (sessionId: SessionId) =>
    createError(FlowErrorCode.SESSION_NOT_FOUND, `Session not found: ${sessionId}`),

  sessionExpired: (sessionId: SessionId) =>
    createError(FlowErrorCode.SESSION_EXPIRED, `Session expired: ${sessionId}`),

  invalidStateTransition: (from: string, to: string) =>
    createError(
      FlowErrorCode.INVALID_STATE_TRANSITION,
      `Invalid state transition from ${from} to ${to}`
    ),

  validationFailed: (message: string) =>
    createError(FlowErrorCode.VALIDATION_FAILED, message),

  timeout: (sessionId: SessionId) =>
    createError(FlowErrorCode.TIMEOUT, `Session timed out: ${sessionId}`),

  alreadyCancelled: (sessionId: SessionId) =>
    createError(FlowErrorCode.ALREADY_CANCELLED, `Session already cancelled: ${sessionId}`),

  notInteractive: () =>
    createError(FlowErrorCode.NOT_INTERACTIVE, 'Server does not support interactive mode'),

  invalidMethod: (method: string) =>
    createError(-32601, `Method not found: ${method}`),

  invalidParams: (message: string) =>
    createError(-32602, `Invalid params: ${message}`),

  internalError: (message: string) =>
    createError(-32603, `Internal error: ${message}`),
};

/**
 * Request builders for each interaction method
 */
export const RequestBuilders = {
  start: (
    toolName: string,
    initialParams?: Record<string, unknown>,
    context?: Record<string, unknown>,
    timeout?: number
  ) =>
    createRequest('interaction.start', {
      toolName,
      initialParams,
      context,
      timeout,
    }),

  prompt: (
    sessionId: SessionId,
    prompt: InteractionPrompt,
    progress?: ProgressInfo
  ) =>
    createRequest('interaction.prompt', {
      sessionId,
      prompt,
      progress,
    }),

  respond: (sessionId: SessionId, response: InteractionResponse) =>
    createRequest('interaction.respond', {
      sessionId,
      response,
    }),

  continue: (
    sessionId: SessionId,
    nextPrompt?: InteractionPrompt,
    progress?: ProgressInfo
  ) =>
    createRequest('interaction.continue', {
      sessionId,
      nextPrompt,
      progress,
    }),

  complete: (sessionId: SessionId, result: unknown, summary?: string) =>
    createRequest('interaction.complete', {
      sessionId,
      result,
      summary,
    }),

  cancel: (sessionId: SessionId, reason?: string) =>
    createRequest('interaction.cancel', {
      sessionId,
      reason,
    }),

  getState: (sessionId: SessionId) =>
    createRequest('interaction.getState', {
      sessionId,
    }),
};

/**
 * Type guards for protocol messages
 */
export const TypeGuards = {
  isRequest: (obj: unknown): obj is JsonRpcRequest => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'jsonrpc' in obj &&
      'method' in obj
    );
  },

  isResponse: (obj: unknown): obj is JsonRpcResponse => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'jsonrpc' in obj &&
      'id' in obj &&
      ('result' in obj || 'error' in obj)
    );
  },

  isError: (obj: unknown): obj is JsonRpcError => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'code' in obj &&
      'message' in obj
    );
  },
};
