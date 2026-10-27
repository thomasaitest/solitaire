import { SCORE } from './scoreConfig.ts';
import type { GameState } from './types.ts';

export interface Charge {
  state: GameState;
  /** Points taken off the score. */
  charged: number;
}

/**
 * Take `amount` off the score (it may go negative). Anything charged here
 * (time, Hint, Angre, mistaps) stays lost when a move is undone: it is added
 * to `drain`.
 */
export function charge(state: GameState, amount: number): Charge {
  const charged = Math.max(0, amount);
  if (charged === 0) return { state, charged: 0 };
  return { state: { ...state, score: state.score - charged, drain: state.drain + charged }, charged };
}

export const chargeHint = (state: GameState): Charge => charge(state, SCORE.hintPenalty);
export const chargeUndo = (state: GameState): Charge => charge(state, SCORE.undoPenalty);
export const chargeMistap = (state: GameState): Charge => charge(state, SCORE.mistapPenalty);

/**
 * Charge the clock for every whole second that has passed since the last
 * charge. `elapsedMs` only advances while the clock runs (after the first
 * move, app visible, game not won), so pausing is handled by the caller.
 */
export function tickClock(state: GameState, elapsedMs: number): Charge {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds <= state.clockSec) {
    if (seconds < state.clockSec) return { state: { ...state, clockSec: seconds }, charged: 0 };
    return { state, charged: 0 };
  }
  const due = (seconds - state.clockSec) * SCORE.secondPenalty;
  const result = charge({ ...state, clockSec: seconds }, due);
  return result;
}
