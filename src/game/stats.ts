export interface PendingWin {
  gameId: string;
  drawCount: 1 | 3;
  timeMs: number;
  prevBest: number | null;
}

export interface Stats {
  played: number;
  won: number;
  bestMs: { '1': number | null; '3': number | null };
  /** Game id that has already incremented `played`. */
  countedGameId: string | null;
  /**
   * Set when a win is recorded so Undo can reverse it.
   * Cleared, without reversing, once the player leaves that game.
   */
  pendingWin: PendingWin | null;
}

export function emptyStats(): Stats {
  return {
    played: 0,
    won: 0,
    bestMs: { '1': null, '3': null },
    countedGameId: null,
    pendingWin: null,
  };
}

export function noteFirstMove(stats: Stats, gameId: string): Stats {
  if (stats.countedGameId === gameId) return stats;
  return { ...stats, played: stats.played + 1, countedGameId: gameId };
}

export function noteWin(stats: Stats, gameId: string, drawCount: 1 | 3, timeMs: number): Stats {
  if (stats.pendingWin?.gameId === gameId) return stats;
  const key = drawCount === 1 ? '1' : '3';
  const prevBest = stats.bestMs[key];
  const best = prevBest == null || timeMs < prevBest ? timeMs : prevBest;
  return {
    ...stats,
    won: stats.won + 1,
    bestMs: { ...stats.bestMs, [key]: best },
    pendingWin: { gameId, drawCount, timeMs, prevBest },
  };
}

export function revertWin(stats: Stats, gameId: string): Stats {
  const pending = stats.pendingWin;
  if (!pending || pending.gameId !== gameId) return stats;
  const key = pending.drawCount === 1 ? '1' : '3';
  return {
    ...stats,
    won: Math.max(0, stats.won - 1),
    bestMs: { ...stats.bestMs, [key]: pending.prevBest },
    pendingWin: null,
  };
}

/** Keep the win on the record once this game is abandoned. */
export function commitPendingWin(stats: Stats): Stats {
  if (!stats.pendingWin) return stats;
  return { ...stats, pendingWin: null };
}

export function winRate(stats: Stats): number {
  if (stats.played <= 0) return 0;
  return Math.round((stats.won / stats.played) * 100);
}
