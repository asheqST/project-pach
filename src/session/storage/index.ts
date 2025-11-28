/**
 * Storage adapters for session management
 */

export * from './interface';
export * from './node-cache-adapter';
export * from './redis-adapter';

import { RedisOptions } from 'ioredis';
import { ISessionStorage, StorageConfig, StorageType } from './interface';
import { NodeCacheAdapter } from './node-cache-adapter';
import { RedisAdapter, RedisAdapterConfig } from './redis-adapter';

/**
 * Factory function to create storage adapter based on configuration
 */
export function createStorage(
  type: StorageType,
  config: StorageConfig & { redis?: RedisOptions; keyPrefix?: string; enableExpirationEvents?: boolean }
): ISessionStorage {
  switch (type) {
    case StorageType.MEMORY:
      return new NodeCacheAdapter(config);

    case StorageType.REDIS:
      if (!config.redis) {
        throw new Error('Redis configuration required for StorageType.REDIS');
      }
      return new RedisAdapter({
        ...config,
        redis: config.redis,
        keyPrefix: config.keyPrefix,
        enableExpirationEvents: config.enableExpirationEvents,
      } as RedisAdapterConfig);

    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}