import { describe, expect, it } from 'vitest';
import { applySafeAutoMove, findSafeAutoMove, isSafeToAutoplay, settleSafeAutoMoves } from './autoplay.ts';
import { buildPosition, makeCard, moveCards, undo } from './engine.ts';
import type { Card } from './types.ts';

/** Foundations s,h,d,c holding ranks 1..n[suit]. */
function found(n: { s?: number; h?: number; d?: number; c?: number }): Card[][] {
  return (['s', 'h', 'd', 'c'] as const).map((suit) =>
    Array.from({ length: n[suit] ?? 0 }, (_, i) => makeCard(suit, i + 1)),
  );
}

describe('isSafeToAutoplay', () => {
  it('always allows aces and twos', () => {
    const state = buildPosition();
    expect(isSafeToAutoplay(state, makeCard('h', 1))).toBe(true);
    expect(isSafeToAutoplay(state, makeCard('s', 2))).toBe(true);
  });

  it('blocks a red five while a black four is not on the foundation', () => {
    // Hearts 1-4 are up, spades 1-3 and clubs 1-4: the 4 of spades is still out.
    const state = buildPosition({ foundations: found({ h: 4, s: 3, c: 4 }) });
    expect(isSafeToAutoplay(state, makeCard('h', 5))).toBe(false);
  });

  it('blocks a five when only one of the two opposite-colour fours is up', () => {
    const state = buildPosition({ foundations: found({ h: 4, s: 4, c: 3 }) });
    expect(isSafeToAutoplay(state, makeCard('h', 5))).toBe(false);
  });

  it('allows a five once both opposite-colour fours are up', () => {
    const state = buildPosition({ foundations: found({ h: 4, s: 4, c: 4 }) });
    expect(isSafeToAutoplay(state, makeCard('h', 5))).toBe(true);
  });

  it('does not care about same-colour cards of the rank below', () => {
    // Black five needs both red fours; the red four of diamonds missing blocks it.
    const state = buildPosition({ foundations: found({ s: 4, h: 4, d: 3, c: 4 }) });
    expect(isSafeToAutoplay(state, makeCard('s', 5))).toBe(false);
  });
});

describe('findSafeAutoMove', () => {
  it('sends an exposed ace up but not a buried one or a face-down one', () => {
    const state = buildPosition({
      tableau: [[makeCard('s', 1), makeCard('h', 9)], [makeCard('d', 1, false)], [], [], [], [], []],
    });
    expect(findSafeAutoMove(state)).toBeNull();
    const exposed = buildPosition({ tableau: [[makeCard('h', 9), makeCard('s', 1)], [], [], [], [], [], []] });
    expect(findSafeAutoMove(exposed)).toEqual({
      from: { zone: 'tableau', index: 0 },
      index: 1,
      to: { zone: 'foundation', index: 0 },
    });
  });

  it('uses the top waste card', () => {
    const state = buildPosition({ waste: [makeCard('c', 7), makeCard('d', 1)] });
    expect(findSafeAutoMove(state)?.from).toEqual({ zone: 'waste', index: 0 });
  });

  it('keeps a legal-but-unsafe five where it is', () => {
    const state = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4 }),
      tableau: [[makeCard('h', 5)], [], [], [], [], [], []],
      stock: [makeCard('s', 4, false)],
    });
    expect(findSafeAutoMove(state)).toBeNull();
  });
});

describe('settleSafeAutoMoves', () => {
  it('chains through several safe cards, across waste and tableau', () => {
    const state = buildPosition({
      foundations: found({ d: 2 }),
      waste: [makeCard('s', 3)],
      tableau: [[makeCard('h', 2), makeCard('s', 2), makeCard('s', 1)], [makeCard('h', 1)], [], [], [], [], []],
    });
    // s1, s2, h1, h2 (turns up nothing new), then the black three once both red twos are up.
    const { state: out, moves } = settleSafeAutoMoves(state);
    expect(moves).toHaveLength(5);
    expect(out.foundations[0]?.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(out.foundations[1]?.map((c) => c.rank)).toEqual([1, 2]);
    expect(out.waste).toHaveLength(0);
  });

  it('leaves a three on the waste while a red two is still missing', () => {
    const state = buildPosition({
      waste: [makeCard('s', 3)],
      tableau: [[makeCard('s', 2), makeCard('s', 1)], [makeCard('h', 1)], [], [], [], [], []],
    });
    const { state: out, moves } = settleSafeAutoMoves(state);
    expect(moves).toHaveLength(3);
    expect(out.waste).toHaveLength(1);
  });

  it('unlocks a five once both fours go up in the same chain', () => {
    const state = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4 }),
      tableau: [[makeCard('h', 5), makeCard('s', 4)], [], [], [], [], [], []],
    });
    // The black four is on top. It is itself unsafe? Needs both red threes: hearts 4 up, diamonds 0 -> unsafe.
    expect(settleSafeAutoMoves(state).moves).toHaveLength(0);
    const ready = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4, d: 3 }),
      tableau: [[makeCard('h', 5), makeCard('s', 4)], [], [], [], [], [], []],
    });
    const { state: out, moves } = settleSafeAutoMoves(ready);
    expect(moves).toHaveLength(2);
    expect(out.foundations[0]?.length).toBe(4);
    expect(out.foundations[1]?.length).toBe(5);
  });

  it('turns a face-down card up and keeps going', () => {
    const state = buildPosition({
      tableau: [[makeCard('d', 1, false), makeCard('h', 1)], [], [], [], [], [], []],
    });
    const { state: out, moves } = settleSafeAutoMoves(state);
    expect(moves).toHaveLength(2);
    expect(out.tableau[0]).toHaveLength(0);
  });

  it('does nothing when the game is won', () => {
    const state = buildPosition({ foundations: found({ s: 13, h: 13, d: 13, c: 13 }) });
    expect(findSafeAutoMove(state)).toBeNull();
  });
});

describe('undo with auto-moves', () => {
  it('reverts the user move and the auto-moves after it in one step', () => {
    const start = buildPosition({
      tableau: [[makeCard('s', 1), makeCard('h', 7)], [makeCard('c', 8)], [], [], [], [], []],
    });
    // User moves the 7 of hearts onto the 8 of clubs; the ace is then exposed and goes up on its own.
    const moved = moveCards(start, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
    expect(moved.ok).toBe(true);
    const { state: after, moves } = settleSafeAutoMoves(moved.state);
    expect(moves).toHaveLength(1);
    expect(after.foundations[0]).toHaveLength(1);
    expect(after.moves).toBe(1);
    expect(after.undos).toHaveLength(1);

    const undone = undo(after);
    expect(undone.ok).toBe(true);
    expect(undone.state.foundations[0]).toHaveLength(0);
    expect(undone.state.tableau[0]?.map((c) => c.id)).toEqual(['s1', 'h7']);
    expect(undone.state.tableau[1]?.map((c) => c.id)).toEqual(['c8']);
    expect(undone.state.moves).toBe(0);
    expect(undone.state.score).toBe(0);
  });

  it('adds score for each auto-move but no move count or undo step', () => {
    const state = buildPosition({ tableau: [[makeCard('s', 1)], [], [], [], [], [], []] });
    const move = findSafeAutoMove(state);
    expect(move).not.toBeNull();
    const next = applySafeAutoMove(state, move!);
    expect(next?.score).toBe(10);
    expect(next?.moves).toBe(0);
    expect(next?.undos).toHaveLength(0);
  });
});
