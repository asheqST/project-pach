/**
 * Ollama Provider Implementation
 * Uses the Ollama SDK for local models
 */

import { Ollama } from 'ollama';
import { BaseLLMProvider } from './base-provider';
import { LLMMessage, LLMResponse, LLMTool, ProviderConfig, LLMProvider } from '../types';

export class OllamaProvider extends BaseLLMProvider {
  private client: Ollama;

  constructor(config: ProviderConfig) {
    super(config);

    this.client = new Ollama({
      host: config.baseURL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    });
  }

  async chat(
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[];
    }
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const params: any = {
      model: this.config.model,
      messages: this.toProviderMessages(messages),
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
        top_p: this.config.topP,
      },
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = this.toProviderTools(options.tools);
    }

    const response = await this.client.chat(params);
    const latencyMs = Date.now() - startTime;

    return this.normalizeResponse({ response, latencyMs });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  getClient(): Ollama {
    return this.client;
  }

  protected normalizeResponse(data: {
    response: any;
    latencyMs: number;
  }): LLMResponse {
    const { response, latencyMs } = data;

    return {
      content: response.message.content || '',
      role: 'assistant',
      finishReason: 'stop',
      usage: {
        promptTokens: response.prompt_eval_count || 0,
        completionTokens: response.eval_count || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
      toolCalls: response.message.tool_calls?.map((tc: any) => ({
        id: tc.function.name, // Ollama doesn't provide ID, use name
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      metadata: {
        model: response.model,
        provider: LLMProvider.OLLAMA,
        latencyMs,
      },
    };
  }

  protected toProviderMessages(messages: LLMMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  protected toProviderTools(tools: LLMTool[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }
}
