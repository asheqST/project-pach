# Token Comparison Chat Tools

Interactive chat interfaces for comparing token usage between **Standard MCP** and **Interactive MCP Flow** approaches.

## Overview

These tools provide real-time token tracking during chat conversations, demonstrating how different MCP approaches consume tokens:

- **Standard MCP (Multi-Step Tool Calls)**: User provides info step-by-step → LLM makes MULTIPLE separate tool calls, one for each piece of information
- **Interactive MCP Flow (Multi-Turn Prompts)**: User provides info step-by-step → Tool itself handles the interactive prompts and collects information

## Key Difference

### Standard MCP Mode
- **Who asks questions**: The LLM (through conversation)
- **How info is collected**: Separate tool calls (`set-destination`, `set-dates`, `set-travelers`, `confirm-booking`)
- **Token pattern**: Multiple LLM calls (one per step)
- **State management**: Server-side (booking state maintained by server)

### Interactive MCP Flow Mode
- **Who asks questions**: The tool (through interactive prompts)
- **How info is collected**: Single tool execution with multiple internal prompts
- **Token pattern**: Fewer LLM calls (tool handles internal flow)
- **State management**: Session-based (managed by MCP Flow protocol)

## Tools

### 1. Token Comparison Chat - Standard MCP
**File**: `evaluation/token-comparison-standard.ts`

Chat interface demonstrating standard MCP with multi-step tool calls:
- Uses `standard-mcp-server` with separate tools for each step
- LLM decides when to call each tool based on conversation
- Each user message may trigger a tool call
- Tracks tokens for every LLM interaction

**Available Tools**:
- `set-destination` - Set travel destination
- `set-dates` - Set travel dates
- `set-travelers` - Set number of travelers
- `get-booking-status` - Check current booking info
- `confirm-booking` - Finalize the booking
- `cancel-booking` - Reset booking

### 2. Token Comparison Chat - Interactive MCP Flow
**File**: `evaluation/token-comparison-interactive-ollama.ts`

Chat interface demonstrating Interactive MCP Flow:
- Uses `stdio-server` with `book-travel` interactive tool
- Tool prompts user for information through MCP Flow protocol
- Single tool execution handles entire flow
- Tracks tokens for LLM interactions (not internal tool prompts)

**Available Tools**:
- `book-travel` - Interactive travel booking wizard
- `greet` - Interactive greeting example

## Prerequisites

### 1. Install Ollama
Download and install from: https://ollama.ai

### 2. Pull a Model with Tool Support
```bash
# Recommended models:
ollama pull llama3.1
# or
ollama pull mistral
# or
ollama pull qwen2.5
```

### 3. Start Ollama
```bash
ollama serve
```

### 4. Build the Project
```bash
# Build the main library first
npm run build

# Build the evaluation scripts
npm run build:evaluation

# Or build both at once
npm run build:all
```

## Usage

### Standard MCP Mode (Multi-Step Tool Calls)

```bash
node evaluation/dist/token-comparison-standard.js

# With specific model:
node evaluation/dist/token-comparison-standard.js --model mistral
```

```bash
# For OpenRouter:
node evaluation/dist/token-comparison-standard-openrouter.js
```

### Interactive MCP Flow Mode

```bash
node evaluation/dist/token-comparison-interactive-ollama.js

# With specific model:
node evaluation/dist/token-comparison-interactive-ollama.js --model qwen2.5
```

```bash
# For OpenRouter:
node evaluation/dist/token-comparison-interactive-openrouter.js
```

## Features

### Real-Time Token Tracking

Tokens are displayed after each LLM response:
```
[Tokens] Call #1: +450 in, +120 out (Total: 570)
```

### Commands

Both chat interfaces support these commands:

| Command          | Description                                |
|------------------|--------------------------------------------|
| `/tokens`        | Display detailed current token usage       |
| `/help`          | Show help message with mode info           |
| `clear`          | Clear the screen                           |
| `exit` or `quit` | End session and generate report            |

### Token Display

#### Inline Display
After each LLM response:
- Prompt tokens (input)
- Completion tokens (output)
- Running total

#### On-Demand Statistics (`/tokens`)
- Total LLM calls
- Total prompt/completion/combined tokens
- Average tokens per call
- Per-call breakdown with tool call indicators

#### End-of-Session Summary
- Complete token usage
- Session duration
- Report file locations

## Example Conversations

### Standard MCP Mode (Multi-Step Tool Calls)

```
════════════════════════════════════════════════════════════
  Token Comparison Chat - Standard MCP
════════════════════════════════════════════════════════════

You: I want to book a trip

● Thinking...
[Tokens] Call #1: +234 in, +45 out (Total: 279)