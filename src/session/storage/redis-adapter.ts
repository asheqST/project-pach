/**
 * Redis Storage Adapter
 * For production and distributed deployments
 *
 * Features:
 * - Distributed session storage
 * - Automatic TTL/expiration
 * - Atomic operations
 * - Horizontal scalability
 */

import Redis, { RedisOptions } from 'ioredis';
import { SessionId, SessionState } from '../../protocol/types';
import { ISessionStorage, StorageConfig } from './interface';

export interface RedisAdapterConfig extends StorageConfig {
  /**
   * Redis connection options
   */
  redis: RedisOptions;

  /**
   * Key prefix for all session keys
   */
  keyPrefix?: string;

  /**
   * Enable keyspace notifications for expiration events
   * Note: Requires Redis config: notify-keyspace-events Ex
   */
  enableExpirationEvents?: boolean;
}

export class RedisAdapter implements ISessionStorage {
  private client: Redis;
  private subscriber?: Redis;
  private config: Required<Omit<RedisAdapterConfig, 'redis'>> & { redis: RedisOptions };
  private expirationHandlers: Array<(sessionId: SessionId) => void> = [];
  private deletionHandlers: Array<(sessionId: SessionId) => void> = [];

  constructor(config: RedisAdapterConfig) {
    this.config = {
      ...config,
      keyPrefix: config.keyPrefix ?? 'session:',
      enableExpirationEvents: config.enableExpirationEvents ?? false,
    };

    // Main Redis client
    this.client = new Redis(this.config.redis);

    // Set up expiration event listener if enabled
    if (this.config.enableExpirationEvents) {
      this.setupExpirationListener();
    }
  }

  /**
   * Set up Redis keyspace notifications for expiration events
   * Requires: redis-server config notify-keyspace-events Ex
   */
  private async setupExpirationListener(): Promise<void> {
    this.subscriber = new Redis(this.config.redis);

    // Subscribe to expiration events
    await this.subscriber.psubscribe('__keyevent@*__:expired');

    this.subscriber.on('pmessage', (_pattern, _channel, expiredKey) => {
      // Remove prefix to get sessionId
      const sessionId = expiredKey.replace(this.config.keyPrefix, '');
      this.expirationHandlers.forEach(handler => handler(sessionId));
    });
  }

  /**
   * Get full key with prefix
   */
  private getKey(sessionId: SessionId): string {
    return `${this.config.keyPrefix}${sessionId}`;
  }

  /**
   * Strip prefix from key
   */
  private stripKey(key: string): SessionId {
    return key.replace(this.config.keyPrefix, '');
  }

  async set(sessionId: SessionId, session: SessionState, ttl?: number): Promise<void> {
    const key = this.getKey(sessionId);
    const value = JSON.stringify(session);
    const ttlSeconds = ttl ?? this.config.ttl;

    await this.client.setex(key, ttlSeconds, value);
  }

  async get(sessionId: SessionId): Promise<SessionState | undefined> {
    const key = this.getKey(sessionId);
    const value = await this.client.get(key);

    if (!value) {
      return undefined;
    }

    try {
      // Parse and return (automatically creates a clone)
      return JSON.parse(value) as SessionState;
    } catch {
      return undefined;
    }
  }

  async has(sessionId: SessionId): Promise<boolean> {
    const key = this.getKey(sessionId);
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async delete(sessionId: SessionId): Promise<boolean> {
    const key = this.getKey(sessionId);
    const deleted = await this.client.del(key);

    if (deleted > 0) {
      this.deletionHandlers.forEach(handler => handler(sessionId));
      return true;
    }

    return false;
  }

  async keys(): Promise<SessionId[]> {
    const pattern = `${this.config.keyPrefix}*`;
    const keys = await this.client.keys(pattern);
    return keys.map(key => this.stripKey(key));
  }

  async count(): Promise<number> {
    const pattern = `${this.config.keyPrefix}*`;

    // Use SCAN for better performance with large datasets
    let cursor = '0';
    let count = 0;

    do {
      const [newCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = newCursor;
      count += keys.length;
    } while (cursor !== '0');

    return count;
  }

  async close(): Promise<void> {
    await this.client.quit();

    if (this.subscriber) {
      await this.subscriber.quit();
    }

    this.expirationHandlers = [];
    this.deletionHandlers = [];
  }

  onExpired(handler: (sessionId: SessionId) => void): void {
    this.expirationHandlers.push(handler);
  }

  onDeleted(handler: (sessionId: SessionId) => void): void {
    this.deletionHandlers.push(handler);
  }

  /**
   * Health check - test Redis connection
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): Redis {
    return this.client;
  }
}