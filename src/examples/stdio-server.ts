/**
 * Example: Interactive MCP Server with stdio transport
 *
 * This example demonstrates how to create an MCP Flow server that uses
 * the official MCP SDK stdio transport for communication.
 *
 * Usage:
 *   node dist/examples/stdio-server.js
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InteractiveServer, connectTransport } from '../server/index.js';
import type { ToolExecutionContext } from '../server/interactive-server.js';
import { PromptType } from '../protocol/types.js';

async function main() {
  // Create the server
  const server = new InteractiveServer({
    session: {
      defaultTimeout: 300000, // 5 minutes
      maxSessions: 100,
    },
  });

  // Register an interactive greeting tool
  server.registerTool({
    name: 'greet',
    description: 'Interactive greeting that asks for user information',
    async execute(context: ToolExecutionContext) {
      try {
        // Ask for name
        const nameResponse = await context.prompt({
          type: PromptType.TEXT,
          message: 'What is your name?',
          validation: { required: true },
        });

        // Ask for favorite color
        const colorResponse = await context.prompt({
          type: PromptType.CHOICE,
          message: 'What is your favorite color?',
          choices: [
            { value: 'red', label: 'Red' },
            { value: 'blue', label: 'Blue' },
            { value: 'green', label: 'Green' },
            { value: 'yellow', label: 'Yellow' },
          ],
          validation: { required: true },
        });

        // Return personalized greeting
        return {
          message: `Hello, ${nameResponse.value}! I see your favorite color is ${colorResponse.value}.`,
          name: nameResponse.value,
          color: colorResponse.value,
        };
      } catch (error) {
        // Handle non-interactive calls
        if ((error as Error).message.includes('Interactive prompts not supported')) {
          return {
            message: 'This tool requires interactive prompts which are not supported in standard MCP tool calls.',
            note: 'To use this tool interactively, use the interaction.start method with the MCP Flow protocol.',
          };
        }
        throw error;
      }
    },
  });

  // Register a booking wizard tool
  server.registerTool({
    name: 'book-travel',
    description: 'Multi-step travel booking wizard',
    async execute(context: ToolExecutionContext) {
      try {
        // Step 1: Destination
        const destResponse = await context.prompt({
          type: PromptType.TEXT,
          message: 'Where would you like to go?',
          placeholder: 'e.g., Paris, Tokyo, New York',
          validation: { required: true },
        });

        // Step 2: Travel dates
        const datesResponse = await context.prompt({
          type: PromptType.TEXT,
          message: 'When would you like to travel?',
          placeholder: 'e.g., June 15-22, 2024',
          validation: { required: true },
        });

        // Step 3: Number of travelers
        const travelersResponse = await context.prompt({
          type: PromptType.NUMBER,
          message: 'How many travelers?',
          validation: { required: true, min: 1, max: 10 },
        });

        // Step 4: Confirm booking
        const confirmResponse = await context.prompt({
          type: PromptType.CONFIRM,
          message: `Confirm booking to ${destResponse.value} for ${travelersResponse.value} traveler(s) on ${datesResponse.value}?`,
        });

        if (confirmResponse.value === true) {
          // Store booking data
          context.setData('destination', destResponse.value);
          context.setData('dates', datesResponse.value);
          context.setData('travelers', travelersResponse.value);

          return {
            success: true,
            booking: {
              destination: destResponse.value,
              dates: datesResponse.value,
              travelers: travelersResponse.value,
              confirmationId: `BK-${Date.now()}`,
            },
          };
        } else {
          return {
            success: false,
            message: 'Booking cancelled',
          };
        }
      } catch (error) {
        // Handle non-interactive calls
        if ((error as Error).message.includes('Interactive prompts not supported')) {
          return {
            message: 'This tool requires interactive prompts which are not supported in standard MCP tool calls.',
            note: 'To use this tool interactively, use the interaction.start method with the MCP Flow protocol.',
          };
        }
        throw error;
      }
    },
  });

  // Create MCP SDK stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await connectTransport(server, transport);

  // Log server ready message to stderr (stdout is used for protocol)
  console.error('MCP Flow server started with stdio transport');
  console.error('Registered tools:');
  console.error('  - greet: Interactive greeting');
  console.error('  - book-travel: Travel booking wizard');
}

// Run the server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
