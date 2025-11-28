/**
 * Session management tests
 */

import { SessionManager } from '../src/session/manager';
import { InteractionState, PromptType } from '../src/protocol/types';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({
      defaultTimeout: 5000,
      maxSessions: 100,
    });
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const { sessionId, state } = await manager.createSession('test-tool');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(state.state).toBe(InteractionState.IDLE);
      expect(state.metadata.toolName).toBe('test-tool');
      expect(state.history).toHaveLength(0);
    });

    it('should emit created event', async () => {
      const eventPromise = new Promise<string>((resolve) => {
        manager.on('created', (sessionId) => {
          resolve(sessionId);
        });
      });

      const { sessionId } = await manager.createSession('test-tool');
      const emittedId = await eventPromise;

      expect(emittedId).toBe(sessionId);
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', async () => {
      const { sessionId } = await manager.createSession('test-tool');
      const session = await manager.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
    });

    it('should return undefined for non-existent session', async () => {
      const session = await manager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('updateState', () => {
    it('should update session state', async () => {
      const { sessionId } = await manager.createSession('test-tool');
      await manager.updateState(sessionId, InteractionState.ACTIVE);

      const session = await manager.getSession(sessionId);
      expect(session?.state).toBe(InteractionState.ACTIVE);
    });

    it('should emit updated event', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      const eventPromise = new Promise<{ id: string; state: any }>((resolve) => {
        manager.on('updated', (id, state) => {
          resolve({ id, state });
        });
      });

      await manager.updateState(sessionId, InteractionState.ACTIVE);
      const { id, state } = await eventPromise;

      expect(id).toBe(sessionId);
      expect(state.state).toBe(InteractionState.ACTIVE);
    });

    it('should throw error for non-existent session', async () => {
      await expect(async () => {
        await manager.updateState('non-existent', InteractionState.ACTIVE);
      }).rejects.toThrow('Session not found');
    });
  });

  describe('addTurn', () => {
    it('should add turn to history', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      const prompt = {
        type: PromptType.TEXT,
        message: 'Test prompt',
      };

      await manager.addTurn(sessionId, prompt);

      const session = await manager.getSession(sessionId);
      expect(session?.history).toHaveLength(1);
      expect(session?.history[0].prompt).toEqual(prompt);
    });

    it('should set current prompt', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      const prompt = {
        type: PromptType.TEXT,
        message: 'Test prompt',
      };

      await manager.addTurn(sessionId, prompt);

      const session = await manager.getSession(sessionId);
      expect(session?.currentPrompt).toEqual(prompt);
    });
  });

  describe('setData and getData', () => {
    it('should store and retrieve data', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      await manager.setData(sessionId, 'key1', 'value1');
      await manager.setData(sessionId, 'key2', 42);

      expect(await manager.getData(sessionId, 'key1')).toBe('value1');
      expect(await manager.getData(sessionId, 'key2')).toBe(42);
    });

    it('should retrieve all data when no key specified', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      await manager.setData(sessionId, 'key1', 'value1');
      await manager.setData(sessionId, 'key2', 42);

      const allData = await manager.getData(sessionId);
      expect(allData).toEqual({ key1: 'value1', key2: 42 });
    });
  });

  describe('completeSession', () => {
    it('should complete session', async () => {
      const { sessionId } = await manager.createSession('test-tool');
      await manager.completeSession(sessionId, { result: 'success' });

      const session = await manager.getSession(sessionId);
      expect(session?.state).toBe(InteractionState.COMPLETED);
    });

    it('should emit completed event', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      const eventPromise = new Promise<{ id: string; result: any }>((resolve) => {
        manager.on('completed', (id, result) => {
          resolve({ id, result });
        });
      });

      await manager.completeSession(sessionId, { result: 'success' });
      const { id, result } = await eventPromise;

      expect(id).toBe(sessionId);
      expect(result).toEqual({ result: 'success' });
    });
  });

  describe('cancelSession', () => {
    it('should cancel session', async () => {
      const { sessionId } = await manager.createSession('test-tool');
      await manager.cancelSession(sessionId, 'User cancelled');

      const session = await manager.getSession(sessionId);
      expect(session?.state).toBe(InteractionState.CANCELLED);
    });

    it('should emit cancelled event', async () => {
      const { sessionId } = await manager.createSession('test-tool');

      const eventPromise = new Promise<{ id: string; reason: string | undefined }>((resolve) => {
        manager.on('cancelled', (id, reason) => {
          resolve({ id, reason });
        });
      });

      await manager.cancelSession(sessionId, 'User cancelled');
      const { id, reason } = await eventPromise;

      expect(id).toBe(sessionId);
      expect(reason).toBe('User cancelled');
    });
  });

  describe('session timeout', () => {
    it('should expire session after timeout', async () => {
      const shortManager = new SessionManager({
        defaultTimeout: 1500, // Min timeout is 1000ms
        pruneInterval: 1000, // Check for expired sessions every 1000ms (min 1 second for node-cache)
      });

      const eventPromise = new Promise<string>((resolve) => {
        shortManager.on('expired', (sessionId) => {
          resolve(sessionId);
        });
      });

      const { sessionId } = await shortManager.createSession('test-tool');
      const expiredId = await eventPromise;

      expect(expiredId).toBe(sessionId);
      await shortManager.destroy();
    }, 4000); // Jest timeout must be longer than session timeout + prune interval
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', async () => {
      const { sessionId: id1 } = await manager.createSession('tool-1');
      const { sessionId: id2 } = await manager.createSession('tool-2');
      const { sessionId: id3 } = await manager.createSession('tool-3');

      // Valid state transitions: IDLE -> ACTIVE
      await manager.updateState(id1, InteractionState.ACTIVE);

      // IDLE -> ACTIVE -> WAITING_USER
      await manager.updateState(id2, InteractionState.ACTIVE);
      await manager.updateState(id2, InteractionState.WAITING_USER);

      // IDLE -> ACTIVE -> COMPLETED
      await manager.updateState(id3, InteractionState.ACTIVE);
      await manager.updateState(id3, InteractionState.COMPLETED);

      const activeSessions = await manager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map((s) => s.sessionId)).toContain(id1);
      expect(activeSessions.map((s) => s.sessionId)).toContain(id2);
    });
  });
});
