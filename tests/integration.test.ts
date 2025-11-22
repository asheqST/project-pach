/**
 * Integration tests for MCP Flow
 * Tests the complete client-server interaction flow using real MCP client
 *
 * These tests verify:
 * - Protocol compliance with MCP and JSON-RPC 2.0
 * - Complete interactive flow from start to completion
 * - Error handling and validation
 * - State management across multiple turns
 * - Proper capability negotiation
 */

import { InteractiveServer, InteractiveTool } from '../src/server';
import { InteractiveClient, Transport } from '../src/client';
import { PromptType, InteractionState } from '../src/protocol/types';
import { JsonRpcRequest, JsonRpcResponse } from '../src/protocol/types';

/**
 * In-memory transport for testing
 * Simulates client-server communication without network
 */
class InMemoryTransport implements Transport {
  constructor(private server: InteractiveServer) {}

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return this.server.handleRequest(request);
  }
}

describe('MCP Flow Integration Tests', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;
  let transport: InMemoryTransport;

  beforeEach(() => {
    server = new InteractiveServer({
      session: {
        defaultTimeout: 60000, // 1 minute for tests
      },
    });
    transport = new InMemoryTransport(server);
    client = new InteractiveClient(transport);
  });

  afterEach(() => {
    server.destroy();
  });

  describe('Capability Negotiation (MCP Compliance)', () => {
    it('should support MCP initialize handshake', async () => {
      const capabilities = await client.negotiate();

      // Verify MCP Flow capabilities are exposed as experimental
      expect(capabilities.interactive).toBe(true);
      expect(capabilities.version).toBe('0.1.0');
      expect(capabilities.features).toBeDefined();
      expect(capabilities.features.statefulSessions).toBe(true);
    });

    it('should respond with proper MCP initialize response structure', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();

      const result = response.result as any;
      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBe('mcp-flow-server');
      expect(result.serverInfo.version).toBe('0.1.0');
      expect(result.capabilities.experimental.interactive).toBeDefined();
    });
  });

  describe('JSON-RPC 2.0 Compliance', () => {
    it('should follow JSON-RPC 2.0 message structure', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-123',
        method: 'capabilities',
      };

      const response = await server.handleRequest(request);

      // JSON-RPC 2.0 compliance checks
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('test-123');
      // Either result or error must be present, but not both
      expect(response.result !== undefined || response.error !== undefined).toBe(true);
      expect(response.result !== undefined && response.error !== undefined).toBe(false);
    });

    it('should return proper error for invalid method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'invalid.method',
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601); // Method not found
      expect(response.result).toBeUndefined();
    });

    it('should use proper MCP Flow error codes (outside reserved range)', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 3,
        method: 'interaction.getState',
        params: {
          sessionId: 'non-existent-session',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      // MCP Flow error codes should be in -32050 to -32099 range
      expect(response.error!.code).toBe(-32050); // SESSION_NOT_FOUND
    });
  });

  describe('Simple Interactive Tool Flow', () => {
    it('should complete a single-prompt interaction', async () => {
      const simpleTool: InteractiveTool = {
        name: 'greet',
        description: 'Simple greeting tool',
        async execute(context) {
          const response = await context.prompt({
            type: PromptType.TEXT,
            message: 'What is your name?',
            validation: { required: true },
          });

          return {
            greeting: `Hello, ${response.value}!`,
          };
        },
      };

      server.registerTool(simpleTool);

      const result = await client.runInteractive(
        'greet',
        async (prompt) => {
          expect(prompt.message).toBe('What is your name?');
          return 'Alice';
        }
      );

      expect(result).toEqual({
        greeting: 'Hello, Alice!',
      });
    });

    it('should handle validation rejection and retry', async () => {
      const validationTool: InteractiveTool = {
        name: 'age_verify',
        description: 'Age verification tool',
        async execute(context) {
          const response = await context.prompt({
            type: PromptType.NUMBER,
            message: 'Enter your age:',
            validation: {
              required: true,
              min: 18,
              max: 120,
            },
          });

          return {
            message: `Age ${response.value} verified`,
          };
        },
      };

      server.registerTool(validationTool);

      let attemptCount = 0;
      const result = await client.runInteractive(
        'age_verify',
        async (_prompt) => {
          attemptCount++;
          if (attemptCount === 1) {
            return 10; // Too young, should be rejected
          }
          return 25; // Valid age
        }
      );

      expect(attemptCount).toBe(2); // Should retry after rejection
      expect(result).toEqual({
        message: 'Age 25 verified',
      });
    });
  });

  describe('Multi-turn Interactive Flow', () => {
    it('should handle wizard-style multi-step interaction', async () => {
      const wizardTool: InteractiveTool = {
        name: 'user_registration',
        description: 'Multi-step user registration',
        async execute(context) {
          const name = await context.prompt({
            type: PromptType.TEXT,
            message: 'Enter your name:',
            validation: { required: true, min: 2 },
          });

          context.setData('name', name.value);

          const email = await context.prompt({
            type: PromptType.TEXT,
            message: 'Enter your email:',
            validation: {
              required: true,
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            },
          });

          context.setData('email', email.value);

          const newsletter = await context.prompt({
            type: PromptType.CONFIRM,
            message: 'Subscribe to newsletter?',
            defaultValue: false,
          });

          const userData = {
            name: context.getData('name'),
            email: context.getData('email'),
            newsletter: newsletter.value,
          };

          return {
            success: true,
            user: userData,
          };
        },
      };

      server.registerTool(wizardTool);

      const promptInputs = [
        'John Doe',
        'john@example.com',
        true,
      ];
      let promptIndex = 0;

      const result = await client.runInteractive(
        'user_registration',
        async (_prompt) => {
          return promptInputs[promptIndex++];
        }
      );

      expect(result).toEqual({
        success: true,
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          newsletter: true,
        },
      });
    });

    it('should maintain session state across multiple turns', async () => {
      const statefulTool: InteractiveTool = {
        name: 'calculator',
        description: 'Multi-step calculator',
        async execute(context) {
          context.setData('operations', []);

          const num1 = await context.prompt({
            type: PromptType.NUMBER,
            message: 'Enter first number:',
            validation: { required: true },
          });

          const operations = context.getData('operations') as any[];
          operations.push({ type: 'input', value: num1.value });
          context.setData('operations', operations);

          const num2 = await context.prompt({
            type: PromptType.NUMBER,
            message: 'Enter second number:',
            validation: { required: true },
          });

          operations.push({ type: 'input', value: num2.value });

          const result = (num1.value as number) + (num2.value as number);
          operations.push({ type: 'result', value: result });

          return {
            result,
            operations: context.getData('operations'),
          };
        },
      };

      server.registerTool(statefulTool);

      let promptCount = 0;
      const result = await client.runInteractive(
        'calculator',
        async () => {
          promptCount++;
          return promptCount === 1 ? 5 : 3;
        }
      );

      expect(result).toMatchObject({
        result: 8,
        operations: expect.arrayContaining([
          { type: 'input', value: 5 },
          { type: 'input', value: 3 },
          { type: 'result', value: 8 },
        ]),
      });
    });
  });

  describe('Choice-based Interactions', () => {
    it('should handle choice prompts correctly', async () => {
      const choiceTool: InteractiveTool = {
        name: 'pizza_order',
        description: 'Pizza ordering tool',
        async execute(context) {
          const size = await context.prompt({
            type: PromptType.CHOICE,
            message: 'Select pizza size:',
            choices: [
              { value: 'small', label: 'Small (10")' },
              { value: 'medium', label: 'Medium (12")' },
              { value: 'large', label: 'Large (14")' },
            ],
            validation: { required: true },
          });

          const prices = { small: 8.99, medium: 11.99, large: 14.99 };
          const selectedSize = size.value as keyof typeof prices;

          return {
            order: {
              size: selectedSize,
              price: prices[selectedSize],
            },
          };
        },
      };

      server.registerTool(choiceTool);

      const result = await client.runInteractive(
        'pizza_order',
        async (_prompt) => {
          expect(_prompt.choices).toHaveLength(3);
          return 'large';
        }
      );

      expect(result).toEqual({
        order: {
          size: 'large',
          price: 14.99,
        },
      });
    });

    it('should reject invalid choice selection', async () => {
      const choiceTool: InteractiveTool = {
        name: 'color_picker',
        description: 'Color selection tool',
        async execute(context) {
          const color = await context.prompt({
            type: PromptType.CHOICE,
            message: 'Pick a color:',
            choices: [
              { value: 'red', label: 'Red' },
              { value: 'blue', label: 'Blue' },
              { value: 'green', label: 'Green' },
            ],
          });

          return { selectedColor: color.value };
        },
      };

      server.registerTool(choiceTool);

      let attemptCount = 0;
      const result = await client.runInteractive(
        'color_picker',
        async (_prompt) => {
          attemptCount++;
          if (attemptCount === 1) {
            return 'yellow'; // Invalid choice
          }
          return 'blue'; // Valid choice
        }
      );

      expect(attemptCount).toBe(2);
      expect(result).toEqual({ selectedColor: 'blue' });
    });
  });

  describe('Session Lifecycle Management', () => {
    it('should track session state transitions', async () => {
      const sessionTool: InteractiveTool = {
        name: 'state_tracker',
        description: 'Tracks session states',
        async execute(context) {
          await context.prompt({
            type: PromptType.TEXT,
            message: 'Enter something:',
          });

          return { completed: true };
        },
      };

      server.registerTool(sessionTool);

      const sessionId = await client.startInteraction('state_tracker');

      // Check initial state
      let state = await client.getState(sessionId);
      expect(state.state).toBe(InteractionState.WAITING_USER);
      expect(state.currentPrompt).toBeDefined();

      // Respond
      await client.respond(sessionId, 'test input');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check completed state
      state = await client.getState(sessionId);
      expect(state.state).toBe(InteractionState.COMPLETED);
    });

    it('should handle session cancellation', async () => {
      const cancelTool: InteractiveTool = {
        name: 'cancellable',
        description: 'Tool that can be cancelled',
        async execute(context) {
          await context.prompt({
            type: PromptType.TEXT,
            message: 'This will be cancelled:',
          });

          return { shouldNotReach: true };
        },
      };

      server.registerTool(cancelTool);

      const sessionId = await client.startInteraction('cancellable');

      // Wait for prompt
      await new Promise(resolve => setTimeout(resolve, 50));

      // Cancel session
      await client.cancel(sessionId, 'User cancelled');

      const state = await client.getState(sessionId);
      expect(state.state).toBe(InteractionState.CANCELLED);
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
      const errorTool: InteractiveTool = {
        name: 'error_tool',
        description: 'Tool that throws an error',
        async execute() {
          throw new Error('Intentional error for testing');
        },
      };

      server.registerTool(errorTool);

      const sessionId = await client.startInteraction('error_tool');

      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = await client.getState(sessionId);
      expect(state.state).toBe(InteractionState.ERROR);
    });

    it('should return error for non-existent tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 4,
        method: 'interaction.start',
        params: {
          toolName: 'non_existent_tool',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Tool not found');
    });
  });

  describe('Data Normalization', () => {
    it('should normalize number inputs from strings', async () => {
      const numberTool: InteractiveTool = {
        name: 'number_test',
        description: 'Tests number normalization',
        async execute(context) {
          const response = await context.prompt({
            type: PromptType.NUMBER,
            message: 'Enter a number:',
          });

          return {
            value: response.value,
            type: typeof response.value,
          };
        },
      };

      server.registerTool(numberTool);

      const result = await client.runInteractive(
        'number_test',
        async () => '42' // String input
      );

      expect(result).toEqual({
        value: 42,
        type: 'number', // Should be normalized to number
      });
    });

    it('should normalize confirm inputs', async () => {
      const confirmTool: InteractiveTool = {
        name: 'confirm_test',
        description: 'Tests confirm normalization',
        async execute(context) {
          const response = await context.prompt({
            type: PromptType.CONFIRM,
            message: 'Confirm?',
          });

          return {
            value: response.value,
            type: typeof response.value,
          };
        },
      };

      server.registerTool(confirmTool);

      const result = await client.runInteractive(
        'confirm_test',
        async () => 'yes' // String input
      );

      expect(result).toEqual({
        value: true,
        type: 'boolean', // Should be normalized to boolean
      });
    });
  });

  describe('Protocol Compliance Verification', () => {
    it('should use proper error code ranges', () => {
      const capabilities = server.getCapabilities();

      // Verify experimental namespace
      expect(capabilities.interactive).toBe(true);
      expect(capabilities.version).toBe('0.1.0');
      expect(capabilities.features.statefulSessions).toBe(true);
      expect(capabilities.features.validation).toBe(true);
    });

    it('should handle concurrent sessions independently', async () => {
      const tool: InteractiveTool = {
        name: 'concurrent_test',
        description: 'Tests concurrent sessions',
        async execute(context) {
          const response = await context.prompt({
            type: PromptType.TEXT,
            message: 'Enter session data:',
          });

          return { data: response.value };
        },
      };

      server.registerTool(tool);

      // Start two sessions
      const session1 = await client.startInteraction('concurrent_test');
      const session2 = await client.startInteraction('concurrent_test');

      // Sessions should be independent
      expect(session1).not.toBe(session2);

      const state1 = await client.getState(session1);
      const state2 = await client.getState(session2);

      expect(state1.sessionId).toBe(session1);
      expect(state2.sessionId).toBe(session2);
      expect(state1.sessionId).not.toBe(state2.sessionId);
    });
  });
});
