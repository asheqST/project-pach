/**
 * Anthropic Provider Implementation
 * Uses the Anthropic SDK for Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base-provider';
import { LLMMessage, LLMResponse, LLMTool, ProviderConfig, LLMProvider } from '../types';

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);

    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
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

    // Extract system message (Anthropic handles it separately)
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const params: Anthropic.MessageCreateParams = {
      model: this.config.model,
      messages: this.toProviderMessages(conversationMessages),
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      system: systemMessage,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = this.toProviderTools(options.tools);
    }

    const response = await this.client.messages.create(params);
    const latencyMs = Date.now() - startTime;

    return this.normalizeResponse({ response, latencyMs });
  }

  async testConnection(): Promise<boolean> {
    try {
      // Small test request
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  getClient(): Anthropic {
    return this.client;
  }

  protected normalizeResponse(data: {
    response: Anthropic.Message;
    latencyMs: number;
  }): LLMResponse {
    const { response, latencyMs } = data;

    // Extract text content
    const textContent = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as Anthropic.TextBlock).text)
      .join('');

    // Extract tool calls
    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => {
        const toolUse = c as Anthropic.ToolUseBlock;
        return {
          id: toolUse.id,
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
        };
      });

    return {
      content: textContent,
      role: 'assistant',
      finishReason: this.normalizeFinishReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      metadata: {
        model: response.model,
        provider: LLMProvider.ANTHROPIC,
        latencyMs,
      },
    };
  }

  protected toProviderMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id!,
              content: msg.content,
            },
          ],
        };
      }

      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      } as Anthropic.MessageParam;
    });
  }

  protected toProviderTools(tools: LLMTool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object',
        ...tool.function.parameters,
      } as Anthropic.Tool.InputSchema,
    }));
  }

  private normalizeFinishReason(
    reason: string | null
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
