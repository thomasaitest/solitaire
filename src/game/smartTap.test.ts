import { describe, expect, it } from 'vitest';
import { buildPosition, makeCard } from './engine.ts';
import { isSafeToAutoplay, safeFoundationMove, tapTarget } from './smartTap.ts';
import type { Card } from './types.ts';

const E = (): Card[] => [];
function found(n: { s?: number; h?: number; d?: number; c?: number }): Card[][] {
  return (['s', 'h', 'd', 'c'] as const).map((suit) =>
    Array.from({ length: n[suit] ?? 0 }, (_, i) => makeCard(suit, i + 1)),
  );
}
const top = (pile: number) => ({ zone: 'tableau' as const, index: pile });

describe('isSafeToAutoplay', () => {
  it('always allows aces and twos', () => {
    const state = buildPosition();
    expect(isSafeToAutoplay(state, makeCard('h', 1))).toBe(true);
    expect(isSafeToAutoplay(state, makeCard('s', 2))).toBe(true);
  });

  it('blocks a red five while an opposite-colour four is not on its foundation', () => {
    expect(isSafeToAutoplay(buildPosition({ foundations: found({ h: 4, s: 3, c: 4 }) }), makeCard('h', 5))).toBe(false);
    expect(isSafeToAutoplay(buildPosition({ foundations: found({ h: 4, s: 4, c: 3 }) }), makeCard('h', 5))).toBe(false);
  });

  it('allows the five once both opposite-colour fours are up', () => {
    expect(isSafeToAutoplay(buildPosition({ foundations: found({ h: 4, s: 4, c: 4 }) }), makeCard('h', 5))).toBe(true);
  });
});

describe('tapTarget', () => {
  it('sends an ace up', () => {
    const state = buildPosition({ tableau: [[makeCard('s', 1)], E(), E(), E(), E(), E(), E()] });
    expect(tapTarget(state, top(0), 0, true)).toEqual({ zone: 'foundation', index: 0 });
  });

  it('sends a safe two up even when it could also build on the tableau; with smart tap off it builds', () => {
    const state = buildPosition({
      foundations: found({ h: 1 }),
      tableau: [[makeCard('h', 2)], [makeCard('s', 3)], E(), E(), E(), E(), E()],
    });
    expect(tapTarget(state, top(0), 0, true)).toEqual({ zone: 'foundation', index: 1 });
    expect(tapTarget(state, top(0), 0, false)).toEqual(top(1));
  });

  it('builds on the tableau for a five that is not safe', () => {
    const state = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4 }),
      tableau: [[makeCard('h', 5)], [makeCard('s', 6)], E(), E(), E(), E(), E()],
    });
    expect(safeFoundationMove(state, top(0), 0)).toBeNull();
    expect(tapTarget(state, top(0), 0, true)).toEqual(top(1));
  });

  it('still sends an unsafe card up when there is no other place for it', () => {
    const state = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4 }),
      tableau: [[makeCard('h', 5)], E(), E(), E(), E(), E(), E()],
    });
    expect(tapTarget(state, top(0), 0, true)).toEqual({ zone: 'foundation', index: 1 });
  });

  it('sends a waste card up when safe', () => {
    const state = buildPosition({ waste: [makeCard('d', 1)] });
    expect(tapTarget(state, { zone: 'waste', index: 0 }, 0, true)).toEqual({ zone: 'foundation', index: 2 });
  });

  it('never moves a card back down from a foundation as a smart tap', () => {
    const state = buildPosition({ foundations: found({ h: 2 }), tableau: [[makeCard('s', 3)], E(), E(), E(), E(), E(), E()] });
    expect(safeFoundationMove(state, { zone: 'foundation', index: 1 }, 1)).toBeNull();
  });

  it('ignores a run of several cards', () => {
    const state = buildPosition({
      tableau: [[makeCard('s', 3), makeCard('h', 2)], E(), E(), E(), E(), E(), E()],
    });
    expect(safeFoundationMove(state, top(0), 0)).toBeNull();
  });
});
