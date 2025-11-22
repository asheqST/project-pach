## MCP Flow Integration Guide

Complete guide for integrating MCP Flow with existing MCP frameworks and tools.

## Table of Contents

1. [Overview](#overview)
2. [Integration with Official SDK](#integration-with-official-sdk)
3. [Standalone Usage](#standalone-usage)
4. [Migrating Existing Tools](#migrating-existing-tools)
5. [Framework Compatibility](#framework-compatibility)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

MCP Flow is designed for seamless integration with existing MCP ecosystems. It works as:

- **Protocol Extension**: Adds interactive capabilities without breaking existing tools
- **SDK Adapter**: Wraps official @modelcontextprotocol/sdk servers
- **Standalone Library**: Works independently for custom implementations

### Integration Approaches

| Approach | When to Use | Complexity |
|----------|-------------|------------|
| SDK Adapter | Existing TypeScript SDK server | ⭐ Easy |
| Standalone | New implementation or custom needs | ⭐⭐ Medium |
| Custom Integration | Specific requirements | ⭐⭐⭐ Advanced |

## Integration with Official SDK

### Prerequisites

```bash
npm install @modelcontextprotocol/sdk mcp-flow
```

### Quick Integration (2 minutes)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { withMCPFlow } from 'mcp-flow/adapters/sdk';

// Your existing MCP server
const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 🎯 Add interactive capabilities in one line!
const enhanced = withMCPFlow(server);

// Now add interactive tools
enhanced.addInteractiveTool({
  name: 'wizard',
  description: 'Interactive wizard',
  async execute(context) {
    const response = await context.prompt({
      type: 'text',
      message: 'Enter your name:',
    });
    return { greeting: `Hello, ${response.value}!` };
  },
});
```

### Complete Example with Existing Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPFlowAdapter } from 'mcp-flow/adapters/sdk';
import { WizardBuilder } from 'mcp-flow/patterns';

// Create standard MCP server
const server = new Server(
  { name: 'enhanced-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register standard tools (existing code - unchanged)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'calculate',
        description: 'Perform calculations',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string' },
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['operation', 'a', 'b'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Existing tool implementation
  const { name, arguments: args } = request.params;

  if (name === 'calculate') {
    const { operation, a, b } = args;
    let result = 0;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'multiply':
        result = a * b;
        break;
    }

    return {
      content: [{ type: 'text', text: `Result: ${result}` }],
    };
  }

  throw new Error('Unknown tool');
});

// 🎯 Initialize MCP Flow adapter
const flowAdapter = new MCPFlowAdapter(server, {
  sessionTimeout: 300000, // 5 minutes
  maxSessions: 100,
});

flowAdapter.initialize();

// Add interactive tools
flowAdapter.addInteractiveTool({
  name: 'interactive_calculator',
  description: 'Interactive calculator with step-by-step input',
  async execute(context) {
    const wizard = new WizardBuilder()
      .addChoice('operation', 'Select operation:', [
        { value: 'add', label: 'Addition (+)' },
        { value: 'subtract', label: 'Subtraction (-)' },
        { value: 'multiply', label: 'Multiplication (×)' },
        { value: 'divide', label: 'Division (÷)' },
      ])
      .addNumber('a', 'First number:', { required: true })
      .addNumber('b', 'Second number:', {
        required: true,
        validate: (value, ctx) => {
          if (ctx.operation === 'divide' && value === 0) {
            return 'Cannot divide by zero';
          }
          return true;
        },
      })
      .onComplete((data) => {
        let result = 0;
        switch (data.operation) {
          case 'add':
            result = (data.a as number) + (data.b as number);
            break;
          case 'subtract':
            result = (data.a as number) - (data.b as number);
            break;
          case 'multiply':
            result = (data.a as number) * (data.b as number);
            break;
          case 'divide':
            result = (data.a as number) / (data.b as number);
            break;
        }
        return { operation: data.operation, a: data.a, b: data.b, result };
      })
      .build();

    return await wizard.execute(context);
  },
});

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Result

Your server now supports:
- ✅ All existing standard MCP tools (unchanged)
- ✅ New interactive tools with multi-turn conversations
- ✅ Standard MCP initialize handshake
- ✅ Interactive capabilities under `experimental.interactive`

## Standalone Usage

For custom implementations or when not using the official SDK:

```typescript
import { InteractiveServer } from 'mcp-flow/server';
import { InteractiveClient } from 'mcp-flow/client';

// Create server
const server = new InteractiveServer();

// Register tools
server.registerTool({
  name: 'onboarding',
  description: 'User onboarding flow',
  async execute(context) {
    // Your interactive logic
    const name = await context.prompt({
      type: 'text',
      message: 'What is your name?',
    });

    return { welcome: `Hello, ${name.value}!` };
  },
});

// Create client with transport
const client = new InteractiveClient(yourTransport);

// Use the tool
const result = await client.runInteractive(
  'onboarding',
  async (prompt) => {
    return await getUserInput(prompt);
  }
);
```

## Migrating Existing Tools

### Approach 1: Wrap Existing Tools

Keep your existing tools and add interactive versions:

```typescript
import { wrapMCPTool } from 'mcp-flow/adapters/sdk';

// Your existing tool
const searchToolSchema = {
  name: 'search',
  description: 'Search files',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      path: { type: 'string' },
    },
    required: ['query'],
  },
};

async function searchHandler(args: any) {
  return await performSearch(args.query, args.path);
}

// 🎯 Wrap as interactive tool
const interactiveSearch = wrapMCPTool(
  'search',
  'Search with interactive prompts',
  searchToolSchema.inputSchema,
  searchHandler
);

flowAdapter.addInteractiveTool(interactiveSearch);
```

**Result**: If required parameters are missing, the tool automatically prompts for them!

### Approach 2: Gradual Migration

1. **Keep existing tool** for backward compatibility
2. **Add new interactive version** with `_interactive` suffix
3. **Deprecate old version** over time

```typescript
// Step 1: Keep existing (standard MCP)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'create_user') {
    // Original implementation
  }
});

// Step 2: Add interactive version
flowAdapter.addInteractiveTool({
  name: 'create_user_interactive',
  description: 'Create user with guided flow (recommended)',
  async execute(context) {
    // Interactive implementation
  },
});

// Step 3: Eventually remove old version
```

### Approach 3: Hybrid Tools

Support both modes in a single tool:

```typescript
flowAdapter.addInteractiveTool({
  name: 'flexible_tool',
  description: 'Works in both modes',
  async execute(context) {
    const { initialParams } = context;

    // If all params provided, skip interactive mode
    if (hasAllRequiredParams(initialParams)) {
      return await processDirectly(initialParams);
    }

    // Otherwise, use interactive flow
    return await interactiveFlow(context);
  },
});
```

## Framework Compatibility

### Compatible Frameworks

| Framework | Status | Notes |
|-----------|--------|-------|
| @modelcontextprotocol/sdk | ✅ Official Support | Use SDK adapter |
| Claude Desktop | ✅ Compatible | Via stdio transport |
| Continue.dev | ✅ Compatible | MCP-compliant |
| Custom Implementations | ✅ Compatible | Use standalone mode |

### Integration Examples

#### PostgreSQL Server Enhancement

```typescript
// Based on @modelcontextprotocol/server-postgres
import { withMCPFlow } from 'mcp-flow/adapters/sdk';

const postgresServer = createPostgresServer(connectionString);
const enhanced = withMCPFlow(postgresServer);

enhanced.addInteractiveTool({
  name: 'query_builder',
  description: 'Build SQL queries interactively',
  async execute(context) {
    const wizard = new WizardBuilder()
      .addChoice('queryType', 'Query type:', [
        { value: 'select', label: 'SELECT' },
        { value: 'insert', label: 'INSERT' },
        { value: 'update', label: 'UPDATE' },
      ])
      .addText('table', 'Table name:', { required: true })
      // ... more steps
      .onComplete(buildQuery)
      .build();

    return await wizard.execute(context);
  },
});
```

#### GitHub Server Enhancement

```typescript
// Based on @modelcontextprotocol/server-github
enhanced.addInteractiveTool({
  name: 'create_pr_wizard',
  description: 'Create PR with guided flow',
  async execute(context) {
    // Guide user through PR creation
    const title = await context.prompt({
      type: 'text',
      message: 'PR title:',
      validation: { required: true, min: 10 },
    });

    const description = await context.prompt({
      type: 'text',
      message: 'Description:',
      validation: { required: true },
    });

    return await createPR({
      title: title.value,
      body: description.value,
    });
  },
});
```

#### Puppeteer Server Enhancement

```typescript
// Based on @modelcontextprotocol/server-puppeteer
enhanced.addInteractiveTool({
  name: 'interactive_scraper',
  description: 'Build web scraper interactively',
  async execute(context) {
    const wizard = new WizardBuilder()
      .addText('url', 'Target URL:', {
        validate: Validators.url(),
      })
      .addChoice('action', 'What to do:', [
        { value: 'screenshot', label: 'Take Screenshot' },
        { value: 'scrape', label: 'Scrape Data' },
        { value: 'interact', label: 'Interact with Page' },
      ])
      // ... conditional steps based on action
      .build();

    const config = await wizard.execute(context);
    return await runPuppeteerTask(config);
  },
});
```

## Best Practices

### 1. Start Small

```typescript
// ❌ Don't: Migrate everything at once
// ✅ Do: Start with one or two tools
enhanced.addInteractiveTool(mostUsedTool);
```

### 2. Provide Clear Prompts

```typescript
// ❌ Don't: Vague prompts
await context.prompt({ type: 'text', message: 'Enter value:' });

// ✅ Do: Clear, specific prompts
await context.prompt({
  type: 'text',
  message: 'Enter your email address:',
  placeholder: 'user@example.com',
  validation: { required: true, pattern: emailRegex },
});
```

### 3. Use Appropriate Patterns

```typescript
// For multi-step flows → Use Wizard
const wizard = new WizardBuilder()...

// For input validation → Use ValidatedInput
const validated = new ValidatedInput({
  validate: Validators.email()
})...

// For disambiguation → Use Clarification
const clarify = new Clarification({
  options: searchResults
})...
```

### 4. Handle Errors Gracefully

```typescript
flowAdapter.addInteractiveTool({
  name: 'robust_tool',
  description: 'Handles errors well',
  async execute(context) {
    try {
      return await riskyOperation(context);
    } catch (error) {
      // Offer recovery options
      const retry = await context.prompt({
        type: 'confirm',
        message: 'Operation failed. Retry?',
      });

      if (retry.value) {
        return await riskyOperation(context);
      }

      return { success: false, error: error.message };
    }
  },
});
```

### 5. Test Both Modes

```typescript
describe('My Tool', () => {
  it('works in non-interactive mode', async () => {
    const result = await callWithAllParams();
    expect(result).toBeDefined();
  });

  it('works in interactive mode', async () => {
    const result = await runInteractive();
    expect(result).toBeDefined();
  });
});
```

## Troubleshooting

### Issue: "Server does not support interactive mode"

**Cause**: Client detected server doesn't have interactive capabilities

**Solution**:
```typescript
// Ensure adapter is initialized
const adapter = new MCPFlowAdapter(server);
adapter.initialize(); // ← Don't forget this!
```

### Issue: "Session not found"

**Cause**: Session expired or invalid session ID

**Solution**:
```typescript
// Increase timeout for long operations
const adapter = new MCPFlowAdapter(server, {
  sessionTimeout: 600000, // 10 minutes
});
```

### Issue: Tools not appearing

**Cause**: Tools registered after server connection

**Solution**:
```typescript
// Register tools BEFORE connecting transport
flowAdapter.addInteractiveTool(myTool);

// Then connect
await server.connect(transport);
```

### Issue: Validation not working

**Cause**: Validation only happens on server side

**Solution**:
```typescript
// Always use server-side validation
const validated = new ValidatedInput({
  validate: async (value) => {
    // Validate on server
    return await checkValue(value);
  },
});
```

## Examples

See complete working examples:

- [`examples/integration-typescript-sdk.ts`](../examples/integration-typescript-sdk.ts) - Official SDK integration
- [`examples/standalone-integration.ts`](../examples/standalone-integration.ts) - Standalone usage
- [`tests/integration.test.ts`](../tests/integration.test.ts) - Integration tests

## Quick Start Scripts

```bash
# Run standalone examples
npm run example:standalone

# Run SDK integration examples (requires SDK)
npm run example:sdk

# Run integration tests
npm run test:integration
```

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/mcp-flow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/mcp-flow/discussions)
- **MCP Community**: [MCP Discord](https://discord.gg/mcp)

## References

- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://modelcontextprotocol.io/specification/2024-11-05/)
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs)

---

**Next Steps:**
1. Try the [standalone example](../examples/standalone-integration.ts)
2. Read the [migration guide](./MIGRATION.md)
3. Check out [pattern examples](./EXAMPLES.md)
