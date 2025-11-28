/**
 * Token Tracker Utility
 *
 * Tracks token usage across multiple Ollama chat calls.
 * Provides detailed metrics for comparison analysis.
 */

import { Ollama, Message, ChatResponse, Tool } from 'ollama';

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
 * Wraps Ollama client to track token usage
 */
export class TokenTracker {
  private ollama: Ollama;
  private calls: TokenCallMetrics[] = [];
  private callCounter = 0;

  constructor(host: string = 'http://127.0.0.1:11434') {
    this.ollama = new Ollama({ host });
  }

  /**
   * Perform a chat call and track token usage
   */
  async chat(params: {
    model: string;
    messages: Message[];
    tools?: Tool[];
  }): Promise<ChatResponse> {
    this.callCounter++;

    const response = await this.ollama.chat(params);

    // Extract token counts from response
    const promptTokens = response.prompt_eval_count || 0;
    const completionTokens = response.eval_count || 0;
    const totalTokens = promptTokens + completionTokens;

    // Record this call
    this.calls.push({
      callNumber: this.callCounter,
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: Date.now(),
      hasToolCalls: !!(response.message.tool_calls && response.message.tool_calls.length > 0),
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
   * Get the underlying Ollama instance
   */
  getOllama(): Ollama {
    return this.ollama;
  }
}
