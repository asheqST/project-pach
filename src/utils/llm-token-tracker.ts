/**
 * Standalone LLM Token Tracker Utility
 * Simplified token tracking for tools that want to track tokens independently
 *
 * This is a lightweight version that can be used without the full LLMConnection pattern
 */

export interface LLMTokenMetrics {
  callNumber: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: number;
}

export interface LLMTokenSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averagePromptTokens: number;
  averageCompletionTokens: number;
  averageTotalTokens: number;
  averageLatencyMs: number;
  peakContextSize: number;
  callBreakdown: LLMTokenMetrics[];
}

export class LLMTokenTracker {
  private calls: LLMTokenMetrics[] = [];
  private callCounter = 0;

  /**
   * Record a single LLM call's metrics
   * @param metrics - Call metrics without call number (auto-incremented)
   */
  recordCall(metrics: Omit<LLMTokenMetrics, 'callNumber'>): void {
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
    const peakContextSize = Math.max(...this.calls.map(call => call.promptTokens), 0);

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
      callBreakdown: [],
    };
  }
}
