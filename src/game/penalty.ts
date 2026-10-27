import { scoreParts } from './scoring.ts';
import type { GameState } from './types.ts';

/** Points lost for using Hint and for every Angre. */
export const PENALTY = 5;

/**
 * Take `PENALTY` off the score the player sees. The shown total never drops
 * below 0, so nothing is charged when it already reads 0 and a hidden negative
 * balance cannot build up behind it.
 */
export function chargePenalty(state: GameState, elapsedMs: number, amount = PENALTY): { state: GameState; charged: number } {
  const shown = scoreParts(state.score, elapsedMs, state.won).total;
  const charged = Math.max(0, Math.min(amount, shown));
  if (charged === 0) return { state, charged: 0 };
  return { state: { ...state, score: state.score - charged }, charged };
}
