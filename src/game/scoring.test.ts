import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPosition, createGame, draw, hydrate, makeCard, moveCards, restartDeal, undo } from './engine.ts';
import { charge, chargeHint, chargeMistap, chargeUndo, tickClock } from './penalty.ts';
import { SCORE } from './scoreConfig.ts';
import { formatScore, shownScore } from './scoring.ts';
import { emptyStats, isNewBestScore, noteWin, revertWin } from './stats.ts';
import { loadStats, saveStats } from '../storage.ts';
import { SUITS } from './types.ts';
import type { Card, GameState, PileRef } from './types.ts';

const T = (index: number): PileRef => ({ zone: 'tableau', index });
const F = (index: number): PileRef => ({ zone: 'foundation', index });
const W: PileRef = { zone: 'waste', index: 0 };
const E = (n: number): Card[][] => Array.from({ length: n }, () => []);

function mustMove(state: GameState, from: PileRef, index: number, to: PileRef): GameState {
  const result = moveCards(state, from, index, to);
  expect(result.ok).toBe(true);
  return result.state;
}

describe('config', () => {
  it('starts every deal on startScore and restores it on restart', () => {
    const game = createGame({ seed: 5 });
    expect(game.score).toBe(SCORE.startScore);
    expect(game.initial.score).toBe(SCORE.startScore);
    const played = draw(game).state;
    expect(restartDeal(played).score).toBe(SCORE.startScore);
  });
});

describe('move scoring', () => {
  it('charges a plain move and nothing else', () => {
    const state = buildPosition({ tableau: [[makeCard('s', 9), makeCard('c', 3)], [makeCard('h', 4)], ...E(5)] });
    expect(mustMove(state, T(0), 1, T(1)).score).toBe(-SCORE.movePenalty);
  });

  it('pays foundation, waste-to-tableau and reveal rewards on top of the move cost', () => {
    const toFoundation = buildPosition({ waste: [makeCard('h', 1)] });
    expect(mustMove(toFoundation, W, 0, F(1)).score).toBe(SCORE.foundationReward - SCORE.movePenalty);

    const toTableau = buildPosition({ waste: [makeCard('s', 9)], tableau: [[makeCard('h', 10)], ...E(6)] });
    expect(mustMove(toTableau, W, 0, T(0)).score).toBe(SCORE.wasteToTableauReward - SCORE.movePenalty);

    const reveal = buildPosition({
      tableau: [[makeCard('c', 9, false), makeCard('h', 8)], [makeCard('s', 9)], ...E(5)],
    });
    expect(mustMove(reveal, T(0), 1, T(1)).score).toBe(SCORE.revealReward - SCORE.movePenalty);
  });

  it('pays the win reward once, on the winning move', () => {
    const foundations = SUITS.map((suit) => Array.from({ length: suit === 'c' ? 12 : 13 }, (_, i) => makeCard(suit, i + 1)));
    const state = buildPosition({ foundations, tableau: [[makeCard('c', 13)], ...E(6)] });
    const won = mustMove(state, T(0), 0, F(3));
    expect(won.won).toBe(true);
    expect(won.score).toBe(SCORE.foundationReward + SCORE.emptyColumnReward + SCORE.winReward - SCORE.movePenalty);
  });

  it('has no floor: the score goes negative', () => {
    const state = buildPosition({ tableau: [[makeCard('s', 9), makeCard('c', 3)], [makeCard('h', 4)], ...E(5)] });
    const moved = mustMove(state, T(0), 1, T(1));
    expect(moved.score).toBe(-SCORE.movePenalty);
    expect(shownScore(moved)).toBeLessThan(0);
  });
});

describe('penalties and negative scores', () => {
  it('charges Hint, Angre and mistaps in full even from 0', () => {
    const start = buildPosition({ score: 0 });
    expect(chargeHint(start).state.score).toBe(-SCORE.hintPenalty);
    expect(chargeUndo(start).state.score).toBe(-SCORE.undoPenalty);
    expect(chargeMistap(start).state.score).toBe(-SCORE.mistapPenalty);
    expect(chargeHint(chargeHint(start).state).state.score).toBe(-2 * SCORE.hintPenalty);
  });

  it('records what was charged in drain', () => {
    const a = charge(buildPosition({ score: 5 }), 8);
    expect(a.charged).toBe(8);
    expect(a.state.score).toBe(-3);
    expect(a.state.drain).toBe(8);
  });

  it('formats negative scores with a real minus sign', () => {
    expect(formatScore(-12)).toBe('\u221212');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(1234)).toBe('1,234');
    expect(formatScore(-1234.4)).toBe('\u22121,234');
  });
});

describe('clock', () => {
  it('charges the whole seconds that have passed, once', () => {
    let state = buildPosition({ score: 10 });
    state = tickClock(state, 3_400).state;
    expect(state.score).toBe(10 - 3 * SCORE.secondPenalty);
    expect(state.clockSec).toBe(3);
    expect(tickClock(state, 3_900).charged).toBe(0);
    state = tickClock(state, 5_000).state;
    expect(state.score).toBe(10 - 5 * SCORE.secondPenalty);
  });

  it('charges nothing when the clock did not advance (paused or not started)', () => {
    const state = buildPosition({ score: 10 });
    expect(tickClock(state, 0)).toEqual({ state, charged: 0 });
    const ticked = tickClock(state, 2_000).state;
    expect(tickClock(ticked, 2_000).state).toBe(ticked);
  });

  it('runs the score negative when you are slow', () => {
    expect(tickClock(buildPosition({ score: 0 }), 90_000).state.score).toBe(-90 * SCORE.secondPenalty);
  });
});

describe('undo (Angre)', () => {
  const start = () =>
    buildPosition({ score: 50, waste: [makeCard('h', 1)], tableau: [[makeCard('s', 9)], [makeCard('h', 10)], ...E(5)] });

  it('restores the earlier score first, then charges 10', () => {
    const moved = mustMove(start(), W, 0, F(1));
    expect(moved.score).toBe(50 + SCORE.foundationReward - SCORE.movePenalty);
    const undone = undo(moved).state;
    expect(undone.score).toBe(50);
    expect(chargeUndo(undone).state.score).toBe(50 - SCORE.undoPenalty);
  });

  it('does not leave the foundation reward behind', () => {
    const moved = mustMove(start(), W, 0, F(1));
    const after = chargeUndo(undo(moved).state).state;
    expect(after.score).toBeLessThan(50);
    expect(after.foundations[1]).toHaveLength(0);
  });

  it('does not refund time, Hint or mistap charges made since the move', () => {
    let state = mustMove(start(), W, 0, F(1));
    state = tickClock(state, 7_000).state;
    state = chargeHint(state).state;
    state = chargeMistap(state).state;
    const lost = 7 * SCORE.secondPenalty + SCORE.hintPenalty + SCORE.mistapPenalty;
    const undone = undo(state).state;
    expect(undone.score).toBe(50 - lost);
    expect(undone.drain).toBe(lost);
  });

  it('cannot farm: move + Angre repeated only loses points', () => {
    let state = start();
    let last = state.score;
    for (let i = 0; i < 4; i++) {
      state = mustMove(state, W, 0, F(1));
      state = chargeUndo(undo(state).state).state;
      expect(state.score).toBe(last - SCORE.undoPenalty);
      last = state.score;
    }
  });

  it('undoing a win removes the win reward and the best-score record', () => {
    const foundations = SUITS.map((suit) => Array.from({ length: suit === 'c' ? 12 : 13 }, (_, i) => makeCard(suit, i + 1)));
    const almost = buildPosition({ foundations, tableau: [[makeCard('c', 13)], ...E(6)], score: 20 });
    const won = mustMove(almost, T(0), 0, F(3));
    let stats = noteWin(emptyStats(), won.gameId, 3, 60_000, shownScore(won));
    expect(stats.bestScore['3']).toBe(won.score);
    const undone = chargeUndo(undo(won).state).state;
    expect(undone.won).toBe(false);
    expect(undone.score).toBe(20 - SCORE.undoPenalty);
    stats = revertWin(stats, won.gameId);
    expect(stats.bestScore['3']).toBeNull();
  });

  it('a score restored from before the move can itself be negative', () => {
    const state = buildPosition({ score: -20, waste: [makeCard('h', 1)] });
    const moved = mustMove(state, W, 0, F(1));
    expect(undo(moved).state.score).toBe(-20);
  });
});

describe('anti-exploit: foundation shuttling', () => {
  it.each([-30, 0, 5, 100])('up and down again always loses points (start %i)', (startScore) => {
    const state = buildPosition({ score: startScore, foundations: [[], [makeCard('h', 1)], [], []], tableau: [[makeCard('s', 2)], ...E(6)] });
    const down = mustMove(state, F(1), 0, T(0));
    expect(down.score).toBe(startScore - SCORE.foundationReward - SCORE.movePenalty);
    const up = mustMove(down, T(0), 1, F(1));
    expect(up.score).toBe(startScore - 2 * SCORE.movePenalty);
  });

  it('several cards shuttled at a score of 0 lose points (no floor to hide the loss)', () => {
    const foundations = [[makeCard('s', 1)], [makeCard('h', 1)], [makeCard('d', 1)], [makeCard('c', 1)]];
    const tableau = [[makeCard('h', 2)], [makeCard('s', 2)], [makeCard('c', 2)], [makeCard('d', 2)], [], [], []];
    let state = buildPosition({ score: 0, foundations, tableau });
    for (let i = 0; i < 4; i++) state = mustMove(state, F(i), 0, T(i));
    expect(state.score).toBe(4 * (-SCORE.foundationReward - SCORE.movePenalty));
    for (let i = 0; i < 4; i++) state = mustMove(state, T(i), 1, F(i));
    expect(state.score).toBe(-8 * SCORE.movePenalty);
  });
});

describe('anti-exploit: empty column', () => {
  it('pays once per column per deal', () => {
    // Column 0 holds a lone 9 that can go onto the 10 in column 1.
    let state = buildPosition({
      score: 0,
      tableau: [[makeCard('s', 9)], [makeCard('h', 10)], [], [makeCard('c', 13)], [], [], []],
    });
    state = mustMove(state, T(0), 0, T(1));
    expect(state.score).toBe(SCORE.emptyColumnReward - SCORE.movePenalty);
    expect(state.emptied).toEqual([0]);
    // Refill column 0 with a king, then empty it again: no second payment.
    state = mustMove(state, T(3), 0, T(0));
    const before = state.score;
    state = mustMove(state, T(0), 0, T(3));
    expect(state.score).toBe(before - SCORE.movePenalty);
  });

  it('does not pay for moving a king from one empty column to another', () => {
    let state = buildPosition({ score: 0, tableau: [[makeCard('s', 13)], [], [], [], [], [], []] });
    for (let i = 0; i < 6; i++) state = mustMove(state, T(i), 0, T(i + 1));
    expect(state.score).toBe(-6 * SCORE.movePenalty);
    expect(state.emptied).toEqual([]);
  });

  it('is undone with the move, so it can be earned again, but never twice', () => {
    const state = buildPosition({ score: 0, tableau: [[makeCard('s', 9)], [makeCard('h', 10)], ...E(5)] });
    const paid = mustMove(state, T(0), 0, T(1));
    const back = undo(paid).state;
    expect(back.emptied).toEqual([]);
    const again = mustMove(back, T(0), 0, T(1));
    expect(again.score).toBe(paid.score);
  });
});

describe('anti-exploit: stock recycling', () => {
  it('earns nothing: every draw costs a move and a recycle costs extra', () => {
    let state = buildPosition({ score: 0, drawCount: 1, stock: [makeCard('s', 5, false), makeCard('h', 6, false)] });
    for (let i = 0; i < 2; i++) state = draw(state).state;
    expect(state.score).toBe(-2 * SCORE.movePenalty);
    state = draw(state).state; // recycle
    expect(state.score).toBe(-3 * SCORE.movePenalty - SCORE.recyclePenalty);
    for (let i = 0; i < 6; i++) state = draw(state).state;
    expect(state.score).toBeLessThan(-3 * SCORE.movePenalty - SCORE.recyclePenalty);
  });

  it('a draw that does nothing is free', () => {
    const state = buildPosition({ score: 3 });
    expect(draw(state).ok).toBe(false);
    expect(draw(state).state.score).toBe(3);
  });
});

describe('saved games', () => {
  it('keeps score, clock counter, drain and paid columns through a save', () => {
    let state = draw(createGame({ seed: 3 })).state;
    state = tickClock(state, 4_000).state;
    state = chargeHint(state).state;
    state = { ...state, emptied: [0, 4] };
    const loaded = hydrate(JSON.parse(JSON.stringify({ ...state, elapsedMs: 4_000 })));
    expect(loaded).not.toBeNull();
    expect(loaded?.score).toBe(state.score);
    expect(loaded?.clockSec).toBe(4);
    expect(loaded?.drain).toBe(state.drain);
    expect(loaded?.emptied).toEqual([0, 4]);
  });

  it('opens a game saved before the points system without a catch-up charge', () => {
    const game = createGame({ seed: 9 });
    const raw = JSON.parse(JSON.stringify({ ...game, elapsedMs: 83_000, score: -40 })) as Record<string, unknown>;
    delete raw.clockSec;
    delete raw.drain;
    delete raw.emptied;
    const loaded = hydrate(raw)!;
    expect(loaded.clockSec).toBe(83);
    expect(loaded.score).toBe(-40);
    expect(loaded.drain).toBe(0);
    expect(loaded.emptied).toEqual([]);
    expect(tickClock(loaded, 83_900).charged).toBe(0);
  });
});

describe('best score', () => {
  it('handles negative scores and only counts a higher one as a record', () => {
    let stats = noteWin(emptyStats(), 'a', 3, 100_000, -50);
    expect(stats.bestScore['3']).toBe(-50);
    expect(isNewBestScore(stats, 'a')).toBe(false); // first win
    stats = noteWin({ ...stats, pendingWin: null }, 'b', 3, 100_000, -80);
    expect(stats.bestScore['3']).toBe(-50);
    expect(isNewBestScore(stats, 'b')).toBe(false);
    stats = noteWin({ ...stats, pendingWin: null }, 'c', 3, 100_000, -10);
    expect(stats.bestScore['3']).toBe(-10);
    expect(isNewBestScore(stats, 'c')).toBe(true);
    expect(revertWin(stats, 'c').bestScore['3']).toBe(-50);
  });

  it('keeps one best per draw mode', () => {
    let stats = noteWin(emptyStats(), 'a', 1, 100_000, 300);
    stats = noteWin({ ...stats, pendingWin: null }, 'b', 3, 100_000, -5);
    expect(stats.bestScore).toEqual({ '1': 300, '3': -5 });
  });
});

describe('best score storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves and loads a negative best score, and tolerates old saves without one', () => {
    const data: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
    });
    expect(loadStats().bestScore).toEqual({ '1': null, '3': null });
    saveStats({ ...emptyStats(), bestScore: { '1': -12, '3': 240 } });
    expect(loadStats().bestScore).toEqual({ '1': -12, '3': 240 });
    data['klondike-stats-v1'] = JSON.stringify({ played: 3, won: 1, bestMs: { '1': 5000, '3': null } });
    const old = loadStats();
    expect(old.bestScore).toEqual({ '1': null, '3': null });
    expect(old.bestMs['1']).toBe(5000);
  });
});
