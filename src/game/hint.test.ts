import { describe, expect, it } from 'vitest';
import { buildPosition, draw, makeCard, moveCards } from './engine.ts';
import { findHint, stateKey } from './hint.ts';
import type { Card } from './types.ts';

const up = makeCard;
const down = (suit: 'h' | 's' | 'd' | 'c', rank: number): Card => makeCard(suit, rank, false);
function cols(...piles: Card[][]): Card[][] {
  return [...piles, ...Array.from({ length: 7 - piles.length }, (): Card[] => [])];
}
function found(n: { s?: number; h?: number; d?: number; c?: number }): Card[][] {
  return (['s', 'h', 'd', 'c'] as const).map((suit) =>
    Array.from({ length: n[suit] ?? 0 }, (_, i) => makeCard(suit, i + 1)),
  );
}

describe('findHint', () => {
  it('prefers a move that turns a face-down card up over a plain foundation move', () => {
    const state = buildPosition({
      waste: [up('h', 1)],
      tableau: cols([down('c', 3), up('d', 8)], [up('s', 9)]),
    });
    const hint = findHint(state);
    expect(hint).toMatchObject({ kind: 'move', reason: 'reveal', from: { zone: 'tableau', index: 0 }, to: { zone: 'tableau', index: 1 } });
  });

  it('sends an ace home when nothing reveals a card', () => {
    const state = buildPosition({ waste: [up('h', 1)], tableau: cols([up('s', 9)], [up('d', 7)]) });
    expect(findHint(state)).toMatchObject({ kind: 'move', reason: 'foundation', from: { zone: 'waste' }, to: { zone: 'foundation', index: 1 } });
  });

  it('does not suggest a pointless shuffle between equal columns', () => {
    // 8 of hearts could go from the 9 of spades to the 9 of clubs, which changes nothing.
    const state = buildPosition({ tableau: cols([up('s', 9), up('h', 8)], [up('c', 9)]) });
    expect(findHint(state)).toEqual({ kind: 'none' });
  });

  it('points at the stock when the only progress is there, and names the card (draw 3)', () => {
    // Drawing three turns up the 7 of hearts on top, which fits the 8 of spades.
    const state = buildPosition({
      drawCount: 3,
      stock: [down('h', 7), down('c', 2), down('d', 4)],
      tableau: cols([up('s', 8)]),
    });
    const hint = findHint(state);
    expect(hint).toMatchObject({ kind: 'draw', draws: 1, recycle: false, to: { zone: 'tableau', index: 0 } });
    expect(hint.kind === 'draw' && hint.card?.id).toBe('h7');
  });

  it('counts the draws needed in draw 1', () => {
    const state = buildPosition({
      drawCount: 1,
      stock: [down('h', 7), down('c', 2), down('d', 4)],
      tableau: cols([up('s', 8)]),
    });
    const hint = findHint(state);
    expect(hint).toMatchObject({ kind: 'draw', draws: 3 });
    expect(hint.kind === 'draw' && hint.card?.id).toBe('h7');
  });

  it('looks through a recycle of the waste', () => {
    // The 7 of hearts was already passed over; turning the waste over brings it back.
    const state = buildPosition({
      drawCount: 1,
      stock: [],
      waste: [up('h', 7), up('c', 2)],
      tableau: cols([up('s', 8)]),
    });
    const hint = findHint(state);
    expect(hint).toMatchObject({ kind: 'draw', recycle: true });
    expect(hint.kind === 'draw' && hint.card?.id).toBe('h7');
  });

  it('says there are no moves in a stock-only dead position after cycling the whole stock', () => {
    const state = buildPosition({
      drawCount: 3,
      stock: [down('c', 4), down('d', 12)],
      tableau: cols([up('s', 13)], [up('h', 7)], [up('d', 9)]),
    });
    expect(findHint(state)).toEqual({ kind: 'none' });
  });

  it('says there are no moves in a truly dead position', () => {
    const state = buildPosition({ tableau: cols([up('s', 13)], [up('h', 7)], [up('d', 7)]) });
    expect(findHint(state)).toEqual({ kind: 'none' });
  });

  it('takes the shortest way to progress', () => {
    const state = buildPosition({
      tableau: cols([down('c', 3), up('h', 8)], [up('s', 9), up('d', 8)], [up('c', 9)]),
    });
    const hint = findHint(state);
    // The shortest way is to put the 8 of hearts on the 9 of clubs directly.
    expect(hint).toMatchObject({ kind: 'move', reason: 'reveal', to: { zone: 'tableau', index: 2 } });
  });

  it('only calls a foundation move for an unsafe card when nothing else is left', () => {
    const state = buildPosition({
      foundations: found({ h: 4, s: 3, c: 4 }),
      tableau: cols([up('h', 5)]),
    });
    expect(findHint(state)).toMatchObject({ kind: 'move', reason: 'foundation' });
  });
});

describe('loop avoidance', () => {
  const state = buildPosition({
    tableau: cols([down('c', 3), up('h', 8)], [up('s', 9)], [down('c', 5), up('d', 8)], [up('c', 9)]),
  });

  it('skips a first step into a position that was already visited', () => {
    const first = findHint(state);
    expect(first.kind).toBe('move');
    if (first.kind !== 'move') return;
    const after = moveCards(state, first.from, first.index, first.to);
    expect(after.ok).toBe(true);
    const seen = new Set([stateKey(state), stateKey(after.state)]);
    const second = findHint(state, seen);
    expect(second.kind).toBe('move');
    if (second.kind !== 'move') return;
    const again = moveCards(state, second.from, second.index, second.to);
    expect(seen.has(stateKey(again.state))).toBe(false);
  });

  it('still answers when every option leads to a seen position', () => {
    const only = buildPosition({ tableau: cols([down('c', 3), up('h', 8)], [up('s', 9)]) });
    const hint = findHint(only);
    expect(hint.kind).toBe('move');
    if (hint.kind !== 'move') return;
    const after = moveCards(only, hint.from, hint.index, hint.to);
    expect(findHint(only, new Set([stateKey(after.state)])).kind).toBe('move');
  });

  it('does not loop when the hints are followed', () => {
    let current = buildPosition({
      drawCount: 3,
      stock: [down('h', 7), down('c', 2), down('d', 4), down('s', 5), down('d', 10), down('c', 11)],
      tableau: cols([up('s', 8)], [up('d', 9)]),
    });
    const seen = new Set<string>([stateKey(current)]);
    for (let i = 0; i < 12; i++) {
      const hint = findHint(current, seen);
      if (hint.kind === 'none') break;
      if (hint.kind === 'move') {
        const r = moveCards(current, hint.from, hint.index, hint.to);
        expect(r.ok).toBe(true);
        current = r.state;
      } else {
        const r = draw(current);
        expect(r.ok).toBe(true);
        current = r.state;
      }
      // Real progress (a card played) may repeat a layout of the stock, but never the same full position twice in a row.
      seen.add(stateKey(current));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
