# MCP Flow Protocol Specification

Version: 0.1.0

## Abstract

MCP Flow extends the Model Context Protocol (MCP) to support interactive, multi-turn tool executions. This specification defines protocol messages, session management, and interaction patterns that enable conversational tool experiences while maintaining backward compatibility with MCP 1.0.

## Table of Contents

1. [Introduction](#introduction)
2. [Protocol Messages](#protocol-messages)
3. [Session Management](#session-management)
4. [Message Flow](#message-flow)
5. [Error Handling](#error-handling)
6. [Capability Negotiation](#capability-negotiation)
7. [Security Considerations](#security-considerations)

## Introduction

### Motivation

Standard MCP tools operate atomically: one request, one response. Real-world tasks often require:

- Clarification of ambiguous inputs
- Validation with user feedback
- Progressive disclosure of options
- Multi-step guided workflows

MCP Flow addresses these needs by extending MCP with interaction primitives.

### Design Goals

1. **Backward Compatibility**: Zero breaking changes to MCP 1.0
2. **Simplicity**: Minimal protocol overhead
3. **Stateless Option**: Servers can operate without persistent state
4. **Transport Agnostic**: Works over stdio, HTTP, WebSockets
5. **Type Safe**: Well-defined message schemas

## Protocol Messages

All MCP Flow messages follow JSON-RPC 2.0 specification and use types from the official `@modelcontextprotocol/sdk`.

### Implementation Note

MCP Flow **extends** the MCP SDK instead of reimplementing the protocol:

```typescript
// Protocol types extend MCP SDK types
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  Request
} from '@modelcontextprotocol/sdk/types.js';

// Interactive requests extend the SDK's Request type
export interface InteractionStartRequest extends Request {
  method: 'interaction.start';
  params: { ... };
}
```

This approach ensures:
- Protocol compliance with official MCP specification
- No duplication of JSON-RPC implementation
- Compatibility with MCP SDK transports (stdio, SSE)
- Future-proof updates as SDK evolves

### Base Types

```typescript
type SessionId = string;

enum InteractionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  WAITING_USER = 'waiting_user',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ERROR = 'error'
}

enum PromptType {
  TEXT = 'text',
  CHOICE = 'choice',
  CONFIRM = 'confirm',
  NUMBER = 'number',
  DATE = 'date',
  FILE = 'file',
  CUSTOM = 'custom'
}
```

### 1. interaction.start

Initiates an interactive session.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "interaction.start",
  "params": {
    "toolName": "string",
    "initialParams": { },
    "context": { },
    "timeout": 300000
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "session_abc123",
    "state": "idle",
    "initialPrompt": {
      "type": "text",
      "message": "Enter destination:",
      "validation": { "required": true }
    }
  }
}
```

**Parameters:**

- `toolName` (required): Name of the tool to execute
- `initialParams` (optional): Initial parameters for the tool
- `context` (optional): Additional context for the session
- `timeout` (optional): Session timeout in milliseconds

### 2. interaction.prompt

Tool sends a prompt to the user (server → client).

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "interaction.prompt",
  "params": {
    "sessionId": "session_abc123",
    "prompt": {
      "type": "choice",
      "message": "Select option:",
      "choices": [
        { "value": "a", "label": "Option A" },
        { "value": "b", "label": "Option B" }
      ],
      "validation": { "required": true }
    },
    "progress": {
      "current": 2,
      "total": 5,
      "message": "Step 2 of 5"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "acknowledged": true
  }
}
```

### 3. interaction.respond

User responds to a prompt (client → server).

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "interaction.respond",
  "params": {
    "sessionId": "session_abc123",
    "response": {
      "value": "selected_value",
      "timestamp": 1704067200000,
      "metadata": { }
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "accepted": true,
    "validation": {
      "valid": true
    }
  }
}
```

**Validation Failure:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "accepted": false,
    "validation": {
      "valid": false,
      "error": "Invalid format",
      "suggestion": "Use YYYY-MM-DD"
    }
  }
}
```

### 4. interaction.continue

Tool continues processing and may send next prompt.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "interaction.continue",
  "params": {
    "sessionId": "session_abc123",
    "nextPrompt": {
      "type": "text",
      "message": "Next step..."
    },
    "progress": {
      "current": 3,
      "total": 5
    }
  }
}
```

### 5. interaction.complete

Finalizes session with result.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "interaction.complete",
  "params": {
    "sessionId": "session_abc123",
    "result": {
      "success": true,
      "data": { }
    },
    "summary": "Completed successfully"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "success": true,
    "finalResult": { }
  }
}
```

### 6. interaction.cancel

Cancels an ongoing interaction.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "interaction.cancel",
  "params": {
    "sessionId": "session_abc123",
    "reason": "User cancelled"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "cancelled": true
  }
}
```

### 7. interaction.getState

Retrieves current session state.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "interaction.getState",
  "params": {
    "sessionId": "session_abc123"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "sessionId": "session_abc123",
    "state": "waiting_user",
    "metadata": {
      "createdAt": 1704067200000,
      "lastActivityAt": 1704067300000,
      "toolName": "booking"
    },
    "history": [
      {
        "turnId": 0,
        "prompt": { },
        "response": { },
        "timestamp": 1704067250000
      }
    ],
    "currentPrompt": { },
    "accumulatedData": { }
  }
}
```

## Session Management

### Session Lifecycle

```
START → IDLE → ACTIVE → WAITING_USER ⇄ PROCESSING → COMPLETED
                  ↓           ↓
              CANCELLED   ERROR
```

### State Transitions

| From          | To            | Trigger              |
|---------------|---------------|----------------------|
| -             | IDLE          | interaction.start    |
| IDLE          | ACTIVE        | Tool begins execution|
| ACTIVE        | WAITING_USER  | Tool sends prompt    |
| WAITING_USER  | PROCESSING    | User responds        |
| PROCESSING    | WAITING_USER  | Next prompt          |
| PROCESSING    | COMPLETED     | Tool completes       |
| Any           | CANCELLED     | interaction.cancel   |
| Any           | ERROR         | Error occurs         |

### Session Data

Each session maintains:

- **Session ID**: Unique identifier
- **State**: Current interaction state
- **Metadata**: Creation time, last activity, tool name
- **History**: Array of interaction turns
- **Current Prompt**: Active prompt awaiting response
- **Accumulated Data**: Key-value store for session context

### Timeouts

Sessions expire after inactivity period (default: 5 minutes). Servers SHOULD:

- Send timeout warnings before expiration
- Allow timeout configuration per session
- Clean up expired sessions

## Message Flow

### Example: Simple Interaction

```
Client                          Server

1. interaction.start →
                              ← sessionId, initialPrompt

2. interaction.respond →
   (user input)
                              ← accepted: true

3.                            ← interaction.complete
                                 (final result)
```

### Example: Multi-turn Wizard

```
Client                          Server

1. interaction.start →
                              ← sessionId

2.                            ← interaction.prompt
                                 ("Enter name")

3. interaction.respond →
   ("John")
                              ← accepted: true

4.                            ← interaction.prompt
                                 ("Enter email")

5. interaction.respond →
   ("john@example.com")
                              ← accepted: true

6.                            ← interaction.complete
                                 (registration complete)
```

### Example: Validation Retry

```
Client                          Server

1.                            ← interaction.prompt
                                 ("Enter email")

2. interaction.respond →
   ("invalid-email")
                              ← accepted: false
                                 error: "Invalid format"

3.                            ← interaction.prompt
                                 (retry with error)

4. interaction.respond →
   ("valid@email.com")
                              ← accepted: true
```

## Error Handling

### Error Codes

MCP Flow defines additional error codes:

| Code   | Name                      | Description                    |
|--------|---------------------------|--------------------------------|
| -32001 | SESSION_NOT_FOUND         | Session ID not found           |
| -32002 | SESSION_EXPIRED           | Session timed out              |
| -32003 | INVALID_STATE_TRANSITION  | Invalid state change           |
| -32004 | VALIDATION_FAILED         | Input validation failed        |
| -32005 | TIMEOUT                   | Operation timed out            |
| -32006 | ALREADY_CANCELLED         | Session already cancelled      |
| -32007 | NOT_INTERACTIVE           | Server doesn't support mode    |

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Session not found: session_abc123",
    "data": {
      "sessionId": "session_abc123"
    }
  }
}
```

### Recovery

Clients SHOULD:

- Handle validation errors by re-prompting
- Detect session expiration and restart
- Implement retry logic with exponential backoff
- Provide user feedback for errors

## Capability Negotiation

### Server Capabilities

Servers declare interactive support:

```json
{
  "interactive": true,
  "version": "0.1.0",
  "features": {
    "statefulSessions": true,
    "progressTracking": true,
    "validation": true,
    "multiplePromptTypes": true,
    "sessionPersistence": false
  }
}
```

### Capability Discovery

Clients SHOULD query capabilities before using interactive features:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "capabilities"
}
```

### Feature Flags

- `statefulSessions`: Server maintains session state
- `progressTracking`: Supports progress indicators
- `validation`: Client-side validation available
- `multiplePromptTypes`: All prompt types supported
- `sessionPersistence`: Sessions survive restarts

### Graceful Degradation

If server doesn't support interactive mode:

1. Client detects via capability negotiation
2. Falls back to standard MCP calls
3. Provides degraded UX (all params upfront)

## Security Considerations

### Session Isolation

- Sessions MUST be isolated from each other
- Session IDs MUST be unpredictable (cryptographically random)
- Unauthorized access to sessions MUST be prevented

### Input Validation

- All user inputs MUST be validated server-side
- Validation MUST occur before business logic
- Malicious inputs MUST be rejected

### Rate Limiting

Servers SHOULD implement:

- Per-session rate limits
- Per-user session limits
- Maximum session duration
- Maximum prompt count per session

### Data Privacy

- Session data MAY contain sensitive information
- Sessions SHOULD be encrypted in transit (TLS)
- Session storage SHOULD be encrypted at rest
- Sessions MUST be cleaned up after completion/expiration

### Authentication

- Sessions MAY require authentication
- Authentication tokens SHOULD be validated per request
- Session hijacking MUST be prevented

## Appendix A: Prompt Types

### Text Prompt

```json
{
  "type": "text",
  "message": "Enter text:",
  "placeholder": "Type here...",
  "defaultValue": "default",
  "validation": {
    "required": true,
    "pattern": "^[a-z]+$",
    "min": 3,
    "max": 50
  }
}
```

### Choice Prompt

```json
{
  "type": "choice",
  "message": "Select option:",
  "choices": [
    { "value": "a", "label": "Option A" },
    { "value": "b", "label": "Option B" }
  ],
  "validation": {
    "required": true
  }
}
```

### Confirm Prompt

```json
{
  "type": "confirm",
  "message": "Are you sure?",
  "defaultValue": false
}
```

### Number Prompt

```json
{
  "type": "number",
  "message": "Enter amount:",
  "validation": {
    "required": true,
    "min": 0,
    "max": 1000
  }
}
```

### Date Prompt

```json
{
  "type": "date",
  "message": "Select date:",
  "validation": {
    "required": true
  }
}
```

## Appendix B: Stateless Mode

For stateless server implementations, session state can be encoded in tokens:

```json
{
  "sessionId": "session_abc123",
  "state": { /* full session state */ },
  "signature": "hmac_signature"
}
```

Token SHOULD be:
- Base64 encoded
- HMAC signed
- Included in subsequent requests
- Validated on each request

## Appendix C: Version History

- **0.1.0** (2024-01-15): Initial specification

## References

- Model Context Protocol (MCP) 1.0
- JSON-RPC 2.0 Specification
- RFC 6749: OAuth 2.0 (for authentication patterns)
