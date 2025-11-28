/**
 * Node-Cache Storage Adapter
 * For development and single-instance deployments
 */

import NodeCache from 'node-cache';
import { SessionId, SessionState } from '../../protocol/types';
import { ISessionStorage, StorageConfig } from './interface';

export class NodeCacheAdapter implements ISessionStorage {
  private cache: NodeCache;
  private expirationHandlers: Array<(sessionId: SessionId) => void> = [];
  private deletionHandlers: Array<(sessionId: SessionId) => void> = [];

  constructor(config: StorageConfig) {
    this.cache = new NodeCache({
      stdTTL: config.ttl,
      checkperiod: config.checkPeriod,
      maxKeys: config.maxKeys,
      useClones: true, // CRITICAL: Returns clones to prevent reference leakage
      deleteOnExpire: true,
    });

    // Set up event handlers
    this.cache.on('expired', (key: string) => {
      this.expirationHandlers.forEach(handler => handler(key));
    });

    this.cache.on('del', (key: string) => {
      this.deletionHandlers.forEach(handler => handler(key));
    });
  }

  async set(sessionId: SessionId, session: SessionState, ttl?: number): Promise<void> {
    if (ttl !== undefined) {
      this.cache.set(sessionId, session, ttl);
    } else {
      this.cache.set(sessionId, session);
    }
  }

  async get(sessionId: SessionId): Promise<SessionState | undefined> {
    // node-cache automatically returns clones (useClones: true)
    return this.cache.get<SessionState>(sessionId);
  }

  async has(sessionId: SessionId): Promise<boolean> {
    return this.cache.has(sessionId);
  }

  async delete(sessionId: SessionId): Promise<boolean> {
    return this.cache.del(sessionId) > 0;
  }

  async keys(): Promise<SessionId[]> {
    return this.cache.keys();
  }

  async count(): Promise<number> {
    return this.cache.keys().length;
  }

  async close(): Promise<void> {
    this.cache.close();
    this.expirationHandlers = [];
    this.deletionHandlers = [];
  }

  onExpired(handler: (sessionId: SessionId) => void): void {
    this.expirationHandlers.push(handler);
  }

  onDeleted(handler: (sessionId: SessionId) => void): void {
    this.deletionHandlers.push(handler);
  }
}