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

  afterEach(() => {
    manager.destroy();
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const session = manager.createSession('test-session', 'test-tool');

      expect(session.sessionId).toBe('test-session');
      expect(session.state).toBe(InteractionState.IDLE);
      expect(session.metadata.toolName).toBe('test-tool');
      expect(session.history).toHaveLength(0);
    });

    it('should emit created event', (done) => {
      manager.on('created', (sessionId) => {
        expect(sessionId).toBe('test-session');
        done();
      });

      manager.createSession('test-session', 'test-tool');
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', () => {
      manager.createSession('test-session', 'test-tool');
      const session = manager.getSession('test-session');

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe('test-session');
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('updateState', () => {
    it('should update session state', () => {
      manager.createSession('test-session', 'test-tool');
      manager.updateState('test-session', InteractionState.ACTIVE);

      const session = manager.getSession('test-session');
      expect(session?.state).toBe(InteractionState.ACTIVE);
    });

    it('should emit updated event', (done) => {
      manager.createSession('test-session', 'test-tool');

      manager.on('updated', (sessionId, state) => {
        expect(sessionId).toBe('test-session');
        expect(state.state).toBe(InteractionState.ACTIVE);
        done();
      });

      manager.updateState('test-session', InteractionState.ACTIVE);
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        manager.updateState('non-existent', InteractionState.ACTIVE);
      }).toThrow('Session not found');
    });
  });

  describe('addTurn', () => {
    it('should add turn to history', () => {
      manager.createSession('test-session', 'test-tool');

      const prompt = {
        type: PromptType.TEXT,
        message: 'Test prompt',
      };

      manager.addTurn('test-session', prompt);

      const session = manager.getSession('test-session');
      expect(session?.history).toHaveLength(1);
      expect(session?.history[0].prompt).toEqual(prompt);
    });

    it('should set current prompt', () => {
      manager.createSession('test-session', 'test-tool');

      const prompt = {
        type: PromptType.TEXT,
        message: 'Test prompt',
      };

      manager.addTurn('test-session', prompt);

      const session = manager.getSession('test-session');
      expect(session?.currentPrompt).toEqual(prompt);
    });
  });

  describe('setData and getData', () => {
    it('should store and retrieve data', () => {
      manager.createSession('test-session', 'test-tool');

      manager.setData('test-session', 'key1', 'value1');
      manager.setData('test-session', 'key2', 42);

      expect(manager.getData('test-session', 'key1')).toBe('value1');
      expect(manager.getData('test-session', 'key2')).toBe(42);
    });

    it('should retrieve all data when no key specified', () => {
      manager.createSession('test-session', 'test-tool');

      manager.setData('test-session', 'key1', 'value1');
      manager.setData('test-session', 'key2', 42);

      const allData = manager.getData('test-session');
      expect(allData).toEqual({ key1: 'value1', key2: 42 });
    });
  });

  describe('completeSession', () => {
    it('should complete session', () => {
      manager.createSession('test-session', 'test-tool');
      manager.completeSession('test-session', { result: 'success' });

      const session = manager.getSession('test-session');
      expect(session?.state).toBe(InteractionState.COMPLETED);
    });

    it('should emit completed event', (done) => {
      manager.createSession('test-session', 'test-tool');

      manager.on('completed', (sessionId, result) => {
        expect(sessionId).toBe('test-session');
        expect(result).toEqual({ result: 'success' });
        done();
      });

      manager.completeSession('test-session', { result: 'success' });
    });
  });

  describe('cancelSession', () => {
    it('should cancel session', () => {
      manager.createSession('test-session', 'test-tool');
      manager.cancelSession('test-session', 'User cancelled');

      const session = manager.getSession('test-session');
      expect(session?.state).toBe(InteractionState.CANCELLED);
    });

    it('should emit cancelled event', (done) => {
      manager.createSession('test-session', 'test-tool');

      manager.on('cancelled', (sessionId, reason) => {
        expect(sessionId).toBe('test-session');
        expect(reason).toBe('User cancelled');
        done();
      });

      manager.cancelSession('test-session', 'User cancelled');
    });
  });

  describe('session timeout', () => {
    it('should expire session after timeout', (done) => {
      const shortManager = new SessionManager({
        defaultTimeout: 100,
      });

      shortManager.on('expired', (sessionId) => {
        expect(sessionId).toBe('test-session');
        shortManager.destroy();
        done();
      });

      shortManager.createSession('test-session', 'test-tool');
    }, 500);
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', () => {
      manager.createSession('session-1', 'tool-1');
      manager.createSession('session-2', 'tool-2');
      manager.createSession('session-3', 'tool-3');

      manager.updateState('session-1', InteractionState.ACTIVE);
      manager.updateState('session-2', InteractionState.WAITING_USER);
      manager.updateState('session-3', InteractionState.COMPLETED);

      const activeSessions = manager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map((s) => s.sessionId)).toContain('session-1');
      expect(activeSessions.map((s) => s.sessionId)).toContain('session-2');
    });
  });
});
