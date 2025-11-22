/**
 * Stateless Session Handler for MCP Flow
 * Enables interactive flows without server-side state storage
 */

import {
  SessionId,
  SessionState,
  InteractionState,
} from '../protocol/types';

/**
 * Session token that encodes entire session state
 * Can be passed between client and server
 */
export interface SessionToken {
  sessionId: SessionId;
  state: SessionState;
  signature?: string; // Optional HMAC signature for validation
}

/**
 * Stateless session handler that encodes state in tokens
 */
export class StatelessSessionHandler {
  private secret?: string;

  constructor(secret?: string) {
    this.secret = secret;
  }

  /**
   * Creates a new session token
   */
  createToken(
    sessionId: SessionId,
    toolName: string,
    context?: Record<string, unknown>
  ): SessionToken {
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

    return {
      sessionId,
      state,
      signature: this.sign(state),
    };
  }

  /**
   * Updates session state in token
   */
  updateToken(
    token: SessionToken,
    updates: Partial<SessionState>
  ): SessionToken {
    if (!this.verify(token)) {
      throw new Error('Invalid session token signature');
    }

    const updatedState: SessionState = {
      ...token.state,
      ...updates,
      metadata: {
        ...token.state.metadata,
        lastActivityAt: Date.now(),
      },
    };

    return {
      sessionId: token.sessionId,
      state: updatedState,
      signature: this.sign(updatedState),
    };
  }

  /**
   * Verifies token signature
   */
  verify(token: SessionToken): boolean {
    if (!this.secret || !token.signature) {
      return true; // No signature validation
    }

    const expectedSignature = this.sign(token.state);
    return expectedSignature === token.signature;
  }

  /**
   * Signs session state (simple implementation)
   */
  private sign(state: SessionState): string | undefined {
    if (!this.secret) {
      return undefined;
    }

    // Simple hash for demonstration
    // In production, use proper HMAC (crypto.createHmac)
    const data = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Serializes token for transmission
   */
  serialize(token: SessionToken): string {
    return Buffer.from(JSON.stringify(token)).toString('base64');
  }

  /**
   * Deserializes token from string
   */
  deserialize(serialized: string): SessionToken {
    try {
      const json = Buffer.from(serialized, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid session token format');
    }
  }
}
