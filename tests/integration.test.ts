/**
 * Integration Tests
 * Tests MCP Flow compatibility with standard MCP patterns
 */

import { InteractiveServer } from '../src/server';
import { InteractiveClient, Transport } from '../src/client';
import { WizardBuilder } from '../src/patterns/wizard';

describe('Integration Tests', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;
  let transport: Transport;

  beforeEach(() => {
    server = new InteractiveServer();

    transport = {
      async send(request) {
        return await server.handleRequest(request);
      },
    };

    client = new InteractiveClient(transport);
  });

  afterEach(() => {
    server.destroy();
  });

  describe('MCP Protocol Compliance', () => {
    it('should respond to initialize request', async () => {
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

      const response = await transport.send(request);

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('protocolVersion', '2024-11-05');
      expect(response.result).toHaveProperty('serverInfo');
      expect(response.result).toHaveProperty('capabilities');
    });

    it('should expose interactive capabilities under experimental namespace', async () => {
      const capabilities = await client.negotiate();

      expect(capabilities).toBeDefined();
      expect(capabilities.interactive).toBeDefined();
      expect(capabilities.version).toBeDefined();
      expect(capabilities.features).toBeDefined();
    });

    it('should use correct error code range', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.getState',
        params: {
          sessionId: 'non-existent-session',
        },
      };

      const response = await transport.send(request);

      expect(response.error).toBeDefined();
      // Error codes should be in -32050 to -32099 range
      expect(response.error!.code).toBeGreaterThanOrEqual(-32099);
      expect(response.error!.code).toBeLessThanOrEqual(-32050);
    });
  });

  describe('Interactive Tool Execution', () => {
    it('should execute complete interactive flow', async () => {
      // Register tool
      server.registerTool({
        name: 'greeting',
        description: 'Get greeting',
        async execute(context) {
          const nameResponse = await context.prompt({
            type: 'text',
            message: 'Enter your name:',
            validation: { required: true },
          });

          return {
            greeting: `Hello, ${nameResponse.value}!`,
          };
        },
      });

      // Run interaction
      const result = await client.runInteractive(
        'greeting',
        async (prompt) => {
          expect(prompt.message).toBe('Enter your name:');
          return 'Alice';
        }
      );

      expect(result).toEqual({
        greeting: 'Hello, Alice!',
      });
    });

    it('should handle validation failures with retry', async () => {
      server.registerTool({
        name: 'age_validator',
        description: 'Validate age',
        async execute(context) {
          const ageResponse = await context.prompt({
            type: 'number',
            message: 'Enter your age:',
            validation: {
              required: true,
              min: 18,
              max: 120,
            },
          });

          return { age: ageResponse.value, valid: true };
        },
      });

      const responses = [15, 25]; // First fails, second succeeds
      let attemptCount = 0;

      const result = await client.runInteractive('age_validator', async (prompt) => {
        const response = responses[attemptCount++];
        return response;
      });

      expect(result).toEqual({ age: 25, valid: true });
      expect(attemptCount).toBeGreaterThan(1); // Should have retried
    });

    it('should support wizard pattern', async () => {
      server.registerTool({
        name: 'profile_wizard',
        description: 'Create profile',
        async execute(context) {
          const wizard = new WizardBuilder()
            .addText('name', 'Name:', { required: true })
            .addNumber('age', 'Age:', { min: 18, required: true })
            .addChoice('country', 'Country:', [
              { value: 'us', label: 'United States' },
              { value: 'uk', label: 'United Kingdom' },
            ])
            .onComplete((data) => ({ profile: data }))
            .build();

          return await wizard.execute(context);
        },
      });

      const responses = ['John Doe', '30', 'us'];
      let responseIndex = 0;

      const result = await client.runInteractive('profile_wizard', async (prompt) => {
        return responses[responseIndex++];
      });

      expect(result).toEqual({
        profile: {
          name: 'John Doe',
          age: 30,
          country: 'us',
        },
      });
    });
  });

  describe('Session Management', () => {
    it('should maintain session state across turns', async () => {
      server.registerTool({
        name: 'stateful_tool',
        description: 'Maintains state',
        async execute(context) {
          const firstResponse = await context.prompt({
            type: 'text',
            message: 'First input:',
          });

          context.setData('first', firstResponse.value);

          const secondResponse = await context.prompt({
            type: 'text',
            message: 'Second input:',
          });

          context.setData('second', secondResponse.value);

          const allData = context.getData();

          return {
            accumulated: allData,
            combined: `${allData.first}-${allData.second}`,
          };
        },
      });

      const responses = ['alpha', 'beta'];
      let responseIndex = 0;

      const result = await client.runInteractive('stateful_tool', async (prompt) => {
        return responses[responseIndex++];
      });

      expect(result).toEqual({
        accumulated: {
          first: 'alpha',
          second: 'beta',
        },
        combined: 'alpha-beta',
      });
    });

    it('should handle session cancellation', async () => {
      server.registerTool({
        name: 'long_tool',
        description: 'Long running tool',
        async execute(context) {
          await context.prompt({
            type: 'text',
            message: 'Start:',
          });

          // Tool continues...
          return { completed: true };
        },
      });

      const sessionId = await client.startInteraction('long_tool');

      // Cancel the session
      await client.cancel(sessionId, 'User cancelled');

      const state = await client.getState(sessionId);
      expect(state.state).toBe('cancelled');
    });

    it('should clean up completed sessions', async () => {
      server.registerTool({
        name: 'quick_tool',
        description: 'Quick tool',
        async execute(context) {
          return { done: true };
        },
      });

      const sessionId = await client.startInteraction('quick_tool');

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = await client.getState(sessionId);
      expect(['completed', 'error'].includes(state.state)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle tool not found', async () => {
      await expect(client.startInteraction('non_existent_tool')).rejects.toThrow();
    });

    it('should handle invalid session ID', async () => {
      await expect(client.respond('invalid-session', 'test')).rejects.toThrow();
    });

    it('should provide proper error messages', async () => {
      try {
        await client.startInteraction('missing_tool');
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy capabilities method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'capabilities',
      };

      const response = await transport.send(request);

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    it('should work with standard MCP tools (non-interactive)', async () => {
      // Even though our server is interactive,
      // it should still work with non-interactive tool patterns

      server.registerTool({
        name: 'simple_tool',
        description: 'Simple non-interactive tool',
        async execute(context) {
          // Use initial params directly, no prompts
          const { a, b } = context.initialParams || {};
          return { sum: (a as number) + (b as number) };
        },
      });

      // Call with initial params (no interaction needed)
      const sessionId = await client.startInteraction('simple_tool', {
        a: 5,
        b: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = await client.getState(sessionId);
      expect(state.state).toBe('completed');
    });
  });
});
