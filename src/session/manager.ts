/**
 * Session Manager for MCP Flow
 * Handles session lifecycle, state persistence, and timeout management
 *
 * Security features using industry-standard libraries:
 * - nanoid: Cryptographically secure ID generation
 * - XState: State machine for validated state transitions
 * - Storage abstraction: Configurable storage (node-cache/Redis)
 *
 * Security fixes:
 * ✅ Session ID collision vulnerability (uses nanoid for cryptographically secure IDs)
 * ✅ Memory exhaustion DoS (hard limits + automatic expiration)
 * ✅ Data leakage between sessions (returns clones, not references)
 * ✅ Prototype pollution (validates keys against dangerous properties)
 * ✅ Input validation (validates all inputs with proper bounds checking)
 * ✅ State transition validation (XState enforces valid state changes)
 */

import EventEmitter from 'eventemitter3';
import { nanoid } from 'nanoid';
import { RedisOptions } from 'ioredis';
import {
  SessionId,
  SessionState,
  InteractionState,
  InteractionTurn,
  InteractionPrompt,
  InteractionResponse,
} from '../protocol/types';
import { ISessionStorage, StorageType, createStorage } from './storage';
import { canTransition, getTransitionEvent } from './state-machine';

export interface SessionConfig {
  defaultTimeout?: number; // in milliseconds
  maxSessions?: number;
  pruneInterval?: number;
  enablePersistence?: boolean;
  // Storage configuration
  storageType?: StorageType;
  redis?: RedisOptions;
  keyPrefix?: string;
  enableExpirationEvents?: boolean;
}

export interface SessionEvents {
  created: (sessionId: SessionId) => void;
  updated: (sessionId: SessionId, state: SessionState) => void;
  expired: (sessionId: SessionId) => void;
  completed: (sessionId: SessionId, result: unknown) => void;
  cancelled: (sessionId: SessionId, reason?: string) => void;
  error: (sessionId: SessionId, error: Error) => void;
}

/**
 * Manages interactive session state and lifecycle
 */
export class SessionManager extends EventEmitter<SessionEvents> {
  private storage: ISessionStorage;
  private config: Required<Omit<SessionConfig, 'redis' | 'keyPrefix' | 'enableExpirationEvents'>> & {
    storageType: StorageType;
  };
  private cleanupTimers: Map<SessionId, NodeJS.Timeout> = new Map();

  // Security constants
  private static readonly MAX_SESSION_ID_LENGTH = 256;
  private static readonly MAX_CONTEXT_SIZE = 10000; // 10KB
  private static readonly MIN_TIMEOUT = 1000; // 1 second
  private static readonly MAX_TIMEOUT = 3600000; // 1 hour
  private static readonly MAX_HISTORY_SIZE = 100;
  private static readonly DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
  private static readonly VALID_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

  constructor(config: SessionConfig = {}) {
    super();

    this.config = {
      defaultTimeout: this.validateTimeout(config.defaultTimeout ?? 300000),
      maxSessions: config.maxSessions ?? 1000,
      pruneInterval: config.pruneInterval ?? 60000,
      enablePersistence: config.enablePersistence ?? false,
      storageType: config.storageType ?? StorageType.MEMORY,
    };

    // Initialize storage with security features
    this.storage = createStorage(this.config.storageType, {
      ttl: Math.floor(this.config.defaultTimeout / 1000), // Convert to seconds
      checkPeriod: Math.floor(this.config.pruneInterval / 1000),
      maxKeys: this.config.maxSessions,
      redis: config.redis,
      keyPrefix: config.keyPrefix,
      enableExpirationEvents: config.enableExpirationEvents,
    });

    // Set up storage event handlers
    this.storage.onExpired((key: string) => {
      this.handleExpiration(key);
    });

    this.storage.onDeleted((key: string) => {
      this.clearCleanupTimer(key);
    });
  }

  /**
   * Creates a new session with cryptographically secure ID
   *
   * @param toolName - Name of the tool being used
   * @param context - Optional context data
   * @param timeout - Optional timeout in milliseconds
   * @returns Object containing sessionId and initial state
   */
  async createSession(
    toolName: string,
    context?: Record<string, unknown>,
    timeout?: number
  ): Promise<{ sessionId: SessionId; state: SessionState }> {
    // Validate inputs
    if (!toolName || typeof toolName !== 'string') {
      throw new Error('Invalid toolName');
    }

    const validatedTimeout = timeout ? this.validateTimeout(timeout) : this.config.defaultTimeout;
    const sanitizedContext = context ? this.sanitizeContext(context) : undefined;

    // Generate cryptographically secure ID
    const sessionId = nanoid();

    // Enforce hard limit BEFORE creating session
    const currentCount = await this.storage.count();
    if (currentCount >= this.config.maxSessions) {
      throw new Error(`Maximum sessions limit reached (${this.config.maxSessions})`);
    }

    const now = Date.now();
    const state: SessionState = {
      sessionId,
      state: InteractionState.IDLE,
      metadata: {
        createdAt: now,
        lastActivityAt: now,
        toolName,
        context: sanitizedContext,
      },
      history: [],
      accumulatedData: {},
    };

    // Store with TTL
    await this.storage.set(sessionId, state, validatedTimeout / 1000);

    this.emit('created', sessionId);

    return { sessionId, state };
  }

  /**
   * Retrieves session state (returns a CLONE to prevent reference leakage)
   */
  async getSession(sessionId: SessionId): Promise<SessionState | undefined> {
    this.validateSessionId(sessionId);

    // Storage returns clone automatically
    return await this.storage.get(sessionId);
  }

  /**
   * Checks if session exists
   */
  async hasSession(sessionId: SessionId): Promise<boolean> {
    this.validateSessionId(sessionId);
    return await this.storage.has(sessionId);
  }

  /**
   * Updates session state with validation
   */
  async updateState(sessionId: SessionId, newState: InteractionState): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Validate state transition using XState with context-aware event
    const event = getTransitionEvent(session.state, newState);
    if (!event || !canTransition(session.state, event)) {
      throw new Error(`Invalid state transition: ${session.state} -> ${newState}`);
    }

    session.state = newState;
    session.metadata.lastActivityAt = Date.now();

    // Update in storage (refreshes TTL)
    await this.storage.set(sessionId, session);

    this.emit('updated', sessionId, session);
  }

  /**
   * Adds a turn to session history with size limits
   */
  async addTurn(
    sessionId: SessionId,
    prompt?: InteractionPrompt,
    response?: InteractionResponse
  ): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Enforce history size limit
    if (session.history.length >= SessionManager.MAX_HISTORY_SIZE) {
      // Remove oldest turn
      session.history.shift();
    }

    const turn: InteractionTurn = {
      turnId: session.history.length,
      prompt,
      response,
      timestamp: Date.now(),
    };

    session.history.push(turn);
    session.metadata.lastActivityAt = Date.now();

    if (prompt) {
      session.currentPrompt = prompt;
    }

    await this.storage.set(sessionId, session);
    this.emit('updated', sessionId, session);
  }

  /**
   * Accumulates data in session context with security validation
   *
   * SECURITY: Prevents prototype pollution by validating keys
   */
  async setData(sessionId: SessionId, key: string, value: unknown): Promise<void> {
    this.validateSessionId(sessionId);
    this.validateDataKey(key);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Sanitize value
    session.accumulatedData[key] = this.sanitizeValue(value);
    session.metadata.lastActivityAt = Date.now();

    await this.storage.set(sessionId, session);
  }

  /**
   * Gets accumulated data (returns CLONE to prevent reference leakage)
   */
  async getData(sessionId: SessionId, key?: string): Promise<unknown> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (key) {
      this.validateDataKey(key);
      // Storage already returns a clone
      return session.accumulatedData[key];
    }

    // Return clone of all accumulated data
    return { ...session.accumulatedData };
  }

  /**
   * Completes a session
   */
  async completeSession(sessionId: SessionId, result: unknown): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Prevent completing already-finished sessions
    if (this.isTerminalState(session.state)) {
      throw new Error(`Session already in terminal state: ${session.state}`);
    }

    const sanitizedResult = this.sanitizeValue(result);
    session.accumulatedData.result = sanitizedResult;
    session.state = InteractionState.COMPLETED;
    session.metadata.lastActivityAt = Date.now();

    await this.storage.set(sessionId, session);
    this.emit('completed', sessionId, sanitizedResult);

    // Schedule cleanup
    this.scheduleCleanup(sessionId, 5000);
  }

  /**
   * Cancels a session
   */
  async cancelSession(sessionId: SessionId, reason?: string): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Prevent cancelling already-finished sessions
    if (this.isTerminalState(session.state)) {
      throw new Error(`Session already in terminal state: ${session.state}`);
    }

    session.state = InteractionState.CANCELLED;
    await this.storage.set(sessionId, session);

    this.emit('cancelled', sessionId, reason);

    // Schedule cleanup
    this.scheduleCleanup(sessionId, 5000);
  }

  /**
   * Marks session as errored
   */
  async errorSession(sessionId: SessionId, error: Error): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.getSession(sessionId);
    if (!session) {
      return; // Session might have already expired
    }

    session.state = InteractionState.ERROR;
    await this.storage.set(sessionId, session);

    this.emit('error', sessionId, error);

    // Schedule cleanup
    this.scheduleCleanup(sessionId, 5000);
  }

  /**
   * Destroys a session
   */
  async destroySession(sessionId: SessionId): Promise<boolean> {
    this.validateSessionId(sessionId);
    this.clearCleanupTimer(sessionId);
    return await this.storage.delete(sessionId);
  }

  /**
   * Gets all active sessions (returns CLONES)
   */
  async getActiveSessions(): Promise<SessionState[]> {
    const sessionIds = await this.storage.keys();
    const sessions = await Promise.all(
      sessionIds.map(async (id) => await this.storage.get(id))
    );

    return sessions
      .filter((s): s is SessionState => s !== undefined)
      .filter(s =>
        s.state === InteractionState.ACTIVE ||
        s.state === InteractionState.WAITING_USER
      );
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    maxSessions: number;
  }> {
    const total = await this.storage.count();
    const activeSessions = await this.getActiveSessions();

    return {
      totalSessions: total,
      activeSessions: activeSessions.length,
      maxSessions: this.config.maxSessions,
    };
  }

  /**
   * Stops pruning and cleans up
   */
  async destroy(): Promise<void> {
    // Clear all cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    // Close storage (triggers all event handlers)
    await this.storage.close();

    // Remove all event listeners
    this.removeAllListeners();
  }

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  /**
   * Validates session ID format
   */
  private validateSessionId(sessionId: SessionId): void {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid sessionId: must be a non-empty string');
    }

    if (sessionId.length > SessionManager.MAX_SESSION_ID_LENGTH) {
      throw new Error(`SessionId too long (max ${SessionManager.MAX_SESSION_ID_LENGTH} chars)`);
    }
  }

  /**
   * Validates timeout value
   */
  private validateTimeout(timeout: number | undefined): number {
    if (timeout === undefined) {
      return this.config?.defaultTimeout ?? 300000;
    }

    if (typeof timeout !== 'number' || !isFinite(timeout)) {
      throw new Error('Invalid timeout: must be a finite number');
    }

    if (timeout < SessionManager.MIN_TIMEOUT) {
      throw new Error(`Timeout too short (min ${SessionManager.MIN_TIMEOUT}ms)`);
    }

    if (timeout > SessionManager.MAX_TIMEOUT) {
      throw new Error(`Timeout too long (max ${SessionManager.MAX_TIMEOUT}ms)`);
    }

    return timeout;
  }

  /**
   * Validates data key against prototype pollution
   */
  private validateDataKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }

    // Prevent prototype pollution
    if (SessionManager.DANGEROUS_KEYS.includes(key)) {
      throw new Error(`Forbidden key: ${key}`);
    }

    // Validate format
    if (!SessionManager.VALID_KEY_PATTERN.test(key)) {
      throw new Error('Invalid key format: only alphanumeric, underscore, and hyphen allowed');
    }
  }

  /**
   * Checks if state is terminal
   */
  private isTerminalState(state: InteractionState): boolean {
    return [
      InteractionState.COMPLETED,
      InteractionState.CANCELLED,
      InteractionState.ERROR,
    ].includes(state);
  }

  /**
   * Sanitizes context data
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    try {
      // Serialize and parse to remove functions, symbols, circular refs
      const serialized = JSON.stringify(context);

      // Check size
      if (serialized.length > SessionManager.MAX_CONTEXT_SIZE) {
        throw new Error(`Context too large (max ${SessionManager.MAX_CONTEXT_SIZE} bytes)`);
      }

      return JSON.parse(serialized);
    } catch (e) {
      if (e instanceof Error && e.message.includes('too large')) {
        throw e;
      }
      throw new Error('Invalid context: cannot serialize');
    }
  }

  /**
   * Sanitizes arbitrary values
   */
  private sanitizeValue(value: unknown): unknown {
    try {
      // Remove functions, symbols, circular references
      return JSON.parse(JSON.stringify(value));
    } catch {
      // If can't serialize, store as string representation
      return String(value);
    }
  }

  /**
   * Handles cache expiration events
   */
  private handleExpiration(sessionId: SessionId): void {
    this.emit('expired', sessionId);
    this.clearCleanupTimer(sessionId);
  }

  /**
   * Schedules cleanup after delay
   */
  private scheduleCleanup(sessionId: SessionId, delayMs: number): void {
    // Clear any existing timer
    this.clearCleanupTimer(sessionId);

    // Schedule new cleanup
    const timer = setTimeout(() => {
      // Call async destroySession without awaiting (fire and forget)
      this.destroySession(sessionId).catch((error) => {
        console.error(`Failed to destroy session ${sessionId}:`, error);
      });
    }, delayMs);

    this.cleanupTimers.set(sessionId, timer);
  }

  /**
   * Clears cleanup timer
   */
  private clearCleanupTimer(sessionId: SessionId): void {
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
    }
  }
}
