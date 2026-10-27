export interface PendingWin {
  gameId: string;
  drawCount: 1 | 3;
  timeMs: number;
  prevBest: number | null;
  score: number;
  prevBestScore: number | null;
}

export interface Stats {
  played: number;
  won: number;
  bestMs: { '1': number | null; '3': number | null };
  /** Highest score at a win, per draw mode. */
  bestScore: { '1': number | null; '3': number | null };
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
    bestScore: { '1': null, '3': null },
    countedGameId: null,
    pendingWin: null,
  };
}

export function noteFirstMove(stats: Stats, gameId: string): Stats {
  if (stats.countedGameId === gameId) return stats;
  return { ...stats, played: stats.played + 1, countedGameId: gameId };
}

export function noteWin(stats: Stats, gameId: string, drawCount: 1 | 3, timeMs: number, score: number): Stats {
  if (stats.pendingWin?.gameId === gameId) return stats;
  const key = drawCount === 1 ? '1' : '3';
  const prevBest = stats.bestMs[key];
  const best = prevBest == null || timeMs < prevBest ? timeMs : prevBest;
  const prevBestScore = stats.bestScore[key];
  const bestScore = prevBestScore == null || score > prevBestScore ? score : prevBestScore;
  return {
    ...stats,
    won: stats.won + 1,
    bestMs: { ...stats.bestMs, [key]: best },
    bestScore: { ...stats.bestScore, [key]: bestScore },
    pendingWin: { gameId, drawCount, timeMs, prevBest, score, prevBestScore },
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
    bestScore: { ...stats.bestScore, [key]: pending.prevBestScore },
    pendingWin: null,
  };
}

/** Keep the win on the record once this game is abandoned. */
export function commitPendingWin(stats: Stats): Stats {
  if (!stats.pendingWin) return stats;
  return { ...stats, pendingWin: null };
}

/** True when the win now on record set a new best score (not the very first win). */
export function isNewBestScore(stats: Stats, gameId: string): boolean {
  const pending = stats.pendingWin;
  if (!pending || pending.gameId !== gameId) return false;
  return pending.prevBestScore != null && pending.score > pending.prevBestScore;
}

export function winRate(stats: Stats): number {
  if (stats.played <= 0) return 0;
  return Math.round((stats.won / stats.played) * 100);
}
