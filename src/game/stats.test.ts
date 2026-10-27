import { describe, expect, it } from 'vitest';
import { commitPendingWin, emptyStats, noteFirstMove, noteWin, revertWin, winRate } from './stats.ts';

describe('stats', () => {
  it('counts a game once, records a win, and restores both if the win is undone', () => {
    let stats = emptyStats();
    stats = noteFirstMove(stats, 'game-a');
    stats = noteFirstMove(stats, 'game-a');
    expect(stats.played).toBe(1);

    stats = noteWin(stats, 'game-a', 3, 90_000, 0);
    expect(stats.won).toBe(1);
    expect(stats.bestMs['3']).toBe(90_000);
    expect(winRate(stats)).toBe(100);

    stats = noteWin(stats, 'game-a', 3, 10_000, 0);
    expect(stats.won).toBe(1);

    const slower = noteWin(revertWin(stats, 'game-a'), 'game-a', 3, 120_000, 0);
    expect(slower.won).toBe(1);
    expect(slower.bestMs['3']).toBe(120_000);

    const undone = revertWin(slower, 'game-a');
    expect(undone.won).toBe(0);
    expect(undone.bestMs['3']).toBeNull();
    expect(undone.played).toBe(1);
  });

  it('keeps a better time and commits the win when the game is left behind', () => {
    let stats = noteWin(noteFirstMove(emptyStats(), 'game-a'), 'game-a', 1, 50_000, 0);
    stats = noteWin(noteFirstMove(commitPendingWin(stats), 'game-b'), 'game-b', 1, 80_000, 0);
    expect(stats.played).toBe(2);
    expect(stats.won).toBe(2);
    expect(stats.bestMs['1']).toBe(50_000);
    expect(revertWin(stats, 'game-a').won).toBe(2);
    expect(revertWin(stats, 'game-b').bestMs['1']).toBe(50_000);
  });
});
