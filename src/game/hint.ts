import { legalTargets, movingCards } from './engine.ts';
import type { GameState, PileRef } from './types.ts';

export type Hint =
  | { kind: 'move'; from: PileRef; index: number; to: PileRef }
  | { kind: 'draw' }
  | { kind: 'none' };

interface Candidate {
  from: PileRef;
  index: number;
  to: PileRef;
  rank: number;
}

/**
 * One useful legal move, for the Hint button.
 * Order: anything to a foundation, a tableau move that turns a card up, a
 * waste card onto the tableau, a king into an empty column that frees a
 * card, then the stock. Shuffles that change nothing are skipped.
 */
export function findHint(state: GameState): Hint {
  if (state.won) return { kind: 'none' };
  const candidates: Candidate[] = [];

  const consider = (from: PileRef, index: number) => {
    const cards = movingCards(state, from, index);
    if (!cards?.[0]) return;
    for (const to of legalTargets(state, from, index)) {
      const rank = score(state, from, index, to);
      if (rank > 0) candidates.push({ from, index, to, rank });
    }
  };

  if (state.waste.length > 0) consider({ zone: 'waste', index: 0 }, state.waste.length - 1);
  state.tableau.forEach((pile, pileIndex) => {
    for (let index = 0; index < pile.length; index++) {
      if (pile[index]?.faceUp) consider({ zone: 'tableau', index: pileIndex }, index);
    }
  });

  candidates.sort((a, b) => b.rank - a.rank);
  const best = candidates[0];
  if (best) return { kind: 'move', from: best.from, index: best.index, to: best.to };
  if (state.stock.length > 0 || state.waste.length > 0) return { kind: 'draw' };
  return { kind: 'none' };
}

function score(state: GameState, from: PileRef, index: number, to: PileRef): number {
  const toEmpty = to.zone === 'tableau' && (state.tableau[to.index]?.length ?? 0) === 0;
  if (from.zone === 'tableau') {
    const pile = state.tableau[from.index] ?? [];
    const below = index > 0 ? pile[index - 1] : undefined;
    const reveals = below !== undefined && !below.faceUp;
    const clearsColumn = index === 0;
    if (to.zone === 'foundation') return reveals ? 100 : 90;
    if (toEmpty) {
      // A king already at the base gains nothing by moving to another empty column.
      if (clearsColumn) return 0;
      return reveals ? 70 : 0;
    }
    if (reveals) return 80;
    if (clearsColumn) return 50;
    return 0;
  }
  if (from.zone === 'waste') {
    if (to.zone === 'foundation') return 95;
    return toEmpty ? 40 : 60;
  }
  return 0;
}
