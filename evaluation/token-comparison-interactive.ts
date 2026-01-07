/**
 * Token Comparison Chat - Interactive MCP Flow Mode
 *
 * Interactive chat interface based on ollama-chat-client with token tracking.
 * Demonstrates Interactive MCP Flow with real-time token usage monitoring.
 *
 * Usage:
 *   npm run build
 *   node dist/examples/token-comparison-interactive.js [--model MODEL_NAME]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in project root
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Message, Tool } from 'ollama';
import { InteractiveClient } from '../src/client/interactive-client';
import { StdioTransportAdapter } from '../src/client/stdio-transport-adapter';
import { InteractionPrompt } from '../src/protocol/types';
import { TokenTracker } from './utils/token-tracker';
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
  promptUser,
  colorize,
} from '../examples/clients/utils/terminal-ui';

/**
 * Interactive MCP Flow Chat Client with Token Tracking
 */
class InteractiveMCPChatClient {
  private tracker: TokenTracker;
  private mcpClient!: InteractiveClient;
  private transport!: StdioTransportAdapter;
  private conversation: Message[] = [];
  private tools: Tool[] = [];
  private model: string;
  private sessionStartTime: number = 0;

  constructor(model: string = 'qwen2.5') {
    this.tracker = new TokenTracker();
    this.model = model;
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    displayMessage('system', 'Checking Ollama connection...');

    // Check Ollama connection
    try {
      await this.tracker.getOllama().list();
      displaySuccess('Connected to Ollama');
    } catch (error) {
      displayError('Failed to connect to Ollama');
      console.log();
      console.log('Make sure Ollama is running:');
      console.log('  Install: https://ollama.ai');
      console.log('  Start: ollama serve');
      console.log();
      throw error;
    }

    displayMessage('system', 'Starting MCP Flow server...');

    // Start MCP server via stdio
    const serverPath = path.join(__dirname, '..', '..', 'dist', 'examples', 'servers', 'stdio-server.js');
    this.transport = new StdioTransportAdapter({
      command: 'node',
      args: [serverPath],
    });

    await this.transport.start();

    // Give server time to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create MCP client
    this.mcpClient = new InteractiveClient(this.transport);

    // Negotiate capabilities
    displayMessage('system', 'Connecting to MCP server...');
    const capabilities = await this.mcpClient.negotiate();
    displaySuccess('Connected to MCP server');

    if (capabilities.interactive) {
      displaySuccess('Interactive mode enabled');
    }

    // Fetch tools from server
    displayMessage('system', 'Fetching available tools...');
    await this.fetchTools();

    if (this.tools.length > 0) {
      displaySuccess(`Loaded ${this.tools.length} tools: ${this.tools.map((t) => t.function.name).join(', ')}`);
    }

    // Set up system message
    this.conversation.push({
      role: 'system',
      content:
        'You are a helpful assistant with access to interactive tools. ' +
        'When you use a tool, it may ask you follow-up questions. ' +
        'Be natural and conversational in your responses.',
    });

    displaySuccess('Initialization complete!');
    console.log();
    displayMessage('system', 'Mode: Interactive MCP Flow (multi-turn prompts)');
    displayTokenHelp();

    this.sessionStartTime = Date.now();
  }

  /**
   * Fetch tools from MCP server
   */
  private async fetchTools(): Promise<void> {
    // Use the transport to make a tools/list request
    const response = await this.transport.send({
      jsonrpc: '2.0',
      id: 'tools-list',
      method: 'tools/list',
      params: {},
    });

    if ('error' in response) {
      throw new Error(response.error.message);
    }

    const result = response.result as { tools: Array<{ name: string; description: string }> };

    // Convert MCP tools to Ollama format
    this.tools = result.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));
  }

  /**
   * Run the chat loop
   */
  async chat(): Promise<void> {
    this.displayHeader();

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
          this.displayHeader();
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

        // Get response from Ollama (may include tool calls)
        await this.processConversation();
      } catch (error) {
        displayError((error as Error).message);
      }
    }
  }

  /**
   * Process the conversation with Ollama
   */
  private async processConversation(): Promise<void> {
    let continueProcessing = true;

    while (continueProcessing) {
      displayMessage('system', 'GobleGoble...');

      // Call Ollama through TokenTracker
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
            // Run the interactive tool
            const result = await this.runInteractiveTool(toolName);

            // Add tool result to conversation
            this.conversation.push({
              role: 'tool',
              content: JSON.stringify(result),
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
   * Run an interactive tool via MCP
   */
  private async runInteractiveTool(toolName: string): Promise<unknown> {
    return await this.mcpClient.runInteractive(toolName, async (prompt: InteractionPrompt) => {
      // Display prompt and get user input
      return await promptUser(prompt);
    });
  }

  /**
   * Handle exit and generate report
   */
  private async handleExit(): Promise<void> {
    console.log();
    const sessionDuration = Date.now() - this.sessionStartTime;
    const summary = this.tracker.getSummary();

    // Display session summary
    displaySessionSummary(summary, 'interactive');

    // Generate report
    displayMessage('system', 'Generating report...');
    const report: SessionReport = SingleModeReportGenerator.createReport(
      'interactive',
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
   * Display the header
   */
  private displayHeader(): void {
    console.clear();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(colorize('  Token Comparison Chat - Interactive MCP Flow', 'bright'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('  Mode: Interactive MCP Flow', 'dim'));
    console.log(colorize(`  Model: ${this.model}`, 'dim'));
    console.log();
    console.log(colorize('  Commands:', 'dim'));
    console.log(colorize('    /tokens - Show current token usage', 'dim'));
    console.log(colorize('    /help   - Show help message', 'dim'));
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
    console.log(colorize('  HELP - Interactive MCP Flow Mode', 'bright'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('  About This Mode:', 'bright'));
    console.log(colorize('    Interactive MCP Flow uses multi-turn conversations.', 'dim'));
    console.log(
      colorize('    Tools will ask you questions to gather required information.', 'dim')
    );
    console.log(colorize('    Prompts are handled by the tool itself.', 'dim'));
    console.log();
    console.log(colorize('  Example:', 'bright'));
    console.log(colorize('    You: "Book a trip for me"', 'yellow'));
    console.log(colorize('    [LLM calls book-travel tool]', 'magenta'));
    console.log(colorize('    Tool: "Where would you like to go?"', 'cyan'));
    console.log(colorize('    You: "Paris"', 'yellow'));
    console.log(colorize('    Tool: "When would you like to travel?"', 'cyan'));
    console.log(colorize('    You: "June 1-5"', 'yellow'));
    console.log(colorize('    ... (and so on)', 'dim'));
    console.log();
    console.log(colorize('  Token Tracking:', 'bright'));
    console.log(colorize('    - Tokens displayed after each LLM response', 'dim'));
    console.log(colorize('    - Tool prompts do NOT consume LLM tokens', 'dim'));
    console.log(colorize('    - Use /tokens to see detailed statistics', 'dim'));
    console.log(colorize('    - Full report generated on exit', 'dim'));
    console.log();
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log();
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    displayMessage('system', 'Shutting down...');
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

  const client = new InteractiveMCPChatClient(model);

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