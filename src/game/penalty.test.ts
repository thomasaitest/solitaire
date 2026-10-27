import { describe, expect, it } from 'vitest';
import { buildPosition, makeCard, moveCards, undo } from './engine.ts';
import { PENALTY, chargePenalty } from './penalty.ts';

describe('chargePenalty', () => {
  it('takes 5 off the score', () => {
    const { state, charged } = chargePenalty(buildPosition({ score: 100 }), 0);
    expect(PENALTY).toBe(5);
    expect(charged).toBe(5);
    expect(state.score).toBe(95);
  });

  it('never takes the shown score below 0', () => {
    const low = chargePenalty(buildPosition({ score: 3 }), 0);
    expect(low.charged).toBe(3);
    expect(low.state.score).toBe(0);
    const zero = chargePenalty(buildPosition({ score: 0 }), 0);
    expect(zero.charged).toBe(0);
    expect(zero.state.score).toBe(0);
  });

  it('counts the clock: nothing is charged when the shown score is already 0', () => {
    // 100 seconds cost 20 points, so a play score of 20 shows as 0.
    const { state, charged } = chargePenalty(buildPosition({ score: 20 }), 100_000);
    expect(charged).toBe(0);
    expect(state.score).toBe(20);
  });
});

describe('Angre penalty', () => {
  const start = buildPosition({
    score: 50,
    tableau: [[makeCard('s', 1, false), makeCard('h', 7)], [makeCard('c', 8)], [], [], [], [], []],
  });

  it('restores the previous position first, then charges 5', () => {
    const moved = moveCards(start, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
    expect(moved.state.score).toBe(55);
    const undone = undo(moved.state);
    expect(undone.state.score).toBe(50);
    expect(undone.state.tableau[0]?.map((c) => c.faceUp)).toEqual([false, true]);
    const { state } = chargePenalty(undone.state, 0);
    expect(state.score).toBe(45);
    expect(state.moves).toBe(0);
  });

  it('cannot be used to farm points: move and Angre again and again only loses points', () => {
    let state = start;
    for (let i = 0; i < 3; i++) {
      const moved = moveCards(state, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
      state = chargePenalty(undo(moved.state).state, 0).state;
    }
    expect(state.score).toBe(35);
  });
});
