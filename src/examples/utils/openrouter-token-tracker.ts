/**
 * OpenRouter Token Tracker Utility
 *
 * Tracks token usage across multiple OpenRouter chat calls.
 * Provides detailed metrics for comparison analysis.
 */

import OpenAI from 'openai';

export interface TokenCallMetrics {
  callNumber: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
  hasToolCalls: boolean;
}

export interface TokenSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averagePromptTokens: number;
  averageCompletionTokens: number;
  averageTotalTokens: number;
  peakContextSize: number;
  toolCallsCount: number;
  callBreakdown: TokenCallMetrics[];
}

/**
 * Wraps OpenRouter client to track token usage
 */
export class OpenRouterTokenTracker {
  private client: OpenAI;
  private calls: TokenCallMetrics[] = [];
  private callCounter = 0;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/your-repo', // Optional
        'X-Title': 'MCP Token Comparison', // Optional
      },
    });
  }

  /**
   * Perform a chat call and track token usage
   */
  async chat(params: {
    model: string;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    tools?: OpenAI.Chat.ChatCompletionTool[];
  }): Promise<OpenAI.Chat.ChatCompletion> {
    this.callCounter++;

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
    });

    // Extract token counts from response
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Record this call
    this.calls.push({
      callNumber: this.callCounter,
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: Date.now(),
      hasToolCalls: !!(
        response.choices[0]?.message?.tool_calls &&
        response.choices[0].message.tool_calls.length > 0
      ),
    });

    return response;
  }

  /**
   * Get summary statistics
   */
  getSummary(): TokenSummary {
    const totalPromptTokens = this.calls.reduce((sum, call) => sum + call.promptTokens, 0);
    const totalCompletionTokens = this.calls.reduce(
      (sum, call) => sum + call.completionTokens,
      0
    );
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCalls = this.calls.length;
    const toolCallsCount = this.calls.filter((call) => call.hasToolCalls).length;
    const peakContextSize = Math.max(...this.calls.map((call) => call.promptTokens), 0);

    return {
      totalCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      averagePromptTokens: totalCalls > 0 ? totalPromptTokens / totalCalls : 0,
      averageCompletionTokens: totalCalls > 0 ? totalCompletionTokens / totalCalls : 0,
      averageTotalTokens: totalCalls > 0 ? totalTokens / totalCalls : 0,
      peakContextSize,
      toolCallsCount,
      callBreakdown: [...this.calls],
    };
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.calls = [];
    this.callCounter = 0;
  }

  /**
   * Get the underlying OpenAI client instance
   */
  getClient(): OpenAI {
    return this.client;
  }
}
