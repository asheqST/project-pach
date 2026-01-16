/**
 * Base LLM Provider
 * Abstract class that all LLM provider implementations must extend
 */

import { LLMMessage, LLMResponse, LLMTool, ProviderConfig } from '../types';

export abstract class BaseLLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request (non-streaming only)
   * @param messages - Array of messages in unified format
   * @param options - Optional parameters like tools for function calling
   * @returns Promise resolving to unified LLM response
   */
  abstract chat(
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[];
    }
  ): Promise<LLMResponse>;

  /**
   * Test connection to the provider
   * @returns Promise resolving to true if connection is successful
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get the underlying provider client for advanced usage
   * @returns The native SDK client instance
   */
  abstract getClient(): unknown;

  /**
   * Normalize provider-specific response to unified format
   * @param response - Provider-specific response object
   * @returns Unified LLM response
   */
  protected abstract normalizeResponse(response: unknown): LLMResponse;

  /**
   * Convert unified messages to provider-specific format
   * @param messages - Unified message array
   * @returns Provider-specific message format
   */
  protected abstract toProviderMessages(messages: LLMMessage[]): unknown;

  /**
   * Convert unified tools to provider-specific format
   * @param tools - Unified tool definitions
   * @returns Provider-specific tool format
   */
  protected abstract toProviderTools(tools: LLMTool[]): unknown;
}
