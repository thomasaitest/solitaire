import { describe, expect, it } from 'vitest';
import { buildPosition, makeCard } from './engine.ts';
import { findHint } from './hint.ts';

describe('findHint', () => {
  it('prefers sending an ace home', () => {
    const state = buildPosition({
      waste: [makeCard('h', 1)],
      tableau: [[makeCard('s', 9)], [makeCard('h', 8)], [], [], [], [], []],
    });
    const hint = findHint(state);
    expect(hint.kind).toBe('move');
    if (hint.kind === 'move') {
      expect(hint.from.zone).toBe('waste');
      expect(hint.to.zone).toBe('foundation');
    }
  });

  it('finds a tableau move that turns a card up', () => {
    const state = buildPosition({
      stock: [makeCard('c', 4, false)],
      tableau: [[makeCard('d', 2, false), makeCard('h', 8)], [makeCard('s', 9)], [], [], [], [], []],
    });
    const hint = findHint(state);
    expect(hint).toEqual({ kind: 'move', from: { zone: 'tableau', index: 0 }, index: 1, to: { zone: 'tableau', index: 1 } });
  });

  it('suggests the stock when no card move helps', () => {
    const state = buildPosition({
      stock: [makeCard('c', 4, false)],
      tableau: [[makeCard('s', 13)], [makeCard('h', 7)], [], [], [], [], []],
    });
    expect(findHint(state)).toEqual({ kind: 'draw' });
  });

  it('reports no move when the table is stuck', () => {
    const state = buildPosition({
      tableau: [[makeCard('s', 13)], [makeCard('h', 7)], [makeCard('d', 7)], [], [], [], []],
    });
    expect(findHint(state)).toEqual({ kind: 'none' });
  });
});
