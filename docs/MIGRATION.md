# Migration Guide: Standard MCP to MCP Flow

This guide helps you migrate existing MCP tools to interactive MCP Flow tools.

## Overview

MCP Flow is backward compatible with standard MCP. You can migrate incrementally:

1. Keep existing tools unchanged
2. Add new interactive tools
3. Convert existing tools to interactive versions
4. Use both standard and interactive tools simultaneously

## Migration Patterns

### Pattern 1: Simple Tool → Interactive Tool

**Before (Standard MCP):**

```typescript
const searchTool = {
  name: 'search',
  description: 'Search for files',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      path: { type: 'string' }
    },
    required: ['query']
  },
  async execute(params) {
    const results = await searchFiles(params.query, params.path);
    return { results };
  }
};
```

**After (MCP Flow):**

```typescript
import { InteractiveTool } from 'mcp-flow';

const searchTool: InteractiveTool = {
  name: 'search',
  description: 'Search for files with interactive disambiguation',
  async execute(context) {
    // Prompt for query if not provided
    const queryResponse = await context.prompt({
      type: 'text',
      message: 'What would you like to search for?',
      validation: { required: true }
    });

    // Optional path
    const pathResponse = await context.prompt({
      type: 'text',
      message: 'Search path (optional):',
      validation: { required: false }
    });

    const results = await searchFiles(
      queryResponse.value,
      pathResponse.value || '.'
    );

    // Disambiguate if multiple results
    if (results.length > 1) {
      const clarification = new Clarification({
        message: 'Multiple results found. Select one:',
        options: results.map(r => ({
          value: r.id,
          label: r.name,
          data: r
        }))
      });

      const selected = await clarification.execute(context);
      return { result: selected };
    }

    return { results };
  }
};
```

### Pattern 2: Adding Validation

**Before:**

```typescript
async execute(params) {
  if (!isValidEmail(params.email)) {
    throw new Error('Invalid email');
  }
  return await processEmail(params.email);
}
```

**After:**

```typescript
import { ValidatedInput, Validators } from 'mcp-flow/patterns';

async execute(context) {
  const emailInput = new ValidatedInput({
    prompt: {
      type: 'text',
      message: 'Enter your email:',
    },
    validate: Validators.email(),
    maxAttempts: 3
  });

  const email = await emailInput.execute(context);
  return await processEmail(email);
}
```

### Pattern 3: Multi-step Workflows

**Before (Multiple Separate Tools):**

```typescript
// Tool 1: Get destination
const getDestinationTool = {
  name: 'get_destination',
  async execute(params) {
    // Returns destination
  }
};

// Tool 2: Get dates
const getDatesTool = {
  name: 'get_dates',
  async execute(params) {
    // Returns dates
  }
};

// Tool 3: Create booking
const createBookingTool = {
  name: 'create_booking',
  async execute(params) {
    // Needs destination and dates from previous calls
  }
};
```

**After (Single Interactive Tool):**

```typescript
import { WizardBuilder } from 'mcp-flow/patterns';

const bookingTool: InteractiveTool = {
  name: 'create_booking',
  description: 'Interactive booking wizard',
  async execute(context) {
    const wizard = new WizardBuilder()
      .addText('destination', 'Where would you like to go?', {
        required: true
      })
      .addText('startDate', 'Check-in date (YYYY-MM-DD):', {
        required: true,
        validate: (value) => isValidDate(value) || 'Invalid date'
      })
      .addText('endDate', 'Check-out date (YYYY-MM-DD):', {
        required: true,
        validate: (value, context) => {
          const start = new Date(context.startDate);
          const end = new Date(value);
          return end > start || 'End date must be after start date';
        }
      })
      .onComplete(async (data) => {
        return await createBooking(data);
      })
      .build();

    return await wizard.execute(context);
  }
};
```

## Server Migration

### Step 1: Install MCP Flow

```bash
npm install mcp-flow
```

### Step 2: Update Server

**Before:**

```typescript
import { MCPServer } from '@modelcontextprotocol/sdk';

const server = new MCPServer({
  name: 'my-server',
  version: '1.0.0'
});

server.registerTool(standardTool);
```

**After:**

```typescript
import { InteractiveServer } from 'mcp-flow';

const server = new InteractiveServer({
  session: {
    defaultTimeout: 300000, // 5 minutes
    maxSessions: 1000
  }
});

// Register interactive tools
server.registerTool(interactiveTool);

// Handle requests
async function handleRequest(request) {
  return await server.handleRequest(request);
}
```

### Step 3: Gradual Migration

You can run both standard and interactive tools:

```typescript
import { MCPServer } from '@modelcontextprotocol/sdk';
import { InteractiveServer } from 'mcp-flow';

const standardServer = new MCPServer({ name: 'standard' });
const interactiveServer = new InteractiveServer();

// Register standard tools
standardServer.registerTool(oldTool);

// Register interactive tools
interactiveServer.registerTool(newTool);

// Route based on capability
async function handleRequest(request) {
  if (request.method?.startsWith('interaction.')) {
    return await interactiveServer.handleRequest(request);
  }
  return await standardServer.handleRequest(request);
}
```

## Client Migration

### Step 1: Check Server Capabilities

```typescript
import { InteractiveClient } from 'mcp-flow';

const client = new InteractiveClient(transport);

// Negotiate capabilities
const capabilities = await client.negotiate();

if (capabilities.interactive) {
  // Use interactive features
  await runInteractiveSession();
} else {
  // Fall back to standard MCP
  await runStandardSession();
}
```

### Step 2: Update Tool Calls

**Before:**

```typescript
const result = await client.callTool('search', {
  query: 'config.json',
  path: '/app'
});
```

**After:**

```typescript
const result = await client.runInteractive(
  'search',
  async (prompt) => {
    // Handle prompts
    return await getUserInput(prompt);
  },
  { query: 'config.json' } // Initial params
);
```

## Common Scenarios

### Scenario 1: Form-like Tool

Convert a tool that accepts multiple parameters into an interactive wizard:

```typescript
// Old: All params required upfront
execute(params: { name, email, age, country })

// New: Guided flow with validation
async execute(context) {
  const wizard = new WizardBuilder()
    .addText('name', 'Name:', { required: true })
    .addText('email', 'Email:', {
      required: true,
      validate: Validators.email()
    })
    .addNumber('age', 'Age:', { min: 18, max: 120 })
    .addChoice('country', 'Country:', countryChoices)
    .onComplete(processForm)
    .build();

  return await wizard.execute(context);
}
```

### Scenario 2: Disambiguation

Convert a tool that errors on ambiguous input into interactive clarification:

```typescript
// Old: Returns error if ambiguous
if (results.length > 1) {
  throw new Error('Ambiguous: multiple results found');
}

// New: Interactive disambiguation
if (results.length > 1) {
  const clarification = new Clarification(
    Disambiguate.fromSearchResults(results)
  );
  return await clarification.execute(context);
}
```

### Scenario 3: Progressive Disclosure

Conditionally ask for more information:

```typescript
const wizard = new WizardBuilder()
  .addChoice('travelClass', 'Class:', [
    { value: 'economy', label: 'Economy' },
    { value: 'business', label: 'Business' }
  ])
  .addConditional(
    {
      id: 'loungeAccess',
      prompt: {
        type: 'confirm',
        message: 'Add lounge access?'
      }
    },
    (context) => context.travelClass === 'business'
  )
  .build();
```

## Best Practices

### 1. Preserve Existing Behavior

Maintain backward compatibility by supporting both modes:

```typescript
async execute(context) {
  const { initialParams } = context;

  // If all params provided, skip interactive mode
  if (initialParams?.query && initialParams?.path) {
    return await searchFiles(initialParams.query, initialParams.path);
  }

  // Otherwise, use interactive flow
  // ...
}
```

### 2. Validation First

Add validation to improve user experience:

```typescript
// Instead of throwing errors
if (!isValid(value)) {
  throw new Error('Invalid');
}

// Use validation pattern
const validated = await new ValidatedInput({
  prompt: { ... },
  validate: Validators.custom(isValid, 'Invalid input')
}).execute(context);
```

### 3. State Accumulation

Use context to build up state:

```typescript
async execute(context) {
  // Step 1
  const name = await context.prompt(...);
  context.setData('name', name.value);

  // Step 2 can access previous data
  const age = await context.prompt(...);
  context.setData('age', age.value);

  // All accumulated data available
  const allData = context.getData();
}
```

### 4. Progress Tracking

For long workflows, show progress:

```typescript
const totalSteps = 5;
let currentStep = 0;

// After each step
context.updateProgress(++currentStep, totalSteps, 'Processing...');
```

## Testing Interactive Tools

### Unit Tests

```typescript
describe('Interactive Tool', () => {
  it('should handle user input', async () => {
    const mockContext = {
      prompt: jest.fn()
        .mockResolvedValueOnce({ value: 'Paris' })
        .mockResolvedValueOnce({ value: '2024-06-01' }),
      setData: jest.fn(),
      getData: jest.fn(),
      updateProgress: jest.fn()
    };

    const result = await tool.execute(mockContext);

    expect(mockContext.prompt).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: true });
  });
});
```

### Integration Tests

```typescript
import { InteractiveServer } from 'mcp-flow';

describe('Server Integration', () => {
  let server: InteractiveServer;

  beforeEach(() => {
    server = new InteractiveServer();
    server.registerTool(tool);
  });

  it('should complete interactive flow', async () => {
    // Start interaction
    const startResp = await server.handleRequest({
      method: 'interaction.start',
      params: { toolName: 'test' }
    });

    const sessionId = startResp.result.sessionId;

    // Respond to prompts
    await server.handleRequest({
      method: 'interaction.respond',
      params: {
        sessionId,
        response: { value: 'test', timestamp: Date.now() }
      }
    });

    // Check completion
    const state = await server.handleRequest({
      method: 'interaction.getState',
      params: { sessionId }
    });

    expect(state.result.state).toBe('completed');
  });
});
```

## Troubleshooting

### Issue: Timeouts

**Problem:** Sessions timing out during long operations

**Solution:** Increase timeout or reset during processing

```typescript
const server = new InteractiveServer({
  session: {
    defaultTimeout: 600000 // 10 minutes
  }
});

// Or per-session
await client.startInteraction('tool', params, {
  timeout: 600000
});
```

### Issue: State Loss

**Problem:** State lost between prompts

**Solution:** Use context.setData/getData

```typescript
// Store state after each prompt
const response = await context.prompt(...);
context.setData('key', response.value);

// Retrieve later
const value = context.getData('key');
```

### Issue: Validation Loops

**Problem:** Users stuck in validation retry loop

**Solution:** Limit attempts

```typescript
const input = new ValidatedInput({
  maxAttempts: 3,
  // ...
});
```

## Next Steps

1. Start with one tool - migrate your simplest tool first
2. Add validation - improve user experience with ValidatedInput
3. Convert workflows - replace multi-tool flows with wizards
4. Add disambiguation - handle ambiguous inputs interactively
5. Monitor and iterate - collect feedback and refine

For questions or issues, see our [GitHub repository](https://github.com/mcp-flow/mcp-flow).
