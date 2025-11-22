/**
 * Session Manager for MCP Flow
 * Handles session lifecycle, state persistence, and timeout management
 */

import EventEmitter from 'eventemitter3';
import {
  SessionId,
  SessionState,
  InteractionState,
  SessionMetadata,
  InteractionTurn,
  InteractionPrompt,
  InteractionResponse,
} from '../protocol/types';

export interface SessionConfig {
  defaultTimeout?: number; // in milliseconds
  maxSessions?: number;
  pruneInterval?: number;
  enablePersistence?: boolean;
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
  private sessions: Map<SessionId, SessionState> = new Map();
  private timeouts: Map<SessionId, NodeJS.Timeout> = new Map();
  private config: Required<SessionConfig>;
  private pruneTimer?: NodeJS.Timeout;

  constructor(config: SessionConfig = {}) {
    super();
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      maxSessions: config.maxSessions ?? 1000,
      pruneInterval: config.pruneInterval ?? 60000, // 1 minute
      enablePersistence: config.enablePersistence ?? false,
    };

    this.startPruning();
  }

  /**
   * Creates a new session
   */
  createSession(
    sessionId: SessionId,
    toolName: string,
    context?: Record<string, unknown>,
    timeout?: number
  ): SessionState {
    if (this.sessions.size >= this.config.maxSessions) {
      this.pruneOldestSessions();
    }

    const now = Date.now();
    const state: SessionState = {
      sessionId,
      state: InteractionState.IDLE,
      metadata: {
        createdAt: now,
        lastActivityAt: now,
        toolName,
        context,
      },
      history: [],
      accumulatedData: {},
    };

    this.sessions.set(sessionId, state);
    this.resetTimeout(sessionId, timeout);
    this.emit('created', sessionId);

    return state;
  }

  /**
   * Retrieves session state
   */
  getSession(sessionId: SessionId): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Checks if session exists
   */
  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Updates session state
   */
  updateState(sessionId: SessionId, newState: InteractionState): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = newState;
    session.metadata.lastActivityAt = Date.now();
    this.resetTimeout(sessionId);
    this.emit('updated', sessionId, session);
  }

  /**
   * Adds a turn to session history
   */
  addTurn(
    sessionId: SessionId,
    prompt?: InteractionPrompt,
    response?: InteractionResponse
  ): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
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

    this.emit('updated', sessionId, session);
  }

  /**
   * Accumulates data in session context
   */
  setData(sessionId: SessionId, key: string, value: unknown): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.accumulatedData[key] = value;
    session.metadata.lastActivityAt = Date.now();
  }

  /**
   * Gets accumulated data
   */
  getData(sessionId: SessionId, key?: string): unknown {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (key) {
      return session.accumulatedData[key];
    }
    return session.accumulatedData;
  }

  /**
   * Completes a session
   */
  completeSession(sessionId: SessionId, result: unknown): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = InteractionState.COMPLETED;
    this.clearTimeout(sessionId);
    this.emit('completed', sessionId, result);

    // Clean up after completion
    setTimeout(() => this.destroySession(sessionId), 5000);
  }

  /**
   * Cancels a session
   */
  cancelSession(sessionId: SessionId, reason?: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = InteractionState.CANCELLED;
    this.clearTimeout(sessionId);
    this.emit('cancelled', sessionId, reason);

    // Clean up after cancellation
    setTimeout(() => this.destroySession(sessionId), 5000);
  }

  /**
   * Marks session as errored
   */
  errorSession(sessionId: SessionId, error: Error): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.state = InteractionState.ERROR;
    this.clearTimeout(sessionId);
    this.emit('error', sessionId, error);

    // Clean up after error
    setTimeout(() => this.destroySession(sessionId), 5000);
  }

  /**
   * Destroys a session
   */
  destroySession(sessionId: SessionId): boolean {
    this.clearTimeout(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === InteractionState.ACTIVE || s.state === InteractionState.WAITING_USER
    );
  }

  /**
   * Resets session timeout
   */
  private resetTimeout(sessionId: SessionId, timeout?: number): void {
    this.clearTimeout(sessionId);

    const timeoutMs = timeout ?? this.config.defaultTimeout;
    const timer = setTimeout(() => {
      this.expireSession(sessionId);
    }, timeoutMs);

    this.timeouts.set(sessionId, timer);
  }

  /**
   * Clears session timeout
   */
  private clearTimeout(sessionId: SessionId): void {
    const timer = this.timeouts.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(sessionId);
    }
  }

  /**
   * Expires a session
   */
  private expireSession(sessionId: SessionId): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.state = InteractionState.ERROR;
    this.emit('expired', sessionId);
    this.destroySession(sessionId);
  }

  /**
   * Prunes oldest sessions when limit reached
   */
  private pruneOldestSessions(): void {
    const sessions = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].metadata.lastActivityAt - b[1].metadata.lastActivityAt);

    const toPrune = Math.ceil(this.config.maxSessions * 0.1); // Prune 10%
    for (let i = 0; i < toPrune && i < sessions.length; i++) {
      const [sessionId, session] = sessions[i];
      if (session.state !== InteractionState.ACTIVE) {
        this.destroySession(sessionId);
      }
    }
  }

  /**
   * Starts periodic pruning of expired sessions
   */
  private startPruning(): void {
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions.entries()) {
        const age = now - session.metadata.lastActivityAt;
        if (age > this.config.defaultTimeout * 2) {
          this.destroySession(sessionId);
        }
      }
    }, this.config.pruneInterval);
  }

  /**
   * Stops pruning and cleans up
   */
  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }

    for (const sessionId of this.sessions.keys()) {
      this.clearTimeout(sessionId);
    }

    this.sessions.clear();
    this.timeouts.clear();
    this.removeAllListeners();
  }
}
