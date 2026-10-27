import { moveCards, suitIndex } from './engine.ts';
import type { Card, GameState, PlannedMove } from './types.ts';

/**
 * Standard safe auto-play rule. A card of rank r may go to its foundation
 * on its own when r is 1 or 2, or when both opposite-colour cards of rank
 * r - 1 are already on their foundations (so nothing can still need this
 * card as a place to build on).
 */
export function isSafeToAutoplay(state: GameState, card: Card): boolean {
  if (card.rank <= 2) return true;
  const red = card.suit === 'h' || card.suit === 'd';
  const opposite = red ? (['s', 'c'] as const) : (['h', 'd'] as const);
  return opposite.every((suit) => (state.foundations[suitIndex(suit)]?.length ?? 0) >= card.rank - 1);
}

/**
 * The next safe foundation move, or null. Looks at the top waste card and the
 * exposed (face-up) top card of each column; lowest rank first so chains are stable.
 */
export function findSafeAutoMove(state: GameState): PlannedMove | null {
  if (state.won) return null;
  let best: (PlannedMove & { rank: number }) | null = null;
  const consider = (card: Card | undefined, from: PlannedMove['from'], index: number) => {
    if (!card || !card.faceUp) return;
    const pile = state.foundations[suitIndex(card.suit)];
    if (!pile || pile.length !== card.rank - 1) return;
    if (!isSafeToAutoplay(state, card)) return;
    if (best && best.rank <= card.rank) return;
    best = { from, index, to: { zone: 'foundation', index: suitIndex(card.suit) }, rank: card.rank };
  };
  consider(state.waste[state.waste.length - 1], { zone: 'waste', index: 0 }, state.waste.length - 1);
  state.tableau.forEach((pile, i) => {
    consider(pile[pile.length - 1], { zone: 'tableau', index: i }, pile.length - 1);
  });
  if (!best) return null;
  const { from, index, to } = best as PlannedMove;
  return { from, index, to };
}

/**
 * Apply one safe auto-move as part of the user's previous action: score
 * counts, but the move counter and the undo stack stay as they were, so one
 * Undo reverts the user move together with everything that followed it.
 */
export function applySafeAutoMove(state: GameState, move: PlannedMove): GameState | null {
  const result = moveCards(state, move.from, move.index, move.to);
  if (!result.ok) return null;
  return { ...result.state, undos: state.undos, moves: state.moves };
}

/** Run the chain to the end. Used by tests; the app steps it with animation. */
export function settleSafeAutoMoves(state: GameState): { state: GameState; moves: PlannedMove[] } {
  let current = state;
  const moves: PlannedMove[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const move = findSafeAutoMove(current);
    if (!move) break;
    const next = applySafeAutoMove(current, move);
    if (!next) break;
    current = next;
    moves.push(move);
  }
  return { state: current, moves };
}
