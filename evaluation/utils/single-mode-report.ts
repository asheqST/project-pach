/**
 * Single-Mode Report Generator
 *
 * Generates token usage reports for a single mode (Standard MCP or Interactive MCP Flow).
 * Outputs terminal summary, markdown file, and JSON data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Message } from 'ollama';
import OpenAI from 'openai';
import { TokenSummary } from './ollama-token-tracker';
import { colorize } from '../../examples/clients/utils/terminal-ui';

// Support both Ollama and OpenAI message formats
export type ConversationMessage = Message | OpenAI.Chat.ChatCompletionMessageParam;

export interface SessionReport {
  mode: 'standard' | 'interactive';
  timestamp: string;
  model: string;
  sessionDuration: number;
  tokenSummary: TokenSummary;
  conversation: ConversationMessage[];
  conversationTurns: number;
}

/**
 * Generate and save reports for a single session
 */
export class SingleModeReportGenerator {
  /**
   * Create a session report
   */
  static createReport(
    mode: 'standard' | 'interactive',
    model: string,
    sessionDuration: number,
    tokenSummary: TokenSummary,
    conversation: ConversationMessage[]
  ): SessionReport {
    const userTurns = conversation.filter((m) => m.role === 'user').length;

    return {
      mode,
      timestamp: new Date().toISOString(),
      model,
      sessionDuration,
      tokenSummary,
      conversation,
      conversationTurns: userTurns,
    };
  }

  /**
   * Generate markdown report
   */
  static generateMarkdownReport(report: SessionReport): string {
    const modeTitle = report.mode === 'standard' ? 'Standard MCP' : 'Interactive MCP Flow';
    let md = `# Token Usage Report - ${modeTitle}\n\n`;

    // Session metadata
    md += `**Generated:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Model:** ${report.model}\n`;
    md += `**Mode:** ${modeTitle}\n`;
    md += `**Session Duration:** ${(report.sessionDuration / 1000).toFixed(1)}s\n`;
    md += `**Conversation Turns:** ${report.conversationTurns}\n\n`;

    // Token summary
    md += `## Token Usage Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total LLM Calls | ${report.tokenSummary.totalCalls} |\n`;
    md += `| Prompt Tokens (Input) | ${report.tokenSummary.totalPromptTokens.toLocaleString()} |\n`;
    md += `| Completion Tokens (Output) | ${report.tokenSummary.totalCompletionTokens.toLocaleString()} |\n`;
    md += `| **Total Tokens** | **${report.tokenSummary.totalTokens.toLocaleString()}** |\n`;
    md += `| Average Tokens per Call | ${Math.round(report.tokenSummary.averageTotalTokens)} |\n`;
    md += `| Peak Context Size | ${report.tokenSummary.peakContextSize.toLocaleString()} |\n`;
    md += `| Tool Calls | ${report.tokenSummary.toolCallsCount} |\n\n`;

    // Call breakdown
    md += `## LLM Call Breakdown\n\n`;
    md += `| Call # | Prompt Tokens | Completion Tokens | Total | Tool Call |\n`;
    md += `|--------|---------------|-------------------|-------|----------|\n`;

    report.tokenSummary.callBreakdown.forEach((call) => {
      md += `| ${call.callNumber} | ${call.promptTokens.toLocaleString()} | ${call.completionTokens.toLocaleString()} | ${call.totalTokens.toLocaleString()} | ${call.hasToolCalls ? 'Yes' : 'No'} |\n`;
    });
    md += `\n`;

    // Mode-specific analysis
    md += `## Mode-Specific Analysis\n\n`;
    if (report.mode === 'standard') {
      md += `### Standard MCP Characteristics\n\n`;
      md += `- **Tool Parameters:** All parameters provided upfront in a single request\n`;
      md += `- **Call Pattern:** Single-turn tool execution\n`;
      md += `- **Context Efficiency:** ${this.analyzeContextEfficiency(report)}\n`;
      md += `- **Parameter Overhead:** ${this.analyzeParameterOverhead(report)}\n\n`;
    } else {
      md += `### Interactive MCP Flow Characteristics\n\n`;
      md += `- **Tool Parameters:** Collected through multi-step interactive prompts\n`;
      md += `- **Call Pattern:** Multi-turn conversational flow\n`;
      md += `- **User Interaction:** ${this.analyzeUserInteraction(report)}\n`;
      md += `- **Prompt Distribution:** ${this.analyzePromptDistribution(report)}\n\n`;
    }

    // Conversation log
    md += `## Conversation Log\n\n`;
    report.conversation.forEach((msg, idx) => {
      if (msg.role === 'system') {
        md += `### System Prompt\n\n`;
        md += `\`\`\`\n${msg.content}\n\`\`\`\n\n`;
      } else if (msg.role === 'user') {
        md += `### User (Turn ${idx})\n\n`;
        md += `${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        md += `### Assistant\n\n`;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const firstToolCall = msg.tool_calls[0];
          // Type guard for function tool calls
          if ('function' in firstToolCall && firstToolCall.function) {
            md += `*Called tool: ${firstToolCall.function.name}*\n\n`;
          }
        }
        if (msg.content) {
          md += `${msg.content}\n\n`;
        }
      } else if (msg.role === 'tool') {
        md += `### Tool Response\n\n`;
        md += `\`\`\`json\n${msg.content}\n\`\`\`\n\n`;
      }
    });

    md += `---\n\n`;
    md += `*Generated by MCP Flow Token Comparison Tool*\n`;

    return md;
  }

  /**
   * Save reports to files
   */
  static async saveReports(report: SessionReport, outputDir: string = '.'): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate timestamp-based filename
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('Z')[0];
    const modePrefix = report.mode;

    // Save JSON
    const jsonPath = path.join(outputDir, `token-report-${modePrefix}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(colorize(`✓ JSON saved to: ${jsonPath}`, 'green'));

    // Save Markdown
    const markdown = this.generateMarkdownReport(report);
    const mdPath = path.join(outputDir, `token-report-${modePrefix}-${timestamp}.md`);
    fs.writeFileSync(mdPath, markdown);
    console.log(colorize(`✓ Markdown saved to: ${mdPath}`, 'green'));
  }

  /**
   * Display terminal summary
   */
  static displayTerminalSummary(report: SessionReport): void {
    const modeTitle = report.mode === 'standard' ? 'Standard MCP' : 'Interactive MCP Flow';

    console.log();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(colorize(`  REPORT SUMMARY - ${modeTitle.toUpperCase()}`, 'bright'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();

    console.log(colorize('  Session Info:', 'bright'));
    console.log(colorize(`    Model: ${report.model}`, 'dim'));
    console.log(
      colorize(`    Duration: ${(report.sessionDuration / 1000).toFixed(1)}s`, 'dim')
    );
    console.log(colorize(`    Conversation Turns: ${report.conversationTurns}`, 'dim'));
    console.log();

    console.log(colorize('  Token Usage:', 'bright'));
    console.log(colorize(`    Total LLM Calls: ${report.tokenSummary.totalCalls}`, 'dim'));
    console.log(
      colorize(
        `    Prompt Tokens: ${report.tokenSummary.totalPromptTokens.toLocaleString()}`,
        'dim'
      )
    );
    console.log(
      colorize(
        `    Completion Tokens: ${report.tokenSummary.totalCompletionTokens.toLocaleString()}`,
        'dim'
      )
    );
    console.log(
      colorize(
        `    Total Tokens: ${report.tokenSummary.totalTokens.toLocaleString()}`,
        'yellow'
      )
    );
    console.log();

    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
  }

  // Analysis helpers

  private static analyzeContextEfficiency(report: SessionReport): string {
    const avgPrompt = report.tokenSummary.averagePromptTokens;
    if (avgPrompt > 500) {
      return `High (avg ${Math.round(avgPrompt)} tokens per call) - comprehensive parameter schema`;
    } else if (avgPrompt > 300) {
      return `Moderate (avg ${Math.round(avgPrompt)} tokens per call)`;
    } else {
      return `Low (avg ${Math.round(avgPrompt)} tokens per call)`;
    }
  }

  private static analyzeParameterOverhead(report: SessionReport): string {
    // For standard MCP, look at peak context vs average
    const peakToAvgRatio = report.tokenSummary.peakContextSize / report.tokenSummary.averagePromptTokens;

    if (peakToAvgRatio > 1.5) {
      return `Significant - peak context ${Math.round((peakToAvgRatio - 1) * 100)}% higher than average`;
    } else {
      return `Minimal - consistent context size across calls`;
    }
  }

  private static analyzeUserInteraction(report: SessionReport): string {
    const turns = report.conversationTurns;
    if (turns > 5) {
      return `${turns} user interactions - extensive dialogue`;
    } else if (turns > 2) {
      return `${turns} user interactions - moderate dialogue`;
    } else {
      return `${turns} user interactions - minimal dialogue`;
    }
  }

  private static analyzePromptDistribution(report: SessionReport): string {
    const callCount = report.tokenSummary.totalCalls;
    const totalTokens = report.tokenSummary.totalTokens;
    const avgPerCall = totalTokens / callCount;

    return `${callCount} LLM calls averaging ${Math.round(avgPerCall)} tokens each - distributed token consumption`;
  }
}
