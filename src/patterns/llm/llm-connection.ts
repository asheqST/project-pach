/**
 * LLM Connection Pattern
 * Main pattern class for calling external LLMs from MCP tools
 */

import { ToolExecutionContext } from '../../server/interactive-server';
import { BaseLLMProvider } from './providers/base-provider';
import { LLMMessage, LLMResponse, LLMTool, ProviderConfig, AdvancedConfig, LLMTokenSummary } from './types';
import { LLMTokenTracker } from './token-tracker';
import { RetryHandler } from './retry-handler';

export interface LLMConnectionConfig {
  primary: ProviderConfig;
  advanced?: AdvancedConfig;
  trackTokens?: boolean;
}

/**
 * LLM Connection Pattern
 * Enables tool developers to call external LLMs from within tool implementations
 */
export class LLMConnection {
  private primaryProvider: BaseLLMProvider;
  private fallbackProviders: BaseLLMProvider[] = [];
  private tokenTracker?: LLMTokenTracker;
  private retryHandler: RetryHandler;
  private config: LLMConnectionConfig;

  constructor(config: LLMConnectionConfig, provider: BaseLLMProvider, fallbackProviders?: BaseLLMProvider[]) {
    this.config = config;
    this.primaryProvider = provider;
    this.fallbackProviders = fallbackProviders || [];

    if (config.trackTokens !== false) {
      this.tokenTracker = new LLMTokenTracker();
    }

    this.retryHandler = new RetryHandler(config.advanced?.retry);
  }

  /**
   * Execute LLM chat completion
   * @param context - Tool execution context (for future use with progress updates)
   * @param messages - Array of messages in unified format
   * @param options - Optional parameters like tools for function calling
   * @returns Promise resolving to LLM response
   */
  async execute(
    context: ToolExecutionContext,
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[];
    }
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const response = await this.retryHandler.execute(async () => {
        return await this.primaryProvider.chat(messages, options);
      });

      // Track tokens
      if (this.tokenTracker) {
        this.tokenTracker.recordCall({
          provider: this.config.primary.provider,
          model: this.config.primary.model,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
          latencyMs: response.metadata?.latencyMs || (Date.now() - startTime),
          timestamp: Date.now(),
          hasToolCalls: !!response.toolCalls && response.toolCalls.length > 0,
          cached: response.metadata?.cached || false,
        });
      }

      return response;
    } catch (error) {
      // Try fallback providers if configured
      if (this.fallbackProviders.length > 0) {
        return this.executeFallback(context, messages, options, error);
      }
      throw error;
    }
  }

  /**
   * Execute with fallback providers
   * @param _context - Tool execution context (unused, for future use)
   * @param messages - Messages
   * @param options - Options
   * @param originalError - Original error that triggered fallback
   * @returns Promise resolving to LLM response
   */
  private async executeFallback(
    _context: ToolExecutionContext,
    messages: LLMMessage[],
    options: any,
    originalError: any
  ): Promise<LLMResponse> {
    for (const provider of this.fallbackProviders) {
      try {
        const response = await provider.chat(messages, options);

        // Track fallback usage
        if (this.tokenTracker) {
          this.tokenTracker.recordCall({
            provider: this.config.advanced?.fallback?.providers[0]?.provider || this.config.primary.provider,
            model: this.config.advanced?.fallback?.providers[0]?.model || this.config.primary.model,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            latencyMs: response.metadata?.latencyMs || 0,
            timestamp: Date.now(),
            hasToolCalls: !!response.toolCalls,
            cached: false,
          });
        }

        return response;
      } catch (fallbackError) {
        // Continue to next fallback
        continue;
      }
    }

    // All fallbacks failed, throw original error
    throw originalError;
  }

  /**
   * Get token usage summary
   * @returns Token summary
   * @throws Error if token tracking is disabled
   */
  getTokenSummary(): LLMTokenSummary {
    if (!this.tokenTracker) {
      throw new Error('Token tracking is disabled. Enable with trackTokens: true');
    }
    return this.tokenTracker.getSummary();
  }

  /**
   * Reset token tracking
   */
  resetTokenTracking(): void {
    if (this.tokenTracker) {
      this.tokenTracker.reset();
    }
  }

  /**
   * Get the underlying provider client for advanced usage
   * @returns Provider client
   */
  getProviderClient(): unknown {
    return this.primaryProvider.getClient();
  }

  /**
   * Test connection to provider
   * @returns Promise resolving to true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    return this.primaryProvider.testConnection();
  }
}
