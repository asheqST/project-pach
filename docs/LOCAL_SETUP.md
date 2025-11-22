# MCPFlow Local Setup Guide

This guide explains how to run and use the MCPFlow package locally before it has been published to npm.

## Prerequisites

- Node.js 18.x or higher (tested on 18.x, 20.x, and 22.x)
- npm (comes with Node.js)
- Git (for cloning the repository)

## Initial Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to the project directory
cd /path/to/project-pach

# Install dependencies
npm install
```

This will install all required dependencies including:
- TypeScript compiler
- Jest for testing
- ESLint and Prettier for code quality
- Runtime dependencies (eventemitter3)

### 2. Build the Project

```bash
# Compile TypeScript to JavaScript
npm run build
```

This creates the `dist/` directory with compiled JavaScript files and TypeScript declaration files:
- `dist/index.js` - Main entry point
- `dist/index.d.ts` - TypeScript type definitions
- `dist/**/*.js` - All compiled modules
- `dist/**/*.d.ts` - Type definitions

### 3. Verify the Build

```bash
# Run tests to ensure everything works
npm test

# Optional: Run linter
npm run lint

# Optional: Check code formatting
npm run format
```

## Using MCPFlow Locally

There are three main ways to use the local MCPFlow package in your projects:

### Option 1: npm link (Recommended for Development)

This creates a symbolic link, so changes to MCPFlow are immediately reflected in your project.

```bash
# In the MCPFlow directory
cd /path/to/project-pach
npm link

# In your project directory
cd /path/to/your-project
npm link mcp-flow
```

Now you can import MCPFlow in your project:

```typescript
import { InteractiveServer, InteractiveClient } from 'mcp-flow';
```

To unlink later:
```bash
# In your project
npm unlink mcp-flow

# In MCPFlow directory
npm unlink
```

### Option 2: Direct npm install from Local Path

Install directly from the local directory:

```bash
# In your project
npm install /path/to/project-pach
```

This copies the package to your `node_modules`. You'll need to reinstall after making changes to MCPFlow.

### Option 3: Direct Import from Built Files

Import directly from the `dist` directory without npm:

```typescript
// Using require
const { InteractiveServer } = require('/path/to/project-pach/dist/index.js');

// Using import (if your project supports it)
import { InteractiveServer } from '/path/to/project-pach/dist/index.js';
```

## Development Workflow

### Watch Mode for Active Development

When actively developing MCPFlow, use watch mode to automatically rebuild on file changes:

```bash
npm run watch
```

This runs TypeScript in watch mode, automatically recompiling when you save changes to `.ts` files.

### Testing During Development

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Code Quality Checks

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting issues
npm run lint -- --fix

# Format code
npm run format
```

## Running an MCPFlow Server Locally

### Basic Server Example

Create a file `server.ts` in your project:

```typescript
import { InteractiveServer } from 'mcp-flow';

// Create server instance with configuration
const server = new InteractiveServer({
  session: {
    defaultTimeout: 300000,  // 5 minutes
    maxSessions: 100,
    pruneInterval: 60000     // Prune expired sessions every minute
  }
});

// Register a simple interactive tool
server.registerTool({
  name: 'greeting',
  description: 'Interactive greeting tool',
  async execute(context) {
    // Prompt for user's name
    const nameResponse = await context.prompt({
      type: 'text',
      message: 'What is your name?',
      validation: { required: true }
    });

    // Prompt for favorite color
    const colorResponse = await context.prompt({
      type: 'choice',
      message: 'What is your favorite color?',
      choices: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
        { value: 'green', label: 'Green' }
      ]
    });

    // Store data in session
    context.setData('name', nameResponse.value);
    context.setData('color', colorResponse.value);

    return {
      success: true,
      message: `Hello ${nameResponse.value}! Your favorite color is ${colorResponse.value}.`
    };
  }
});

// Handle incoming JSON-RPC requests
async function handleRequest(request: any) {
  try {
    const response = await server.handleRequest(request);
    return response;
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// Example: Process a request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    },
    capabilities: {}
  }
};

handleRequest(initRequest).then(response => {
  console.log('Server initialized:', JSON.stringify(response, null, 2));
});
```

### Run Your Server

```bash
# If using npm link
npx ts-node server.ts

# Or compile first
tsc server.ts
node server.js
```

## Using Example Tools

MCPFlow comes with example tools you can use as reference:

```bash
# View example implementations
ls src/examples/
```

Example tools include:
- `booking-wizard.ts` - Travel booking with wizard pattern
- `email-validator.ts` - Email validation with retry logic
- `file-finder.ts` - File search with disambiguation

### Running Examples

```typescript
import { createBookingWizard } from '/path/to/project-pach/dist/examples/booking-wizard.js';

const server = new InteractiveServer();
const bookingTool = createBookingWizard();
server.registerTool(bookingTool);
```

## Troubleshooting

### "Cannot find module 'mcp-flow'"

**Solution:** Make sure you've:
1. Built the project with `npm run build`
2. Linked it with `npm link` (if using that approach)
3. Installed it in your project

### TypeScript Type Errors

**Solution:** Ensure your project's `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

### Changes Not Reflecting

**Solution:**
- If using `npm link`: Make sure to run `npm run build` or use `npm run watch`
- If using direct install: Reinstall with `npm install /path/to/project-pach`
- Clear your project's cache: `rm -rf node_modules/.cache`

### Tests Failing

**Solution:**
1. Check Node.js version: `node --version` (should be 18+)
2. Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`
3. Rebuild: `npm run build`

## Project Structure

Understanding the structure helps when developing locally:

```
project-pach/
├── src/                          # Source TypeScript files
│   ├── index.ts                  # Main entry point
│   ├── protocol/                 # Protocol types and utilities
│   ├── server/                   # Server implementation
│   ├── client/                   # Client implementation
│   ├── session/                  # Session management
│   ├── patterns/                 # Reusable patterns
│   └── examples/                 # Example tools
├── dist/                         # Compiled output (generated)
│   ├── index.js                  # Compiled entry point
│   ├── index.d.ts                # Type definitions
│   └── ...                       # Other compiled files
├── docs/                         # Documentation
├── package.json                  # Package configuration
├── tsconfig.json                 # TypeScript configuration
├── jest.config.js                # Jest test configuration
└── README.md                     # Main documentation
```

## Next Steps

1. Read the [main README](../README.md) for API documentation
2. Check out [EXAMPLES.md](./EXAMPLES.md) for more usage patterns
3. Review [PROTOCOL.md](./PROTOCOL.md) to understand the protocol
4. See [MIGRATION.md](./MIGRATION.md) for converting standard MCP tools

## Publishing to npm (For Maintainers)

When ready to publish:

```bash
# Ensure everything is clean
npm run lint
npm test
npm run build

# Login to npm (first time only)
npm login

# Publish
npm publish
```

The `prepublishOnly` script automatically runs `npm run build` before publishing.
