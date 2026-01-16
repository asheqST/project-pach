/**
 * OpenAI Provider Implementation
 * Uses the OpenAI SDK for chat completions
 */

import OpenAI from 'openai';
import { BaseLLMProvider } from './base-provider';
import { LLMMessage, LLMResponse, LLMTool, ProviderConfig, LLMProvider } from '../types';

export class OpenAIProvider extends BaseLLMProvider {
  protected client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);

    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseURL,
      timeout: config.timeout || 60000,
      defaultHeaders: config.headers,
    });
  }

  async chat(
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[];
    }
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.config.model,
      messages: this.toProviderMessages(messages),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      top_p: this.config.topP,
      stream: false, // Non-streaming only
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = this.toProviderTools(options.tools);
    }

    const response = await this.client.chat.completions.create(params);
    const latencyMs = Date.now() - startTime;

    return this.normalizeResponse({ response, latencyMs });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getClient(): OpenAI {
    return this.client;
  }

  protected normalizeResponse(data: {
    response: OpenAI.Chat.ChatCompletion;
    latencyMs: number;
  }): LLMResponse {
    const { response, latencyMs } = data;
    const message = response.choices[0].message;

    return {
      content: message.content || '',
      role: 'assistant',
      finishReason: this.normalizeFinishReason(response.choices[0].finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      toolCalls: message.tool_calls?.map(tc => {
        if (tc.type === 'function') {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          };
        }
        // Handle custom tools (shouldn't happen in practice)
        return {
          id: tc.id,
          name: 'unknown',
          arguments: {},
        };
      }),
      metadata: {
        model: response.model,
        provider: LLMProvider.OPENAI,
        latencyMs,
      },
    };
  }

  protected toProviderMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.tool_call_id!,
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
        name: msg.name,
        tool_calls: msg.tool_calls,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  protected toProviderTools(tools: LLMTool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  private normalizeFinishReason(
    reason: string | null
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
