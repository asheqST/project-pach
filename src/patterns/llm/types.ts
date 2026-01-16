/**
 * LLM Connection Pattern Types
 * Core type definitions for LLM provider integrations
 */

/**
 * Supported LLM providers
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OPENROUTER = 'openrouter',
  OLLAMA = 'ollama',
}

/**
 * Unified message format across all providers
 * Follows OpenAI's message structure as the common interface
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * Tool definition for function calling
 */
export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * Provider configuration options
 */
export interface ProviderConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Advanced configuration options
 */
export interface AdvancedConfig {
  retry?: {
    enabled: boolean;
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
    retryableStatusCodes: number[];
  };
  fallback?: {
    providers: ProviderConfig[];
    strategy: 'sequential' | 'fastest';
  };
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Unified LLM response format
 */
export interface LLMResponse {
  content: string;
  role: 'assistant';
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage: TokenUsage;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  metadata?: {
    model: string;
    provider: LLMProvider;
    latencyMs: number;
    cached?: boolean;
  };
}

/**
 * Call metrics for token tracking
 */
export interface LLMCallMetrics {
  callNumber: number;
  provider: LLMProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: number;
  hasToolCalls: boolean;
  cached: boolean;
}

/**
 * Token summary across multiple calls
 */
export interface LLMTokenSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averagePromptTokens: number;
  averageCompletionTokens: number;
  averageTotalTokens: number;
  averageLatencyMs: number;
  peakContextSize: number;
  toolCallsCount: number;
  cacheHitCount: number;
  providerBreakdown: Record<LLMProvider, {
    calls: number;
    tokens: number;
  }>;
  callBreakdown: LLMCallMetrics[];
}

/**
 * Custom error classes for LLM operations
 */
export class LLMConnectionError extends Error {
  constructor(
    message: string,
    public provider: LLMProvider,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'LLMConnectionError';
  }
}

export class LLMRateLimitError extends LLMConnectionError {
  constructor(provider: LLMProvider, public retryAfter?: number) {
    super(`Rate limit exceeded for ${provider}`, provider, 429);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMAuthenticationError extends LLMConnectionError {
  constructor(provider: LLMProvider) {
    super(`Authentication failed for ${provider}`, provider, 401);
    this.name = 'LLMAuthenticationError';
  }
}
