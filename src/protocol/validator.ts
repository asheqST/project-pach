/**
 * Protocol validation utilities for MCP Flow
 */

import {
  InteractionPrompt,
  InteractionResponse,
  ValidationResult,
  PromptType,
} from './types';

/**
 * Maximum allowed size for response payloads (100KB)
 * Prevents DoS attacks via large input payloads
 */
export const MAX_RESPONSE_SIZE = 100 * 1024; // 100KB

/**
 * Validates user response against prompt requirements
 */
export function validateResponse(
  response: InteractionResponse,
  prompt: InteractionPrompt
): ValidationResult {
  const { value } = response;
  const { validation, type } = prompt;

  // Validate overall response size to prevent DoS
  try {
    const responseSize = JSON.stringify(response).length;
    if (responseSize > MAX_RESPONSE_SIZE) {
      return {
        valid: false,
        error: `Response size (${responseSize} bytes) exceeds maximum allowed size (${MAX_RESPONSE_SIZE} bytes)`,
      };
    }
  } catch (e) {
    return {
      valid: false,
      error: 'Invalid response format',
    };
  }

  // Required field check
  if (validation?.required && (value === null || value === undefined || value === '')) {
    return {
      valid: false,
      error: 'This field is required',
    };
  }

  // Type-specific validation
  switch (type) {
    case PromptType.TEXT:
      return validateText(value, validation);
    case PromptType.NUMBER:
      return validateNumber(value, validation);
    case PromptType.CHOICE:
      return validateChoice(value, prompt);
    case PromptType.CONFIRM:
      return validateConfirm(value);
    case PromptType.DATE:
      return validateDate(value);
    default:
      return { valid: true };
  }
}

function validateText(
  value: unknown,
  validation?: InteractionPrompt['validation']
): ValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Expected text input' };
  }

  if (validation?.pattern) {
    try {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return {
          valid: false,
          error: 'Input does not match required format',
        };
      }
    } catch (e) {
      return { valid: false, error: 'Invalid pattern configuration' };
    }
  }

  if (validation?.min !== undefined && value.length < validation.min) {
    return {
      valid: false,
      error: `Minimum length is ${validation.min} characters`,
    };
  }

  if (validation?.max !== undefined && value.length > validation.max) {
    return {
      valid: false,
      error: `Maximum length is ${validation.max} characters`,
    };
  }

  return { valid: true };
}

function validateNumber(
  value: unknown,
  validation?: InteractionPrompt['validation']
): ValidationResult {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (typeof num !== 'number' || isNaN(num)) {
    return { valid: false, error: 'Expected a valid number' };
  }

  if (validation?.min !== undefined && num < validation.min) {
    return {
      valid: false,
      error: `Minimum value is ${validation.min}`,
    };
  }

  if (validation?.max !== undefined && num > validation.max) {
    return {
      valid: false,
      error: `Maximum value is ${validation.max}`,
    };
  }

  return { valid: true };
}

function validateChoice(value: unknown, prompt: InteractionPrompt): ValidationResult {
  if (!prompt.choices || prompt.choices.length === 0) {
    return { valid: false, error: 'No choices available' };
  }

  const validValues = prompt.choices.map((c) => c.value);
  if (!validValues.includes(String(value))) {
    return {
      valid: false,
      error: 'Please select a valid option',
      suggestion: `Valid options: ${validValues.join(', ')}`,
    };
  }

  return { valid: true };
}

function validateConfirm(value: unknown): ValidationResult {
  if (typeof value !== 'boolean') {
    const stringValue = String(value).toLowerCase();
    if (!['true', 'false', 'yes', 'no', 'y', 'n'].includes(stringValue)) {
      return {
        valid: false,
        error: 'Expected yes/no or true/false',
      };
    }
  }

  return { valid: true };
}

function validateDate(value: unknown): ValidationResult {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return {
      valid: false,
      error: 'Expected a valid date',
    };
  }

  return { valid: true };
}

/**
 * Normalizes user input based on prompt type
 */
export function normalizeResponse(
  value: unknown,
  type: PromptType
): unknown {
  switch (type) {
    case PromptType.NUMBER:
      return typeof value === 'string' ? parseFloat(value) : value;
    case PromptType.CONFIRM: {
      if (typeof value === 'boolean') return value;
      const str = String(value).toLowerCase();
      return ['true', 'yes', 'y'].includes(str);
    }
    case PromptType.DATE:
      return typeof value === 'string' ? new Date(value) : value;
    default:
      return value;
  }
}
