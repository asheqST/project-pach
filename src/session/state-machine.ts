/**
 * XState state machine for session lifecycle management
 * Enforces valid state transitions and prevents invalid state changes
 */

import { createMachine } from 'xstate';
import { InteractionState } from '../protocol/types';

/**
 * Session lifecycle events
 */
export type SessionEvent =
  | { type: 'START' }
  | { type: 'WAIT_USER' }
  | { type: 'PROCESS' }
  | { type: 'COMPLETE' }
  | { type: 'CANCEL' }
  | { type: 'ERROR' }
  | { type: 'RESUME' };

/**
 * Session state machine configuration
 *
 * State Flow:
 * IDLE → ACTIVE → WAITING_USER → PROCESSING → ACTIVE (loop) → COMPLETED
 *                ↓                ↓            ↓
 *              CANCELLED        CANCELLED    CANCELLED
 *                ↓                ↓            ↓
 *              ERROR            ERROR        ERROR
 */
export const sessionMachine = createMachine({
  id: 'session',
  initial: InteractionState.IDLE,
  states: {
    [InteractionState.IDLE]: {
      on: {
        START: InteractionState.ACTIVE,
      },
    },
    [InteractionState.ACTIVE]: {
      on: {
        WAIT_USER: InteractionState.WAITING_USER,
        PROCESS: InteractionState.PROCESSING,
        COMPLETE: InteractionState.COMPLETED,
        CANCEL: InteractionState.CANCELLED,
        ERROR: InteractionState.ERROR,
      },
    },
    [InteractionState.WAITING_USER]: {
      on: {
        PROCESS: InteractionState.PROCESSING,
        CANCEL: InteractionState.CANCELLED,
        ERROR: InteractionState.ERROR,
      },
    },
    [InteractionState.PROCESSING]: {
      on: {
        RESUME: InteractionState.ACTIVE,
        COMPLETE: InteractionState.COMPLETED,
        CANCEL: InteractionState.CANCELLED,
        ERROR: InteractionState.ERROR,
      },
    },
    [InteractionState.COMPLETED]: {
      type: 'final',
    },
    [InteractionState.CANCELLED]: {
      type: 'final',
    },
    [InteractionState.ERROR]: {
      type: 'final',
    },
  },
});

/**
 * Check if a state transition is valid
 * @param currentState Current session state
 * @param event Event to transition with
 * @returns True if transition is valid, false otherwise
 */
export function canTransition(
  currentState: InteractionState,
  event: SessionEvent
): boolean {
  const stateNode = sessionMachine.states[currentState];
  if (!stateNode) {
    return false;
  }

  // Check if final state
  if (stateNode.type === 'final') {
    return false;
  }

  // Check if event is valid for current state
  const transitions = stateNode.on;
  if (!transitions) {
    return false;
  }

  return event.type in transitions;
}

/**
 * Get the next state for a given event
 * @param currentState Current session state
 * @param event Event to transition with
 * @returns Next state or undefined if transition is invalid
 */
export function getNextState(
  currentState: InteractionState,
  event: SessionEvent
): InteractionState | undefined {
  if (!canTransition(currentState, event)) {
    return undefined;
  }

  const stateNode = sessionMachine.states[currentState];
  const transitions = stateNode.on;
  if (!transitions) {
    return undefined;
  }

  const nextState = transitions[event.type];
  return typeof nextState === 'string' ? nextState as InteractionState : undefined;
}

/**
 * Map InteractionState to corresponding event
 * Note: When transitioning TO a state, we need the appropriate event for the current context
 */
export function getEventForStatus(status: InteractionState): SessionEvent | undefined {
  switch (status) {
    case InteractionState.ACTIVE:
      // ACTIVE can be reached via START (from IDLE) or RESUME (from PROCESSING)
      // We return START as the default, but callers should use RESUME when coming from PROCESSING
      return { type: 'START' };
    case InteractionState.WAITING_USER:
      return { type: 'WAIT_USER' };
    case InteractionState.PROCESSING:
      return { type: 'PROCESS' };
    case InteractionState.COMPLETED:
      return { type: 'COMPLETE' };
    case InteractionState.CANCELLED:
      return { type: 'CANCEL' };
    case InteractionState.ERROR:
      return { type: 'ERROR' };
    default:
      return undefined;
  }
}

/**
 * Get the appropriate event for transitioning to a target state from a current state
 * This is more context-aware than getEventForStatus
 */
export function getTransitionEvent(
  currentState: InteractionState,
  targetState: InteractionState
): SessionEvent | undefined {
  // Special case: PROCESSING → ACTIVE requires RESUME event
  if (currentState === InteractionState.PROCESSING && targetState === InteractionState.ACTIVE) {
    return { type: 'RESUME' };
  }

  // For other cases, use the default event for the target state
  return getEventForStatus(targetState);
}