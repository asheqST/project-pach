/**
 * Validation Pattern for MCP Flow
 * Iterative refinement with retry logic
 */

import { ToolExecutionContext } from '../server/interactive-server';
import { InteractionPrompt } from '../protocol/types';

export interface ValidationConfig {
  maxAttempts?: number;
  prompt: InteractionPrompt;
  validate: (value: unknown) => Promise<PatternValidationResult> | PatternValidationResult;
  onSuccess?: (value: unknown) => unknown;
  onFailure?: (errors: string[]) => void;
}

export interface PatternValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  transformed?: unknown;
}

/**
 * Validation pattern with retry logic
 */
export class ValidatedInput {
  private config: Required<Omit<ValidationConfig, 'onSuccess' | 'onFailure'>> &
    Pick<ValidationConfig, 'onSuccess' | 'onFailure'>;

  constructor(config: ValidationConfig) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      prompt: config.prompt,
      validate: config.validate,
      onSuccess: config.onSuccess,
      onFailure: config.onFailure,
    };
  }

  /**
   * Executes validation with retry logic
   */
  async execute(executionContext: ToolExecutionContext): Promise<unknown> {
    const errors: string[] = [];
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      const prompt =
        attempt === 0
          ? this.config.prompt
          : {
              ...this.config.prompt,
              message: `${this.config.prompt.message}\n\n${errors[errors.length - 1]}`,
            };

      const response = await executionContext.prompt(prompt);
      const validationResult = await this.config.validate(response.value);

      if (validationResult.valid) {
        const value = validationResult.transformed ?? response.value;
        return this.config.onSuccess ? this.config.onSuccess(value) : value;
      }

      // Validation failed
      const errorMsg =
        validationResult.error ?? 'Invalid input, please try again';
      const suggestionMsg = validationResult.suggestion
        ? `\nSuggestion: ${validationResult.suggestion}`
        : '';

      errors.push(`${errorMsg}${suggestionMsg}`);
      attempt++;
    }

    // Max attempts reached
    if (this.config.onFailure) {
      this.config.onFailure(errors);
    }

    throw new Error(
      `Validation failed after ${this.config.maxAttempts} attempts`
    );
  }
}

/**
 * Common validators
 */
export const Validators = {
  /**
   * Email validator
   */
  email: (): ((value: unknown) => PatternValidationResult) => {
    return (value: unknown) => {
      const email = String(value);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return {
          valid: false,
          error: 'Invalid email format',
          suggestion: 'Use format: user@example.com',
        };
      }

      return { valid: true };
    };
  },

  /**
   * URL validator
   */
  url: (): ((value: unknown) => PatternValidationResult) => {
    return (value: unknown) => {
      try {
        new URL(String(value));
        return { valid: true };
      } catch {
        return {
          valid: false,
          error: 'Invalid URL format',
          suggestion: 'Use format: https://example.com',
        };
      }
    };
  },

  /**
   * Range validator
   */
  range: (min: number, max: number): ((value: unknown) => PatternValidationResult) => {
    return (value: unknown) => {
      const num = Number(value);
      if (isNaN(num)) {
        return {
          valid: false,
          error: 'Expected a number',
        };
      }

      if (num < min || num > max) {
        return {
          valid: false,
          error: `Value must be between ${min} and ${max}`,
        };
      }

      return { valid: true, transformed: num };
    };
  },

  /**
   * Length validator
   */
  length: (
    min: number,
    max: number
  ): ((value: unknown) => PatternValidationResult) => {
    return (value: unknown) => {
      const str = String(value);
      if (str.length < min || str.length > max) {
        return {
          valid: false,
          error: `Length must be between ${min} and ${max} characters`,
        };
      }

      return { valid: true };
    };
  },

  /**
   * Pattern validator
   */
  pattern: (regex: RegExp, message?: string): ((value: unknown) => PatternValidationResult) => {
    return (value: unknown) => {
      if (!regex.test(String(value))) {
        return {
          valid: false,
          error: message ?? 'Input does not match required pattern',
        };
      }

      return { valid: true };
    };
  },

  /**
   * Custom async validator
   */
  custom: (
    validator: (value: unknown) => Promise<boolean> | boolean,
    errorMessage: string
  ): ((value: unknown) => Promise<PatternValidationResult>) => {
    return async (value: unknown) => {
      const isValid = await validator(value);
      if (!isValid) {
        return {
          valid: false,
          error: errorMessage,
        };
      }

      return { valid: true };
    };
  },

  /**
   * Combines multiple validators
   */
  combine: (
    ...validators: Array<(value: unknown) => PatternValidationResult | Promise<PatternValidationResult>>
  ): ((value: unknown) => Promise<PatternValidationResult>) => {
    return async (value: unknown) => {
      for (const validator of validators) {
        const result = await validator(value);
        if (!result.valid) {
          return result;
        }
      }

      return { valid: true };
    };
  },
};
