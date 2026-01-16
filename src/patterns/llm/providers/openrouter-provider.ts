/**
 * OpenRouter Provider Implementation
 * Extends OpenAI provider with OpenRouter-specific configuration
 */

import { OpenAIProvider } from './openai-provider';
import { ProviderConfig, LLMProvider, LLMResponse } from '../types';

export class OpenRouterProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    const openRouterConfig: ProviderConfig = {
      ...config,
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://github.com/mcp-flow',
        'X-Title': 'MCP Flow',
        ...config.headers,
      },
    };

    super(openRouterConfig);
  }

  protected normalizeResponse(data: {
    response: any;
    latencyMs: number;
  }): LLMResponse {
    // Use parent's normalization but override provider
    const response = super.normalizeResponse(data);
    response.metadata!.provider = LLMProvider.OPENROUTER;
    return response;
  }
}
