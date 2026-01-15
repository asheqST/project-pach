/**
 * Example: Ollama Chat Client with MCP Flow Interactive Server
 *
 * This example demonstrates a terminal-based chat interface where:
 * - User types messages in a chat UI
 * - Ollama LLM decides when to call MCP Flow tools
 * - Interactive prompts are handled directly in the terminal
 * - Results flow back to Ollama for natural language responses
 *
 * Prerequisites:
 * - Ollama installed and running (https://ollama.ai)
 * - A model with tool support downloaded (e.g., llama3.1, mistral)
 *
 * Usage:
 *   npm run build
 *   node dist/examples/ollama-chat-client.js
 */

import { Ollama, Tool, Message } from 'ollama';
import { InteractiveClient } from '../../src/client/interactive-client';
import { StdioTransportAdapter } from '../../src/client/stdio-transport-adapter';
import { InteractionPrompt } from '../../src/protocol/types';
import {
  displayHeader,
  displayMessage,
  displayToolExecution,
  displayError,
  displaySuccess,
  getUserInput,
  promptUser,
  colorize,
} from './utils/terminal-ui';
import * as path from 'path';

/**
 * Main Ollama MCP Chat Client
 */
class OllamaMCPChatClient {
  private ollama: Ollama;
  private mcpClient!: InteractiveClient;
  private transport!: StdioTransportAdapter;
  private conversation: Message[] = [];
  private tools: Tool[] = [];
  private model: string;

  constructor(model: string = 'qwen2.5') {
    this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    this.model = model;
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    displayMessage('system', 'Checking Ollama connection...');

    // Check Ollama connection
    try {
      await this.ollama.list();
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
    const serverPath = path.join(__dirname, '..', 'servers', 'stdio-server');
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
    displayHeader();

    let running = true;
    while (running) {
      try {
        // Get user input
        const userInput = await getUserInput(colorize('\nYou: ', 'bright'));

        // Handle commands
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          displayMessage('system', 'Goodbye!');
          running = false;
          break;
        }

        if (userInput.toLowerCase() === 'clear') {
          displayHeader();
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

      // Call Ollama
      const response = await this.ollama.chat({
        model: this.model,
        messages: this.conversation,
        tools: this.tools.length > 0 ? this.tools : undefined,
      });

      // Debug: log the response
      //console.debug('\n[DEBUG] Ollama response:', JSON.stringify(response.message, null, 2));

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
    return await this.mcpClient.runInteractive(
      toolName,
      async (prompt: InteractionPrompt) => {
        // Display prompt and get user input
        return await promptUser(prompt);
      }
    );
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

  const client = new OllamaMCPChatClient(model);

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
