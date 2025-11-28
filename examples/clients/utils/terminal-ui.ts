/**
 * Terminal UI Utilities
 * Helpers for rendering prompts and handling user input in terminal
 */

import * as readline from 'readline';
import { InteractionPrompt, PromptType } from '../../../src/protocol/types.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

/**
 * Format a message with color
 */
export function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Display a formatted prompt
 */
export function displayPrompt(prompt: InteractionPrompt): void {
  console.log();
  console.log(colorize('→ ' + prompt.message, 'cyan'));

  if (prompt.placeholder) {
    console.log(colorize(`  (e.g., ${prompt.placeholder})`, 'dim'));
  }

  if (prompt.type === PromptType.CHOICE && prompt.choices) {
    console.log(colorize('  Choices:', 'dim'));
    prompt.choices.forEach((choice, index) => {
      console.log(colorize(`    ${index + 1}. ${choice.label}`, 'dim'));
    });
  }

  if (prompt.validation) {
    const hints: string[] = [];
    if (prompt.validation.required) {
      hints.push('required');
    }
    if (prompt.validation.min !== undefined) {
      hints.push(`min: ${prompt.validation.min}`);
    }
    if (prompt.validation.max !== undefined) {
      hints.push(`max: ${prompt.validation.max}`);
    }
    if (hints.length > 0) {
      console.log(colorize(`  (${hints.join(', ')})`, 'dim'));
    }
  }
}

/**
 * Get user input with readline
 */
export function getUserInput(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Handle prompt based on type and get validated user input
 */
export async function promptUser(prompt: InteractionPrompt): Promise<unknown> {
  displayPrompt(prompt);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const inputPrompt =
        prompt.type === PromptType.CONFIRM
          ? colorize('  [Y/n]: ', 'yellow')
          : colorize('  > ', 'yellow');

      const input = await getUserInput(inputPrompt);

      // Handle empty input
      if (!input && prompt.validation?.required && !prompt.defaultValue) {
        console.log(colorize('  ✗ This field is required', 'red'));
        continue;
      }

      if (!input && prompt.defaultValue) {
        return prompt.defaultValue;
      }

      // Validate and convert based on type
      const result = await validateAndConvert(input, prompt);
      return result;
    } catch (error) {
      console.log(colorize(`  ✗ ${(error as Error).message}`, 'red'));

      if (attempts >= maxAttempts) {
        throw new Error('Maximum attempts exceeded');
      }

      console.log(colorize('  Please try again...', 'yellow'));
    }
  }

  throw new Error('Failed to get valid input');
}

/**
 * Validate and convert input based on prompt type
 */
async function validateAndConvert(
  input: string,
  prompt: InteractionPrompt
): Promise<unknown> {
  switch (prompt.type) {
    case PromptType.TEXT:
      return validateText(input, prompt);

    case PromptType.NUMBER:
      return validateNumber(input, prompt);

    case PromptType.CONFIRM:
      return validateConfirm(input);

    case PromptType.CHOICE:
      return validateChoice(input, prompt);

    default:
      return input;
  }
}

/**
 * Validate text input
 */
function validateText(input: string, prompt: InteractionPrompt): string {
  if (prompt.validation?.pattern) {
    const regex = new RegExp(prompt.validation.pattern);
    if (!regex.test(input)) {
      throw new Error('Input does not match required pattern');
    }
  }

  if (
    prompt.validation?.min !== undefined &&
    input.length < prompt.validation.min
  ) {
    throw new Error(`Input must be at least ${prompt.validation.min} characters`);
  }

  if (
    prompt.validation?.max !== undefined &&
    input.length > prompt.validation.max
  ) {
    throw new Error(`Input must be at most ${prompt.validation.max} characters`);
  }

  return input;
}

/**
 * Validate number input
 */
function validateNumber(input: string, prompt: InteractionPrompt): number {
  const num = Number(input);

  if (isNaN(num)) {
    throw new Error('Please enter a valid number');
  }

  if (prompt.validation?.min !== undefined && num < prompt.validation.min) {
    throw new Error(`Number must be at least ${prompt.validation.min}`);
  }

  if (prompt.validation?.max !== undefined && num > prompt.validation.max) {
    throw new Error(`Number must be at most ${prompt.validation.max}`);
  }

  return num;
}

/**
 * Validate confirm input
 */
function validateConfirm(input: string): boolean {
  const lower = input.toLowerCase();

  if (!input || lower === 'y' || lower === 'yes' || lower === 'true') {
    return true;
  }

  if (lower === 'n' || lower === 'no' || lower === 'false') {
    return false;
  }

  throw new Error('Please enter Y (yes) or N (no)');
}

/**
 * Validate choice input
 */
function validateChoice(input: string, prompt: InteractionPrompt): string {
  if (!prompt.choices || prompt.choices.length === 0) {
    throw new Error('No choices available');
  }

  // Try to match by number
  const num = parseInt(input);
  if (!isNaN(num) && num >= 1 && num <= prompt.choices.length) {
    return prompt.choices[num - 1].value;
  }

  // Try to match by label or value
  const choice = prompt.choices.find(
    (c) =>
      c.label.toLowerCase() === input.toLowerCase() ||
      c.value.toLowerCase() === input.toLowerCase()
  );

  if (choice) {
    return choice.value;
  }

  throw new Error(
    `Invalid choice. Please enter a number (1-${prompt.choices.length}) or choice name`
  );
}

/**
 * Display a message with formatting
 */
export function displayMessage(role: 'user' | 'assistant' | 'system', message: string): void {
  console.log();
  switch (role) {
    case 'user':
      console.log(colorize('You:', 'bright') + ' ' + message);
      break;
    case 'assistant':
      console.log(colorize('Assistant:', 'green') + ' ' + message);
      break;
    case 'system':
      console.log(colorize('● ', 'blue') + colorize(message, 'dim'));
      break;
  }
}

/**
 * Display tool execution status
 */
export function displayToolExecution(toolName: string, status: 'start' | 'complete' | 'error'): void {
  console.log();
  switch (status) {
    case 'start':
      console.log(colorize(`[Tool: ${toolName}]`, 'magenta'));
      break;
    case 'complete':
      console.log(colorize(`✓ Tool completed: ${toolName}`, 'green'));
      break;
    case 'error':
      console.log(colorize(`✗ Tool failed: ${toolName}`, 'red'));
      break;
  }
}

/**
 * Display the header
 */
export function displayHeader(): void {
  console.clear();
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log(colorize('  MCP Flow Chat (Powered by Ollama)', 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log();
  console.log(colorize('  Type your message and press Enter', 'dim'));
  console.log(colorize('  Type "exit" or "quit" to end the chat', 'dim'));
  console.log(colorize('  Type "clear" to clear the screen', 'dim'));
  console.log();
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.log();
  console.log(colorize('✗ Error: ' + message, 'red'));
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log();
  console.log(colorize('✓ ' + message, 'green'));
}
