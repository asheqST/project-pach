/**
 * Mock implementation of nanoid for testing
 * Generates predictable IDs for test reproducibility
 */

let counter = 0;

export function nanoid(): string {
  return `test-session-${counter++}`;
}

// Export a customAlphabet function as well for compatibility
export function customAlphabet(_alphabet: string, _size: number): () => string {
  return () => nanoid();
}
