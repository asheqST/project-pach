# MCP Flow Architecture

This document describes the internal architecture of MCP Flow and how it integrates with the official MCP SDK.

## Design Philosophy

**MCP Flow extends, not reimplements.**

Instead of creating a standalone protocol implementation, MCP Flow builds on top of the official `@modelcontextprotocol/sdk`, following the principle of **composition over duplication**.

## MCP SDK Integration

### What We Use from MCP SDK

MCP Flow leverages the following from `@modelcontextprotocol/sdk`:

1. **Protocol Types** (`@modelcontextprotocol/sdk/types.js`):
   - `JSONRPCRequest` - Base request type
   - `JSONRPCResponse` - Success response type
   - `JSONRPCError` - Error response type
   - `Request` - Protocol request interface

2. **Type Compatibility**:
   - Our interactive requests extend SDK's `Request` type
   - Our responses conform to SDK's response unions
   - Full compatibility with SDK transports

### What We Add (Interactive Extensions)

MCP Flow adds interactive capabilities on top of the MCP SDK foundation:

```typescript
// src/protocol/types.ts

// Import MCP SDK types (not reimplement)
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  Request
} from '@modelcontextprotocol/sdk/types.js';

// Re-export for backward compatibility
export type JsonRpcRequest = JSONRPCRequest;
export type JsonRpcResponse = JSONRPCResponse | JSONRPCError;

// Extend SDK types for interactive protocol
export interface InteractionStartRequest extends Request {
  method: 'interaction.start';
  params: {
    toolName: string;
    initialParams?: Record<string, unknown>;
    context?: Record<string, unknown>;
    timeout?: number;
  };
}
```

## Architecture Layers

### Layer 1: Protocol Layer

**Location**: `src/protocol/`

**Purpose**: Define interactive protocol messages as extensions to MCP SDK types

**Key Files**:
- `types.ts` - Interactive message types extending MCP SDK
- `utils.ts` - Protocol utilities and type guards
- `validator.ts` - Input validation logic

**Design Pattern**:
```typescript
// DON'T: Reimplement JSON-RPC
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

// DO: Import from MCP SDK
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
export type JsonRpcRequest = JSONRPCRequest;
```

### Layer 2: Session Layer

**Location**: `src/session/`

**Purpose**: State management and lifecycle tracking (MCP Flow-specific logic)

**Key Files**:
- `manager.ts` - Stateful session management
- `stateless.ts` - Token-based stateless sessions

**Key Concepts**:
- Session lifecycle (IDLE → ACTIVE → WAITING_USER → COMPLETED)
- Turn-by-turn history
- Accumulated data storage
- Timeout management

### Layer 3: Server Layer

**Location**: `src/server/`

**Purpose**: Interactive server implementation using MCP SDK types

**Key File**: `interactive-server.ts`

**Design**:
```typescript
import EventEmitter from 'eventemitter3';
import {
  JsonRpcRequest,  // Re-exported MCP SDK type
  JsonRpcResponse, // Re-exported MCP SDK type
  // ... other types
} from '../protocol/types';

export class InteractiveServer extends EventEmitter {
  // Server logic uses MCP SDK-compatible types
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // Implementation
  }
}
```

The server:
- Uses MCP SDK protocol types throughout
- Can integrate with MCP SDK transports
- Maintains interactive-specific logic (sessions, tools, prompts)
- No manual JSON-RPC implementation

### Layer 4: Client Layer

**Location**: `src/client/`

**Purpose**: Client for interacting with MCP Flow servers

**Key File**: `interactive-client.ts`

**Type Safety**:
```typescript
import { isErrorResponse, isSuccessResponse } from '../protocol/utils';

const response = await transport.send(request);

// Type-safe response handling
if (isErrorResponse(response)) {
  // TypeScript knows this is an error response
  throw new Error(response.error.message);
}

// TypeScript knows this is a success response
const result = response.result;
```

### Layer 5: Pattern Layer

**Location**: `src/patterns/`

**Purpose**: High-level interaction patterns built on top of protocol

**Key Files**:
- `wizard.ts` - Sequential multi-step flows
- `validation.ts` - Input validation with retry
- `clarification.ts` - Ambiguity resolution

## Type Guards and Union Types

MCP SDK uses union types for responses (`JSONRPCResponse | JSONRPCError`). We provide type guards for safe narrowing:

```typescript
// src/protocol/utils.ts

export function isErrorResponse(
  response: JsonRpcResponse
): response is JsonRpcError {
  return 'error' in response && response.error !== undefined;
}

export function isSuccessResponse(
  response: JsonRpcResponse
): response is JSONRPCResponse {
  return 'result' in response && !('error' in response);
}
```

Usage:
```typescript
const response = await server.handleRequest(request);

if (isErrorResponse(response)) {
  // Handle error case
  console.error(response.error.message);
} else {
  // Handle success case
  console.log(response.result);
}
```

## Transport Integration

MCP Flow is designed to work with MCP SDK transports:

### Current Architecture (Custom Transport Interface)

```typescript
// src/client/interactive-client.ts
export interface Transport {
  send(request: JsonRpcRequest): Promise<JsonRpcResponse>;
}
```

### Future: MCP SDK Transport Integration

The architecture supports future integration with official MCP SDK transports:

```typescript
// Future enhancement
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Server can use MCP SDK transports directly
const transport = new StdioServerTransport();
// Connect server to transport
```

## Benefits of This Architecture

### 1. **No Protocol Duplication**
- MCP SDK handles JSON-RPC 2.0 implementation
- We focus on interactive-specific logic
- Less code to maintain

### 2. **Type Safety**
- TypeScript type guards for union types
- Compile-time safety for protocol messages
- IDE autocomplete for MCP SDK types

### 3. **Future Compatibility**
- Automatically stays in sync with MCP SDK updates
- Easy to adopt new SDK features
- Protocol changes propagate automatically

### 4. **Transport Flexibility**
- Compatible with MCP SDK transports
- Can use stdio, SSE, WebSockets
- No custom transport implementation needed

### 5. **Standards Compliance**
- Official MCP SDK ensures protocol compliance
- No risk of diverging from specification
- Interoperability with other MCP tools

## Migration Path (Completed)

The refactoring from standalone to SDK-based implementation involved:

1. ✅ Add `@modelcontextprotocol/sdk` dependency
2. ✅ Replace custom JSON-RPC types with SDK imports
3. ✅ Extend SDK `Request` type for interactive requests
4. ✅ Add type guards for SDK union types
5. ✅ Update server to use SDK types
6. ✅ Update client with type-safe response handling
7. ✅ Update all tests (123 tests passing)

**Result**: Zero breaking changes, full backward compatibility maintained.

## Testing Strategy

### Test Helpers

Type-safe test utilities (`tests/test-helpers.ts`):

```typescript
export function expectSuccess<T>(response: JsonRpcResponse): T {
  if (isErrorResponse(response)) {
    throw new Error(`Expected success but got error: ${response.error.message}`);
  }
  return response.result as T;
}

export function expectError(response: JsonRpcResponse) {
  if (isSuccessResponse(response)) {
    throw new Error('Expected error but got success');
  }
  return response.error;
}
```

### Test Coverage

- **123 tests** across 6 test suites
- Protocol compliance tests
- Integration tests
- Session management tests
- Pattern tests
- Coverage tests

## Future Enhancements

### 1. Direct MCP SDK Server Integration

Instead of custom server class, extend MCP SDK's `Server` class:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export class InteractiveServer extends Server {
  // Register interactive request handlers
  // Leverage SDK's built-in capabilities
}
```

### 2. Official Transport Integration

Use MCP SDK transports directly:

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
const server = new InteractiveServer();

await server.connect(transport);
```

### 3. MCP SDK Client Integration

Leverage SDK's `Client` class:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class InteractiveClient extends Client {
  // Add interactive methods
}
```

## Conclusion

MCP Flow demonstrates how to properly **extend** an SDK rather than **reimplement** it:

- Composition over duplication
- Type-safe extensions
- Standards compliance
- Future-proof architecture

This architectural approach ensures MCP Flow remains a lightweight, maintainable extension to the Model Context Protocol ecosystem.
