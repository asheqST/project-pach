/**
 * Tests for MCP SDK Transport Integration
 */

import { InteractiveServer } from '../src/server/interactive-server';
import { connectTransport } from '../src/server/transport-adapter';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// Mock transport implementation for testing
class MockTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  private messageQueue: JSONRPCMessage[] = [];
  private started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.messageQueue.push(message);
  }

  async close(): Promise<void> {
    this.started = false;
    if (this.onclose) {
      this.onclose();
    }
  }

  // Test helpers
  getMessages(): JSONRPCMessage[] {
    return this.messageQueue;
  }

  async simulateMessage(message: JSONRPCMessage): Promise<void> {
    if (this.onmessage) {
      this.onmessage(message);
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  isStarted(): boolean {
    return this.started;
  }
}

describe('Transport Integration', () => {
  let server: InteractiveServer;
  let transport: MockTransport;

  beforeEach(() => {
    server = new InteractiveServer();
    transport = new MockTransport();
  });

  afterEach(() => {
    server.destroy();
  });

  describe('connectTransport', () => {
    it('should start the transport', async () => {
      await connectTransport(server, transport);
      expect(transport.isStarted()).toBe(true);
    });

    it('should handle initialize requests', async () => {
      await connectTransport(server, transport);

      await transport.simulateMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

      const messages = transport.getMessages();
      expect(messages.length).toBe(1);

      const response = messages[0] as any;
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.capabilities.experimental).toBeDefined();
      expect(response.result.capabilities.experimental.interactive).toBeDefined();
    });

    it('should handle interaction.start requests', async () => {
      // Register a tool
      server.registerTool({
        name: 'test-tool',
        description: 'Test tool',
        async execute(_context) {
          return { success: true };
        },
      });

      await connectTransport(server, transport);

      await transport.simulateMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'interaction.start',
        params: {
          toolName: 'test-tool',
        },
      });

      const messages = transport.getMessages();
      expect(messages.length).toBe(1);

      const response = messages[0] as any;
      expect(response.id).toBe(2);
      expect(response.result).toBeDefined();
      expect(response.result.sessionId).toBeDefined();
      expect(response.result.state).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      let errorCaught = false;
      server.on('error', () => {
        errorCaught = true;
      });

      await connectTransport(server, transport);

      // Send invalid message (missing required fields)
      await transport.simulateMessage({
        jsonrpc: '2.0',
        method: 'interaction.start',
        // Missing id and params
      } as any);

      // Error should be handled
      expect(errorCaught).toBe(false); // Internal errors don't emit
    });

    it('should destroy server when transport closes', async () => {
      const destroySpy = jest.spyOn(server, 'destroy');

      await connectTransport(server, transport);
      await transport.close();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('should handle tool not found error', async () => {
      await connectTransport(server, transport);

      await transport.simulateMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'interaction.start',
        params: {
          toolName: 'non-existent-tool',
        },
      });

      const messages = transport.getMessages();
      expect(messages.length).toBe(1);

      const response = messages[0] as any;
      expect(response.id).toBe(3);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Tool not found');
    });

    it('should handle session state requests', async () => {
      // Register a tool
      server.registerTool({
        name: 'test-tool',
        description: 'Test tool',
        async execute(_context) {
          return { success: true };
        },
      });

      await connectTransport(server, transport);

      // Start interaction
      await transport.simulateMessage({
        jsonrpc: '2.0',
        id: 4,
        method: 'interaction.start',
        params: {
          toolName: 'test-tool',
        },
      });

      const startResponse = transport.getMessages()[0] as any;
      const sessionId = startResponse.result.sessionId;

      // Get state
      await transport.simulateMessage({
        jsonrpc: '2.0',
        id: 5,
        method: 'interaction.getState',
        params: {
          sessionId,
        },
      });

      const messages = transport.getMessages();
      expect(messages.length).toBe(2);

      const stateResponse = messages[1] as any;
      expect(stateResponse.id).toBe(5);
      expect(stateResponse.result).toBeDefined();
      expect(stateResponse.result.sessionId).toBe(sessionId);
    });
  });

  describe('Message type guards', () => {
    it('should identify requests', () => {
      const { isRequest } = require('../src/server/transport-adapter');

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };

      expect(isRequest(request)).toBe(true);
    });

    it('should identify responses', () => {
      const { isResponse } = require('../src/server/transport-adapter');

      const successResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {},
      };

      const errorResponse = {
        jsonrpc: '2.0',
        id: 2,
        error: { code: -1, message: 'error' },
      };

      expect(isResponse(successResponse)).toBe(true);
      expect(isResponse(errorResponse)).toBe(true);
    });
  });
});
