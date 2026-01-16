# MCP Flow: Interactive Protocol Extension

> **📋 Note:** MCP Flow is an **experimental extension** to the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It adds interactive, multi-turn capabilities while maintaining full backward compatibility with standard MCP servers and clients. All interactive features are exposed under the `experimental.interactive` capability namespace.

Transform MCP from single request-response tool calls into conversational, multi-turn interactions with state preservation and flow control.

## Vision

MCP Flow extends the Model Context Protocol to enable tools that can have dialogs with users within a single execution context. Instead of atomic one-shot operations, tools can now guide users through complex workflows, validate inputs iteratively, and maintain state across interaction turns.

## Key Features

- **Multi-turn Conversations**: Tools can ask questions and process responses sequentially
- **State Management**: Session state preserved across interaction turns
- **Validation Patterns**: Built-in support for input validation with retry logic
- **Flow Control**: Wizard, validation, and clarification patterns out of the box
- **Backward Compatible**: Zero breaking changes to MCP 1.0 - opt-in enhancement
- **Type Safe**: Full TypeScript support with comprehensive type definitions

## Quick Start

### Installation

> **Note:** MCP Flow is not yet published to npm. For now, clone and build from source:

```bash
# Clone the repository
git clone https://github.com/[YOUR-ORG]/mcp-flow.git
cd mcp-flow

# Install dependencies
npm install

# Build the library and examples
npm run build
```

This will:
- Compile the library from `src/` to `dist/`
- Bundle example executables in `dist/examples/`
- Create evaluation scripts in `dist/evaluation/`

**Node.js Requirement:** 18 or higher

MCP Flow is built on top of the official `@modelcontextprotocol/sdk`, providing interactive capabilities as an extension to the base MCP protocol.

### Server Setup

> **Tip:** After building, you can run the complete stdio-server example with: `./dist/examples/servers/stdio-server`

Create your own interactive server:

```typescript
import { InteractiveServer } from 'mcp-flow';

const server = new InteractiveServer();

// Register an interactive tool
server.registerTool({
  name: 'booking',
  description: 'Book a travel reservation',
  async execute(context) {
    // Prompt user for destination
    const destResponse = await context.prompt({
      type: 'text',
      message: 'Where would you like to go?',
      validation: { required: true }
    });

    // Prompt for dates
    const dateResponse = await context.prompt({
      type: 'text',
      message: 'When would you like to travel?',
      validation: { required: true }
    });

    // Store accumulated data
    context.setData('destination', destResponse.value);
    context.setData('date', dateResponse.value);

    return {
      success: true,
      booking: {
        destination: destResponse.value,
        date: dateResponse.value
      }
    };
  }
});

// Handle requests
server.handleRequest(request).then(response => {
  // Send response to client
});
```

### Client Usage

> **Tip:** See a complete working example at `./dist/examples/clients/ollama-chat-client` (requires Ollama running on localhost:11434)

Create your own client:

```typescript
import { InteractiveClient } from 'mcp-flow';

const client = new InteractiveClient(transport);

// Run interactive session
const result = await client.runInteractive(
  'booking',
  async (prompt) => {
    // Handle prompts - get user input
    const userInput = await getUserInput(prompt.message);
    return userInput;
  }
);

console.log('Booking complete:', result);
```

### Using MCP Flow in Your Project

**Option 1: Local Development (Direct Source Imports)**

While developing locally, import directly from the source:

```typescript
import { InteractiveServer } from './path/to/mcp-flow/src/server/index';
import { InteractiveClient } from './path/to/mcp-flow/src/client/interactive-client';
```

**Option 2: Build and Link**

Build the library and use npm link:

```bash
# In the mcp-flow directory
npm run build
npm link

# In your project directory
npm link mcp-flow
```

Then import normally:

```typescript
import { InteractiveServer, InteractiveClient } from 'mcp-flow';
```

**Option 3: Future (Once Published to npm)**

```bash
npm install mcp-flow
```

This option will be available once MCP Flow is published to the npm registry.

## Patterns

MCP Flow includes reusable patterns for common interaction scenarios:

### Wizard Pattern

Multi-step guided flows with sequential prompts:

```typescript
import { WizardBuilder } from 'mcp-flow/patterns';

const wizard = new WizardBuilder()
  .addText('name', 'Enter your name:', { required: true })
  .addNumber('age', 'Enter your age:', { min: 18, max: 120 })
  .addChoice('country', 'Select your country:', [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
  ])
  .onComplete((data) => {
    return { success: true, user: data };
  })
  .build();

// Execute in tool
const result = await wizard.execute(context);
```

### Validation Pattern

Iterative input refinement with retry logic:

```typescript
import { ValidatedInput, Validators } from 'mcp-flow/patterns';

const emailInput = new ValidatedInput({
  prompt: {
    type: 'text',
    message: 'Enter your email:',
  },
  validate: Validators.combine(
    Validators.email(),
    Validators.custom(async (value) => {
      return await checkEmailExists(value);
    }, 'Email already registered')
  ),
  maxAttempts: 3
});

const email = await emailInput.execute(context);
```

### Clarification Pattern

Ambiguity resolution through user selection:

```typescript
import { Clarification, Disambiguate } from 'mcp-flow/patterns';

// Search results need disambiguation
const results = await searchFiles(query);

const clarification = new Clarification(
  Disambiguate.fromSearchResults(
    results,
    'Multiple files found. Please select one:'
  )
);

const selectedFile = await clarification.execute(context);
```

## Protocol

### Message Types

MCP Flow adds the following JSON-RPC methods:

- `interaction.start` - Initiate interactive session
- `interaction.prompt` - Tool requests user input
- `interaction.respond` - User provides input
- `interaction.continue` - Tool processes and continues
- `interaction.complete` - Finalize with result
- `interaction.cancel` - Cancel ongoing interaction
- `interaction.getState` - Retrieve session state

### Session Lifecycle

```
┌─────────────┐
│    IDLE     │
└──────┬──────┘
       │ start
       ▼
┌─────────────┐
│   ACTIVE    │◄──┐
└──────┬──────┘   │
       │ prompt   │
       ▼          │
┌─────────────┐   │
│WAITING_USER │   │
└──────┬──────┘   │
       │ respond  │
       ▼          │
┌─────────────┐   │
│ PROCESSING  │───┘
└──────┬──────┘
       │ complete
       ▼
┌─────────────┐
│ COMPLETED   │
└─────────────┘
```

### Capability Negotiation

Servers declare support for interactive mode:

```typescript
{
  interactive: true,
  version: "0.1.0",
  features: {
    statefulSessions: true,
    progressTracking: true,
    validation: true,
    multiplePromptTypes: true
  }
}
```

## Architecture

### MCP SDK Integration

MCP Flow **extends** the official `@modelcontextprotocol/sdk` instead of reimplementing the protocol:

- ✅ **Uses MCP SDK Types**: Imports `JSONRPCRequest`, `JSONRPCResponse`, `JSONRPCError` from the official SDK
- ✅ **No Protocol Duplication**: Leverages SDK's JSON-RPC 2.0 implementation
- ✅ **Transport Compatible**: Can integrate with MCP SDK transports (stdio, SSE)
- ✅ **Type-Safe Extensions**: Interactive protocol types extend SDK's `Request` type
- ✅ **Future-Proof**: Automatically stays in sync with MCP SDK updates

### Three-Layer Design

1. **Protocol Layer**: Interactive message types extending MCP SDK protocol types
2. **Session Layer**: State persistence and lifecycle management with enterprise-grade features
   - **XState Integration**: Validated state transitions with formal state machine
   - **Storage Abstraction**: Pluggable storage (in-memory node-cache or distributed Redis)
   - **Security Hardening**: Cryptographically secure IDs (nanoid), input validation, prototype pollution prevention
   - **Automatic Expiration**: TTL-based cleanup with event-driven callbacks
3. **Flow Control Layer**: Branching logic, validation, and progress tracking

For detailed architecture information, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Stateful vs Stateless

MCP Flow supports both approaches:

**Stateful** (default): Server maintains session state with pluggable storage

```typescript
// In-memory storage (default)
const server = new InteractiveServer({
  session: {
    defaultTimeout: 300000,
    maxSessions: 1000,
    storageType: 'memory' // node-cache with automatic cloning
  }
});

// Redis storage for distributed deployments
const server = new InteractiveServer({
  session: {
    storageType: 'redis',
    redis: {
      host: 'localhost',
      port: 6379
    }
  }
});
```

**Stateless**: Session state encoded in tokens

```typescript
import { StatelessSessionHandler } from 'mcp-flow/session';

const handler = new StatelessSessionHandler(secret);
const token = handler.createToken(sessionId, toolName);
```

## Examples

All examples are located in the `examples/` directory and are built into standalone executables.

**Running the Examples:**

```bash
# Build all examples (if not already built)
npm run build:examples

# Run the stdio server
./dist/examples/servers/stdio-server

# Run the Ollama chat client (requires Ollama installed and running)
./dist/examples/clients/ollama-chat-client

# Run the standard (non-interactive) MCP server for comparison
./dist/examples/servers/standard-mcp-server
```

### Server Examples with Interactive Tools

See `examples/servers/tools/` for complete tool implementations:

- **booking-wizard.ts** - Travel booking with wizard pattern
- **email-validator.ts** - Email validation with retry logic
- **file-finder.ts** - File search with disambiguation

### Client Examples

See `examples/clients/` for client implementations:

- **ollama-chat-client.ts** - Terminal-based chat interface using Ollama LLM with MCP Flow

### Full Server Examples

See `examples/servers/` for complete server setups:

- **stdio-server.ts** - Interactive MCP server using stdio transport
- **standard-mcp-server.ts** - Standard non-interactive MCP server for comparison

For detailed examples documentation, see [examples/README.md](examples/README.md).

## API Reference

### Server API

```typescript
class InteractiveServer {
  registerTool(tool: InteractiveTool): void
  unregisterTool(name: string): boolean
  handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>
  getCapabilities(): InteractiveCapabilities
}
```

### Tool Execution Context

```typescript
interface ToolExecutionContext {
  sessionId: SessionId
  prompt(prompt: InteractionPrompt): Promise<InteractionResponse>
  setData(key: string, value: unknown): void
  getData(key?: string): unknown
  updateProgress(current: number, total: number, message?: string): void
}
```

### Client API

```typescript
class InteractiveClient {
  startInteraction(toolName: string, params?: object): Promise<SessionId>
  respond(sessionId: SessionId, value: unknown): Promise<{ accepted: boolean }>
  cancel(sessionId: SessionId, reason?: string): Promise<void>
  getState(sessionId: SessionId): Promise<SessionState>
  runInteractive(
    toolName: string,
    promptHandler: (prompt: InteractionPrompt) => Promise<unknown>
  ): Promise<unknown>
}
```

## Protocol Compliance

### MCP Compatibility

MCP Flow is built on top of the [Model Context Protocol (2024-11-05)](https://modelcontextprotocol.io/specification/2024-11-05/):

- ✅ **JSON-RPC 2.0 Compliant:** All messages follow JSON-RPC 2.0 specification
- ✅ **Standard MCP Support:** Compatible with standard MCP `initialize`, `tools/list`, `tools/call`, etc.
- ✅ **Extension Model:** Interactive features exposed via `experimental.interactive` capabilities
- ✅ **Non-Breaking:** Existing MCP tools work unchanged
- ✅ **Proper Error Codes:** Uses -32050 to -32099 range for custom errors (avoiding JSON-RPC reserved range)

### Capability Negotiation

```typescript
// Server responds to MCP initialize
{
  "protocolVersion": "2024-11-05",
  "serverInfo": {
    "name": "mcp-flow-server",
    "version": "0.1.0"
  },
  "capabilities": {
    "experimental": {
      "interactive": {
        "interactive": true,
        "version": "0.1.0",
        "features": {
          "statefulSessions": true,
          "progressTracking": true,
          "validation": true
        }
      }
    }
  }
}
```

For complete compliance details, see [VALIDATION.md](docs/VALIDATION.md).

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## Migration Guide

See [MIGRATION.md](docs/MIGRATION.md) for detailed migration instructions from standard MCP tools to interactive tools.

## Design Principles

- **Simplicity First**: Minimal additional complexity over base MCP
- **Progressive Enhancement**: Complex features are optional
- **Transport Agnostic**: Works with stdio, HTTP, WebSockets
- **LLM Friendly**: Clear boundaries for AI orchestration
- **Type Safe**: Full TypeScript support

## Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT

## Protocol Philosophy

MCP Flow extends MCP's "tools" concept to "conversational agents" - tools that can engage rather than just execute. The protocol remains lightweight, adding only interaction semantics without prescribing implementation details. The goal is enabling richer tool interactions while maintaining MCP's simplicity and universality.
