/**
 * Token Comparison Chat - Standard MCP Mode
 *
 * Interactive chat interface using Standard MCP (non-interactive) with token tracking.
 * Tracks and reports token usage for conversations using traditional single-turn tool calls.
 *
 * Usage:
 *   npm run build
 *   node dist/examples/token-comparison-standard.js [--model MODEL_NAME]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in project root
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Message, Tool } from 'ollama';
import { StdioTransportAdapter } from '../src/client/stdio-transport-adapter';
import { OllamaTokenTracker } from './utils/ollama-token-tracker';
import {
  SingleModeReportGenerator,
  SessionReport,
} from './utils/single-mode-report';
import {
  displayTokenUpdate,
  displayCurrentTokenStats,
  displaySessionSummary,
  displayTokenHelp,
} from './utils/token-display';
import {
  displayMessage,
  displayToolExecution,
  displayError,
  displaySuccess,
  getUserInput,
  colorize,
} from '../examples/clients/utils/terminal-ui';

/**
 * Standard MCP Token Comparison Chat Client
 */
class StandardMCPChatClient {
  private tracker: OllamaTokenTracker;
  private transport!: StdioTransportAdapter;
  private conversation: Message[] = [];
  private tools: Tool[] = [];
  private model: string;
  private sessionStartTime: number = 0;

  constructor(model: string = 'qwen2.5') {
    this.tracker = new OllamaTokenTracker();
    this.model = model;
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    displayMessage('system', 'Standard MCP Token Comparison - Initializing...');
    console.log();

    // Start standard MCP server
    const serverPath = path.join(
      __dirname,
      '..',
      '..',
      'dist',
      'examples',
      'servers',
      'standard-mcp-server.js'
    );
    this.transport = new StdioTransportAdapter({
      command: 'node',
      args: [serverPath],
    });

    await this.transport.start();
    await new Promise((resolve) => setTimeout(resolve, 500));

    displaySuccess('Connected to Standard MCP server');

    // Fetch tools
    displayMessage('system', 'Fetching available tools...');
    await this.fetchTools();

    if (this.tools.length > 0) {
      displaySuccess(`Loaded ${this.tools.length} tools: ${this.tools.map((t) => t.function.name).join(', ')}`);
    }

    // Set up system message
    this.conversation.push({
      role: 'system',
      content:
        'You are a helpful assistant with access to travel booking tools. ' +
        'You can help users book trips by calling separate tools for each piece of information. ' +
        'Use set-destination, set-dates, and set-travelers tools as the user provides information, ' +
        'then call confirm-booking when all information is collected. ' +
        'Be conversational and guide the user through the booking process.',
    });

    displaySuccess('Initialization complete!');
    console.log();
    displayMessage(
      'system',
      'Mode: Standard MCP (multi-step tool calls)'
    );
    displayMessage(
      'system',
      'The LLM will make multiple tool calls as you provide information step-by-step'
    );
    displayTokenHelp();

    this.sessionStartTime = Date.now();
  }

  /**
   * Fetch tools from MCP server
   */
  private async fetchTools(): Promise<void> {
    const response = await this.transport.send({
      jsonrpc: '2.0',
      id: 'tools-list',
      method: 'tools/list',
      params: {},
    });

    if ('error' in response) {
      throw new Error(response.error.message);
    }

    const result = response.result as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: {
          type: string;
          properties: {
            [key: string]: {
              type?: string | string[];
              items?: unknown;
              description?: string;
              enum?: unknown[];
            };
          };
          required: string[];
        };
      }>;
    };

    this.tools = result.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Run the chat loop
   */
  async chat(): Promise<void> {
    this.displayChatHeader();

    let running = true;
    while (running) {
      try {
        // Get user input
        const userInput = await getUserInput(colorize('\nYou: ', 'bright'));

        // Handle commands
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          await this.handleExit();
          running = false;
          break;
        }

        if (userInput.toLowerCase() === 'clear') {
          this.displayChatHeader();
          continue;
        }

        if (userInput.toLowerCase() === '/tokens') {
          displayCurrentTokenStats(this.tracker.getSummary());
          continue;
        }

        if (userInput.toLowerCase() === '/help') {
          this.displayHelp();
          continue;
        }

        if (!userInput.trim()) {
          continue;
        }

        // Add user message to conversation
        this.conversation.push({
          role: 'user',
          content: userInput,
        });

        // Get response from LLM (may include tool calls)
        await this.processConversation();
      } catch (error) {
        displayError((error as Error).message);
      }
    }
  }

  /**
   * Process the conversation with LLM
   */
  private async processConversation(): Promise<void> {
    let continueProcessing = true;

    while (continueProcessing) {
      displayMessage('system', 'GobleGoble...');

      // Call LLM through TokenTracker
      const response = await this.tracker.chat({
        model: this.model,
        messages: this.conversation,
        tools: this.tools.length > 0 ? this.tools : undefined,
      });

      // Display token usage for this call
      displayTokenUpdate(this.tracker.getSummary());

      // Check if there are tool calls
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        this.conversation.push({
          role: 'assistant',
          content: response.message.content || '',
          tool_calls: response.message.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of response.message.tool_calls) {
          const toolName = toolCall.function.name;
          displayToolExecution(toolName, 'start');

          try {
            // Execute the tool via standard MCP
            const toolResult = await this.executeStandardTool(toolCall);

            // Add tool result to conversation
            this.conversation.push({
              role: 'tool',
              content: JSON.stringify(toolResult),
            });

            displayToolExecution(toolName, 'complete');
          } catch (error) {
            displayToolExecution(toolName, 'error');
            displayError((error as Error).message);

            // Add error to conversation
            this.conversation.push({
              role: 'tool',
              content: JSON.stringify({ error: (error as Error).message }),
            });
          }
        }

        // Continue processing to get final response
        continueProcessing = true;
      } else {
        // No tool calls, display response and stop
        if (response.message.content) {
          displayMessage('assistant', response.message.content);
          this.conversation.push({
            role: 'assistant',
            content: response.message.content,
          });
        }
        continueProcessing = false;
      }
    }
  }

  /**
   * Execute a tool via standard MCP protocol
   */
  private async executeStandardTool(toolCall: {
    function: { name: string; arguments: Record<string, unknown> };
  }): Promise<unknown> {
    const response = await this.transport.send({
      jsonrpc: '2.0',
      id: `tool-call-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    });

    if ('error' in response) {
      throw new Error(response.error.message);
    }

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };

    // Parse the result text as JSON
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return { result: result.content[0].text };
    }
  }

  /**
   * Handle exit and generate report
   */
  private async handleExit(): Promise<void> {
    console.log();
    const sessionDuration = Date.now() - this.sessionStartTime;
    const summary = this.tracker.getSummary();

    // Display session summary
    displaySessionSummary(summary, 'standard');

    // Generate report
    displayMessage('system', 'Generating report...');
    const report: SessionReport = SingleModeReportGenerator.createReport(
      'standard',
      this.model,
      sessionDuration,
      summary,
      this.conversation
    );

    // Display terminal summary
    SingleModeReportGenerator.displayTerminalSummary(report);

    // Save reports
    await SingleModeReportGenerator.saveReports(report);

    displaySuccess('Session complete! Goodbye!');
    console.log();
  }

  /**
   * Display chat header
   */
  private displayChatHeader(): void {
    console.clear();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(colorize('  Token Comparison Chat - Standard MCP', 'bright'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('  Mode: Standard MCP (multi-step tool calls)', 'dim'));
    console.log(colorize(`  Model: ${this.model}`, 'dim'));
    console.log();
    console.log(colorize('  Commands:', 'dim'));
    console.log(colorize('    /tokens - Show current token usage', 'dim'));
    console.log(colorize('    /help   - Show this help message', 'dim'));
    console.log(colorize('    clear   - Clear the screen', 'dim'));
    console.log(colorize('    exit    - End session and generate report', 'dim'));
    console.log();
  }

  /**
   * Display help message
   */
  private displayHelp(): void {
    console.log();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(colorize('  HELP - Standard MCP Mode', 'bright'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('  About This Mode:', 'bright'));
    console.log(
      colorize(
        '    Standard MCP with multi-step tool calls.',
        'dim'
      )
    );
    console.log(
      colorize(
        '    The LLM makes MULTIPLE tool calls as you provide info step-by-step.',
        'dim'
      )
    );
    console.log(
      colorize(
        '    Each piece of information triggers a separate tool call.',
        'dim'
      )
    );
    console.log();
    console.log(colorize('  Example Flow:', 'bright'));
    console.log(colorize('    You: "I want to book a trip"', 'yellow'));
    console.log(colorize('    Assistant: "Where would you like to go?"', 'green'));
    console.log(colorize('    You: "Paris"', 'yellow'));
    console.log(colorize('    [LLM calls set-destination tool]', 'magenta'));
    console.log(colorize('    Assistant: "When would you like to travel?"', 'green'));
    console.log(colorize('    You: "June 1-5"', 'yellow'));
    console.log(colorize('    [LLM calls set-dates tool]', 'magenta'));
    console.log(colorize('    ... and so on', 'dim'));
    console.log();
    console.log(colorize('  Token Tracking:', 'bright'));
    console.log(
      colorize(
        '    - Each LLM call (including tool decisions) is tracked',
        'dim'
      )
    );
    console.log(
      colorize(
        '    - Tokens displayed after each response',
        'dim'
      )
    );
    console.log(
      colorize(
        '    - Use /tokens for detailed breakdown',
        'dim'
      )
    );
    console.log();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    await this.transport.close();
  }
}

/**
 * Main entry point
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const modelIndex = args.indexOf('--model');
  const model = modelIndex >= 0 && args[modelIndex + 1] ? args[modelIndex + 1] : 'qwen2.5';

  const client = new StandardMCPChatClient(model);

  try {
    await client.initialize();
    await client.chat();
  } catch (error) {
    displayError((error as Error).message);
    console.error(error);
  } finally {
    await client.shutdown();
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log();
  displayMessage('system', 'Interrupted. Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log();
  displayMessage('system', 'Terminated. Shutting down...');
  process.exit(0);
});

// Run the client
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
