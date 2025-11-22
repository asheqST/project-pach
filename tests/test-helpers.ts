/**
 * Test helper utilities for MCP Flow tests
 * Provides type-safe helpers for working with JsonRpcResponse
 */

import { JsonRpcResponse } from '../src/protocol/types';
import { isErrorResponse, isSuccessResponse } from '../src/protocol/utils';

/**
 * Assert that a response is a success response and return the result
 */
export function expectSuccess<T = any>(response: JsonRpcResponse): T {
  if (isErrorResponse(response)) {
    throw new Error(`Expected success response but got error: ${response.error.message}`);
  }
  return response.result as T;
}

/**
 * Assert that a response is an error response and return the error
 */
export function expectError(response: JsonRpcResponse) {
  if (isSuccessResponse(response)) {
    throw new Error(`Expected error response but got success`);
  }
  return response.error;
}

/**
 * Get result if success, undefined if error
 */
export function getResult<T = any>(response: JsonRpcResponse): T | undefined {
  return isSuccessResponse(response) ? (response.result as T) : undefined;
}

/**
 * Get error if error response, undefined if success
 */
export function getError(response: JsonRpcResponse) {
  return isErrorResponse(response) ? response.error : undefined;
}

/**
 * Check if response is success
 */
export function isSuccess(response: JsonRpcResponse): boolean {
  return isSuccessResponse(response);
}

/**
 * Check if response is error
 */
export function isError(response: JsonRpcResponse): boolean {
  return isErrorResponse(response);
}

export { isErrorResponse, isSuccessResponse };
