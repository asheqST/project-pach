/**
 * MCP Flow Protocol Types
 * Extension to Model Context Protocol for interactive, multi-turn tool interactions
 */

/**
 * Base JSON-RPC 2.0 types compatible with MCP
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Session identifier for tracking interaction state
 */
export type SessionId = string;

/**
 * Interaction state machine states
 */
export enum InteractionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  WAITING_USER = 'waiting_user',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ERROR = 'error',
}

/**
 * Prompt types for different interaction patterns
 */
export enum PromptType {
  TEXT = 'text',
  CHOICE = 'choice',
  CONFIRM = 'confirm',
  NUMBER = 'number',
  DATE = 'date',
  FILE = 'file',
  CUSTOM = 'custom',
}

/**
 * Validation result for user inputs
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Interactive prompt sent from tool to user
 */
export interface InteractionPrompt {
  type: PromptType;
  message: string;
  placeholder?: string;
  defaultValue?: unknown;
  choices?: Array<{ value: string; label: string }>;
  validation?: {
    required?: boolean;
    pattern?: string;
    min?: number;
    max?: number;
    custom?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * User response to an interaction prompt
 */
export interface InteractionResponse {
  value: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Progress indicator for long-running interactions
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message?: string;
  percentage?: number;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  createdAt: number;
  lastActivityAt: number;
  toolName: string;
  userId?: string;
  context?: Record<string, unknown>;
}

/**
 * Session state snapshot
 */
export interface SessionState {
  sessionId: SessionId;
  state: InteractionState;
  metadata: SessionMetadata;
  history: InteractionTurn[];
  currentPrompt?: InteractionPrompt;
  accumulatedData: Record<string, unknown>;
}

/**
 * Single turn in an interaction
 */
export interface InteractionTurn {
  turnId: number;
  prompt?: InteractionPrompt;
  response?: InteractionResponse;
  timestamp: number;
}

/**
 * Message Types - Protocol Extension
 */

/**
 * interaction.start - Initiate interactive session
 */
export interface InteractionStartRequest extends JsonRpcRequest {
  method: 'interaction.start';
  params: {
    toolName: string;
    initialParams?: Record<string, unknown>;
    context?: Record<string, unknown>;
    timeout?: number;
  };
}

export interface InteractionStartResponse extends JsonRpcResponse {
  result: {
    sessionId: SessionId;
    initialPrompt?: InteractionPrompt;
    state: InteractionState;
  };
}

/**
 * interaction.prompt - Tool requests user input
 */
export interface InteractionPromptRequest extends JsonRpcRequest {
  method: 'interaction.prompt';
  params: {
    sessionId: SessionId;
    prompt: InteractionPrompt;
    progress?: ProgressInfo;
  };
}

export interface InteractionPromptResponse extends JsonRpcResponse {
  result: {
    acknowledged: boolean;
  };
}

/**
 * interaction.respond - User provides input
 */
export interface InteractionRespondRequest extends JsonRpcRequest {
  method: 'interaction.respond';
  params: {
    sessionId: SessionId;
    response: InteractionResponse;
  };
}

export interface InteractionRespondResponse extends JsonRpcResponse {
  result: {
    accepted: boolean;
    validation?: ValidationResult;
  };
}

/**
 * interaction.continue - Tool processes and continues
 */
export interface InteractionContinueRequest extends JsonRpcRequest {
  method: 'interaction.continue';
  params: {
    sessionId: SessionId;
    nextPrompt?: InteractionPrompt;
    progress?: ProgressInfo;
  };
}

export interface InteractionContinueResponse extends JsonRpcResponse {
  result: {
    state: InteractionState;
  };
}

/**
 * interaction.complete - Finalize with result
 */
export interface InteractionCompleteRequest extends JsonRpcRequest {
  method: 'interaction.complete';
  params: {
    sessionId: SessionId;
    result: unknown;
    summary?: string;
  };
}

export interface InteractionCompleteResponse extends JsonRpcResponse {
  result: {
    success: boolean;
    finalResult: unknown;
  };
}

/**
 * interaction.cancel - Cancel ongoing interaction
 */
export interface InteractionCancelRequest extends JsonRpcRequest {
  method: 'interaction.cancel';
  params: {
    sessionId: SessionId;
    reason?: string;
  };
}

export interface InteractionCancelResponse extends JsonRpcResponse {
  result: {
    cancelled: boolean;
  };
}

/**
 * interaction.getState - Retrieve current session state
 */
export interface InteractionGetStateRequest extends JsonRpcRequest {
  method: 'interaction.getState';
  params: {
    sessionId: SessionId;
  };
}

export interface InteractionGetStateResponse extends JsonRpcResponse {
  result: SessionState;
}

/**
 * Capability negotiation
 */
export interface InteractiveCapabilities {
  interactive: boolean;
  version: string;
  features: {
    statefulSessions?: boolean;
    progressTracking?: boolean;
    validation?: boolean;
    multiplePromptTypes?: boolean;
    sessionPersistence?: boolean;
  };
}

/**
 * Error codes specific to MCP Flow
 */
export enum FlowErrorCode {
  SESSION_NOT_FOUND = -32001,
  SESSION_EXPIRED = -32002,
  INVALID_STATE_TRANSITION = -32003,
  VALIDATION_FAILED = -32004,
  TIMEOUT = -32005,
  ALREADY_CANCELLED = -32006,
  NOT_INTERACTIVE = -32007,
}

/**
 * Union types for type safety
 */
export type InteractionRequest =
  | InteractionStartRequest
  | InteractionPromptRequest
  | InteractionRespondRequest
  | InteractionContinueRequest
  | InteractionCompleteRequest
  | InteractionCancelRequest
  | InteractionGetStateRequest;

export type InteractionResponseMessage =
  | InteractionStartResponse
  | InteractionPromptResponse
  | InteractionRespondResponse
  | InteractionContinueResponse
  | InteractionCompleteResponse
  | InteractionCancelResponse
  | InteractionGetStateResponse;
