/**
 * MCP Flow - Interactive Protocol Extension for Model Context Protocol
 *
 * Transforms MCP from single request-response tool calls into conversational,
 * multi-turn interactions with state preservation and flow control.
 *
 * @packageDocumentation
 */

// Protocol layer
export * from './protocol';

// Session management
export * from './session';

// Server implementation
export * from './server';

// Client implementation
export * from './client';

// Interaction patterns
export * from './patterns';

// Example tools (optional, for demonstration)
export * from './examples';

/**
 * Version information
 */
export const VERSION = '0.1.0';
