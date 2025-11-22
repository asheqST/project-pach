/**
 * Protocol tests for MCP Flow
 */

import {
  validateResponse,
  normalizeResponse,
  generateSessionId,
  Errors,
  RequestBuilders,
} from '../src/protocol';
import { PromptType, InteractionPrompt, InteractionResponse } from '../src/protocol/types';

describe('Protocol Validator', () => {
  describe('validateResponse', () => {
    it('should validate text input', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.TEXT,
        message: 'Enter text',
        validation: { required: true, min: 3, max: 10 },
      };

      const validResponse: InteractionResponse = {
        value: 'hello',
        timestamp: Date.now(),
      };

      const result = validateResponse(validResponse, prompt);
      expect(result.valid).toBe(true);
    });

    it('should reject text input that is too short', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.TEXT,
        message: 'Enter text',
        validation: { min: 5 },
      };

      const response: InteractionResponse = {
        value: 'hi',
        timestamp: Date.now(),
      };

      const result = validateResponse(response, prompt);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum length');
    });

    it('should validate number input', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.NUMBER,
        message: 'Enter number',
        validation: { min: 1, max: 100 },
      };

      const validResponse: InteractionResponse = {
        value: 50,
        timestamp: Date.now(),
      };

      const result = validateResponse(validResponse, prompt);
      expect(result.valid).toBe(true);
    });

    it('should validate choice input', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.CHOICE,
        message: 'Select option',
        choices: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      };

      const validResponse: InteractionResponse = {
        value: 'a',
        timestamp: Date.now(),
      };

      const result = validateResponse(validResponse, prompt);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid choice', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.CHOICE,
        message: 'Select option',
        choices: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      };

      const invalidResponse: InteractionResponse = {
        value: 'c',
        timestamp: Date.now(),
      };

      const result = validateResponse(invalidResponse, prompt);
      expect(result.valid).toBe(false);
    });

    it('should validate pattern matching', () => {
      const prompt: InteractionPrompt = {
        type: PromptType.TEXT,
        message: 'Enter email',
        validation: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
      };

      const validResponse: InteractionResponse = {
        value: 'user@example.com',
        timestamp: Date.now(),
      };

      const result = validateResponse(validResponse, prompt);
      expect(result.valid).toBe(true);
    });
  });

  describe('normalizeResponse', () => {
    it('should normalize number strings', () => {
      const result = normalizeResponse('42', PromptType.NUMBER);
      expect(result).toBe(42);
    });

    it('should normalize confirm strings', () => {
      expect(normalizeResponse('yes', PromptType.CONFIRM)).toBe(true);
      expect(normalizeResponse('no', PromptType.CONFIRM)).toBe(false);
      expect(normalizeResponse(true, PromptType.CONFIRM)).toBe(true);
    });

    it('should normalize date strings', () => {
      const dateStr = '2024-01-15';
      const result = normalizeResponse(dateStr, PromptType.DATE);
      expect(result).toBeInstanceOf(Date);
    });
  });
});

describe('Protocol Utils', () => {
  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session_/);
    });
  });

  describe('Errors', () => {
    it('should create session not found error', () => {
      const error = Errors.sessionNotFound('test-session');
      expect(error.code).toBe(-32001);
      expect(error.message).toContain('test-session');
    });

    it('should create validation error', () => {
      const error = Errors.validationFailed('Invalid input');
      expect(error.code).toBe(-32004);
      expect(error.message).toBe('Invalid input');
    });
  });

  describe('RequestBuilders', () => {
    it('should build start request', () => {
      const request = RequestBuilders.start('test-tool', { foo: 'bar' });
      expect(request.method).toBe('interaction.start');
      expect(request.params?.toolName).toBe('test-tool');
      expect(request.params?.initialParams).toEqual({ foo: 'bar' });
    });

    it('should build respond request', () => {
      const response: InteractionResponse = {
        value: 'test',
        timestamp: Date.now(),
      };
      const request = RequestBuilders.respond('session-1', response);
      expect(request.method).toBe('interaction.respond');
      expect(request.params?.sessionId).toBe('session-1');
    });
  });
});
