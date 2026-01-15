# Ollama Chat Client for MCP Flow

A terminal-based chat interface that demonstrates how to use Ollama with MCP Flow's interactive server.

## Features

- 🤖 Natural chat interface powered by Ollama
- 🔧 Automatic tool selection by LLM
- 💬 Interactive multi-step prompts handled in terminal
- ✅ Input validation and error handling
- 🎨 Colored terminal output for better UX

## Prerequisites

### 1. Install Ollama

Download and install Ollama from: https://ollama.ai

### 2. Pull a model with tool support

```bash
# Recommended models with tool calling support:
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

## Usage

### 1. Build the project

```bash
npm run build
```

### 2. Run the chat client

```bash
./dist/examples/clients/ollama-chat-client
```

Or with a specific model:

```bash
./dist/examples/clients/ollama-chat-client --model mistral
```

## Available Tools

The MCP Flow server exposes two interactive tools:

### 1. greet
Interactive greeting that asks for user information.

**Example conversation:**
```
You: Please greet me

[Tool: greet]
→ What is your name?
  > John

→ What is your favorite color?
  Choices:
    1. Red
    2. Blue
    3. Green
    4. Yellow
  > Blue

✓ Tool completed: greet