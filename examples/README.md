# MCP Flow Examples

This directory contains practical examples demonstrating how to use MCP Flow in your applications.

## Directory Structure

```
examples/
├── clients/          # Client examples showing how to connect to MCP servers
├── servers/          # Server examples showing how to create MCP servers with interactive tools
└── README.md         # This file
```

## Client Examples

Located in `clients/`, these examples demonstrate how to build clients that connect to MCP servers:

- **[ollama-chat-client.ts](clients/ollama-chat-client.ts)** - Terminal-based chat interface using Ollama LLM with MCP Flow interactive server

See [clients/README.md](clients/README.md) for detailed documentation.

## Server Examples

Located in `servers/`, these examples demonstrate how to create MCP servers with interactive capabilities:

### Full Server Examples

- **[stdio-server.ts](servers/stdio-server.ts)** - Interactive MCP server using stdio transport
- **[standard-mcp-server.ts](servers/standard-mcp-server.ts)** - Standard non-interactive MCP server for comparison

### Interactive Tool Examples

Located in `servers/tools/`, these demonstrate different interaction patterns:

- **[booking-wizard.ts](servers/tools/booking-wizard.ts)** - Travel booking wizard using the Wizard pattern
- **[email-validator.ts](servers/tools/email-validator.ts)** - Email validation with retry logic using the Validation pattern
- **[file-finder.ts](servers/tools/file-finder.ts)** - File search with disambiguation using the Clarification pattern

## Getting Started

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Run a server example:**
   ```bash
   node dist/examples/servers/stdio-server.js
   ```

3. **Run a client example:**
   ```bash
   node dist/examples/clients/ollama-chat-client.js
   ```

## Additional Resources

- **Token Usage Evaluation**: See the [evaluation/](../evaluation/) directory for token usage comparison tools
- **Main Documentation**: See the project [README.md](../README.md) for library documentation
- **API Reference**: Explore the `src/` directory for full API details
