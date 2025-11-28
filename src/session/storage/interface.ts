/**
 * Storage abstraction for session data
 * Allows swapping between node-cache (dev/single-instance) and Redis (prod/distributed)
 */

import { SessionId, SessionState } from '../../protocol/types';

/**
 * Storage configuration options
 */
export interface StorageConfig {
  // TTL in seconds
  ttl: number;
  // Check period for expired entries in seconds
  checkPeriod: number;
  // Maximum number of keys/sessions
  maxKeys: number;
}

/**
 * Storage adapter interface
 * Implementations: NodeCacheAdapter, RedisAdapter
 */
export interface ISessionStorage {
  /**
   * Store session data with TTL
   */
  set(sessionId: SessionId, session: SessionState, ttl?: number): Promise<void>;

  /**
   * Retrieve session data (returns clone)
   */
  get(sessionId: SessionId): Promise<SessionState | undefined>;

  /**
   * Check if session exists
   */
  has(sessionId: SessionId): Promise<boolean>;

  /**
   * Delete session
   */
  delete(sessionId: SessionId): Promise<boolean>;

  /**
   * Get all session IDs
   */
  keys(): Promise<SessionId[]>;

  /**
   * Get total count of sessions
   */
  count(): Promise<number>;

  /**
   * Close/cleanup storage
   */
  close(): Promise<void>;

  /**
   * Register event handler for expiration
   */
  onExpired(handler: (sessionId: SessionId) => void): void;

  /**
   * Register event handler for deletion
   */
  onDeleted(handler: (sessionId: SessionId) => void): void;
}

/**
 * Storage type enum
 */
export enum StorageType {
  MEMORY = 'memory',    // node-cache (dev/single-instance)
  REDIS = 'redis',      // Redis (prod/distributed)
}