/**
 * Interactive server tests
 */

import { InteractiveServer, InteractiveTool } from '../src/server';
import { PromptType } from '../src/protocol/types';

describe('InteractiveServer', () => {
  let server: InteractiveServer;

  beforeEach(() => {
    server = new InteractiveServer({
      session: {
        defaultTimeout: 10000,
      },
    });
  });

  afterEach(() => {
    server.destroy();
  });

  describe('capabilities', () => {
    it('should return capabilities', () => {
      const capabilities = server.getCapabilities();

      expect(capabilities.interactive).toBe(true);
      expect(capabilities.version).toBeDefined();
      expect(capabilities.features.statefulSessions).toBe(true);
    });
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);

      // Tool is registered if start request succeeds
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: {
          toolName: 'test-tool',
        },
      };

      return server.handleRequest(request).then((response) => {
        expect((response as any).error).toBeUndefined();
        expect((response as any).result).toBeDefined();
      });
    });

    it('should unregister a tool', () => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);
      const unregistered = server.unregisterTool('test-tool');

      expect(unregistered).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('should handle capabilities request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'capabilities',
      };

      const response = await server.handleRequest(request);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toBeDefined();
    });

    it('should handle interaction.start request', async () => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: {
          toolName: 'test-tool',
        },
      };

      const response = await server.handleRequest(request);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toHaveProperty('sessionId');
    });

    it('should return error for unknown tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: {
          toolName: 'unknown-tool',
        },
      };

      const response = await server.handleRequest(request);

      expect((response as any).error).toBeDefined();
      expect((response as any).error?.message).toContain('Tool not found');
    });

    it('should handle interaction.respond request', async () => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async (context) => {
          await context.prompt({
            type: PromptType.TEXT,
            message: 'Enter text',
          });
          return { success: true };
        },
      };

      server.registerTool(tool);

      // Start interaction
      const startRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: { toolName: 'test-tool' },
      };

      const startResponse = await server.handleRequest(startRequest);
      const sessionId = ((startResponse as any).result as { sessionId: string }).sessionId;

      // Wait for prompt
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Respond
      const respondRequest = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'interaction.respond',
        params: {
          sessionId,
          response: {
            value: 'test response',
            timestamp: Date.now(),
          },
        },
      };

      const respondResponse = await server.handleRequest(respondRequest);

      expect((respondResponse as any).error).toBeUndefined();
      expect((respondResponse as any).result).toHaveProperty('accepted');
    });

    it('should handle interaction.cancel request', async () => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);

      // Start interaction
      const startRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: { toolName: 'test-tool' },
      };

      const startResponse = await server.handleRequest(startRequest);
      const sessionId = ((startResponse as any).result as { sessionId: string }).sessionId;

      // Cancel
      const cancelRequest = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'interaction.cancel',
        params: {
          sessionId,
          reason: 'Test cancellation',
        },
      };

      const cancelResponse = await server.handleRequest(cancelRequest);

      expect((cancelResponse as any).error).toBeUndefined();
      expect((cancelResponse as any).result).toHaveProperty('cancelled', true);
    });

    it('should return error for invalid method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'invalid.method',
      };

      const response = await server.handleRequest(request);

      expect((response as any).error).toBeDefined();
      expect((response as any).error?.code).toBe(-32601);
    });
  });

  describe('events', () => {
    it('should emit toolStarted event', (done) => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);

      server.on('toolStarted', (_sessionId, toolName) => {
        expect(toolName).toBe('test-tool');
        done();
      });

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: { toolName: 'test-tool' },
      };

      server.handleRequest(request);
    });

    it('should emit toolCompleted event', (done) => {
      const tool: InteractiveTool = {
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({ success: true }),
      };

      server.registerTool(tool);

      server.on('toolCompleted', (_sessionId, result) => {
        expect(result).toEqual({ success: true });
        done();
      });

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'interaction.start',
        params: { toolName: 'test-tool' },
      };

      server.handleRequest(request);
    });
  });
});
