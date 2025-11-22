/**
 * CRITICAL ANALYSIS: Integration Test Verification
 *
 * This test file adds debug logging to verify that validation is actually
 * happening on the server side and not just in the client.
 */

import { InteractiveServer, InteractiveTool } from '../src/server';
import { InteractiveClient, Transport } from '../src/client';
import { PromptType } from '../src/protocol/types';
import { JsonRpcRequest, JsonRpcResponse } from '../src/protocol/types';

class InMemoryTransport implements Transport {
  constructor(private server: InteractiveServer) {}

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    console.log('[TRANSPORT] Request:', JSON.stringify(request, null, 2));
    const response = await this.server.handleRequest(request);
    console.log('[TRANSPORT] Response:', JSON.stringify(response, null, 2));
    return response;
  }
}

describe('Critical Test Verification', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;
  let transport: InMemoryTransport;

  beforeEach(() => {
    server = new InteractiveServer({
      session: {
        defaultTimeout: 60000,
      },
    });
    transport = new InMemoryTransport(server);
    client = new InteractiveClient(transport);
  });

  afterEach(() => {
    server.destroy();
  });

  it('VERIFY: Validation actually happens server-side', async () => {
    console.log('\n========== TEST: Server-side Validation ==========');

    const validationTool: InteractiveTool = {
      name: 'age_verify',
      description: 'Age verification tool',
      async execute(context) {
        console.log('[TOOL] Starting execution');
        const response = await context.prompt({
          type: PromptType.NUMBER,
          message: 'Enter your age:',
          validation: {
            required: true,
            min: 18,
            max: 120,
          },
        });

        console.log('[TOOL] Received validated response:', response.value);
        return {
          message: `Age ${response.value} verified`,
        };
      },
    };

    server.registerTool(validationTool);

    let attemptCount = 0;
    const result = await client.runInteractive(
      'age_verify',
      async (prompt) => {
        attemptCount++;
        console.log(`[CLIENT] Attempt ${attemptCount}, prompt:`, prompt.message);

        if (attemptCount === 1) {
          console.log('[CLIENT] Sending invalid age: 10 (should be rejected)');
          return 10;
        }
        console.log('[CLIENT] Sending valid age: 25');
        return 25;
      }
    );

    console.log('[TEST] Final attempt count:', attemptCount);
    console.log('[TEST] Final result:', result);

    // Verify server rejected invalid input and client had to retry
    expect(attemptCount).toBe(2);
    expect(result).toEqual({
      message: 'Age 25 verified',
    });
  });

  it('VERIFY: State actually persists across multiple prompts', async () => {
    console.log('\n========== TEST: State Persistence ==========');

    const stateTool: InteractiveTool = {
      name: 'state_test',
      description: 'Tests state persistence',
      async execute(context) {
        console.log('[TOOL] Initial state:', context.getData());

        // First prompt
        await context.prompt({
          type: PromptType.TEXT,
          message: 'First input:',
        });

        context.setData('step1', 'completed');
        console.log('[TOOL] After step 1:', context.getData());

        // Second prompt - verify step1 data still exists
        await context.prompt({
          type: PromptType.TEXT,
          message: 'Second input:',
        });

        const step1Data = context.getData('step1');
        console.log('[TOOL] Step 1 data retrieved:', step1Data);

        if (step1Data !== 'completed') {
          throw new Error('State was not persisted!');
        }

        return { statePreserved: true };
      },
    };

    server.registerTool(stateTool);

    const result = await client.runInteractive(
      'state_test',
      async (_prompt) => {
        console.log('[CLIENT] Responding to:', _prompt.message);
        return 'test';
      }
    );

    expect(result).toEqual({ statePreserved: true });
  });

  it('VERIFY: Choice validation actually rejects invalid values', async () => {
    console.log('\n========== TEST: Choice Validation ==========');

    const choiceTool: InteractiveTool = {
      name: 'choice_test',
      description: 'Tests choice validation',
      async execute(context) {
        const response = await context.prompt({
          type: PromptType.CHOICE,
          message: 'Pick a color:',
          choices: [
            { value: 'red', label: 'Red' },
            { value: 'blue', label: 'Blue' },
          ],
        });

        console.log('[TOOL] Received choice:', response.value);
        return { color: response.value };
      },
    };

    server.registerTool(choiceTool);

    let attemptCount = 0;
    let rejectionDetected = false;

    const result = await client.runInteractive(
      'choice_test',
      async (_prompt) => {
        attemptCount++;
        console.log(`[CLIENT] Attempt ${attemptCount}`);

        if (attemptCount === 1) {
          console.log('[CLIENT] Sending invalid choice: green');
          return 'green'; // Should be rejected
        }

        if (attemptCount === 2) {
          rejectionDetected = true;
          console.log('[CLIENT] Retry detected - validation worked!');
        }

        console.log('[CLIENT] Sending valid choice: red');
        return 'red';
      }
    );

    console.log('[TEST] Rejection detected:', rejectionDetected);
    console.log('[TEST] Attempt count:', attemptCount);

    expect(rejectionDetected).toBe(true);
    expect(attemptCount).toBe(2);
    expect(result).toEqual({ color: 'red' });
  });

  it('VERIFY: Actual JSON-RPC message structure', async () => {
    console.log('\n========== TEST: JSON-RPC Structure ==========');

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'test-123',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    };

    const response = await server.handleRequest(request);

    // Verify exact structure
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 'test-123');

    // Must have exactly one of result or error
    const hasResult = response.result !== undefined;
    const hasError = response.error !== undefined;

    console.log('[TEST] Has result:', hasResult);
    console.log('[TEST] Has error:', hasError);

    expect(hasResult !== hasError).toBe(true); // XOR - exactly one must be true

    if (hasResult) {
      const result = response.result as any;
      expect(result).toHaveProperty('protocolVersion');
      expect(result).toHaveProperty('serverInfo');
      expect(result).toHaveProperty('capabilities');
      expect(result.capabilities).toHaveProperty('experimental');
      expect(result.capabilities.experimental).toHaveProperty('interactive');
    }
  });

  it('VERIFY: Error codes are in correct range', async () => {
    console.log('\n========== TEST: Error Code Ranges ==========');

    // Test session not found error
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'interaction.getState',
      params: { sessionId: 'non-existent' },
    };

    const response = await server.handleRequest(request);

    console.log('[TEST] Error response:', response.error);

    expect(response.error).toBeDefined();
    const errorCode = response.error!.code;

    // Verify it's in MCP Flow custom range (-32050 to -32099)
    expect(errorCode).toBeGreaterThanOrEqual(-32099);
    expect(errorCode).toBeLessThanOrEqual(-32050);

    // Verify it's in JSON-RPC "implementation-defined server errors" range (-32099 to -32000)
    // This is the CORRECT range for custom server errors per JSON-RPC 2.0 spec
    const inServerErrorRange = errorCode >= -32099 && errorCode <= -32000;
    expect(inServerErrorRange).toBe(true);

    // Verify it's NOT in standard JSON-RPC error range (-32700 to -32600)
    const inStandardErrorRange = errorCode >= -32700 && errorCode <= -32600;
    expect(inStandardErrorRange).toBe(false);

    console.log('[TEST] Error code:', errorCode);
    console.log('[TEST] In MCP Flow range (-32099 to -32050):', true);
    console.log('[TEST] In JSON-RPC server error range (-32099 to -32000):', inServerErrorRange);
    console.log('[TEST] In JSON-RPC standard error range (-32700 to -32600):', inStandardErrorRange);
  });
});
