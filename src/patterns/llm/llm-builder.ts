/**
 * LLM Connection Builder
 * Fluent API for building LLM connections
 */

import { LLMConnection, LLMConnectionConfig } from './llm-connection';
import { LLMProvider, ProviderConfig } from './types';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OpenRouterProvider } from './providers/openrouter-provider';
import { OllamaProvider } from './providers/ollama-provider';
import { BaseLLMProvider } from './providers/base-provider';

/**
 * Builder for creating LLM connections with fluent API
 */
export class LLMConnectionBuilder {
  private config: Partial<LLMConnectionConfig> = {};
  private fallbackConfigs: ProviderConfig[] = [];

  /**
   * Configure OpenAI provider
   * @param model - Model name (e.g., 'gpt-4o', 'gpt-4o-mini')
   * @param options - Optional configuration
   * @returns This builder for chaining
   */
  useOpenAI(
    model: string,
    options?: {
      apiKey?: string;
      baseURL?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): this {
    this.config.primary = {
      provider: LLMProvider.OPENAI,
      model,
      apiKey: options?.apiKey,
      baseURL: options?.baseURL,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
    return this;
  }

  /**
   * Configure Anthropic provider
   * @param model - Model name (e.g., 'claude-3-5-sonnet-20241022')
   * @param options - Optional configuration
   * @returns This builder for chaining
   */
  useAnthropic(
    model: string,
    options?: {
      apiKey?: string;
      baseURL?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): this {
    this.config.primary = {
      provider: LLMProvider.ANTHROPIC,
      model,
      apiKey: options?.apiKey,
      baseURL: options?.baseURL,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
    return this;
  }

  /**
   * Configure OpenRouter provider
   * @param model - Model name (e.g., 'openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet')
   * @param options - Optional configuration
   * @returns This builder for chaining
   */
  useOpenRouter(
    model: string,
    options?: {
      apiKey?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): this {
    this.config.primary = {
      provider: LLMProvider.OPENROUTER,
      model,
      apiKey: options?.apiKey,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
    return this;
  }

  /**
   * Configure Ollama provider
   * @param model - Model name (e.g., 'llama3.1', 'qwen2.5', 'mistral')
   * @param options - Optional configuration
   * @returns This builder for chaining
   */
  useOllama(
    model: string,
    options?: {
      host?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): this {
    this.config.primary = {
      provider: LLMProvider.OLLAMA,
      model,
      baseURL: options?.host,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
    return this;
  }

  /**
   * Configure custom provider config
   * @param config - Provider configuration
   * @returns This builder for chaining
   */
  useProvider(config: ProviderConfig): this {
    this.config.primary = config;
    return this;
  }

  /**
   * Enable or disable token tracking (enabled by default)
   * @param enabled - Whether to track tokens
   * @returns This builder for chaining
   */
  withTokenTracking(enabled: boolean = true): this {
    this.config.trackTokens = enabled;
    return this;
  }

  /**
   * Configure retry behavior
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  withRetry(config: {
    maxAttempts?: number;
    backoffMs?: number;
    maxBackoffMs?: number;
    retryableStatusCodes?: number[];
  }): this {
    if (!this.config.advanced) {
      this.config.advanced = {};
    }
    this.config.advanced.retry = {
      enabled: true,
      maxAttempts: config.maxAttempts || 3,
      backoffMs: config.backoffMs || 1000,
      maxBackoffMs: config.maxBackoffMs || 30000,
      retryableStatusCodes: config.retryableStatusCodes || [408, 429, 500, 502, 503, 504],
    };
    return this;
  }

  /**
   * Configure fallback providers
   * @param providers - Fallback provider configurations
   * @returns This builder for chaining
   */
  withFallback(...providers: ProviderConfig[]): this {
    this.fallbackConfigs = providers;
    if (!this.config.advanced) {
      this.config.advanced = {};
    }
    this.config.advanced.fallback = {
      providers,
      strategy: 'sequential',
    };
    return this;
  }

  /**
   * Configure timeout
   * @param timeoutMs - Timeout in milliseconds
   * @returns This builder for chaining
   */
  withTimeout(timeoutMs: number): this {
    if (this.config.primary) {
      this.config.primary.timeout = timeoutMs;
    }
    return this;
  }

  /**
   * Configure custom headers
   * @param headers - Custom headers
   * @returns This builder for chaining
   */
  withHeaders(headers: Record<string, string>): this {
    if (this.config.primary) {
      this.config.primary.headers = headers;
    }
    return this;
  }

  /**
   * Build the LLM connection
   * @returns LLMConnection instance
   * @throws Error if no primary provider is configured
   */
  build(): LLMConnection {
    if (!this.config.primary) {
      throw new Error('Must configure a primary provider using use*() methods');
    }

    const provider = this.createProvider(this.config.primary);
    const fallbackProviders = this.fallbackConfigs.map(config => this.createProvider(config));

    return new LLMConnection(
      this.config as LLMConnectionConfig,
      provider,
      fallbackProviders
    );
  }

  /**
   * Create a provider instance from configuration
   * @param config - Provider configuration
   * @returns Provider instance
   * @throws Error if provider type is unknown
   */
  private createProvider(config: ProviderConfig): BaseLLMProvider {
    switch (config.provider) {
      case LLMProvider.OPENAI:
        return new OpenAIProvider(config);
      case LLMProvider.ANTHROPIC:
        return new AnthropicProvider(config);
      case LLMProvider.OPENROUTER:
        return new OpenRouterProvider(config);
      case LLMProvider.OLLAMA:
        return new OllamaProvider(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}
