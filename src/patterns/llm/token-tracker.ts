/**
 * LLM Token Tracker
 * Tracks token usage across multiple LLM calls
 */

import { LLMCallMetrics, LLMTokenSummary, LLMProvider } from './types';

export class LLMTokenTracker {
  private calls: LLMCallMetrics[] = [];
  private callCounter = 0;

  /**
   * Record a single LLM call's metrics
   * @param metrics - Call metrics without call number (auto-incremented)
   */
  recordCall(metrics: Omit<LLMCallMetrics, 'callNumber'>): void {
    this.callCounter++;
    this.calls.push({
      callNumber: this.callCounter,
      ...metrics,
    });
  }

  /**
   * Get aggregated token usage summary
   * @returns Summary of all tracked calls
   */
  getSummary(): LLMTokenSummary {
    const totalCalls = this.calls.length;

    if (totalCalls === 0) {
      return this.getEmptySummary();
    }

    const totalPromptTokens = this.calls.reduce((sum, call) => sum + call.promptTokens, 0);
    const totalCompletionTokens = this.calls.reduce((sum, call) => sum + call.completionTokens, 0);
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalLatency = this.calls.reduce((sum, call) => sum + call.latencyMs, 0);
    const toolCallsCount = this.calls.filter(call => call.hasToolCalls).length;
    const cacheHitCount = this.calls.filter(call => call.cached).length;
    const peakContextSize = Math.max(...this.calls.map(call => call.promptTokens), 0);

    // Calculate provider breakdown
    const providerBreakdown: Record<LLMProvider, { calls: number; tokens: number }> = {
      [LLMProvider.OPENAI]: { calls: 0, tokens: 0 },
      [LLMProvider.ANTHROPIC]: { calls: 0, tokens: 0 },
      [LLMProvider.OPENROUTER]: { calls: 0, tokens: 0 },
      [LLMProvider.OLLAMA]: { calls: 0, tokens: 0 },
    };

    this.calls.forEach(call => {
      providerBreakdown[call.provider].calls++;
      providerBreakdown[call.provider].tokens += call.totalTokens;
    });

    return {
      totalCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      averagePromptTokens: totalPromptTokens / totalCalls,
      averageCompletionTokens: totalCompletionTokens / totalCalls,
      averageTotalTokens: totalTokens / totalCalls,
      averageLatencyMs: totalLatency / totalCalls,
      peakContextSize,
      toolCallsCount,
      cacheHitCount,
      providerBreakdown,
      callBreakdown: [...this.calls],
    };
  }

  /**
   * Reset all tracked calls
   */
  reset(): void {
    this.calls = [];
    this.callCounter = 0;
  }

  /**
   * Get total number of calls tracked
   * @returns Call count
   */
  getCallCount(): number {
    return this.callCounter;
  }

  /**
   * Get empty summary (when no calls have been made)
   */
  private getEmptySummary(): LLMTokenSummary {
    return {
      totalCalls: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      averagePromptTokens: 0,
      averageCompletionTokens: 0,
      averageTotalTokens: 0,
      averageLatencyMs: 0,
      peakContextSize: 0,
      toolCallsCount: 0,
      cacheHitCount: 0,
      providerBreakdown: {
        [LLMProvider.OPENAI]: { calls: 0, tokens: 0 },
        [LLMProvider.ANTHROPIC]: { calls: 0, tokens: 0 },
        [LLMProvider.OPENROUTER]: { calls: 0, tokens: 0 },
        [LLMProvider.OLLAMA]: { calls: 0, tokens: 0 },
      },
      callBreakdown: [],
    };
  }
}
