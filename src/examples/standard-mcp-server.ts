/**
 * Example: Standard MCP Server (Non-Interactive)
 *
 * This server implements the standard MCP protocol WITHOUT interactive features.
 * Demonstrates multi-step conversational flow through multiple discrete tool calls.
 * The LLM makes separate tool calls as the user provides information step-by-step.
 *
 * Usage:
 *   node dist/examples/standard-mcp-server.js
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Server-side state for booking information
interface BookingState {
  destination?: string;
  dates?: string;
  travelers?: number;
}

let currentBooking: BookingState = {};

async function main() {
  // Create standard MCP server (no interactive capabilities)
  const server = new Server(
    {
      name: 'standard-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'set-destination',
          description: 'Set the travel destination for the booking',
          inputSchema: {
            type: 'object',
            properties: {
              destination: {
                type: 'string',
                description: 'Travel destination (e.g., Paris, Tokyo, New York)',
              },
            },
            required: ['destination'],
          },
        },
        {
          name: 'set-dates',
          description: 'Set the travel dates for the booking',
          inputSchema: {
            type: 'object',
            properties: {
              dates: {
                type: 'string',
                description: 'Travel dates (e.g., June 1-5, 2024)',
              },
            },
            required: ['dates'],
          },
        },
        {
          name: 'set-travelers',
          description: 'Set the number of travelers for the booking',
          inputSchema: {
            type: 'object',
            properties: {
              travelers: {
                type: 'number',
                description: 'Number of travelers (1-10)',
              },
            },
            required: ['travelers'],
          },
        },
        {
          name: 'get-booking-status',
          description: 'Get the current booking information that has been collected so far',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'confirm-booking',
          description:
            'Confirm and finalize the booking with all collected information. Use this after destination, dates, and travelers have been set.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'cancel-booking',
          description: 'Cancel the current booking and clear all information',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Set destination
    if (name === 'set-destination') {
      const { destination } = args as { destination: string };
      currentBooking.destination = destination;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Destination set to ${destination}`,
              currentBooking,
              nextSteps: getNextSteps(),
            }),
          },
        ],
      };
    }

    // Set dates
    if (name === 'set-dates') {
      const { dates } = args as { dates: string };
      currentBooking.dates = dates;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Travel dates set to ${dates}`,
              currentBooking,
              nextSteps: getNextSteps(),
            }),
          },
        ],
      };
    }

    // Set travelers
    if (name === 'set-travelers') {
      const { travelers } = args as { travelers: number };

      if (travelers < 1 || travelers > 10) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Number of travelers must be between 1 and 10',
              }),
            },
          ],
        };
      }

      currentBooking.travelers = travelers;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Number of travelers set to ${travelers}`,
              currentBooking,
              nextSteps: getNextSteps(),
            }),
          },
        ],
      };
    }

    // Get booking status
    if (name === 'get-booking-status') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              currentBooking,
              isComplete: isBookingComplete(),
              nextSteps: getNextSteps(),
            }),
          },
        ],
      };
    }

    // Confirm booking
    if (name === 'confirm-booking') {
      if (!isBookingComplete()) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Cannot confirm booking - missing required information',
                currentBooking,
                missing: getMissingFields(),
              }),
            },
          ],
        };
      }

      const booking = {
        success: true,
        booking: {
          destination: currentBooking.destination,
          dates: currentBooking.dates,
          travelers: currentBooking.travelers,
          confirmationId: `BK-${Date.now()}`,
        },
        message: `Successfully booked trip to ${currentBooking.destination} for ${currentBooking.travelers} traveler(s) on ${currentBooking.dates}`,
      };

      // Reset booking after confirmation
      currentBooking = {};

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(booking, null, 2),
          },
        ],
      };
    }

    // Cancel booking
    if (name === 'cancel-booking') {
      currentBooking = {};

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Booking cancelled and all information cleared',
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
    };
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log to stderr (stdout is used for protocol)
  console.error('Standard MCP server started (multi-step mode)');
  console.error('Tools: set-destination, set-dates, set-travelers, confirm-booking, get-booking-status, cancel-booking');
}

// Helper functions
function isBookingComplete(): boolean {
  return !!(
    currentBooking.destination &&
    currentBooking.dates &&
    currentBooking.travelers
  );
}

function getMissingFields(): string[] {
  const missing: string[] = [];
  if (!currentBooking.destination) missing.push('destination');
  if (!currentBooking.dates) missing.push('dates');
  if (!currentBooking.travelers) missing.push('travelers');
  return missing;
}

function getNextSteps(): string[] {
  const steps: string[] = [];

  if (!currentBooking.destination) {
    steps.push('Set destination using set-destination tool');
  }
  if (!currentBooking.dates) {
    steps.push('Set travel dates using set-dates tool');
  }
  if (!currentBooking.travelers) {
    steps.push('Set number of travelers using set-travelers tool');
  }
  if (isBookingComplete()) {
    steps.push('Confirm booking using confirm-booking tool');
  }

  return steps;
}

// Run the server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
