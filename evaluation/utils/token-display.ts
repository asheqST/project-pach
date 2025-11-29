/**
 * Token Display Utilities
 *
 * Helpers for displaying token usage information in the terminal
 * during chat sessions.
 */

import { TokenSummary, TokenCallMetrics } from './ollama-token-tracker';
import { colorize } from '../../examples/clients/utils/terminal-ui';

/**
 * Display real-time token update after an LLM call
 */
export function displayTokenUpdate(summary: TokenSummary): void {
  const lastCall = summary.callBreakdown[summary.callBreakdown.length - 1];

  if (!lastCall) return;

  const update =
    colorize('[Tokens] ', 'cyan') +
    colorize(`Call #${lastCall.callNumber}: `, 'dim') +
    colorize(`+${lastCall.promptTokens}`, 'yellow') +
    colorize(' in, ', 'dim') +
    colorize(`+${lastCall.completionTokens}`, 'yellow') +
    colorize(' out ', 'dim') +
    colorize(`(Total: ${summary.totalTokens.toLocaleString()})`, 'bright');

  console.log(update);
}

/**
 * Display current token statistics (on-demand via /tokens command)
 */
export function displayCurrentTokenStats(summary: TokenSummary): void {
  console.log();
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log(colorize('  CURRENT TOKEN USAGE', 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log();

  console.log(colorize('  Summary:', 'bright'));
  console.log(colorize(`    • Total LLM Calls: ${summary.totalCalls}`, 'dim'));
  console.log(
    colorize(
      `    • Prompt Tokens (Input): ${summary.totalPromptTokens.toLocaleString()}`,
      'dim'
    )
  );
  console.log(
    colorize(
      `    • Completion Tokens (Output): ${summary.totalCompletionTokens.toLocaleString()}`,
      'dim'
    )
  );
  console.log(
    colorize(
      `    • Total Tokens: ${summary.totalTokens.toLocaleString()}`,
      'bright'
    )
  );
  console.log(
    colorize(
      `    • Average Tokens/Call: ${Math.round(summary.averageTotalTokens)}`,
      'dim'
    )
  );
  console.log();

  if (summary.callBreakdown.length > 0) {
    console.log(colorize('  Call Breakdown:', 'bright'));
    summary.callBreakdown.forEach((call: TokenCallMetrics) => {
      const toolIndicator = call.hasToolCalls ? colorize(' [Tool]', 'magenta') : '';
      console.log(
        colorize(`    #${call.callNumber}: `, 'dim') +
          colorize(`${call.promptTokens}`, 'yellow') +
          colorize(' in, ', 'dim') +
          colorize(`${call.completionTokens}`, 'yellow') +
          colorize(' out', 'dim') +
          toolIndicator
      );
    });
    console.log();
  }

  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log();
}

/**
 * Display end-of-session token summary
 */
export function displaySessionSummary(summary: TokenSummary, mode: 'standard' | 'interactive'): void {
  const modeLabel = mode === 'standard' ? 'Standard MCP' : 'Interactive MCP Flow';

  console.log();
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log(colorize(`  SESSION COMPLETE - ${modeLabel.toUpperCase()}`, 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log();

  console.log(colorize('  Token Usage Summary:', 'bright'));
  console.log();

  const stats = [
    { label: 'Total LLM Calls', value: summary.totalCalls },
    { label: 'Total Prompt Tokens', value: summary.totalPromptTokens.toLocaleString() },
    {
      label: 'Total Completion Tokens',
      value: summary.totalCompletionTokens.toLocaleString(),
    },
    { label: 'Total Tokens', value: summary.totalTokens.toLocaleString(), highlight: true },
    { label: 'Average Tokens per Call', value: Math.round(summary.averageTotalTokens) },
    { label: 'Peak Context Size', value: summary.peakContextSize.toLocaleString() },
  ];

  stats.forEach((stat) => {
    const label = `    ${stat.label}:`.padEnd(35);
    const value = String(stat.value).padStart(12);
    if (stat.highlight) {
      console.log(colorize(label, 'dim') + colorize(value, 'bright'));
    } else {
      console.log(colorize(label + value, 'dim'));
    }
  });

  console.log();
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log();
}

/**
 * Display a compact token counter (for persistent display)
 */
export function getTokenCounterString(summary: TokenSummary): string {
  return (
    colorize('[Tokens: ', 'dim') +
    colorize(summary.totalTokens.toLocaleString(), 'yellow') +
    colorize(']', 'dim')
  );
}

/**
 * Display help message about token tracking
 */
export function displayTokenHelp(): void {
  console.log();
  console.log(colorize('  Token Tracking Commands:', 'bright'));
  console.log(colorize('    /tokens  - Display current token usage statistics', 'dim'));
  console.log(
    colorize(
      '    Tokens are automatically displayed after each LLM response',
      'dim'
    )
  );
  console.log();
}
